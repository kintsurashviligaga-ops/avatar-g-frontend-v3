/** @jest-environment node */
/**
 * The film START of a sequential chain: scene 1 renders now, the later scenes wait on the server for the previous clip's
 * real last frame (lib/chat/filmChain). Driven for real (Vertex transport, Google-only) with the ledger, the wallet, the
 * provider and the voice legs mocked — no network, no spend. The poll side: lib/chat/filmChainPoll.test.ts.
 */
jest.mock('server-only', () => ({}));

let mockBalance: number | null = 1000;
jest.mock('../supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mockBalance === null ? null : { credits_balance: mockBalance }, error: null }) }) }),
    }),
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: id === 'founder' ? 'founder@example.test' : 'user@example.test' } }, error: null }) } },
  })),
  authedClientFromRequest: jest.fn(),
}));
jest.mock('../auth/adminGuard', () => ({ isAdminEmail: (e: string) => e === 'founder@example.test' }));
jest.mock('../veo/policy', () => ({ isGoogleOnly: jest.fn(() => true) }));
jest.mock('../veo/engine', () => ({ veoTransport: jest.fn(() => 'vertex') }));
jest.mock('../ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => null), uploadBufferAndSign: jest.fn(async () => null) }));
jest.mock('./promptAgent', () => ({ runPromptAgent: jest.fn(async () => null) }));
jest.mock('./filmVoiceover', () => ({
  generateCheckedFilmVoiceover: jest.fn(async () => null),
  generateDialogueVoiceover: jest.fn(async () => null),
  generateDialogueStems: jest.fn(async () => null),
  dialogueStemsViable: jest.fn(() => false),
  wantsCommentary: jest.fn(() => false),
  generateFilmSfx: jest.fn(async () => null),
}));
jest.mock('../ai/qaDirectorAgent', () => ({ evaluateFilmQa: jest.fn(async () => null) }));
jest.mock('../elevenlabs/music', () => ({ hasElevenLabsMusicKey: jest.fn(() => false) }));
jest.mock('./filmClipRetry', () => {
  const actual = jest.requireActual('./filmClipRetry');
  return { ...actual, MAX_CLIP_DISPATCH_ATTEMPTS: 1, clipDispatchJitterMs: () => 0, clipRetryBackoffMs: () => 0 };
});
// Every clip leg runs through withTrace; the film no longer asks it to debit (the test proves it by `deduct`).
const mockWithTraceMeta: Array<Record<string, unknown>> = [];
jest.mock('../observability/agentTrace', () => ({
  withTrace: jest.fn(async (meta: Record<string, unknown>, fn: () => Promise<unknown>) => {
    mockWithTraceMeta.push(meta);
    return fn();
  }),
}));

const mockExecute = jest.fn();
jest.mock('./ServiceManager', () => ({ ServiceManager: jest.fn().mockImplementation(() => ({ execute: (...a: unknown[]) => mockExecute(...a), poll: jest.fn() })) }));

const mockDeduct = jest.fn();
const mockRefund = jest.fn();
jest.mock('../orchestrator/ledger', () => ({
  deductCredits: (...a: unknown[]) => mockDeduct(...a),
  refundCredits: (...a: unknown[]) => mockRefund(...a),
  refundDebitByRef: jest.fn(async () => ({ ok: true })),
}));
const mockConsumeFree = jest.fn();
const mockRestoreFree = jest.fn();
jest.mock('../billing/wallet-ledger', () => ({
  consumeFreeFilm: (...a: unknown[]) => mockConsumeFree(...a),
  restoreFreeFilm: (...a: unknown[]) => mockRestoreFree(...a),
}));

// The film start's duplicate guard (claimPaidStartKey): a store with the database's semantics — first claim of a
// (user, key) wins, a release frees it. Its real atomicity on Postgres: lib/chat/filmBilling.pg.test.ts.
const mockStartKeys = new Set<string>();
const mockClaimStart = jest.fn();
const mockReleaseKey = jest.fn();
jest.mock('../orchestrator/idempotency', () => ({
  ...jest.requireActual('../orchestrator/idempotency'),
  claimPaidStartKey: (...a: unknown[]) => mockClaimStart(...a),
  releaseIdempotencyKey: (...a: unknown[]) => mockReleaseKey(...a),
}));

// R3-A: what the start records server-side for each queued Veo scene (the poll later settles it with Google).
const mockRecordScenes = jest.fn();
jest.mock('./filmBilling', () => ({
  ...jest.requireActual('./filmBilling'),
  recordFilmScenes: (...a: unknown[]) => mockRecordScenes(...a),
}));

import { handleFilmComposite } from './filmComposite';
import { generateDialogueVoiceover, generateCheckedFilmVoiceover } from './filmVoiceover';
import { decodeFilmRef } from './filmTaskRef';
import { deriveFilmTokenId } from './filmStatusStore';
import { getFilmChainPlan, __setFilmChainRedisForTests } from './filmChain';
import type { OrchestratorInput } from './providerRouter';
import { filmCredits } from '@/lib/credits/priceBook';
import { perSceneCredits } from '@/lib/credits/videoPricing';

/** The film under test: 4 × 8 s on Fast (lib/credits/priceBook), and its even per-scene share. */
const FILM_PRICE = filmCredits(32, 'fast', false, 4);
const SCENE_SHARE = perSceneCredits(FILM_PRICE, 4);

const queued = (n: number) => ({ success: true, predictionId: `task-${n}`, predictionStatus: 'processing', metadata: { videoProvider: 'gemini-veo' } });
/** The studio's Veo plan as it travels on the wire (lib/veo/renderOptions.ts VeoRenderOptionsSchema). */
const veo = (tier: 'standard' | 'fast' | 'lite') => ({
  tier, format: '9:16', referenceMode: 'first_frame', generateAudio: true, seedLock: true, enhancePrompt: false, scenes: [],
});

let seq = 0;
const input = (metadata: Record<string, unknown>, userId = 'user-1'): OrchestratorInput => ({
  message: 'A detective waits for an informant on a rain-soaked pier at midnight',
  serviceContext: 'video', agentId: '', userId, sessionId: `s-${++seq}`, locale: 'en', history: [],
  metadata: { orientation: 'vertical', ...metadata },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockWithTraceMeta.length = 0;
  mockBalance = 1000;
  mockDeduct.mockResolvedValue({ ok: true, balance: 900 });
  mockRefund.mockResolvedValue({ ok: true });
  mockRecordScenes.mockResolvedValue('recorded');
  mockConsumeFree.mockResolvedValue(-1); // no free slot
  mockRestoreFree.mockResolvedValue(0);
  mockStartKeys.clear();
  mockClaimStart.mockImplementation(async (uid: string, key: string) => {
    const k = `${uid}|${key}`;
    if (mockStartKeys.has(k)) return 'held';
    mockStartKeys.add(k);
    return 'claimed';
  });
  mockReleaseKey.mockImplementation(async (uid: string, key: string) => { mockStartKeys.delete(`${uid}|${key}`); });
  let n = 0;
  mockExecute.mockImplementation(async () => queued(++n));
  // A Georgian film's off-camera voice is made before anything is charged or sent: it has to come back for the film to start.
  (generateCheckedFilmVoiceover as jest.Mock).mockResolvedValue({ url: 'https://store.local.test/voiceover.mp3', score: null, verdict: null, reads: 1, words: null });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
});
afterEach(() => jest.restoreAllMocks());


const FRAMES = [1, 2, 3, 4].map((n) => `https://frames.example/board-${n}.png`);
const BOARD = [
  'A presenter in a black blazer on a pitch-black stage begins speaking directly to the camera with open hand gestures.',
  'Medium close-up: the presenter talks to the camera and smiles.',
  'The presenter explains the studio, leaning in, warm light on the face.',
  'Close-up: the presenter says the final words and nods.',
];
const KA_SCRIPT = 'წარმოგიდგენთ ახალ ქართულ სტუდიას. ერთი ფანჯრიდან ქმნით ვიდეოს, ხმას და მუსიკას. სცადეთ დღესვე.';
/** The 2026-10-16 ad's panel with its approved storyboard frames: 4 × 8 s, Fast, a Georgian narration. */
const adPanel = (over: Record<string, unknown> = {}) => ({
  sceneCount: 4, clipSec: 8, veo: veo('fast'), sceneScripts: BOARD, sceneFrames: FRAMES,
  narrationScript: KA_SCRIPT, narratorGender: 'female', voicePersona: 'male', voiceLanguage: 'ka', voiceTone: 'emotional', ...over,
});
const clipCalls = () => mockExecute.mock.calls
  .map((c) => c[0] as { serviceContext: string; userPrompt: string; selectedOptions: Record<string, string> })
  .filter((r) => r.serviceContext === 'video');
const tokenOf = (res: { predictionId?: string | null }) => decodeFilmRef(res.predictionId ?? '')!;
const tokenIdOf = (res: { predictionId?: string | null }) => {
  const t = tokenOf(res);
  return deriveFilmTokenId({ sessionId: t.sessionId, createdAt: t.createdAt, seed: t.seed });
};

describe('chain on (a store every poll can read)', () => {
  beforeEach(() => {
    process.env.FILM_CHAIN_MEMORY = '1';
    __setFilmChainRedisForTests(null);
  });
  afterEach(() => { delete process.env.FILM_CHAIN_MEMORY; delete process.env.FILM_SEQUENTIAL_CHAIN; });

  test('only scene 1 is sent, from its storyboard frame, with no end frame to interpolate to', async () => {
    const res = await handleFilmComposite(input(adPanel()));
    expect(res.success).toBe(true);
    const clips = clipCalls();
    expect(clips).toHaveLength(1);
    expect(clips[0]!.selectedOptions.characterReference).toBe(FRAMES[0]);
    expect(clips[0]!.selectedOptions.veoEndFrame).toBeUndefined();
  });

  test('the token says the film is chained; scenes 2–4 wait with no job', async () => {
    const res = await handleFilmComposite(input(adPanel()));
    const t = tokenOf(res);
    expect(t.chain).toBe(true);
    expect(t.clips.map((c) => [c.ordinal, c.status, c.taskRef])).toEqual([
      [t.clips[0]!.ordinal, 'queued', 'task-1'],
      ...t.clips.slice(1).map((c) => [c.ordinal, 'pending', null]),
    ]);
    // The token itself carries no prompt for the waiting scenes: the server keeps them.
    expect(Buffer.from(res.predictionId!.slice('film:'.length), 'base64url').toString('utf8')).not.toMatch(/presenter|stage/);
    // The start says what happens, rather than "1/4 clips dispatched".
    expect(res.message).toContain("Scene 1 dispatched; scenes 2–4 each start from the previous scene's last frame");
    expect(res.message).not.toContain('Clips dispatched: 1/4');
  });

  test('the server keeps scenes 2–4 exactly as the side-by-side start would have sent them, with their own frames as fallback', async () => {
    const res = await handleFilmComposite(input(adPanel()));
    const plan = await getFilmChainPlan(tokenIdOf(res));
    expect(plan).not.toBeNull();
    expect(plan!.uid).toBe('user-1');
    expect(plan!.scenes.map((s) => s.storyboardFrame)).toEqual(FRAMES.slice(1));
    expect(plan!.sceneCredits).toBe(SCENE_SHARE); // the film's price over 4 scenes
    expect(plan!.chargeRef).toMatch(/^filmpay:f[0-9a-f]{16}$/);

    // The same film side by side: its clips 2–4 are what the chain will send (bar the start and end frames).
    process.env.FILM_SEQUENTIAL_CHAIN = '0';
    mockExecute.mockClear();
    await handleFilmComposite(input(adPanel()));
    const parallel = clipCalls();
    expect(parallel).toHaveLength(4);
    plan!.scenes.forEach((scene, i) => {
      const sent = parallel[i + 1]!;
      expect(scene.userPrompt).toBe(sent.userPrompt);
      const { characterReference: _c, veoEndFrame: _e, ...rest } = sent.selectedOptions;
      const { characterReference: _c2, veoEndFrame: _e2, ...kept } = scene.selectedOptions;
      expect(kept).toEqual(rest);
    });
  });

  test('the paid film records the share of scene 1 only; the others are recorded when the poll sends them', async () => {
    // A real Veo task ref (base64url JSON naming the operation), so the share has an operation to settle against.
    const veoRef = (n: number) => Buffer.from(JSON.stringify({ provider: 'gemini-veo', providerTaskId: `projects/p/operations/op-${n}::9:16` })).toString('base64url');
    let n = 0;
    mockExecute.mockImplementation(async () => ({ ...queued(++n), predictionId: veoRef(n) }));
    await handleFilmComposite(input(adPanel()));
    expect(mockDeduct).toHaveBeenCalledTimes(1);
    expect(mockDeduct.mock.calls[0]![1]).toBe(FILM_PRICE); // the price is unchanged
    expect(mockRecordScenes).toHaveBeenCalledTimes(1);
    expect(mockRecordScenes.mock.calls[0]![2]).toEqual([{ ordinal: expect.any(Number), operation: 'projects/p/operations/op-1', credits: SCENE_SHARE }]);
    expect(mockRefund).not.toHaveBeenCalled(); // a waiting scene is not a failed one
  });

  test('English lines Veo speaks in the waiting scenes: they count as Veo scenes, so no second voice is laid over them', async () => {
    // One line per scene, so scenes 2–4 (still waiting at the start) carry lines too.
    const dialogueScript = [
      'Presenter: Meet the new studio built for creators.',
      'Presenter: One window makes your video and your music.',
      'Presenter: Every scene keeps the same face and light.',
      'Presenter: Start your very first film today.',
    ].join('\n');
    const res = await handleFilmComposite(input(adPanel({ narrationScript: undefined, voiceLanguage: 'en', dialogueScript })));
    expect(clipCalls()).toHaveLength(1);
    const plan = (await getFilmChainPlan(tokenIdOf(res)))!;
    expect(plan.scenes.filter((s) => /Every scene keeps the same face|Start your very first film|One window makes/.test(s.userPrompt))).toHaveLength(3);
    expect(generateDialogueVoiceover).not.toHaveBeenCalled();
    expect(generateCheckedFilmVoiceover).not.toHaveBeenCalled();
  });

  test('scene 1 refused: nothing waits on it, the other scenes go side by side as before', async () => {
    let n = 0;
    mockExecute.mockImplementation(async () => (++n === 1
      ? { success: false, predictionStatus: 'failed', metadata: { veoFailure: { reason: 'quota', retryable: false } } }
      : queued(n)));
    const res = await handleFilmComposite(input(adPanel()));
    expect(clipCalls()).toHaveLength(4); // scene 1 once (not again), scenes 2–4 side by side
    expect(tokenOf(res).chain).toBeUndefined();
  });

  test('a music video is not chained (its scenes cut between different shots)', async () => {
    const res = await handleFilmComposite(input(adPanel({ musicVideoMode: true, narrationScript: undefined })));
    expect(clipCalls().length).toBeGreaterThan(1);
    expect(tokenOf(res).chain).toBeUndefined();
  });
});

describe('chain off', () => {
  test('no store every poll can read → every scene is sent at once, exactly as before', async () => {
    __setFilmChainRedisForTests(null);
    const res = await handleFilmComposite(input(adPanel()));
    expect(clipCalls()).toHaveLength(4);
    expect(tokenOf(res).chain).toBeUndefined();
  });
});
