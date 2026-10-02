/** @jest-environment node */
/**
 * POST /api/ai/music — the CHARGE fails closed, a replay is refused, and a failure reports a refund only when one landed.
 *
 * ⚠️ What this pins (each case failed before the change):
 *   · a ledger that DEFINITIVELY fails (deductCredits → 'error') used to sit in the same fail-open `try` as the mutex,
 *     so the track rendered UNBILLED. Now: 503 billing_unavailable, no provider, the mutex released for the retry.
 *   · a byte-identical replay (same jobId + body → same ref) was answered "charged" by deduct_credits' dedupe and
 *     rendered a fresh track for nothing. Now: 409 before any charge or render.
 *   · a failed render said nothing about money. Now `refunded: true` only when refund_credits answered ok — and a
 *     charge whose refund did NOT land never gets the sanitiser's "you were not charged" sentence.
 *   · the provider's raw error text never reaches the body.
 * Every provider, the ledger and the idempotency store are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })),
}));
jest.mock('../../../../lib/api/guard', () => ({ applyApiGuards: jest.fn(async () => ({ response: null, auth: null, budgetRemaining: null })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({ RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } } }));
jest.mock('../../../../lib/agent/optimizer/activeConfig', () => ({ getActiveConfig: jest.fn(async () => null) }));
jest.mock('../../../../lib/elevenlabs/music', () => ({ composeElevenLabsMusic: jest.fn(), hasElevenLabsMusicKey: jest.fn(() => true) }));
jest.mock('../../../../lib/ai/replicate', () => ({ generateMusicCover: jest.fn(), generateVoiceSong: jest.fn(), generateMusic: jest.fn() }));
jest.mock('../../../../lib/udio/client', () => ({ generateUdioTrack: jest.fn() }));
jest.mock('../../../../lib/ai/lyriaMusic', () => ({ hasLyriaProvider: jest.fn(() => true), generateLyriaTrack: jest.fn() }));
jest.mock('../../../../lib/chat/mediaKeys', () => ({ hasUdioApiKey: jest.fn(() => true) }));
jest.mock('../../../../lib/audio/trimAudio', () => ({ trimAudioToDuration: jest.fn() }));
jest.mock('../../../../lib/audio/transcode', () => ({ transcodeVoiceToMp3: jest.fn() }));
jest.mock('../../../../lib/audio/rvc', () => ({ convertSongWithRvc: jest.fn() }));
jest.mock('../../../../lib/audio/voiceModel', () => ({ getUserVoiceModel: jest.fn(async () => null), DEMO_VOICE_USER_ID: 'demo' }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(), createSignedAssetUrl: jest.fn() }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ recordCompletedAsset: jest.fn() }));
jest.mock('../../../../lib/providers/latencyFailover', () => ({ runWithLatencyFailover: jest.fn() }));
jest.mock('../../../../lib/orchestrator/idempotency', () => ({
  isProviderTripped: jest.fn(() => false),
  recordProviderResult: jest.fn(),
  claimIdempotencyKey: jest.fn(async () => true),
  releaseIdempotencyKey: jest.fn(async () => undefined),
  hashPayload: jest.fn(async () => 'hash'),
}));
jest.mock('../../../../lib/orchestrator/ledger', () => ({
  debitExistsForRef: jest.fn(async () => false),
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundCredits: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../../../../lib/credits/musicSettlement', () => ({ settleMusicCharge: jest.fn() }));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({
  // The render's first awaited step. Throwing here is a provider failure right after the reserve.
  promptToEnglish: jest.fn(async () => {
    throw new Error('Replicate API 402: {"title":"Insufficient credit","detail":"Go to https://replicate.com/account/billing"}');
  }),
  lastTranslateOutcome: jest.fn(() => 'ok'),
}));
jest.mock('../../../../lib/audio/trackDuration', () => ({ probeTrackDurationSec: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { promptToEnglish } from '../../../../lib/ai/promptToEnglish';
import { debitExistsForRef, deductCredits, refundCredits } from '../../../../lib/orchestrator/ledger';
import { releaseIdempotencyKey } from '../../../../lib/orchestrator/idempotency';

const post = (body: unknown, locale?: string) =>
  new NextRequest('https://myavatar.ge/api/ai/music', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(locale ? { cookie: `NEXT_LOCALE=${locale}` } : {}) },
    body: JSON.stringify(body),
  });

const BODY = { prompt: 'მშვიდი ფორტეპიანო წვიმიან საღამოს', style: 'ambient', durationSec: 30, jobId: 'job-1' };
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  (debitExistsForRef as jest.Mock).mockResolvedValue(false);
  (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
  (refundCredits as jest.Mock).mockResolvedValue({ ok: true });
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

test('a ledger that definitively failed refuses with 503 billing_unavailable — the track is NOT rendered unbilled', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'error' });
  const res = await POST(post(BODY, 'en'));
  expect(res.status).toBe(503);
  const j = await res.json();
  expect(j).toMatchObject({ success: false, error: 'billing_unavailable', code: 'billing_unavailable' });
  expect(j.message).toMatch(/nothing was charged/i);
  expect(promptToEnglish).not.toHaveBeenCalled(); // the render never began
  expect(fetchSpy).not.toHaveBeenCalled(); // not even the cover art
  expect(refundCredits).not.toHaveBeenCalled(); // nothing was taken, nothing to give back
  expect(releaseIdempotencyKey).toHaveBeenCalled(); // the retry is not locked out for five minutes
});

test('the 503 copy follows the caller’s language (ka by default)', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'error' });
  const j = await (await POST(post(BODY))).json();
  expect(j.message).toMatch(/კრედიტი არ ჩამოგეჭრა/);
});

test('a ledger without the RPC (skipped) still proceeds uncharged — the documented degrade, unchanged', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'skipped' });
  const res = await POST(post(BODY));
  expect(promptToEnglish).toHaveBeenCalled(); // rendered
  expect(refundCredits).not.toHaveBeenCalled(); // nothing was charged, so nothing is refunded
  expect((await res.json()).refunded).toBe(false);
});

test('a REPLAYED request (its ref was already charged) is refused before any charge or render', async () => {
  (debitExistsForRef as jest.Mock).mockResolvedValue(true);
  const res = await POST(post(BODY));
  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({ success: false, error: 'duplicate_request' });
  expect(deductCredits).not.toHaveBeenCalled();
  expect(promptToEnglish).not.toHaveBeenCalled();
  expect(releaseIdempotencyKey).toHaveBeenCalled();
  // The ref it checked is the one it would have charged — bound to this user, job and body.
  const [uid, ref] = (debitExistsForRef as jest.Mock).mock.calls[0];
  expect(uid).toBe('user-1');
  expect(ref).toMatch(/^music:job-1:[0-9a-f]+:user-1$/);
});

test('an unreadable ledger (null) does not block — deduct_credits decides, exactly as before', async () => {
  (debitExistsForRef as jest.Mock).mockResolvedValue(null);
  await POST(post(BODY));
  expect(deductCredits).toHaveBeenCalledTimes(1);
});

test('a failed render after a charge reports refunded:true — and never the provider’s own words', async () => {
  const res = await POST(post(BODY, 'en'));
  expect(res.status).toBe(502);
  const j = await res.json();
  expect(j).toMatchObject({ success: false, refunded: true });
  expect(refundCredits).toHaveBeenCalledTimes(1);
  expect((refundCredits as jest.Mock).mock.calls[0]).toEqual(['user-1', 5, expect.stringMatching(/^music:job-1:.*:refund$/)]);
  expect(JSON.stringify(j)).not.toMatch(/replicate|billing|402/i);
});

test('a refund that did NOT land is never reported as one, nor dressed as "you were not charged"', async () => {
  (refundCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'error' });
  const j = await (await POST(post(BODY, 'en'))).json();
  expect(j).toMatchObject({ success: false, refunded: false, error: 'music_failed' });
  expect(j.message).toBeUndefined();
});
