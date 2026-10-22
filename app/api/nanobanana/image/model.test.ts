/** @jest-environment node */
/**
 * POST /api/nanobanana/image — the picked `model` (components/studio/ui/ModelPicker → lib/studio/modelPick imageModelField).
 *
 * ⚠️ A client can never run a model the catalogue does not list for this route: an unknown id, another service's model, a
 * Studio β (Higgsfield) model, or a hand-picked NanoBanana endpoint outside the catalogue's own is refused 400 BEFORE the
 * mutex, the charge and any provider call. Google's image model renders every valid pick (MASTER TASK v3.1); the pick is
 * still the endpoint the double-click key and the reply name, and no `model` names exactly what the route always named
 * (Auto). Google's image model, storage, the ledger and the idempotency store are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../../lib/api/guard', () => ({
  applyApiGuards: jest.fn(async () => ({ response: null, auth: { userId: 'user-1' }, budgetRemaining: null })),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({ RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } } }));
jest.mock('../../../../lib/agent/optimizer/activeConfig', () => ({ getActiveConfig: jest.fn(async () => null) }));
jest.mock('../../../../lib/ai/geminiImage', () => ({
  generateGeminiImage: jest.fn(async () => ({ base64: 'aGk=', mimeType: 'image/png' })),
  geminiFrameModel: jest.fn(() => 'gemini-3.1-flash-image'),
}));
jest.mock('../../../../lib/services/billing/budgetCheck', () => ({ platformBudgetRefusal: jest.fn(async () => null) }));
jest.mock('../../../../lib/services/billing/guardedCall', () => {
  class BudgetExceededError extends Error {}
  return { BudgetExceededError, guardedCall: jest.fn(async (_meta: unknown, fn: () => Promise<unknown>) => fn()) };
});
jest.mock('../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => 'https://signed.example/out.png') }));
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

/** The endpoint the reply names (the request rendered on Google's image model). */
async function endpointFor(body: Record<string, unknown>): Promise<string> {
  const res = await POST(post(body));
  expect(res.status).toBe(200);
  expect(generateGeminiImage).toHaveBeenCalledTimes(1);
  return (await res.json()).endpoint;
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
    expect(generateGeminiImage).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('a valid pick is filed under its own endpoint', () => {
  test('no `model` → Auto: exactly the old size map', async () => {
    expect(await endpointFor({ quality: 'standard' })).toBe('v2-1k');
    jest.clearAllMocks();
    expect(await endpointFor({ quality: 'high' })).toBe('v2-2k');
    jest.clearAllMocks();
    expect(await endpointFor({ quality: 'ultra' })).toBe('pro-4k');
    jest.clearAllMocks();
    expect(await endpointFor({})).toBe('v2-2k'); // no quality → high, as before
  });

  test('V2 stays V2 at 4K; Pro stays Pro at 2K — and a 1K request on Pro is filed as its 2K', async () => {
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
