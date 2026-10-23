/** @jest-environment node */
/**
 * POST /api/video/assemble — the film / ad score is Lyria on Vertex and NOTHING else (MASTER TASK v3.1; ElevenLabs
 * Music left in PR 6), and only what is verified on this project: an instrumental on the clip model, a longer bed only
 * on a verified Pro, a sung song only once Lyria vocals are verified.
 *
 * ⚠️ PROJECT_MASTER R7 (no silent fallback): with REPLICATE_API_TOKEN set, a score miss used to be re-scored
 * on Replicate MusicGen, a provider the platform no longer allows, and the film shipped with a bed nobody chose. The
 * score is one leg of a film that otherwise renders, so its failure is the leg's own explicit outcome — no music,
 * `scoreFallback: null` (the studio's "no music could be generated" note, lib/chat/filmDelivery) — never a second
 * provider. The token is SET and every request goes to a network spy, so a MusicGen call put back (its Replicate client
 * is gone, PR 20) would show up at once.
 *
 * Driven through the single-clip path (resolveMusicBed is shared with the multi-clip saga). Every provider, the ledger,
 * storage and the stores are mocked — no network, no ffmpeg, no spend.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/api/requireAuthForGeneration', () => ({ requireAuthForGeneration: jest.fn(() => ({ response: null })) }));
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } },
}));
jest.mock('../../../../lib/orchestrator/saga', () => ({ runSaga: jest.fn() }));
jest.mock('../../../../lib/orchestrator/idempotency', () => ({
  lockTokens: jest.fn(async () => ({ id: 'lock-1' })),
  commitTokenLock: jest.fn(async () => undefined),
  releaseTokenLock: jest.fn(async () => undefined),
  claimIdempotencyKey: jest.fn(async () => true),
  releaseIdempotencyKey: jest.fn(async () => undefined),
  hashPayload: jest.fn(async () => 'hash'),
}));
jest.mock('../../../../lib/orchestrator/runpod-adapter', () => ({ readRunPodConfig: jest.fn(() => null), dispatchRunPod: jest.fn() }));
jest.mock('../../../../lib/orchestrator/ledger', () => ({
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundCredits: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../../../../lib/chat/filmComposite', () => ({ isAdminUser: jest.fn(async () => false) }));
jest.mock('../../../../lib/billing/wallet-ledger', () => ({ consumeFreeFilm: jest.fn(async () => null), restoreFreeFilm: jest.fn() }));
jest.mock('../../../../lib/billing/entitlements', () => ({ markFreeOutput: jest.fn() }));
// The owner gate is pinned in lib/security/callerMedia.test.ts and callerMedia.test.ts here; every URL passes it.
jest.mock('../../../../lib/security/callerMedia', () => ({ firstUnreadableOwnUrl: jest.fn(async () => -1) }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({
  reSignIfInternal: jest.fn(async (u: string) => u),
  uploadAndSign: jest.fn(async () => 'https://storage.example/lyria-score.mp3'),
}));
jest.mock('../../../../lib/video/remixOps', () => ({
  muxAudioOntoVideo: jest.fn(async () => 'https://storage.example/scored-master.mp4'),
  fitAspect: jest.fn(),
}));
jest.mock('../../../../lib/video/surgicalOps', () => ({ probeDimensions: jest.fn() }));
jest.mock('../../../../lib/orchestrator/ffmpeg-assembly', () => ({ assembleWithFfmpeg: jest.fn() }));
jest.mock('../../../../lib/pipeline/compositing/word-synced-captions', () => ({}));
jest.mock('../../../../lib/pipeline/compositing/caption-burn', () => ({ overlayCaptionsOnUrl: jest.fn() }));
// Lyria itself: lib/audio/lyriaBed (the plan, the prompt, the upload) runs for real on top of it.
jest.mock('../../../../lib/ai/lyriaMusic', () => ({ generateLyriaTrack: jest.fn(), hasLyriaProvider: jest.fn(() => true) }));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => `EN: ${p}`) }));
jest.mock('../../../../lib/orchestrator/masterQa', () => ({}));
jest.mock('../../../../lib/ai/visionQualityGate', () => ({ evaluateRenderQuality: jest.fn(), visionQaEnabled: jest.fn(() => false) }));
jest.mock('../../../../lib/chat/filmStatusStore', () => ({
  recordFilmAssembling: jest.fn(), recordFilmMaster: jest.fn(async () => undefined), recordFilmFailed: jest.fn(),
  getFilmStatus: jest.fn(), getFilmPaid: jest.fn(), isFilmPaidUpstream: jest.fn(() => false),
  consumeFilmBilling: jest.fn(), restoreFilmBilling: jest.fn(),
}));
jest.mock('../../../../lib/pipeline/compositing/ffmpeg-overlay', () => ({ overlayMasterUrl: jest.fn(), hasOverlayContent: jest.fn(() => false) }));
jest.mock('../../../../lib/pipeline/qaAgent', () => ({ keepLiveClips: jest.fn(async (s: unknown[]) => s) }));
jest.mock('../../../../lib/pipeline/marketing-from-brief', () => ({ deriveMarketingFromBrief: jest.fn() }));
jest.mock('../../../../lib/chat/filmVoiceover', () => ({ textToHostedSpeech: jest.fn(), sanitizeSpokenText: jest.fn((t: string) => t) }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ recordCompletedFilm: jest.fn() }));
jest.mock('../../../../lib/pipeline/cost', () => ({ estimateFilmCostUsd: jest.fn(() => 0) }));
jest.mock('../../../../lib/pipeline/checkpoints', () => ({ saveClipCheckpoints: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { generateLyriaTrack, hasLyriaProvider } from '../../../../lib/ai/lyriaMusic';
import { stitchedSeconds } from '../../../../lib/orchestrator/ffmpeg-filtergraph';
import { VIDEO_FPS } from '../../../../lib/video/durationContract';
import { muxAudioOntoVideo } from '../../../../lib/video/remixOps';
import { deductCredits, refundCredits } from '../../../../lib/orchestrator/ledger';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/video/assemble', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const CLIP = 'https://storage.example/clip-0.mp4';
const FILM = { segments: [{ url: CLIP, durationSec: 8 }], scorePrompt: 'instrumental music for a quiet morning in old Tbilisi' };
const ENV = { ...process.env };
/** Any request that reached Replicate (MusicGen) — the spy refuses it, so a call shows up here. */
const replicateCalls = () => jest.mocked(fetch).mock.calls.filter(([u]) => /replicate\.com/.test(String(u)));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  process.env = { ...ENV, REPLICATE_API_TOKEN: 'r8-test-token' }; // the old MusicGen leg's gate — open on purpose
  delete process.env.MUSIC_LYRIA_PRO_VERIFIED;
  delete process.env.MUSIC_LYRIA_PRO_SECONDS;
  delete process.env.MUSIC_LYRIA_VOCALS_VERIFIED;
  (hasLyriaProvider as jest.Mock).mockReturnValue(true);
  (generateLyriaTrack as jest.Mock).mockResolvedValue({ base64: 'AAAA', mime: 'audio/mpeg' });
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  process.env = { ...ENV };
});

