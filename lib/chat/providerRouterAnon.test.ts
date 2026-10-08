/** @jest-environment node */
/**
 * orchestrate() refuses anonymous PAID generation (lib/auth/generationGate) — behaviourally, through the real router.
 *
 * ⚠️ /api/chat/orchestrate and /api/chat/stream both land in orchestrate() with the userId taken from the verified
 * session, and before this gate a direct POST with no session reached ServiceManager.execute / the film composite on
 * the platform's own keys — unbilled spend, because the per-user credit debit only exists for a signed-in user.
 * Every paid branch (image / video / avatar, film by flag / by storyboard signal / by keyword, music video, music,
 * interior) now runs through refuseAnonymousGeneration() first. Pinned here:
 *   · an anonymous image / video / film / music command answers metadata.authRequired and NEVER reaches a provider;
 *   · an attached photo does not smuggle a generation past the gate via the multimodal (Gemini vision) branch;
 *   · a signed-in user is not refused, and FILM_ALLOW_ANONYMOUS=1 re-opens it for a demo deployment;
 *   · plain text chat is not a generation and is not gated.
 * Every provider module is mocked; nothing here can reach the network.
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
// Music now runs on Lyria (Udio is retired by MyAvatar v32) and hosts the track via storage — both mocked: the storage
// adapter's import chain (supabase server → env schema) is server-only and must not load here.
jest.mock('../ai/lyriaMusic', () => ({ hasLyriaProvider: jest.fn(() => true), generateLyriaTrack: jest.fn(), lyriaModel: () => 'lyria-test' }));
jest.mock('../orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => null) }));
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
import { handleMusicVideoComposite, isMusicVideoComposite } from './musicVideoComposite';
import { hasSufficientBalance } from '../orchestrator/ledger';
import { generateWithGemini } from '../gemini/client';
import { generateLyriaTrack } from '../ai/lyriaMusic';
import { createPrediction } from '../replicate/client';
import { generateWorldLabsInterior } from '../worldlabs/client';
import { signInToGenerateMessage } from '../auth/generationGate';

const { __sm: sm } = jest.requireMock('./ServiceManager') as { __sm: { execute: jest.Mock; poll: jest.Mock } };

const IMAGE_CMD = 'generate an image of a red fox in the snow';
const VIDEO_CMD = 'create a video of waves crashing on a rocky shore at dusk';
const FILM_CMD = 'make a 30-second film about a lighthouse keeper in a storm';
const MUSIC_CMD = 'compose a song about the sea with piano and strings';

function input(over: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return {
    message: IMAGE_CMD,
    serviceContext: 'global',
    agentId: 'main-assistant',
    userId: 'anonymous',
    sessionId: 'session_test_1',
    locale: 'en',
    history: [],
    ...over,
  };
}

const ENV = ['FILM_ALLOW_ANONYMOUS', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'UDIO_API_KEY', 'REPLICATE_API_TOKEN'];
const saved: Record<string, string | undefined> = {};
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  (isMusicVideoComposite as jest.Mock).mockReturnValue(false);
  sm.execute.mockResolvedValue({
    success: true, provider: 'nanobanana', operation: 'text-to-image', responseType: 'image', message: 'done',
    assetUrl: 'https://x.supabase.co/img.png', predictionStatus: 'succeeded',
    metadata: { provider: 'nanobanana', operation: 'text-to-image', sessionId: 'session_test_1', promptHash: 'h' },
  });
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
});

afterEach(() => {
  fetchSpy.mockRestore();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function expectNoProviderReached(): void {
  expect(sm.execute).not.toHaveBeenCalled();
  expect(handleFilmComposite).not.toHaveBeenCalled();
  expect(handleMusicVideoComposite).not.toHaveBeenCalled();
  expect(generateLyriaTrack).not.toHaveBeenCalled();
  expect(createPrediction).not.toHaveBeenCalled();
  expect(generateWorldLabsInterior).not.toHaveBeenCalled();
  expect(hasSufficientBalance).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
}

describe('anonymous generation commands are refused before any provider', () => {
  it.each([
    ['an image command', IMAGE_CMD, 'global', 'image_generation'],
    ['a video command', VIDEO_CMD, 'global', 'video_generation'],
    ['a bare prompt on the video page', 'waves on a rocky shore', 'video', 'video_generation'],
    ['an avatar command', 'make me an avatar from this description: a smiling astronaut', 'global', 'avatar_generation'],
  ])('%s → authRequired', async (_label, message, serviceContext, intent) => {
    const res = await orchestrate(input({ message, serviceContext }));
    expect(res.success).toBe(false);
    expect(res.intent).toBe(intent);
    expect(res.metadata).toMatchObject({ provider: 'auth', authRequired: true });
    expect(res.message).toBe(signInToGenerateMessage('en'));
    expectNoProviderReached();
  });

  it.each([
    ['the anonymous sentinel', 'anonymous'],
    ['an empty user id', ''],
    ['a whitespace user id', '   '],
  ])('%s is refused (not only the literal "anonymous")', async (_label, userId) => {
    const res = await orchestrate(input({ userId }));
    expect(res.metadata.authRequired).toBe(true);
    expectNoProviderReached();
  });

  it('a film by keyword is refused before the film composite plans a single scene', async () => {
    const res = await orchestrate(input({ message: FILM_CMD }));
    expect(res).toMatchObject({ success: false, intent: 'video_generation', metadata: { authRequired: true } });
    expectNoProviderReached();
  });

  it('a film by storyboard dispatch signal (approved frames) is refused', async () => {
    const res = await orchestrate(input({ message: 'a calm ocean wave at sunset', metadata: { sceneFrames: ['https://x.supabase.co/f1.jpg'], sceneCount: 3 } }));
    expect(res.metadata.authRequired).toBe(true);
    expectNoProviderReached();
  });

  it('music-video mode (the studio flag) is refused', async () => {
    const res = await orchestrate(input({ message: 'an R&B track with a singer in Tbilisi', metadata: { musicVideoMode: true } }));
    expect(res.metadata.authRequired).toBe(true);
    expectNoProviderReached();
  });

  it('a music-video composite by keyword is refused', async () => {
    (isMusicVideoComposite as jest.Mock).mockReturnValue(true);
    const res = await orchestrate(input({ message: 'make a music video about summer in Batumi' }));
    expect(res).toMatchObject({ intent: 'video_generation', metadata: { authRequired: true } });
    expectNoProviderReached();
  });

  it('a music command is refused', async () => {
    const res = await orchestrate(input({ message: MUSIC_CMD }));
    expect(res).toMatchObject({ intent: 'music_generation', metadata: { authRequired: true } });
    expectNoProviderReached();
  });

  it('an interior room redesign (photo attached on the interior page) is refused', async () => {
    const res = await orchestrate(input({ message: 'redesign this living room in Scandinavian style', serviceContext: 'interior', imageUrl: 'https://x.supabase.co/room.jpg' }));
    expect(res.metadata.authRequired).toBe(true);
    expectNoProviderReached();
  });

  it('an attached photo does not smuggle a generation command past the gate through Gemini vision', async () => {
    process.env.GEMINI_API_KEY = 'test-key-not-real';
    const res = await orchestrate(input({ message: IMAGE_CMD, imageUrl: 'data:image/png;base64,iVBORw0KGgo=' }));
    expect(res.metadata.authRequired).toBe(true);
    expect(generateWithGemini).not.toHaveBeenCalled();
    expectNoProviderReached();
  });

  it('localizes the refusal (ka / ru, Georgian for an unknown locale)', async () => {
    const ka = await orchestrate(input({ locale: 'ka' }));
    expect(ka.message).toBe(signInToGenerateMessage('ka'));
    const unknown = await orchestrate(input({ locale: 'de' }));
    expect(unknown.message).toBe(signInToGenerateMessage('ka'));
    const ru = await orchestrate(input({ locale: 'ru' }));
    expect(ru.message).toBe(signInToGenerateMessage('ru'));
  });
});

describe('signed-in users and the demo switch are not refused', () => {
  it('a signed-in image command reaches ServiceManager.execute (after the balance gate)', async () => {
    const res = await orchestrate(input({ userId: 'user-1' }));
    expect(res.metadata.authRequired).toBeUndefined();
    expect(sm.execute).toHaveBeenCalledTimes(1);
    expect(sm.execute.mock.calls[0]![0]).toMatchObject({ intent: 'image_generation', sessionId: 'session_test_1' });
    expect(hasSufficientBalance).toHaveBeenCalledWith('user-1', expect.any(Number));
  });

  it('a signed-in video command reaches ServiceManager.execute', async () => {
    const res = await orchestrate(input({ userId: 'user-1', message: VIDEO_CMD }));
    expect(res.metadata.authRequired).toBeUndefined();
    expect(sm.execute).toHaveBeenCalledTimes(1);
    expect(sm.execute.mock.calls[0]![0].intent).toBe('video_generation');
  });

  it('a signed-in film reaches the film composite', async () => {
    await orchestrate(input({ userId: 'user-1', message: FILM_CMD }));
    expect(handleFilmComposite).toHaveBeenCalledTimes(1);
    expect(sm.execute).not.toHaveBeenCalled();
  });

  it('FILM_ALLOW_ANONYMOUS=1 lets the anonymous image and film commands through', async () => {
    process.env.FILM_ALLOW_ANONYMOUS = '1';
    const img = await orchestrate(input());
    expect(img.metadata.authRequired).toBeUndefined();
    expect(sm.execute).toHaveBeenCalledTimes(1);
    // There is no account behind 'anonymous' to price against — the balance gate skips it by design.
    expect(hasSufficientBalance).not.toHaveBeenCalled();

    await orchestrate(input({ message: FILM_CMD }));
    expect(handleFilmComposite).toHaveBeenCalledTimes(1);
  });

  it('FILM_ALLOW_ANONYMOUS=0 keeps it closed', async () => {
    process.env.FILM_ALLOW_ANONYMOUS = '0';
    const res = await orchestrate(input());
    expect(res.metadata.authRequired).toBe(true);
    expectNoProviderReached();
  });
});

describe('text chat is not a generation', () => {
  it('an anonymous plain question is answered, not refused', async () => {
    process.env.GEMINI_API_KEY = 'test-key-not-real';
    const res = await orchestrate(input({ message: 'what is the capital of Georgia?' }));
    expect(res.metadata.authRequired).toBeUndefined();
    expect(generateWithGemini).toHaveBeenCalled();
    expect(sm.execute).not.toHaveBeenCalled();
  });
});
