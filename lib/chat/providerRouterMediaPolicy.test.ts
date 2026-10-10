/** @jest-environment node */
/**
 * orchestrate() under the Google-only switches, and the order of its first checks — behaviourally, through the real
 * router (every provider module mocked; nothing here can reach the network).
 *
 *   · MEDIA_GOOGLE_ONLY on: the chat branches whose only engines are outside ones (music on Udio / MusicGen, the
 *     Replicate intents, the interior redesign and the 3D room) answer the paused-tool sentence before any balance
 *     read, charge or provider call. Off: they run as before.
 *   · An explicit film dispatch (the music-video flag, the storyboard's signals) reaches the film pipeline whatever the
 *     brief says: a brief with "room" or "space" in it used to be answered "Upload a room photo" by the 3D-interior
 *     branch, and one with a reference image could be answered as text by the vision branch.
 */
jest.mock('server-only', () => ({}));

jest.mock('./ServiceManager', () => {
  const execute = jest.fn();
  const poll = jest.fn();
  return { ServiceManager: jest.fn().mockImplementation(() => ({ execute, poll })), __sm: { execute, poll } };
});
jest.mock('./filmComposite', () => ({
  // The real keyword predicate (a pure regex in filmPipeline) — only the composite HANDLER is stubbed.
  isThirtySecondFilm: (m: string) => (jest.requireActual('./filmPipeline') as typeof import('./filmPipeline')).isThirtySecondFilm(m),
  handleFilmComposite: jest.fn(async () => ({ success: true, intent: 'video_generation', responseType: 'video', message: 'film queued', metadata: { provider: 'film' } })),
}));
jest.mock('./musicVideoComposite', () => ({
  isMusicVideoComposite: jest.fn(() => false),
  handleMusicVideoComposite: jest.fn(async () => ({ success: true, intent: 'video_generation', responseType: 'video', message: 'mv queued', metadata: { provider: 'mv' } })),
}));
jest.mock('../orchestrator/ledger', () => ({
  hasSufficientBalance: jest.fn(async () => true),
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundDebitByRef: jest.fn(),
}));
jest.mock('../gemini/client', () => ({ generateWithGemini: jest.fn(async () => ({ text: 'hi there', model: 'gemini-test' })) }));
jest.mock('@anthropic-ai/sdk', () => jest.fn().mockImplementation(() => ({ messages: { create: jest.fn() } })));
jest.mock('../udio/client', () => ({ startUdioGeneration: jest.fn(), getUdioGenerationStatus: jest.fn() }));
jest.mock('../worldlabs/client', () => ({ generateWorldLabsInterior: jest.fn() }));
jest.mock('../nanobanana/client', () => ({ generateNanoBananaImage: jest.fn() }));
jest.mock('../replicate/client', () => ({ createPrediction: jest.fn(), pollUntilDone: jest.fn(), pollPrediction: jest.fn() }));
jest.mock('../monetization/audit-engine', () => ({
  isFounderAuditCommand: jest.fn(() => false),
  isFounder: jest.fn(() => false),
  runFounderAudit: jest.fn(),
  renderAuditAsMarkdown: jest.fn(),
  forecastMarginForAction: jest.fn(),
}));
jest.mock('./filmStatusStore', () => ({ deriveFilmTokenId: jest.fn(), buildFilmSnapshot: jest.fn(), putFilmStatus: jest.fn() }));
jest.mock('../observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));

import { orchestrate, type OrchestratorInput } from './providerRouter';
import { handleFilmComposite } from './filmComposite';
import { isMusicVideoComposite } from './musicVideoComposite';
import { hasSufficientBalance } from '../orchestrator/ledger';
import { generateWithGemini } from '../gemini/client';
import { startUdioGeneration } from '../udio/client';
import { createPrediction } from '../replicate/client';
import { generateWorldLabsInterior } from '../worldlabs/client';
import { googleOnlyMessage, GOOGLE_ONLY_CODE } from '../providers/mediaPolicy';

const { __sm: sm } = jest.requireMock('./ServiceManager') as { __sm: { execute: jest.Mock; poll: jest.Mock } };

const USER = '11111111-1111-4111-8111-111111111111';
function input(over: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return {
    message: 'compose a song about the sea with piano and strings',
    serviceContext: 'global',
    agentId: 'main-assistant',
    userId: USER,
    sessionId: 'session_test_1',
    locale: 'en',
    history: [],
    ...over,
  };
}

const ENV = ['MEDIA_GOOGLE_ONLY', 'FILM_ALLOW_ANONYMOUS', 'GEMINI_API_KEY', 'UDIO_API_KEY', 'REPLICATE_API_TOKEN'];
const saved: Record<string, string | undefined> = {};
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  (isMusicVideoComposite as jest.Mock).mockReturnValue(false);
  (startUdioGeneration as jest.Mock).mockResolvedValue({ workId: 'w1', model: 'udio-test' });
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
});

