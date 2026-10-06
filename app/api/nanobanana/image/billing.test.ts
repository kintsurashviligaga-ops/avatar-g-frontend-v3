/** @jest-environment node */
/**
 * POST /api/nanobanana/image — the CHARGE fails closed, a replay is refused, and a failure claims a refund only when
 * one landed. (Each case failed before the change.)
 *   · deductCredits → 'error' used to fail OPEN ("a ledger hiccup never blocks a paid render") → free images for as
 *     long as the ledger was down. Now 503 billing_unavailable, no engine called.
 *   · a byte-identical replay (same jobId + body → same ref) was rendered for free once the 60 s mutex lapsed.
 *   · "your credit was returned" was printed whenever a credit had been RESERVED, before the refund ran and whatever
 *     it answered. Now the sentence and `refunded: true` follow refund_credits' own answer.
 *   · a thrown render answered `error: err.message` — the provider's raw text. Now the sanitiser's code.
 * Every engine, the ledger and the idempotency store are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/ai/geminiImagen', () => ({ hasGeminiImagenProvider: jest.fn(() => true), geminiImagenModel: () => 'imagen-4.0-generate-001' }));
jest.mock('../../../../lib/ai/geminiImage', () => ({ ...jest.requireActual('../../../../lib/ai/geminiImage'), generateGeminiImage: jest.fn(async () => null) }));


jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../../lib/api/guard', () => ({
  applyApiGuards: jest.fn(async () => ({ response: null, auth: { userId: 'user-1' }, budgetRemaining: null })),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({ RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } } }));
jest.mock('../../../../lib/agent/optimizer/activeConfig', () => ({ getActiveConfig: jest.fn(async () => null) }));
jest.mock('../../../../lib/nanobanana/client', () => ({
  generateNanoBananaImage: jest.fn(async () => { throw new Error('NanoBanana 500: upstream exploded at tempfile.aiquickdraw.com'); }),
}));
jest.mock('../../../../lib/ai/xaiImage', () => ({ generateGrokImage: jest.fn(async () => null) }));
jest.mock('../../../../lib/ai/fluxImage', () => ({ generateFluxProImage: jest.fn(async () => null) }));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn() }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ recordCompletedAsset: jest.fn() }));
jest.mock('../../../../lib/audio/voiceModel', () => ({ DEMO_VOICE_USER_ID: 'demo' }));
jest.mock('../../../../lib/orchestrator/idempotency', () => ({
  isProviderTripped: jest.fn(async () => false),
  recordProviderResult: jest.fn(async () => undefined),
  claimIdempotencyKey: jest.fn(async () => true),
  releaseIdempotencyKey: jest.fn(async () => undefined),
  hashPayload: jest.fn(async () => 'hash'),
}));
jest.mock('../../../../lib/orchestrator/ledger', () => ({
  debitExistsForRef: jest.fn(async () => false),
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundCredits: jest.fn(async () => ({ ok: true })),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { generateNanoBananaImage } from '../../../../lib/nanobanana/client';
import { promptToEnglish } from '../../../../lib/ai/promptToEnglish';
import { debitExistsForRef, deductCredits, refundCredits } from '../../../../lib/orchestrator/ledger';
import { releaseIdempotencyKey } from '../../../../lib/orchestrator/idempotency';

const post = (body: unknown, locale?: string) =>
  new NextRequest('https://myavatar.ge/api/nanobanana/image', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(locale ? { cookie: `NEXT_LOCALE=${locale}` } : {}) },
    body: JSON.stringify(body),
  });

const BODY = { prompt: 'a lighthouse at dusk', quality: 'standard', aspectRatio: '1:1', jobId: 'tile-1' };

beforeEach(() => {
  jest.clearAllMocks();
  (debitExistsForRef as jest.Mock).mockResolvedValue(false);
  (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
  (refundCredits as jest.Mock).mockResolvedValue({ ok: true });
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('a ledger that definitively failed → 503 billing_unavailable, and no engine is called', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'error' });
  const res = await POST(post(BODY, 'ru'));
  expect(res.status).toBe(503);
  const j = await res.json();
  expect(j).toMatchObject({ success: false, error: 'billing_unavailable', code: 'billing_unavailable' });
  expect(j.message).toMatch(/ничего не списано/);
  expect(promptToEnglish).not.toHaveBeenCalled();
  expect(generateNanoBananaImage).not.toHaveBeenCalled();
  expect(refundCredits).not.toHaveBeenCalled();
  expect(releaseIdempotencyKey).toHaveBeenCalled();
});

test('a REPLAYED tile (its ref already charged) is refused before any charge or render', async () => {
  (debitExistsForRef as jest.Mock).mockResolvedValue(true);
  const res = await POST(post(BODY));
  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({ success: false, error: 'duplicate_request' });
  expect(deductCredits).not.toHaveBeenCalled();
  expect(generateNanoBananaImage).not.toHaveBeenCalled();
  expect((debitExistsForRef as jest.Mock).mock.calls[0][1]).toMatch(/^image:nanobanana:tile-1:[0-9a-f]+:user-1$/);
});

test('every engine missed → refunded:true and the "credit returned" sentence, because the refund landed', async () => {
  const res = await POST(post(BODY));
  expect(res.status).toBe(502);
  const j = await res.json();
  expect(j).toMatchObject({ success: false, code: 'provider_unavailable', error: 'provider_unavailable', refunded: true });
  expect(j.message).toMatch(/your credit was returned/);
  expect(JSON.stringify(j)).not.toMatch(/aiquickdraw|upstream exploded/); // the engine's own words stay server-side
});

test('…and when the refund did NOT land, neither the flag nor the sentence claims it', async () => {
  (refundCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'error' });
  const j = await (await POST(post(BODY))).json();
  expect(j.refunded).toBe(false);
  expect(j.message).not.toMatch(/returned|დაბრუნდა/);
});

test('a thrown render answers with the sanitiser’s code (not the raw text) and refunded:true', async () => {
  (promptToEnglish as jest.Mock).mockRejectedValueOnce(new Error('Replicate API 402: {"detail":"Go to https://replicate.com/account/billing"}'));
  const res = await POST(post(BODY, 'en'));
  expect(res.status).toBe(502);
  const j = await res.json();
  expect(j).toMatchObject({ success: false, refunded: true });
  expect(JSON.stringify(j)).not.toMatch(/replicate|billing/i);
});

test('a thrown render whose refund did not land gets a neutral code, never "you were not charged"', async () => {
  (promptToEnglish as jest.Mock).mockRejectedValueOnce(new Error('boom'));
  (refundCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'error' });
  const j = await (await POST(post(BODY, 'en'))).json();
  expect(j).toMatchObject({ success: false, error: 'image_failed', refunded: false });
  expect(j.message).toBeUndefined();
});
