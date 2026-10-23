/** @jest-environment node */
/**
 * POST /api/nanobanana/image — Google's image model is the route's ONE engine, whatever MEDIA_GOOGLE_ONLY says
 * (MASTER TASK v3.1; PROJECT_MASTER R7, "NO SILENT FALLBACK").
 *
 * ⚠️ A NanoBanana miss used to cascade to Grok (xAI) and then FLUX 1.1 Pro (Replicate), and MEDIA_GOOGLE_ONLY=0 put NanoBanana
 * itself back in front. Pinned here: Google image renders under every env value, a throw or an empty answer ends on the
 * explicit 502 provider_unavailable with the reserved credit returned, and NanoBanana, Grok and FLUX are never called. Their
 * clients are gone (PR 20), so a reinstated leg would have to reach the network, and the network spy refuses and records
 * every request.
 * Every provider, the ledger and the idempotency store are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));
// The platform budget guard reads a spend ledger these tests do not have, and it fails closed (MASTER TASK v3.1): here
// the ledger is readable and has room. The guard's own refusals are pinned in lib/services/billing and ./platformBudget.test.
jest.mock('../../../../lib/services/billing/BillingGuard', () => ({
  canProceed: jest.fn(async () => ({ allowed: true, reason: 'ok', mode: 'normal', projectedDaily: 0, projectedMonthly: 0, degraded: false })),
  recordUsage: jest.fn(async () => {}),
}));

jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../../lib/api/guard', () => ({
  applyApiGuards: jest.fn(async () => ({ response: null, auth: { userId: 'user-1' }, budgetRemaining: null })),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({ RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } } }));
jest.mock('../../../../lib/agent/optimizer/activeConfig', () => ({ getActiveConfig: jest.fn(async () => null) }));
jest.mock('../../../../lib/ai/geminiImage', () => ({ generateGeminiImage: jest.fn(), geminiFrameModel: jest.fn(() => 'gemini-3.1-flash-image') }));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn() }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ recordCompletedAsset: jest.fn() }));
jest.mock('../../../../lib/audio/voiceModel', () => ({ DEMO_VOICE_USER_ID: 'demo' }));
jest.mock('../../../../lib/orchestrator/idempotency', () => ({
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
import { uploadAndSign } from '../../../../lib/orchestrator/storage-adapter';
import { releaseIdempotencyKey } from '../../../../lib/orchestrator/idempotency';
import { deductCredits, refundCredits } from '../../../../lib/orchestrator/ledger';
import { creditCostFor } from '../../../../lib/credits/pricing';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/nanobanana/image', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const BODY = { prompt: 'a lighthouse at dusk', quality: 'standard', aspectRatio: '1:1', jobId: 'tile-1' };
const ENV = { ...process.env };

let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
  (refundCredits as jest.Mock).mockResolvedValue({ ok: true });
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...ENV };
});

/** No engine but Google's was asked: NanoBanana, Grok and FLUX could only be reached over the network now. */
function expectNoOtherEngine() {
  expect(fetchSpy).not.toHaveBeenCalled();
}

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
  expectNoOtherEngine();
  expect(fetchSpy).not.toHaveBeenCalled(); // nothing to re-host
}

describe.each([
  {},
  { MEDIA_GOOGLE_ONLY: '0' },
  { MEDIA_GOOGLE_ONLY: 'false', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-nanobanana' },
])('env %o — the one engine is Google image', (env) => {
  beforeEach(() => {
    delete process.env.MEDIA_GOOGLE_ONLY;
    delete process.env.OUTSIDE_ENGINES_APPROVED;
    Object.assign(process.env, env);
  });

  test('Google image answers → hosted once, named as Google, no other engine', async () => {
    (generateGeminiImage as jest.Mock).mockResolvedValue({ base64: 'aW1n', mimeType: 'image/png', model: 'gemini-3.1-flash-image' });
    (uploadAndSign as jest.Mock).mockResolvedValue('https://x.supabase.co/storage/v1/object/sign/uploads/omni/a.png?token=t');
    const res = await POST(post(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, url: expect.stringContaining('supabase.co'), model: 'Google gemini-3.1-flash-image' });
    expectNoOtherEngine();
    expect(fetchSpy).not.toHaveBeenCalled(); // already in our storage: no second copy
    expect(refundCredits).not.toHaveBeenCalled();
  });

  test('a photo edit passes the photo as a reference that must load', async () => {
    (generateGeminiImage as jest.Mock).mockResolvedValue(null);
    await POST(post({ ...BODY, referenceImageUrl: 'data:image/png;base64,AAAA' }));
    expect(generateGeminiImage).toHaveBeenCalledWith(expect.objectContaining({ requireReferences: true }));
  });

  test('Google image throws → the explicit 502 with the credit returned', async () => {
    (generateGeminiImage as jest.Mock).mockRejectedValue(new Error('Vertex 500'));
    await expectExplicitRefundedMiss(await POST(post(BODY)));
    expect(generateGeminiImage).toHaveBeenCalledTimes(1);
  });

  test('Google image answers with no image → the same explicit 502 with the credit returned', async () => {
    (generateGeminiImage as jest.Mock).mockResolvedValue(null);
    await expectExplicitRefundedMiss(await POST(post(BODY)));
  });
});
