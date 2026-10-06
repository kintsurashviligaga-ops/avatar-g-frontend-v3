/** @jest-environment node */
/**
 * POST /api/nanobanana/image — GOOGLE FIRST (2026-10-03).
 *
 * The NanoBanana reseller's balance ran dry and every image, photographer and interior render failed („The current credits
 * are insufficient"). The catalogue's models ARE Google's (Nano Banana 2 / Pro), so the route asks Google directly first:
 * the endpoint's own model and size, the user's photo as a reference, the bytes re-hosted with their own type. The reseller
 * → Grok → FLUX legs only run when Google misses, and the charge and the refund are exactly what they were. Every provider,
 * the ledger and the idempotency store are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/ai/geminiImagen', () => ({ hasGeminiImagenProvider: jest.fn(() => true), geminiImagenModel: () => 'imagen-4.0-generate-001' }));


jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../../lib/api/guard', () => ({
  applyApiGuards: jest.fn(async () => ({ response: null, auth: { userId: 'user-1' }, budgetRemaining: null })),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({ RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } } }));
jest.mock('../../../../lib/agent/optimizer/activeConfig', () => ({ getActiveConfig: jest.fn(async () => null) }));
jest.mock('../../../../lib/ai/geminiImage', () => {
  const actual = jest.requireActual('../../../../lib/ai/geminiImage');
  return { ...actual, generateGeminiImage: jest.fn(async () => null) };
});
jest.mock('../../../../lib/nanobanana/client', () => ({
  generateNanoBananaImage: jest.fn(async () => ({ url: 'https://provider.example/out.jpg', text: 'ok', credits: 12 })),
}));
jest.mock('../../../../lib/ai/xaiImage', () => ({ generateGrokImage: jest.fn(async () => null) }));
jest.mock('../../../../lib/ai/fluxImage', () => ({ generateFluxProImage: jest.fn(async () => null) }));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => 'https://signed.example/out.png') }));
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
import { generateGeminiImage } from '../../../../lib/ai/geminiImage';
import { generateNanoBananaImage } from '../../../../lib/nanobanana/client';
import { generateGrokImage } from '../../../../lib/ai/xaiImage';
import { generateFluxProImage } from '../../../../lib/ai/fluxImage';
import { uploadAndSign } from '../../../../lib/orchestrator/storage-adapter';
import { isProviderTripped, recordProviderResult } from '../../../../lib/orchestrator/idempotency';
import { deductCredits, refundCredits } from '../../../../lib/orchestrator/ledger';
import { creditCostFor } from '../../../../lib/credits/pricing';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/nanobanana/image', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const GOOGLE = { base64: 'iVBORw0KGgo=', mimeType: 'image/png', model: 'imagen-4.0-generate-001' };
const googleArgs = () => (generateGeminiImage as jest.Mock).mock.calls[0][0] as {
  prompt: string; aspectRatio?: string; imageSize?: string; model?: string; referenceImages?: string[];
};

beforeEach(() => {
  jest.clearAllMocks();
  (generateGeminiImage as jest.Mock).mockResolvedValue(GOOGLE);
  (generateNanoBananaImage as jest.Mock).mockResolvedValue({ url: 'https://provider.example/out.jpg', text: 'ok', credits: 12 });
  (uploadAndSign as jest.Mock).mockResolvedValue('https://signed.example/out.png');
  (isProviderTripped as jest.Mock).mockResolvedValue(false);
  (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
  (refundCredits as jest.Mock).mockResolvedValue({ ok: true });
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('Google answers: its bytes are hosted with their own type, the reseller and the fallbacks never run, one charge', async () => {
  const res = await POST(post({ prompt: 'A red bicycle in Old Tbilisi', aspectRatio: '9:16', jobId: 'job-1' }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ success: true, url: 'https://signed.example/out.png', model: 'Google imagen-4.0-generate-001' });
  expect(generateNanoBananaImage).not.toHaveBeenCalled();
  expect(generateGrokImage).not.toHaveBeenCalled();
  expect(generateFluxProImage).not.toHaveBeenCalled();
  const [bucket, path, b64, mime] = (uploadAndSign as jest.Mock).mock.calls[0];
  expect([bucket, b64, mime]).toEqual(['uploads', GOOGLE.base64, 'image/png']);
  expect(path).toMatch(/^omni\/.+\.png$/);
  expect(googleArgs()).toMatchObject({ aspectRatio: '9:16' });
  expect(googleArgs().prompt).toContain('A red bicycle in Old Tbilisi');
  expect(deductCredits).toHaveBeenCalledTimes(1);
  expect((deductCredits as jest.Mock).mock.calls[0][1]).toBe(creditCostFor('image'));
  expect(refundCredits).not.toHaveBeenCalled();
  expect(recordProviderResult).toHaveBeenCalledWith('gemini-image', true);
});

test('the endpoint picks the Google model and size: legacy quality aliases → configured Imagen at its default size, a JPEG stays a .jpg', async () => {
  await POST(post({ prompt: 'p', quality: 'standard', jobId: 'a' }));
  expect(googleArgs()).toMatchObject({ model: 'imagen-4.0-generate-001', imageSize: '1K' });

  (generateGeminiImage as jest.Mock).mockClear();
  (generateGeminiImage as jest.Mock).mockResolvedValue({ ...GOOGLE, mimeType: 'image/jpeg', model: 'imagen-4.0-generate-001' });
  (uploadAndSign as jest.Mock).mockClear();
  await POST(post({ prompt: 'p', quality: 'ultra', jobId: 'b' }));
  expect(googleArgs()).toMatchObject({ model: 'imagen-4.0-generate-001', imageSize: '1K' });
  const [, path, , mime] = (uploadAndSign as jest.Mock).mock.calls[0];
  expect(mime).toBe('image/jpeg');
  expect(path).toMatch(/\.jpg$/);
});

test('reference edits are unavailable before hosting, billing or any engine call', async () => {
  const res = await POST(post({ prompt: 'make it night', referenceImage: 'data:image/jpeg;base64,/9j/4AAQ', jobId: 'e' }));
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ code: 'image_edit_unavailable' });
  expect(deductCredits).not.toHaveBeenCalled();
  expect(uploadAndSign).not.toHaveBeenCalled();
  expect(generateGeminiImage).not.toHaveBeenCalled();
});

test('a Google miss does not submit another job or call a prohibited fallback', async () => {
  (generateGeminiImage as jest.Mock).mockResolvedValue(null);
  const res = await POST(post({ prompt: 'p', jobId: 'm' }));
  expect(res.status).toBe(502);
  expect(generateGeminiImage).toHaveBeenCalledTimes(1);
  expect(generateNanoBananaImage).not.toHaveBeenCalled();
  expect(generateGrokImage).not.toHaveBeenCalled();
  expect(generateFluxProImage).not.toHaveBeenCalled();
  expect(await res.json()).toMatchObject({ success: false, code: 'provider_unavailable', refunded: true });
  expect(refundCredits).toHaveBeenCalledTimes(1);
});

test('an open Google breaker cannot fall back to a prohibited provider', async () => {
  (isProviderTripped as jest.Mock).mockImplementation(async (p: string) => p === 'gemini-image');
  const res = await POST(post({ prompt: 'p', jobId: 'k' }));
  expect(res.status).toBe(502);
  expect(generateGeminiImage).not.toHaveBeenCalled();
  expect(generateNanoBananaImage).not.toHaveBeenCalled();
  expect(generateGrokImage).not.toHaveBeenCalled();
  expect(generateFluxProImage).not.toHaveBeenCalled();
  expect(refundCredits).toHaveBeenCalledTimes(1);
});
