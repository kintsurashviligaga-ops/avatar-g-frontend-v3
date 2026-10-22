/** @jest-environment node */
/**
 * POST /api/nanobanana/image (photo shoot, interior design, product photos) — inside the PLATFORM's AI limit.
 *
 * ⚠️ 2026-10-16: with the site's daily AI limit spent, chat, video and storyboards were refused for everyone, but this
 * route called Google directly: interior renders kept running and were never booked against the limit. Pinned here:
 * a spent limit refuses BEFORE the credit is reserved (nothing charged, nothing to refund), a refusal that lands at the
 * Google call returns the reserved credit, and both say which limit and when it lifts.
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

const mockBudget = jest.fn();
jest.mock('../../../../lib/services/billing/budgetCheck', () => ({ platformBudgetRefusal: (...a: unknown[]) => mockBudget(...a) }));
const mockGuarded = jest.fn();
jest.mock('../../../../lib/services/billing/guardedCall', () => {
  class BudgetExceededError extends Error {
    reason: string;
    constructor(_service: string, reason: string) { super(`budget_exceeded:${reason}`); this.name = 'BudgetExceededError'; this.reason = reason; }
  }
  return { BudgetExceededError, guardedCall: (...a: unknown[]) => mockGuarded(...a) };
});

import { NextRequest } from 'next/server';
import { POST } from './route';
import { generateGeminiImage } from '../../../../lib/ai/geminiImage';
import { deductCredits, refundCredits } from '../../../../lib/orchestrator/ledger';
import { releaseIdempotencyKey } from '../../../../lib/orchestrator/idempotency';
import { BudgetExceededError } from '../../../../lib/services/billing/guardedCall';
import { budgetRefusalMessage } from '../../../../lib/services/billing/budgetMessage';

const post = (body: unknown, locale?: string) =>
  new NextRequest('https://myavatar.ge/api/nanobanana/image', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(locale ? { cookie: `NEXT_LOCALE=${locale}` } : {}) },
    body: JSON.stringify(body),
  });
const BODY = { prompt: 'a calm Scandinavian living room, oak floor, morning light', quality: 'standard', aspectRatio: '1:1', jobId: 'tile-1' };

beforeEach(() => {
  jest.clearAllMocks();
  mockBudget.mockResolvedValue(null);
  mockGuarded.mockImplementation(async (_meta: unknown, fn: () => Promise<unknown>) => fn());
  (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
  (refundCredits as jest.Mock).mockResolvedValue({ ok: true });
  (generateGeminiImage as jest.Mock).mockResolvedValue(null);
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('a spent daily limit refuses before the credit is reserved: 503 platform_budget, nothing charged, Google not called', async () => {
  mockBudget.mockResolvedValue('daily_limit');
  const res = await POST(post(BODY));
  expect(res.status).toBe(503);
  const j = await res.json();
  expect(j).toMatchObject({ success: false, code: 'platform_budget', budgetReason: 'daily_limit' });
  expect(j.message).toBe(budgetRefusalMessage('ka', 'daily_limit'));
  expect(deductCredits).not.toHaveBeenCalled();
  expect(refundCredits).not.toHaveBeenCalled();
  expect(generateGeminiImage).not.toHaveBeenCalled();
  expect(releaseIdempotencyKey).toHaveBeenCalled(); // tomorrow's retry is not locked out
  expect(mockBudget).toHaveBeenCalledWith({ service: 'image', model: 'gemini-image', units: 1 });
});

test('every Google render goes through the platform guard as an image call, booked to the person', async () => {
  await POST(post(BODY));
  expect(mockGuarded).toHaveBeenCalledTimes(1);
  expect(mockGuarded.mock.calls[0]![0]).toMatchObject({ service: 'image', model: 'gemini-image', units: 1, userId: 'user-1' });
  expect(generateGeminiImage).toHaveBeenCalledTimes(1);
});

test('a refusal at the Google call returns the reserved credit and names the limit, in the screen\'s language', async () => {
  mockGuarded.mockRejectedValue(new BudgetExceededError('image' as never, 'daily_limit'));
  const res = await POST(post(BODY, 'en'));
  expect(res.status).toBe(503);
  const j = await res.json();
  expect(j).toMatchObject({ success: false, code: 'platform_budget', budgetReason: 'daily_limit', refunded: true });
  expect(j.message).toBe(budgetRefusalMessage('en', 'daily_limit'));
  expect(deductCredits).toHaveBeenCalledTimes(1);
  expect(refundCredits).toHaveBeenCalledTimes(1);
  expect(generateGeminiImage).not.toHaveBeenCalled();
});