const lyriaCall = () => (generateLyriaTrack as jest.Mock).mock.calls[0][0] as { prompt: string; instrumental: boolean; model: string };

test('an explicitly requested score uses Lyria: an instrumental on the clip model, scoreFallback "lyria"', async () => {
  const res = await POST(post(FILM));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({
    url: 'https://storage.example/scored-master.mp4', scoreFallback: 'lyria', musicUrl: 'https://storage.example/lyria-score.mp3', single: true,
  });
  expect(lyriaCall()).toMatchObject({ instrumental: true, model: 'lyria-3-clip-preview' });
  expect(replicateCalls()).toEqual([]);
});

test('a speech film without a music request keeps its native audio and never orders a score', async () => {
  const res = await POST(post({ ...FILM, scorePrompt: 'a quiet morning in old Tbilisi' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ url: CLIP, scoreFallback: null, musicUrl: null, single: true });
  expect(generateLyriaTrack).not.toHaveBeenCalled();
  expect(replicateCalls()).toEqual([]);
  expect(muxAudioOntoVideo).not.toHaveBeenCalled();
});

test('a Lyria miss leaves the film without music and says so — MusicGen is never asked', async () => {
  (generateLyriaTrack as jest.Mock).mockResolvedValue(null);
  const res = await POST(post(FILM));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ url: CLIP, scoreFallback: null, musicUrl: null, single: true });
  expect(replicateCalls()).toEqual([]);
  expect(muxAudioOntoVideo).not.toHaveBeenCalled();
  // Nothing was produced (no bed, no voiceover, no overlay), so the route's existing rule hands the stitch charge back.
  expect(deductCredits).toHaveBeenCalledTimes(1);
  expect(refundCredits).toHaveBeenCalledTimes(1);
  expect((refundCredits as jest.Mock).mock.calls[0][2]).toMatch(/^assemble-single:.*:refund$/);
});