afterEach(() => {
  fetchSpy.mockRestore();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function expectNoOutsideEngine(): void {
  expect(startUdioGeneration).not.toHaveBeenCalled();
  expect(createPrediction).not.toHaveBeenCalled();
  expect(generateWorldLabsInterior).not.toHaveBeenCalled();
  expect(hasSufficientBalance).not.toHaveBeenCalled();
  expect(sm.execute).not.toHaveBeenCalled();
}

describe('MEDIA_GOOGLE_ONLY on: chat branches with only outside engines are refused before any charge', () => {
  beforeEach(() => {
    process.env.MEDIA_GOOGLE_ONLY = '1';
    process.env.UDIO_API_KEY = 'udio-test';
    process.env.REPLICATE_API_TOKEN = 'r8-test';
  });

  it.each([
    ['a chat music command', input()],
    ['a music command that names an engine', input({ selectedOptions: { provider: 'replicate' } })],
    ['the interior service', input({ message: 'redesign my living room in a scandi style', serviceContext: 'interior' })],
    ['a 3D room asked by name', input({ message: 'make a marble 3d interior of a small room' })],
    ['a Replicate visual analysis', input({ message: 'tell me what you see', serviceContext: 'visual-ai' })],
  ])('%s → the paused-tool sentence, nothing reached', async (_label, req) => {
    const res = await orchestrate(req);
    expect(res.success).toBe(false);
    expect(res.message).toBe(googleOnlyMessage('en'));
    expect(res.metadata).toMatchObject({ code: GOOGLE_ONLY_CODE });
    expectNoOutsideEngine();
  });

  it('speaks Georgian by default', async () => {
    const res = await orchestrate(input({ locale: 'ka' }));
    expect(res.message).toBe(googleOnlyMessage('ka'));
  });
});

describe('MEDIA_GOOGLE_ONLY off: the same branches run as before', () => {
  it('a chat music command still reaches its engine', async () => {
    process.env.UDIO_API_KEY = 'udio-test';
    const res = await orchestrate(input());
    expect(startUdioGeneration).toHaveBeenCalledTimes(1);
    expect(res.metadata).toMatchObject({ provider: 'udio' });
  });

  it('the interior service without a photo still asks for one', async () => {
    const res = await orchestrate(input({ message: 'redesign my living room', serviceContext: 'interior' }));
    expect(res.metadata).toMatchObject({ provider: 'worldlabs', validation: 'blocked_missing_image' });
  });
});

describe('an explicit film dispatch reaches the film pipeline whatever the brief says', () => {
  it.each([
    ['a storyboard render whose brief mentions a room', { sceneCount: 3 }, 'a dancer alone in an empty room at night'],
    ['a music video whose brief mentions space', { musicVideoMode: true }, 'an astronaut floating in deep space, synthwave'],
  ])('%s', async (_label, metadata, message) => {
    const res = await orchestrate(input({ message, metadata }));
    expect(handleFilmComposite).toHaveBeenCalledTimes(1);
    expect(res.metadata).toMatchObject({ provider: 'film' });
    expect(generateWorldLabsInterior).not.toHaveBeenCalled();
  });

  it('a storyboard render with a reference photo is not answered as text by the vision branch', async () => {
    process.env.GEMINI_API_KEY = 'g-test';
    await orchestrate(input({ message: 'a calm ocean wave at sunset', imageUrl: 'https://x.supabase.co/ref.jpg', metadata: { sceneFrames: ['https://x/1.webp'] } }));
    expect(handleFilmComposite).toHaveBeenCalledTimes(1);
    expect(generateWithGemini).not.toHaveBeenCalled();
  });

  it('a signed-out film dispatch is still refused before the pipeline', async () => {
    const res = await orchestrate(input({ userId: 'anonymous', message: 'a dancer in a room', metadata: { sceneCount: 3 } }));
    expect(res.metadata).toMatchObject({ authRequired: true });
    expect(handleFilmComposite).not.toHaveBeenCalled();
  });
});
