/** @jest-environment node */
/**
 * POST /api/video/assemble — the film / ad score is ElevenLabs Music and NOTHING else.
 *
 * ⚠️ PROJECT_MASTER R7 (no silent fallback): with REPLICATE_API_TOKEN set, an ElevenLabs Music miss used to be re-scored
 * on Replicate MusicGen, a provider the platform no longer allows, and the film shipped with a bed nobody chose. The
 * score is one leg of a film that otherwise renders, so its failure is the leg's own explicit outcome — no music,
 * `scoreFallback: null` (the studio's "no music could be generated" note, lib/chat/filmDelivery) — never a second
 * provider. The token is SET and MusicGen is mocked to SUCCEED here, so a fallback put back would show up at once.
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
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({
  reSignIfInternal: jest.fn(async (u: string) => u),
  uploadAndSign: jest.fn(async () => 'https://storage.example/el-score.mp3'),
}));
jest.mock('../../../../lib/video/remixOps', () => ({
  muxAudioOntoVideo: jest.fn(async () => 'https://storage.example/scored-master.mp4'),
  fitAspect: jest.fn(),
}));
jest.mock('../../../../lib/video/surgicalOps', () => ({ probeDimensions: jest.fn() }));
jest.mock('../../../../lib/orchestrator/ffmpeg-assembly', () => ({ assembleWithFfmpeg: jest.fn() }));
jest.mock('../../../../lib/pipeline/compositing/word-synced-captions', () => ({}));
jest.mock('../../../../lib/pipeline/compositing/caption-burn', () => ({ overlayCaptionsOnUrl: jest.fn() }));
jest.mock('../../../../lib/elevenlabs/music', () => ({
  composeElevenLabsMusic: jest.fn(),
  hasElevenLabsMusicKey: jest.fn(() => true),
  buildElevenMusicPrompt: jest.fn(() => ({ prompt: 'cinematic instrumental film score', instrumental: true })),
}));
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
// Not imported by the route any more — mocked (to SUCCEED) so a fallback put back through it would be caught.
jest.mock('../../../../lib/ai/replicate', () => ({ generateMusic: jest.fn(async () => ({ audioUrl: 'https://replicate.delivery/musicgen.mp3' })) }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { composeElevenLabsMusic, hasElevenLabsMusicKey } from '../../../../lib/elevenlabs/music';
import { generateMusic } from '../../../../lib/ai/replicate';
import { muxAudioOntoVideo } from '../../../../lib/video/remixOps';
import { deductCredits, refundCredits } from '../../../../lib/orchestrator/ledger';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/video/assemble', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const CLIP = 'https://storage.example/clip-0.mp4';
const FILM = { segments: [{ url: CLIP, durationSec: 8 }], scorePrompt: 'a quiet morning in old Tbilisi' };
const ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  // ElevenLabs is raced against a 90 s timer the route never clears; fake timers keep that from holding the worker.
  jest.useFakeTimers();
  process.env = { ...ENV, REPLICATE_API_TOKEN: 'r8-test-token' }; // the old MusicGen leg's gate — open on purpose
  (hasElevenLabsMusicKey as jest.Mock).mockReturnValue(true);
  (composeElevenLabsMusic as jest.Mock).mockResolvedValue({ audio: Buffer.from('el'), contentType: 'audio/mpeg' });
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

test('ElevenLabs Music scores the film (the baseline): scoreFallback "elevenlabs-music"', async () => {
  const res = await POST(post(FILM));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({
    url: 'https://storage.example/scored-master.mp4', scoreFallback: 'elevenlabs-music', musicUrl: 'https://storage.example/el-score.mp3', single: true,
  });
  expect(generateMusic).not.toHaveBeenCalled();
});

test('an ElevenLabs Music FAILURE leaves the film without music and says so — MusicGen is never asked', async () => {
  (composeElevenLabsMusic as jest.Mock).mockRejectedValue(new Error('ElevenLabs 429'));
  const res = await POST(post(FILM));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ url: CLIP, scoreFallback: null, musicUrl: null, single: true });
  expect(generateMusic).not.toHaveBeenCalled();
  expect(muxAudioOntoVideo).not.toHaveBeenCalled();
  // Nothing was produced (no bed, no voiceover, no overlay), so the route's existing rule hands the stitch charge back.
  expect(deductCredits).toHaveBeenCalledTimes(1);
  expect(refundCredits).toHaveBeenCalledTimes(1);
  expect((refundCredits as jest.Mock).mock.calls[0][2]).toMatch(/^assemble-single:.*:refund$/);
});

test('no ElevenLabs key: the same — no music, no MusicGen', async () => {
  (hasElevenLabsMusicKey as jest.Mock).mockReturnValue(false);
  const json = await (await POST(post(FILM))).json();
  expect(json).toMatchObject({ url: CLIP, scoreFallback: null, musicUrl: null });
  expect(composeElevenLabsMusic).not.toHaveBeenCalled();
  expect(generateMusic).not.toHaveBeenCalled();
});
