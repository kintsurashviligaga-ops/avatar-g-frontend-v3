/** @jest-environment node */
/**
 * The sequential chain on the film POLL (lib/chat/filmChain + lib/chat/providerRouter pollFilmTask): a waiting scene is
 * pending and never polled; once its predecessor lands, the owner's poll sends it from that clip's real last frame (or
 * its own storyboard frame when the predecessor failed), records the outcome once, and later polls follow the scene's
 * own job. Nobody else's poll moves the chain. The film start that writes the plan: lib/chat/filmSequentialChain.test.ts.
 */
jest.mock('server-only', () => ({}));

jest.mock('./ServiceManager', () => {
  const execute = jest.fn();
  const poll = jest.fn();
  return { ServiceManager: jest.fn().mockImplementation(() => ({ execute, poll })), __sm: { execute, poll } };
});
const mockSubmit = jest.fn();
jest.mock('./filmComposite', () => ({
  isThirtySecondFilm: jest.fn(() => false),
  handleFilmComposite: jest.fn(),
  submitFilmClip: (...a: unknown[]) => mockSubmit(...a),
}));
jest.mock('./musicVideoComposite', () => ({ isMusicVideoComposite: jest.fn(() => false), handleMusicVideoComposite: jest.fn() }));
const mockRefund = jest.fn();
jest.mock('../orchestrator/ledger', () => ({
  hasSufficientBalance: jest.fn(), deductCredits: jest.fn(), refundDebitByRef: jest.fn(),
  refundCredits: (...a: unknown[]) => mockRefund(...a),
}));
const mockUpload = jest.fn();
jest.mock('../orchestrator/storage-adapter', () => ({ uploadBufferAndSign: (...a: unknown[]) => mockUpload(...a) }));
const mockExtract = jest.fn();
jest.mock('../video/lastFrame', () => ({ extractLastFrame: (...a: unknown[]) => mockExtract(...a) }));
const mockRecordScenes = jest.fn();
jest.mock('./filmBilling', () => ({ recordFilmScenes: (...a: unknown[]) => mockRecordScenes(...a) }));
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
jest.mock('./filmSceneRefund', () => ({
  settleFailedFilmScenes: (...a: unknown[]) => mockSettle(...a),
  veoOperationOfTaskRef: jest.requireActual('./filmSceneRefund').veoOperationOfTaskRef,
}));

import { pollOrchestrationTask } from './providerRouter';
import { encodeFilmRef } from './filmTaskRef';
import { __setFilmChainRedisForTests, getFilmChainPlan, getFilmChainSteps, saveFilmChainPlan, type FilmChainPlan } from './filmChain';

const { __sm: sm } = jest.requireMock('./ServiceManager') as { __sm: { poll: jest.Mock } };

const TOKEN_ID = 'f00000000000000aa';
const OWNER = 'user-9';
const CHARGE = `filmpay:${TOKEN_ID}`;
const CLIP_1 = 'https://media.local.test/clip-1.mp4';
const HOSTED = 'https://store.local.test/film-chain/f00000000000000aa/scene-2-start.jpg?sig=1';
const veoRef = (n: number): string =>
  Buffer.from(JSON.stringify({ provider: 'gemini-veo', providerTaskId: `projects/p/operations/op-${n}::9:16` })).toString('base64url');

function plan(): FilmChainPlan {
  const scene = (ordinal: number) => ({
    ordinal,
    seed: 7,
    userPrompt: `Scene ${ordinal}: the presenter keeps walking.`,
    selectedOptions: { aspectRatio: '9:16', characterReference: `https://frames.local.test/${ordinal}.png`, veoEndFrame: 'https://frames.local.test/end.png' },
    storyboardFrame: `https://frames.local.test/${ordinal}.png`,
  });
  return {
    v: 1, tokenId: TOKEN_ID, uid: OWNER, sessionId: 's1', locale: 'ka', compositeId: 'c1', videoModel: null,
    forecast: { wholesaleGel: 1, retailGel: 2 }, sceneCredits: 25, chargeRef: CHARGE,
    scenes: [scene(2), scene(3)], createdAt: 1_760_000_000_000,
  };
}

function chainToken(): string {
  return encodeFilmRef({
    v: 1, sessionId: 's1', createdAt: 1_760_000_000_000, seed: 7, sceneCount: 3, clipSec: 8,
    clips: [
      { ordinal: 1, taskRef: 'job-1', status: 'queued', attempts: 1 },
      { ordinal: 2, taskRef: null, status: 'pending', attempts: 0 },
      { ordinal: 3, taskRef: null, status: 'pending', attempts: 0 },
    ],
    musicWorkId: null,
    chain: true,
  } as Parameters<typeof encodeFilmRef>[0]);
}

