/** @jest-environment node */
/**
 * R3-A on the film POLL: a clip that reads 'failed' only HINTS which scenes to settle; the signed-in user (never the token)
 * owns the settlement, a scene that died at dispatch (no job, already refunded by the start) is never hinted, and what came
 * back is told to the client. The settlement itself: lib/chat/filmSceneRefund.test.ts (+ .pg.test.ts on a real Postgres).
 */
jest.mock('server-only', () => ({}));

jest.mock('./ServiceManager', () => {
  const execute = jest.fn();
  const poll = jest.fn();
  return { ServiceManager: jest.fn().mockImplementation(() => ({ execute, poll })), __sm: { execute, poll } };
});
jest.mock('./filmComposite', () => ({ isThirtySecondFilm: jest.fn(() => false), handleFilmComposite: jest.fn() }));
jest.mock('./musicVideoComposite', () => ({ isMusicVideoComposite: jest.fn(() => false), handleMusicVideoComposite: jest.fn() }));
jest.mock('../orchestrator/ledger', () => ({ hasSufficientBalance: jest.fn(), deductCredits: jest.fn(), refundDebitByRef: jest.fn() }));
jest.mock('../gemini/client', () => ({ generateWithGemini: jest.fn() }));
jest.mock('@anthropic-ai/sdk', () => jest.fn().mockImplementation(() => ({ messages: { create: jest.fn() } })));
jest.mock('../udio/client', () => ({ startUdioGeneration: jest.fn(), getUdioGenerationStatus: jest.fn() }));
jest.mock('../replicate/client', () => ({ createPrediction: jest.fn(), pollUntilDone: jest.fn(), pollPrediction: jest.fn() }));
jest.mock('../monetization/audit-engine', () => ({
  isFounderAuditCommand: jest.fn(() => false), isFounder: jest.fn(() => false), runFounderAudit: jest.fn(),
  renderAuditAsMarkdown: jest.fn(), forecastMarginForAction: jest.fn(),
}));
jest.mock('./filmStatusStore', () => ({
  deriveFilmTokenId: jest.fn(() => 'f00000000000000aa'), buildFilmSnapshot: jest.fn(() => ({})), foldFilmSnapshot: jest.fn(() => ({})),
  getFilmStatus: jest.fn(async () => null), putFilmStatus: jest.fn(async () => undefined),
}));
jest.mock('../observability/report-error', () => ({ reportError: jest.fn() }));
const mockSettle = jest.fn();
jest.mock('./filmSceneRefund', () => ({ settleFailedFilmScenes: (...a: unknown[]) => mockSettle(...a) }));

import { pollOrchestrationTask } from './providerRouter';
import { encodeFilmRef } from './filmTaskRef';

const { __sm: sm } = jest.requireMock('./ServiceManager') as { __sm: { poll: jest.Mock } };

function filmToken(): string {
  return encodeFilmRef({
    sessionId: 's1', createdAt: 1_760_000_000_000, seed: 7, sceneCount: 3, clipSec: 8,
    clips: [
      { ordinal: 1, taskRef: 'job-1', status: 'queued', attempts: 1 },
      { ordinal: 2, taskRef: 'job-2', status: 'queued', attempts: 1 },
      { ordinal: 3, taskRef: null, status: 'failed', attempts: 1 }, // dead at dispatch: the start already refunded it
    ],
    musicWorkId: null,
  } as Parameters<typeof encodeFilmRef>[0]);
}

beforeEach(() => {
  jest.clearAllMocks();
  sm.poll.mockImplementation(async (taskRef: string) => taskRef === 'job-2'
    ? { success: false, predictionStatus: 'failed', message: 'declined', metadata: {} }
    : { success: true, predictionStatus: 'succeeded', assetUrl: 'https://media.local.test/1.mp4', metadata: {} });
  mockSettle.mockResolvedValue(0);
});

