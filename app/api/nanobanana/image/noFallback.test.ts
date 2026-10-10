/** @jest-environment node */
/**
 * POST /api/nanobanana/image — NanoBanana is the route's ONLY engine (PROJECT_MASTER R7, "NO SILENT FALLBACK").
 *
 * ⚠️ A NanoBanana miss used to cascade to Grok (xAI) and then FLUX 1.1 Pro (Replicate) — two forbidden providers, rendering
 * under the model the user picked and billed as that model. Pinned here: a throw, a reply with no image URL, or the breaker
 * open each end on the explicit 502 provider_unavailable with the reserved credit returned, and neither old fallback is ever
 * called. The Grok and FLUX mocks are primed to SUCCEED, so a reinstated fallback would turn every 502 below into a 200.
 * Every provider, the ledger and the idempotency store are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../../lib/api/guard', () => ({
  applyApiGuards: jest.fn(async () => ({ response: null, auth: { userId: 'user-1' }, budgetRemaining: null })),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({ RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } } }));
jest.mock('../../../../lib/agent/optimizer/activeConfig', () => ({ getActiveConfig: jest.fn(async () => null) }));
jest.mock('../../../../lib/nanobanana/client', () => ({ generateNanoBananaImage: jest.fn() }));
jest.mock('../../../../lib/ai/xaiImage', () => ({
  generateGrokImage: jest.fn(async () => ({ url: 'https://grok.example/out.png', b64: null, model: 'grok-2-image' })),
}));
jest.mock('../../../../lib/ai/geminiImage', () => ({ generateGeminiImage: jest.fn(), geminiFrameModel: jest.fn(() => 'gemini-3.1-flash-image') }));
jest.mock('../../../../lib/ai/fluxImage', () => ({ generateFluxProImage: jest.fn(async () => 'https://flux.example/out.png') }));
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
import { generateGrokImage } from '../../../../lib/ai/xaiImage';
import { generateFluxProImage } from '../../../../lib/ai/fluxImage';
import { generateGeminiImage } from '../../../../lib/ai/geminiImage';
import { uploadAndSign } from '../../../../lib/orchestrator/storage-adapter';
import { isProviderTripped, recordProviderResult, releaseIdempotencyKey } from '../../../../lib/orchestrator/idempotency';
import { deductCredits, refundCredits } from '../../../../lib/orchestrator/ledger';
import { creditCostFor } from '../../../../lib/credits/pricing';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/nanobanana/image', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const BODY = { prompt: 'a lighthouse at dusk', quality: 'standard', aspectRatio: '1:1', jobId: 'tile-1' };

let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  (isProviderTripped as jest.Mock).mockResolvedValue(false);
  (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
  (refundCredits as jest.Mock).mockResolvedValue({ ok: true });
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MEDIA_GOOGLE_ONLY;
});

/** The one failure exit: 502 provider_unavailable, the reserved credit returned, nothing re-hosted, no other engine. */
async function expectExplicitRefundedMiss(res: Response) {
  expect(res.status).toBe(502);
  const j = await res.json();
  expect(j).toMatchObject({ success: false, code: 'provider_unavailable', error: 'provider_unavailable', refunded: true });
  expect(j.message).toMatch(/your credit was returned/);
  expect(deductCredits).toHaveBeenCalledTimes(1);
  expect(refundCredits).toHaveBeenCalledTimes(1);
  expect((refundCredits as jest.Mock).mock.calls[0][1]).toBe(creditCostFor('image'));
  expect((refundCredits as jest.Mock).mock.calls[0][2]).toMatch(/^image:nanobanana:tile-1:.*:refund$/);
  expect(releaseIdempotencyKey).toHaveBeenCalled(); // a retry is not locked out
  expect(generateGrokImage).not.toHaveBeenCalled();
  expect(generateFluxProImage).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled(); // nothing to re-host
}

test('NanoBanana throws → the explicit 502 with the credit returned; Grok and FLUX are never called', async () => {
  (generateNanoBananaImage as jest.Mock).mockRejectedValue(new Error('NanoBanana 500'));
  await expectExplicitRefundedMiss(await POST(post(BODY)));
  expect(generateNanoBananaImage).toHaveBeenCalledTimes(1);
  expect(recordProviderResult).toHaveBeenCalledWith('nanobanana', false);
});

test('NanoBanana answers without an image URL → the same explicit 502 with the credit returned', async () => {
  (generateNanoBananaImage as jest.Mock).mockResolvedValue({ url: undefined, text: 'content policy', credits: 0 });
  await expectExplicitRefundedMiss(await POST(post(BODY)));
  expect(recordProviderResult).toHaveBeenCalledWith('nanobanana', false);
});

test('the NanoBanana breaker is OPEN → no provider call at all, the explicit 502 with the credit returned', async () => {
  (isProviderTripped as jest.Mock).mockImplementation(async (name: string) => name === 'nanobanana');
  await expectExplicitRefundedMiss(await POST(post(BODY)));
  expect(generateNanoBananaImage).not.toHaveBeenCalled();
});

test('a NanoBanana success is delivered under NanoBanana\'s own name — no other engine is consulted', async () => {
  (generateNanoBananaImage as jest.Mock).mockResolvedValue({ url: 'https://provider.example/out.jpg', text: 'ok', credits: 12 });
  const res = await POST(post(BODY));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ success: true, url: 'https://provider.example/out.jpg', model: 'NanoBananaAI V2-1K' });
  expect(refundCredits).not.toHaveBeenCalled();
  expect(generateGrokImage).not.toHaveBeenCalled();
  expect(generateFluxProImage).not.toHaveBeenCalled();
});

describe('MEDIA_GOOGLE_ONLY on — the one engine is Google image, never NanoBanana', () => {
  beforeEach(() => { process.env.MEDIA_GOOGLE_ONLY = '1'; });

  test('Google image answers → hosted once, named as Google, NanoBanana never called', async () => {
    (generateGeminiImage as jest.Mock).mockResolvedValue({ base64: 'aW1n', mimeType: 'image/png', model: 'gemini-3.1-flash-image' });
    (uploadAndSign as jest.Mock).mockResolvedValue('https://x.supabase.co/storage/v1/object/sign/uploads/omni/a.png?token=t');
    const res = await POST(post(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, url: expect.stringContaining('supabase.co'), model: 'Google gemini-3.1-flash-image' });
    expect(generateNanoBananaImage).not.toHaveBeenCalled();
    expect(isProviderTripped).not.toHaveBeenCalledWith('nanobanana');
    expect(fetchSpy).not.toHaveBeenCalled(); // already in our storage: no second copy
    expect(refundCredits).not.toHaveBeenCalled();
  });

  test('a photo edit passes the photo as a reference that must load', async () => {
    (generateGeminiImage as jest.Mock).mockResolvedValue(null);
    await POST(post({ ...BODY, referenceImageUrl: 'data:image/png;base64,AAAA' }));
    expect(generateGeminiImage).toHaveBeenCalledWith(expect.objectContaining({ requireReferences: true }));
  });

  test('a Google miss is the same explicit, refunded 502, with no other engine', async () => {
    (generateGeminiImage as jest.Mock).mockResolvedValue(null);
    await expectExplicitRefundedMiss(await POST(post(BODY)));
    expect(generateNanoBananaImage).not.toHaveBeenCalled();
  });
});