/** The client's vocabulary: a clip still rendering (or waiting its turn) reads 'queued'. */
/** Provider verdicts by job: job-1 is scene 1; veoRef(n) is the chained scene n's own job. */
let verdicts: Record<string, { success: boolean; predictionStatus: string; assetUrl?: string; message?: string; metadata?: Record<string, unknown> }>;
const clipsOf = (res: Awaited<ReturnType<typeof pollOrchestrationTask>>) =>
  (res.metadata?.film as { clips: Array<{ ordinal: number; status: string; providerStatus?: string; note?: string }> }).clips;

beforeEach(async () => {
  jest.clearAllMocks();
  process.env.FILM_CHAIN_MEMORY = '1';
  __setFilmChainRedisForTests(null);
  await saveFilmChainPlan(plan());
  verdicts = { 'job-1': { success: false, predictionStatus: 'processing' } };
  sm.poll.mockImplementation(async (taskRef: string) => ({ metadata: {}, ...(verdicts[taskRef] ?? { success: false, predictionStatus: 'processing' }) }));
  mockExtract.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  mockUpload.mockResolvedValue(HOSTED);
  mockSubmit.mockImplementation(async (_ctx: unknown, _req: unknown, scene: { ordinal: number }) => ({ status: 'queued', taskRef: veoRef(scene.ordinal), attempts: 1 }));
  mockRecordScenes.mockResolvedValue('recorded');
  mockRefund.mockResolvedValue({ ok: true });
  mockSettle.mockResolvedValue(0);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  delete process.env.FILM_CHAIN_MEMORY;
  __setFilmChainRedisForTests(null);
  jest.restoreAllMocks();
});

test('while scene 1 renders, scenes 2–3 wait: never polled, never sent, and the film is not done', async () => {
  const res = await pollOrchestrationTask(chainToken(), 's1', OWNER);
  expect(sm.poll).toHaveBeenCalledTimes(1);
  expect(sm.poll).toHaveBeenCalledWith('job-1', 's1');
  expect(mockSubmit).not.toHaveBeenCalled();
  const clips = clipsOf(res);
  expect(clips.filter((c) => c.ordinal > 1).map((c) => [c.status, c.providerStatus])).toEqual([['queued', 'waiting'], ['queued', 'waiting']]);
  expect(res.status).not.toBe('succeeded');
});

test('scene 1 done → scene 2 starts from scene 1’s real last frame, its share is recorded, and the next poll follows its job', async () => {
  verdicts['job-1'] = { success: true, predictionStatus: 'succeeded', assetUrl: CLIP_1 };
  const res = await pollOrchestrationTask(chainToken(), 's1', OWNER);

  expect(mockExtract).toHaveBeenCalledWith(CLIP_1);
  expect(mockUpload).toHaveBeenCalledWith('renders', `film-chain/${TOKEN_ID}/scene-2-start.jpg`, expect.any(Buffer), 'image/jpeg', 21600);
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  const [ctx, req, scene, compositeId, , , waive] = mockSubmit.mock.calls[0]!;
  expect([scene.ordinal, scene.seed, compositeId, waive]).toEqual([2, 7, 'c1', true]);
  expect(ctx).toEqual({ userId: OWNER, sessionId: 's1', locale: 'ka', videoModel: null });
  expect(req.selectedOptions.characterReference).toBe(HOSTED);
  expect(req.selectedOptions.veoEndFrame).toBeUndefined();
  expect(mockRecordScenes).toHaveBeenCalledWith(OWNER, TOKEN_ID, [{ ordinal: 2, operation: 'projects/p/operations/op-2', credits: 25 }]);
  expect(mockRefund).not.toHaveBeenCalled();
  expect(clipsOf(res).find((c) => c.ordinal === 2)).toMatchObject({ status: 'queued', providerStatus: 'queued', note: 'started from last-frame' });
  expect(clipsOf(res).find((c) => c.ordinal === 3)).toMatchObject({ status: 'queued', providerStatus: 'waiting' });

  // The next poll reads scene 2's job from the server record (the token never changes) and sends nothing again.
  sm.poll.mockClear();
  await pollOrchestrationTask(chainToken(), 's1', OWNER);
  expect(sm.poll.mock.calls.map((c) => c[0])).toEqual(['job-1', veoRef(2)]);
  expect(mockSubmit).toHaveBeenCalledTimes(1);
});

