/** @jest-environment node */
/**
 * POST /api/ai/edit-photo — a ledger that DEFINITIVELY failed refuses the paid chain (503) instead of running it
 * unbilled. Before: only `insufficient` blocked; an `error` debit fell through to a free Replicate chain.
 * Every provider and the ledger are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/api/generationGuard', () => ({
  guardGeneration: jest.fn(async () => ({ ok: true, userId: 'user-1', locale: 'en' })),
  insufficientCreditsMessage: () => 'Insufficient Credits',
}));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn(async () => null), RATE_LIMITS: { EXPENSIVE: {} } }));
jest.mock('../../../../lib/orchestrator/ledger', () => ({ deductCredits: jest.fn(), refundCredits: jest.fn(async () => ({ ok: true })) }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({
  reSignIfInternal: jest.fn(async (u: string) => u),
  createSignedAssetUrl: jest.fn(async () => 'https://proj.supabase.co/storage/v1/object/sign/uploads/p.png?token=t'),
  parseSupabaseObjectUrl: jest.fn(() => null),
  uploadAndSign: jest.fn(async () => null),
}));
jest.mock('../../../../lib/replicate/client', () => ({
  createPrediction: jest.fn(async () => ({ id: 'p1', status: 'succeeded', output: 'https://replicate.delivery/out.png' })),
  pollUntilDone: jest.fn(),
}));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../../../../lib/orchestrator/saveEditorOutput', () => ({ saveEditorOutput: jest.fn(async () => undefined) }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { deductCredits } from '../../../../lib/orchestrator/ledger';
import { createPrediction } from '../../../../lib/replicate/client';

const ENV = { ...process.env };
const post = () => POST(new NextRequest('https://myavatar.ge/api/ai/edit-photo', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'remove_bg', mediaUrl: 'user-1/photo.png' }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, REPLICATE_API_TOKEN: 'test-token' };
  global.fetch = jest.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch;
});
afterAll(() => { process.env = ENV; });

test('a ledger error → 503 billing_unavailable, and the paid chain never runs', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'error' });
  const res = await post();
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ url: null, error: 'billing_unavailable' });
  expect(createPrediction).not.toHaveBeenCalled();
});

test('insufficient → 402, the paid chain never runs (unchanged)', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'insufficient' });
  expect((await post()).status).toBe(402);
  expect(createPrediction).not.toHaveBeenCalled();
});

test('a charged chain runs (unchanged)', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
  await post();
  expect(createPrediction).toHaveBeenCalledTimes(1);
});
