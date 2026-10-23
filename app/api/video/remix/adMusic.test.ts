/** @jest-environment node */
/**
 * POST /api/video/remix op=productad — the single-clip ad's music bed is Lyria on Vertex and NOTHING else (MASTER TASK
 * v3.1; ElevenLabs Music left in PR 6): an instrumental on the clip model, the one Lyria capability proven here.
 *
 * ⚠️ PROJECT_MASTER R7 (no silent fallback): a score miss used to drop to Replicate MusicGen, so the ad
 * came back scored by a provider the platform no longer allows, with nothing in the response to say so. The bed is an
 * optional leg of an ad that is already rendered and paid for, so its failure is the leg's own explicit outcome — the
 * clip delivered WITHOUT music and reported `music: false` — and never a second provider. MusicGen's Replicate client is
 * gone (PR 20), so a call put back would have to reach the network, and the network spy refuses and records every request.
 *
 * Every provider, the ledger, storage and the idempotency store are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } },
}));
jest.mock('../../../../lib/video/trimClip', () => ({ trimClip: jest.fn() }));
jest.mock('../../../../lib/video/remixOps', () => ({
  muxAudioOntoVideo: jest.fn(async () => 'https://storage.example/scored.mp4'),
  extractFrame: jest.fn(), kenBurnsClip: jest.fn(), colorGrade: jest.fn(), changeSpeed: jest.fn(),
  changeSpeedRamp: jest.fn(), stabilizeClip: jest.fn(), addWatermark: jest.fn(),
  fitImageToAspect: jest.fn(async (i: string) => i), fitAspect: jest.fn(),
}));
jest.mock('../../../../lib/ai/veoClipSync', () => ({
  renderVeoClipSync: jest.fn(async () => ({ url: 'https://storage.example/veo-ad.mp4', engine: 'Veo 3.1' })),
}));
jest.mock('../../../../lib/pipeline/compositing/ffmpeg-overlay', () => ({ overlayMasterUrl: jest.fn() }));
jest.mock('../../../../lib/chat/filmVoiceover', () => ({ textToHostedSpeech: jest.fn() }));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../../../../lib/ai/lipsync', () => ({ filmLipsyncCreate: jest.fn(), lipsyncFetch: jest.fn() }));
jest.mock('../../../../lib/security/callerMedia', () => ({
  // The owner rule is pinned in lib/security/callerMedia.test.ts; here an https ref passes as given, a path does not.
  resolveCallerMedia: jest.fn(async (v: unknown) =>
    (typeof v === 'string' && /^https:\/\//.test(v) ? { ok: true, url: v, own: false } : { ok: false, reason: 'invalid' })),
}));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({
  reSignIfInternal: jest.fn(async (u: string) => u),
  createSignedAssetUrl: jest.fn(),
  uploadAndSign: jest.fn(async () => 'https://storage.example/ad-music.mp3'),
}));
jest.mock('../../../../lib/audio/lyriaBed', () => ({
  ...jest.requireActual('../../../../lib/audio/lyriaBed'),
  lyriaBedReady: jest.fn(() => true),
  composeLyriaBed: jest.fn(),
}));
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })),
  createServiceRoleClient: jest.fn(),
}));
jest.mock('../../../../lib/chat/filmComposite', () => ({ isAdminUser: jest.fn(async () => false) }));
jest.mock('../../../../lib/orchestrator/ledger', () => ({
  deductCreditsOnce: jest.fn(async () => ({ ok: true })),
  refundCredits: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../../../../lib/orchestrator/idempotency', () => ({
  claimIdempotencyKey: jest.fn(async () => true),
  releaseIdempotencyKey: jest.fn(async () => undefined),
  hashPayload: jest.fn(async () => 'hash'),
}));
jest.mock('../../../../lib/chat/filmStatusStore', () => ({ recordFilmMaster: jest.fn() }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ recordCompletedFilm: jest.fn() }));
jest.mock('../../../../lib/veo/policy', () => ({ isGoogleOnly: jest.fn(() => true) }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { composeLyriaBed, lyriaBedReady } from '../../../../lib/audio/lyriaBed';
import { muxAudioOntoVideo } from '../../../../lib/video/remixOps';
import { deductCreditsOnce, refundCredits } from '../../../../lib/orchestrator/ledger';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/video/remix', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** A single-clip ad: no sceneIndex, so the route lays its own preset score under it. */
const AD = { op: 'productad', imageUrl: 'https://cdn.example.com/product.jpg', preset: 'luxury', jobId: 'job-ad-1', aspect: '9:16' };
/** Any request that reached Replicate (MusicGen) — the spy refuses it, so a call shows up here. */
const replicateCalls = () => jest.mocked(fetch).mock.calls.filter(([u]) => /replicate\.com/.test(String(u)));

beforeEach(() => {
  jest.clearAllMocks();
  (lyriaBedReady as jest.Mock).mockReturnValue(true);
  (composeLyriaBed as jest.Mock).mockResolvedValue('https://storage.example/ad-music.mp3');
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('Lyria scores the clip (the baseline): an 8 s instrumental on the clip model, music: true', async () => {
  const res = await POST(post(AD));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ url: 'https://storage.example/scored.mp4', music: true, charged: true });
  expect(composeLyriaBed).toHaveBeenCalledTimes(1);
  expect(composeLyriaBed).toHaveBeenCalledWith(expect.objectContaining({
    instrumental: true, folder: 'productad-music', plan: { model: 'lyria-3-clip-preview', sec: 8 },
  }));
  expect(muxAudioOntoVideo).toHaveBeenCalledWith('https://storage.example/veo-ad.mp4', 'https://storage.example/ad-music.mp3', 'under', 12);
  expect(replicateCalls()).toEqual([]);
});

test('a Lyria miss ships the clip without music, says so — and MusicGen is never asked', async () => {
  (composeLyriaBed as jest.Mock).mockResolvedValue(null);
  const res = await POST(post(AD));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ url: 'https://storage.example/veo-ad.mp4', music: false, charged: true });
  expect(replicateCalls()).toEqual([]);
  expect(muxAudioOntoVideo).not.toHaveBeenCalled();
  // The ad itself was delivered, so its charge stands — exactly as before when no bed could be made.
  expect(deductCreditsOnce).toHaveBeenCalledTimes(1);
  expect(refundCredits).not.toHaveBeenCalled();
});

test('Lyria not configured: the same — no music, no MusicGen', async () => {
  (lyriaBedReady as jest.Mock).mockReturnValue(false);
  const json = await (await POST(post(AD))).json();
  expect(json).toMatchObject({ url: 'https://storage.example/veo-ad.mp4', music: false });
  expect(composeLyriaBed).not.toHaveBeenCalled();
  expect(replicateCalls()).toEqual([]);
});

test('a replayed charge (same jobId and body, already charged) is refused with 409 before anything renders (C5)', async () => {
  (deductCreditsOnce as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'replay', balance: 75 });
  const res = await POST(post(AD));
  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({ url: null, success: false, code: 'duplicate_request' });
  expect(composeLyriaBed).not.toHaveBeenCalled();
  expect(muxAudioOntoVideo).not.toHaveBeenCalled();
  expect(refundCredits).not.toHaveBeenCalled();
});
