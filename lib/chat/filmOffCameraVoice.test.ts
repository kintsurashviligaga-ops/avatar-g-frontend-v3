/** @jest-environment node */
/**
 * A Georgian film is voiced OFF CAMERA by one voice — Veo never speaks Georgian.
 *
 * ⚠️ 2026-10-16: the owner's 32 s ad (4 × 8 s, a Georgian narration typed in the Video panel, male Georgian voice picked)
 * was delegated to Veo scene by scene. Veo cannot speak Georgian: every scene came back in a different voice and the
 * words were garbled. The owner chose one Georgian voice over the whole film with the presenter not talking on screen.
 * handleFilmComposite is driven for real here (Vertex transport, as in Production) with the ledger, the wallet, the
 * provider and the voice legs mocked — no network, no spend.
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
jest.mock('../orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => null) }));
jest.mock('./promptAgent', () => ({ runPromptAgent: jest.fn(async () => null) }));
jest.mock('./filmVoiceover', () => ({
  generateFilmVoiceover: jest.fn(async () => null),
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
import { generateFilmVoiceover } from './filmVoiceover';
import { SILENT_PRESENTER_DIRECTION, silenceSpeechVerbs } from './filmPipeline';
import type { OrchestratorInput } from './providerRouter';

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
  (generateFilmVoiceover as jest.Mock).mockResolvedValue('https://store.local.test/voiceover.mp3');
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
});
afterEach(() => jest.restoreAllMocks());


/** The approved storyboard's scenes, as the board sends them: the presenter is written as TALKING. */
const BOARD = [
  'A presenter in a black blazer on a pitch-black stage begins speaking directly to the camera with open hand gestures.',
  'Medium close-up: the presenter talks to the camera and smiles.',
  'The presenter explains the studio, leaning in, warm light on the face.',
  'Close-up: the presenter says the final words and nods.',
];
const KA_SCRIPT = 'წარმოგიდგენთ ახალ ქართულ სტუდიას. ერთი ფანჯრიდან ქმნით ვიდეოს, ხმას და მუსიკას. სცადეთ დღესვე.';
/** The 2026-10-16 ad's panel: 4 × 8 s, Fast, sound on, a Georgian narration, a male Georgian voice. */
const adPanel = (narrationScript: string) => ({
  sceneCount: 4, clipSec: 8, veo: veo('fast'), sceneScripts: BOARD,
  narrationScript, narratorGender: 'female', voicePersona: 'male', voiceLanguage: 'ka', voiceTone: 'emotional',
});
const clipCalls = () => mockExecute.mock.calls
  .map((c) => c[0] as { serviceContext: string; userPrompt: string; selectedOptions: Record<string, string> })
  .filter((r) => r.serviceContext === 'video');

describe('a Georgian narration is spoken off camera by ONE voice', () => {
  test('no clip is asked to speak Georgian: every scene plays silent, with Veo audio off', async () => {
    const res = await handleFilmComposite(input(adPanel(KA_SCRIPT)));
    expect(res.success).toBe(true);
    const clips = clipCalls();
    expect(clips).toHaveLength(4);
    for (const clip of clips) {
      expect(clip.userPrompt).not.toMatch(/[Ⴀ-ჿ]/);
      expect(clip.userPrompt).not.toMatch(/speaks aloud|lips moving in sync/);
      expect(clip.userPrompt).toContain(SILENT_PRESENTER_DIRECTION);
      // The approved scene still reads the same, with the speech verbs played as presenting.
      expect(clip.userPrompt).not.toMatch(/\b(speaking|talks|explains|says)\b/);
      expect(clip.selectedOptions.spokenLine).toBeUndefined();
      expect(clip.selectedOptions.veoGenerateAudio).toBe('0');
      expect(clip.selectedOptions.negativePrompt.startsWith('talking, speaking, moving lips')).toBe(true);
    }
    expect(clips[0]!.userPrompt).toContain('begins presenting directly to the camera with open hand gestures');
  });

  test('the whole narration is voiced once, verbatim, in the male Georgian voice the panel picked', async () => {
    await handleFilmComposite(input(adPanel(KA_SCRIPT)));
    expect(generateFilmVoiceover).toHaveBeenCalledTimes(1);
    expect(generateFilmVoiceover).toHaveBeenCalledWith(expect.objectContaining({
      narrationScript: KA_SCRIPT, voicePersona: 'male', voiceLanguage: 'ka', totalSec: 32,
    }));
  });

  test('the price is the same quote: muting Veo’s own audio does not change what the film costs', async () => {
    await handleFilmComposite(input(adPanel(KA_SCRIPT)));
    expect(mockDeduct).toHaveBeenCalledTimes(1);
    expect(mockDeduct.mock.calls[0]![1]).toBe(100);
  });

  test('a Georgian line too long to place in one scene still leaves every scene silent (no clip talks beside the voice)', async () => {
    const oneLong = `${KA_SCRIPT} ${KA_SCRIPT} ${KA_SCRIPT}`.replace(/\n/g, ' '); // one line, past the 200-char spoken-line bound
    expect(oneLong.length).toBeGreaterThan(200);
    const res = await handleFilmComposite(input(adPanel(oneLong)));
    expect(res.success).toBe(true);
    for (const clip of clipCalls()) {
      expect(clip.userPrompt).toContain(SILENT_PRESENTER_DIRECTION);
      expect(clip.selectedOptions.veoGenerateAudio).toBe('0');
    }
    expect(generateFilmVoiceover).toHaveBeenCalledWith(expect.objectContaining({ narrationScript: oneLong }));
  });

  test('a narration longer than the film is refused before anything is charged or rendered', async () => {
    const res = await handleFilmComposite(input({ ...adPanel(Array(6).fill(KA_SCRIPT).join(' ')), sceneCount: 2, sceneScripts: BOARD.slice(0, 2) }));
    expect(res.success).toBe(false);
    expect((res.metadata as { speechTooLong?: boolean }).speechTooLong).toBe(true);
    expect(mockDeduct).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
    expect(generateFilmVoiceover).not.toHaveBeenCalled();
  });
});