test('scene 2 failed at Google → scene 3 starts from its own storyboard frame, and scene 2 is hinted for R3-A', async () => {
  verdicts['job-1'] = { success: true, predictionStatus: 'succeeded', assetUrl: CLIP_1 };
  await pollOrchestrationTask(chainToken(), 's1', OWNER); // sends scene 2
  verdicts[veoRef(2)] = { success: false, predictionStatus: 'failed', message: 'generation failed' };
  mockExtract.mockClear();

  await pollOrchestrationTask(chainToken(), 's1', OWNER);
  expect(mockSubmit).toHaveBeenCalledTimes(2);
  const [, req, scene] = mockSubmit.mock.calls[1]!;
  expect(scene.ordinal).toBe(3);
  expect(req.selectedOptions.characterReference).toBe('https://frames.local.test/3.png');
  expect(mockExtract).not.toHaveBeenCalled();
  expect(mockSettle).toHaveBeenCalledWith(OWNER, TOKEN_ID, [2]);
  const steps = await getFilmChainSteps((await getFilmChainPlan(TOKEN_ID))!);
  expect(steps!.get(3)).toMatchObject({ status: 'queued', from: 'storyboard' });
});

/** Google's safety filter on a clip (ServiceManager's Veo poll): failed, with the rule it fell under. */
const declinedByGoogle = { success: false, predictionStatus: 'failed', message: 'declined by Google', metadata: { veoFiltered: true, veoSafetyCategory: 'celebrity', veoSupportCodes: ['15236754'] } };

test('scene 2 declined by Google from scene 1’s last frame → sent once more from its own storyboard frame, before scene 3, with no share back', async () => {
  // ⚠️ 2026-10-17: the paid 32 s ad lost scene 3 this way (celebrity rule, from clip 2's last frame) and came out 24 s.
  verdicts['job-1'] = { success: true, predictionStatus: 'succeeded', assetUrl: CLIP_1 };
  await pollOrchestrationTask(chainToken(), 's1', OWNER); // scene 2 from scene 1's last frame
  verdicts[veoRef(2)] = declinedByGoogle;
  const SECOND = veoRef(22);
  mockSubmit.mockImplementationOnce(async () => ({ status: 'queued', taskRef: SECOND, attempts: 1 }));
  mockExtract.mockClear();

  const res = await pollOrchestrationTask(chainToken(), 's1', OWNER);
  expect(mockSubmit).toHaveBeenCalledTimes(2);
  const [, req, scene] = mockSubmit.mock.calls[1]!;
  expect(scene.ordinal).toBe(2);
  expect(req.selectedOptions.characterReference).toBe('https://frames.local.test/2.png');
  expect(mockExtract).not.toHaveBeenCalled();
  expect(mockSettle).not.toHaveBeenCalled();
  expect(mockRefund).not.toHaveBeenCalled();
  expect(clipsOf(res).find((c) => c.ordinal === 2)).toMatchObject({ status: 'queued' });
  expect(clipsOf(res).find((c) => c.ordinal === 3)).toMatchObject({ status: 'queued', providerStatus: 'waiting' });
  expect(res.status).not.toBe('succeeded');

  // The next poll follows the second try's own job and sends nothing again.
  sm.poll.mockClear();
  await pollOrchestrationTask(chainToken(), 's1', OWNER);
  expect(sm.poll.mock.calls.map((c) => c[0])).toEqual(['job-1', SECOND]);
  expect(mockSubmit).toHaveBeenCalledTimes(2);

  // The second try lands → scene 3 starts from ITS real last frame.
  verdicts[SECOND] = { success: true, predictionStatus: 'succeeded', assetUrl: 'https://media.local.test/clip-2b.mp4' };
  await pollOrchestrationTask(chainToken(), 's1', OWNER);
  expect(mockSubmit).toHaveBeenCalledTimes(3);
  expect(mockSubmit.mock.calls[2]![2].ordinal).toBe(3);
  expect(mockExtract).toHaveBeenCalledWith('https://media.local.test/clip-2b.mp4');
});