test('a scene that died AFTER dispatch is hinted for the signed-in user; the dispatch-dead one is not', async () => {
  mockSettle.mockResolvedValue(25);
  const res = await pollOrchestrationTask(filmToken(), 's1', 'user-9');
  expect(mockSettle).toHaveBeenCalledTimes(1);
  expect(mockSettle).toHaveBeenCalledWith('user-9', 'f00000000000000aa', [2]);
  expect(res.message).toContain('💳 25 კრედიტი დაბრუნდა');
  expect((res.metadata?.film as { creditsGivenBack?: number }).creditsGivenBack).toBe(25);
});

test('nothing given back → no line, no field', async () => {
  const res = await pollOrchestrationTask(filmToken(), 's1', 'user-9');
  expect(res.message).not.toContain('💳');
  expect((res.metadata?.film as Record<string, unknown>).creditsGivenBack).toBeUndefined();
});

test('every scene alive → nothing is settled, nothing is read', async () => {
  sm.poll.mockResolvedValue({ success: true, predictionStatus: 'processing', metadata: {} });
  await pollOrchestrationTask(filmToken(), 's1', 'user-9');
  expect(mockSettle).not.toHaveBeenCalled();
});

test('a store that throws never breaks the poll', async () => {
  mockSettle.mockRejectedValue(new Error('connection reset'));
  const res = await pollOrchestrationTask(filmToken(), 's1', 'user-9');
  expect(res.predictionId).toBe(filmToken());
  expect(res.message).not.toContain('💳');
});

test('a scene Google\'s safety filter declined is named on its clip with the rule and codes; an ordinary failure is not', async () => {
  sm.poll.mockImplementation(async (taskRef: string) => taskRef === 'job-2'
    ? { success: false, predictionStatus: 'failed', message: 'declined', metadata: { veoFiltered: true, veoSafetyCategory: 'celebrity', veoSupportCodes: ['15236754', 'x<script>'] } }
    : { success: true, predictionStatus: 'succeeded', assetUrl: 'https://media.local.test/1.mp4', metadata: {} });
  const res = await pollOrchestrationTask(filmToken(), 's1', 'user-9');
  const clips = (res.metadata?.film as { clips: Array<Record<string, unknown>> }).clips;
  expect(clips.find((c) => c.ordinal === 2)?.declined).toEqual({ category: 'celebrity', codes: ['15236754'] });
  expect(clips.find((c) => c.ordinal === 1)?.declined).toBeUndefined();
  expect(clips.find((c) => c.ordinal === 3)?.declined).toBeUndefined();

  // A failure that is not a safety refusal carries no `declined` (the film keeps its own sentence).
  sm.poll.mockImplementation(async (taskRef: string) => taskRef === 'job-2'
    ? { success: false, predictionStatus: 'failed', message: 'generation failed', metadata: {} }
    : { success: true, predictionStatus: 'succeeded', assetUrl: 'https://media.local.test/1.mp4', metadata: {} });
  const plain = await pollOrchestrationTask(filmToken(), 's1', 'user-9');
  expect((plain.metadata?.film as { clips: Array<Record<string, unknown>> }).clips.find((c) => c.ordinal === 2)?.declined).toBeUndefined();
});

test('an unknown category from the wire is not passed through', async () => {
  sm.poll.mockImplementation(async (taskRef: string) => taskRef === 'job-2'
    ? { success: false, predictionStatus: 'failed', message: 'declined', metadata: { veoFiltered: true, veoSafetyCategory: '<img>', veoSupportCodes: [] } }
    : { success: true, predictionStatus: 'succeeded', assetUrl: 'https://media.local.test/1.mp4', metadata: {} });
  const res = await pollOrchestrationTask(filmToken(), 's1', 'user-9');
  const clips = (res.metadata?.film as { clips: Array<Record<string, unknown>> }).clips;
  expect(clips.find((c) => c.ordinal === 2)?.declined).toEqual({ category: null, codes: [] });
});
