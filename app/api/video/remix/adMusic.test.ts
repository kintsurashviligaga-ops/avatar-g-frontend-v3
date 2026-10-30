/** @jest-environment node */
/**
 * POST /api/video/remix op=productad — REMOVED (GG 2026-10-27 „პროდუქტის რეკლამა საერთოდ ამოვიღოთ სერვისებიდან"): the route
 * refuses it before any charge or provider call. History: the single-clip ad's music bed was Lyria on Vertex only (MASTER TASK
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

test('the product ad is removed (GG 2026-10-27): 410 service_removed before the auth, the charge, Veo or Lyria', async () => {
  const res = await POST(post(AD));
  expect(res.status).toBe(410);
  expect(res.headers.get('cache-control')).toBe('no-store');
  const json = await res.json();
  expect(json).toMatchObject({ code: 'service_removed', tool: 'product' });
  expect(json.messages.ka).toContain('პროდუქტის რეკლამა');
  expect(deductCreditsOnce).not.toHaveBeenCalled();
  expect(composeLyriaBed).not.toHaveBeenCalled();
  expect(muxAudioOntoVideo).not.toHaveBeenCalled();
  expect(replicateCalls()).toEqual([]);
});

test('a secondary clip of an old multi-clip ad is refused the same way', async () => {
  const res = await POST(post({ ...AD, sceneIndex: 1 }));
  expect(res.status).toBe(410);
  expect(deductCreditsOnce).not.toHaveBeenCalled();
  expect(refundCredits).not.toHaveBeenCalled();
});