test('Lyria not configured: the same — no music, no MusicGen', async () => {
  (hasLyriaProvider as jest.Mock).mockReturnValue(false);
  const json = await (await POST(post(FILM))).json();
  expect(json).toMatchObject({ url: CLIP, scoreFallback: null, musicUrl: null });
  expect(generateLyriaTrack).not.toHaveBeenCalled();
  expect(replicateCalls()).toEqual([]);
});

describe('the score is as long as Lyria is verified for', () => {
  // An instrumental score (no music video): 6 × 8 s scenes stitch to more than the clip model's 30 s.
  const segments = Array.from({ length: 6 }, (_, i) => ({ url: `https://storage.example/clip-${i}.mp4`, durationSec: 8 }));
  const filmSec = Math.round(stitchedSeconds(6, 8, undefined, VIDEO_FPS));

  test('the clip model (about 30 s) until Lyria Pro is verified: the rest of a longer film has no music', async () => {
    await POST(post({ segments, scorePrompt: FILM.scorePrompt })).catch(() => undefined);
    expect(generateLyriaTrack).toHaveBeenCalledTimes(1);
    expect(lyriaCall().model).toBe('lyria-3-clip-preview');
    expect(lyriaCall().prompt).toContain('30-second');
    expect(filmSec).toBeGreaterThan(30);
  });

  test('a verified Pro makes the whole film, up to the length it was verified at', async () => {
    process.env.MUSIC_LYRIA_PRO_VERIFIED = '1';
    process.env.MUSIC_LYRIA_PRO_SECONDS = '120';
    await POST(post({ segments, scorePrompt: FILM.scorePrompt })).catch(() => undefined);
    expect(lyriaCall().model).toBe('lyria-3-pro-preview');
    expect(lyriaCall().prompt).toContain(`${filmSec}-second`);
    expect(lyriaCall().prompt).toContain(`About ${filmSec} seconds long`);
  });
});

describe('a sung song (music video)', () => {
  const segments = Array.from({ length: 3 }, (_, i) => ({ url: `https://storage.example/clip-${i}.mp4`, durationSec: 8 }));
  const SONG = { segments, scorePrompt: 'ძველ ფაბში მღერის ბლუზს', musicVideoMode: true };

  test('before Lyria vocals are verified: no music, and no instrumental is put in its place', async () => {
    await POST(post(SONG)).catch(() => undefined);
    expect(generateLyriaTrack).not.toHaveBeenCalled();
    expect(replicateCalls()).toEqual([]);
  });

  test('once verified: the brief in English, the song language from what was typed, a tempo on the 8 s scene grid', async () => {
    process.env.MUSIC_LYRIA_VOCALS_VERIFIED = '1';
    await POST(post(SONG)).catch(() => undefined);
    expect(lyriaCall()).toMatchObject({ instrumental: false, model: 'lyria-3-clip-preview' });
    expect(lyriaCall().prompt).toContain('Theme: "EN: ძველ ფაბში მღერის ბლუზს"');
    expect(lyriaCall().prompt).toContain('sung in Georgian');
    expect(lyriaCall().prompt).toContain('90 BPM'); // blues (80) moved to the nearest tempo where 8 s is whole bars
  });
});
