/** @jest-environment node */
/**
 * POST /api/nanobanana/image — the picked `model` (components/studio/ui/ModelPicker → lib/studio/modelPick imageModelField).
 *
 * ⚠️ A client can never run a model the catalogue does not list for this route: an unknown id, another service's model, a
 * Studio β (Higgsfield) model, or a hand-picked NanoBanana endpoint outside the catalogue's own is refused 400 BEFORE the
 * mutex, the charge and any provider call. A valid pick renders on its own endpoint; no `model` renders exactly what the
 * route always rendered (Auto). The NanoBanana leg is made to throw and both fallbacks miss, so a passing request ends on the
 * 502-refund path — no fetch, no spend; every provider, the ledger and the idempotency store are mocked.
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
  generateNanoBananaImage: jest.fn(async () => { throw new Error('nanobanana stopped by the test'); }),
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
import { claimIdempotencyKey, hashPayload } from '../../../../lib/orchestrator/idempotency';
import { deductCredits } from '../../../../lib/orchestrator/ledger';

const post = (body: Record<string, unknown>) =>
  new NextRequest('https://myavatar.ge/api/nanobanana/image', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'a lighthouse at dusk', aspectRatio: '1:1', ...body }),
  });

let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
});
afterEach(() => fetchSpy.mockRestore());

/** The endpoint NanoBanana was asked for (the request ran to the provider leg). */
async function endpointFor(body: Record<string, unknown>): Promise<string> {
  const res = await POST(post(body));
  expect(res.status).toBe(502); // every leg was made to miss → refunded
  expect(generateNanoBananaImage).not.toHaveBeenCalled();
  return (hashPayload as jest.Mock).mock.calls[0][0].e;
}

describe('a pick the catalogue does not list for this route is refused before anything costs anything', () => {
  test.each([
    ['an unknown id', { model: 'nb/ultra-max' }],
    ['a Studio β (Higgsfield) model', { model: 'hf/soul-2' }],
    ['another service\'s model', { model: 'google/veo-3.1' }],
    ['a non-string', { model: { id: 'nb/pro' } }],
    ['a NanoBanana endpoint outside the catalogue', { endpoint: 'task-details' }],
    ['an endpoint alias the catalogue never names', { endpoint: 'v2_4k' }],
  ])('%s → 400 unknown_model, no mutex, no charge, no provider call', async (_name, body) => {
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, code: 'unknown_model' });
    expect(claimIdempotencyKey).not.toHaveBeenCalled();
    expect(deductCredits).not.toHaveBeenCalled();
    expect(generateNanoBananaImage).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('a valid pick renders on its own endpoint', () => {
  test('no `model` → Auto: exactly the old size map', async () => {
    expect(await endpointFor({ quality: 'standard' })).toBe('v2-1k');
    jest.clearAllMocks();
    expect(await endpointFor({ quality: 'high' })).toBe('v2-2k');
    jest.clearAllMocks();
    expect(await endpointFor({ quality: 'ultra' })).toBe('pro-4k');
    jest.clearAllMocks();
    expect(await endpointFor({})).toBe('v2-2k'); // no quality → high, as before
  });

  test('V2 stays V2 at 4K; Pro stays Pro at 2K — and a 1K request on Pro renders its 2K', async () => {
    expect(await endpointFor({ model: 'nb/v2', quality: 'ultra' })).toBe('v2-4k');
    jest.clearAllMocks();
    expect(await endpointFor({ model: 'nb/pro', quality: 'high' })).toBe('pro-1k2k');
    jest.clearAllMocks();
    expect(await endpointFor({ model: 'nb/pro', quality: 'standard' })).toBe('pro-1k2k');
    jest.clearAllMocks();
    expect(await endpointFor({ model: 'nb/auto', quality: 'ultra' })).toBe('pro-4k');
  });

  test('the charge is one image\'s, whatever the model; the double-click key tells two models apart', async () => {
    await endpointFor({ model: 'nb/pro', quality: 'high' });
    expect(deductCredits).toHaveBeenCalledTimes(1);
    expect((hashPayload as jest.Mock).mock.calls[0][0].e).toBe('pro-1k2k');
    jest.clearAllMocks();
    await endpointFor({ model: 'nb/v2', quality: 'high' });
    expect((hashPayload as jest.Mock).mock.calls[0][0].e).toBe('v2-2k');
  });

  test('a legacy `endpoint` that IS one of the catalogue\'s own is still honoured', async () => {
    expect(await endpointFor({ endpoint: 'v2-4k', quality: 'standard' })).toBe('v2-4k');
  });
});