describe('no voice, no film: the off-camera voice is made before anything is charged or rendered', () => {
  // ⚠️ 2026-10-17: the paid 32 s ad came back SILENT. Production's ElevenLabs key was the key's ID, every voice request
  // was refused, and the voice leg (run beside the clips) quietly returned nothing after the Veo render was paid for.
  test('ElevenLabs gives no voice → refused, nothing charged, no clip sent, and the press can be tried again', async () => {
    (generateFilmVoiceover as jest.Mock).mockResolvedValue(null);
    const res = await handleFilmComposite(input(adPanel(KA_SCRIPT)));
    expect(res.success).toBe(false);
    expect((res.metadata as { voiceUnavailable?: boolean }).voiceUnavailable).toBe(true);
    expect(res.message).toMatch(/nothing was charged/);
    expect(mockDeduct).not.toHaveBeenCalled();
    expect(mockConsumeFree).not.toHaveBeenCalled();
    expect(clipCalls()).toHaveLength(0);
    expect(mockReleaseKey).toHaveBeenCalledTimes(1);
  });

  test('the same for the founder, whose film the platform pays for', async () => {
    (generateFilmVoiceover as jest.Mock).mockResolvedValue(null);
    const res = await handleFilmComposite(input(adPanel(KA_SCRIPT), 'founder'));
    expect(res.success).toBe(false);
    expect(clipCalls()).toHaveLength(0);
  });

  test('the voice is made first, then the charge, then the clips', async () => {
    const res = await handleFilmComposite(input(adPanel(KA_SCRIPT)));
    expect(res.success).toBe(true);
    const voiceAt = (generateFilmVoiceover as jest.Mock).mock.invocationCallOrder[0]!;
    expect(voiceAt).toBeLessThan(mockDeduct.mock.invocationCallOrder[0]!);
    expect(voiceAt).toBeLessThan(mockExecute.mock.invocationCallOrder[0]!);
  });

  test('a film Veo voices in-clip is not held to an ElevenLabs voice it never asked for', async () => {
    (generateFilmVoiceover as jest.Mock).mockResolvedValue(null);
    const en = 'Meet the new studio. One window makes the video, the voice and the music. Try it today.';
    const res = await handleFilmComposite(input({ ...adPanel(en), voiceLanguage: 'en' }));
    expect(res.success).toBe(true);
    expect(clipCalls()).toHaveLength(4);
  });
});

describe('a language Veo speaks keeps its in-clip voice (unchanged)', () => {
  test('an English narration is still spoken by the presenter in each clip, with no second voice laid over it', async () => {
    const en = 'Meet the new studio. One window makes the video, the voice and the music. Try it today.';
    await handleFilmComposite(input({ ...adPanel(en), voiceLanguage: 'en' }));
    const clips = clipCalls();
    expect(clips).toHaveLength(4);
    expect(clips.some((c) => c.userPrompt.includes('Meet the new studio.'))).toBe(true);
    for (const clip of clips) {
      expect(clip.userPrompt).not.toContain(SILENT_PRESENTER_DIRECTION);
      expect(clip.selectedOptions.veoGenerateAudio).toBe('1');
    }
    expect(generateFilmVoiceover).not.toHaveBeenCalled();
  });
});

describe('silenceSpeechVerbs', () => {
  test('speech verbs become presenting ones; capitals kept; other words untouched', () => {
    expect(silenceSpeechVerbs('Speaking to camera, he says the line and talks on; the speaker smiles.'))
      .toBe('Presenting to camera, he presents the line and presents on; the speaker smiles.');
    expect(silenceSpeechVerbs('A slow dolly in on a black stage.')).toBe('A slow dolly in on a black stage.');
  });
});