test('declined again on its second try: no third try; scene 3 starts from its storyboard frame and scene 2 is hinted for R3-A', async () => {
  verdicts['job-1'] = { success: true, predictionStatus: 'succeeded', assetUrl: CLIP_1 };
  await pollOrchestrationTask(chainToken(), 's1', OWNER);
  verdicts[veoRef(2)] = declinedByGoogle;
  const SECOND = veoRef(22);
  mockSubmit.mockImplementationOnce(async () => ({ status: 'queued', taskRef: SECOND, attempts: 1 }));
  await pollOrchestrationTask(chainToken(), 's1', OWNER); // the second try
  verdicts[SECOND] = declinedByGoogle;

  await pollOrchestrationTask(chainToken(), 's1', OWNER);
  expect(mockSubmit).toHaveBeenCalledTimes(3);
  const [, req, scene] = mockSubmit.mock.calls[2]!;
  expect(scene.ordinal).toBe(3);
  expect(req.selectedOptions.characterReference).toBe('https://frames.local.test/3.png');
  expect(mockSettle).toHaveBeenCalledWith(OWNER, TOKEN_ID, [2]);
  await pollOrchestrationTask(chainToken(), 's1', OWNER);
  expect(mockSubmit).toHaveBeenCalledTimes(3);
});

test('a plain failure (not Google’s safety filter) is not sent again', async () => {
  verdicts['job-1'] = { success: true, predictionStatus: 'succeeded', assetUrl: CLIP_1 };
  await pollOrchestrationTask(chainToken(), 's1', OWNER);
  verdicts[veoRef(2)] = { success: false, predictionStatus: 'failed', message: 'generation failed' };
  await pollOrchestrationTask(chainToken(), 's1', OWNER);
  expect(mockSubmit.mock.calls.map((c) => (c[2] as { ordinal: number }).ordinal)).toEqual([2, 3]);
});

test('a scene Google refuses at dispatch is recorded failed and its share goes back once, under the film’s charge', async () => {
  verdicts['job-1'] = { success: true, predictionStatus: 'succeeded', assetUrl: CLIP_1 };
  mockSubmit.mockResolvedValueOnce({ status: 'failed', taskRef: null, attempts: 3, error: 'quota' });
  const res = await pollOrchestrationTask(chainToken(), 's1', OWNER);
  expect(mockRefund).toHaveBeenCalledTimes(1);
  expect(mockRefund).toHaveBeenCalledWith(OWNER, 25, `${CHARGE}:refund:chain:2`);
  expect(mockRecordScenes).not.toHaveBeenCalled();
  expect(clipsOf(res).find((c) => c.ordinal === 2)).toMatchObject({ status: 'failed' });
  // Dispatch-dead: no job, so R3-A is not asked (the refund above already gave the share back).
  expect(mockSettle).not.toHaveBeenCalled();

  // The next poll moves on to scene 3 and never sends or refunds scene 2 again.
  await pollOrchestrationTask(chainToken(), 's1', OWNER);
  expect(mockSubmit.mock.calls.map((c) => c[2].ordinal)).toEqual([2, 3]);
  expect(mockRefund).toHaveBeenCalledTimes(1);
});

test('another user’s poll, or a signed-out one, never moves the chain', async () => {
  verdicts['job-1'] = { success: true, predictionStatus: 'succeeded', assetUrl: CLIP_1 };
  const other = await pollOrchestrationTask(chainToken(), 's1', 'user-other');
  await pollOrchestrationTask(chainToken(), 's1', undefined);
  expect(mockSubmit).not.toHaveBeenCalled();
  expect(mockExtract).not.toHaveBeenCalled();
  expect(clipsOf(other).find((c) => c.ordinal === 2)).toMatchObject({ status: 'queued', providerStatus: 'waiting' });
});

test('two polls at once send scene 2 once', async () => {
  verdicts['job-1'] = { success: true, predictionStatus: 'succeeded', assetUrl: CLIP_1 };
  await Promise.all([pollOrchestrationTask(chainToken(), 's1', OWNER), pollOrchestrationTask(chainToken(), 's1', OWNER)]);
  expect(mockSubmit).toHaveBeenCalledTimes(1);
});

test('a chain token whose plan is gone keeps polling scene 1 and reads the waiting scenes as pending', async () => {
  __setFilmChainRedisForTests(null); // clears the in-memory plan
  verdicts['job-1'] = { success: true, predictionStatus: 'succeeded', assetUrl: CLIP_1 };
  const res = await pollOrchestrationTask(chainToken(), 's1', OWNER);
  expect(mockSubmit).not.toHaveBeenCalled();
  expect(clipsOf(res).find((c) => c.ordinal === 1)).toMatchObject({ status: 'succeeded' });
  expect(clipsOf(res).find((c) => c.ordinal === 2)).toMatchObject({ status: 'queued' });
});
