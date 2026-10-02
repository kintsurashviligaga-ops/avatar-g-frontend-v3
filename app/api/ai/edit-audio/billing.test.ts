/** @jest-environment node */
/**
 * POST /api/ai/edit-audio — Demucs separation is refused (503) when the ledger DEFINITIVELY failed, instead of
 * running unbilled. Before: only `insufficient` blocked; an `error` debit fell through to a free separation.
 * Every provider and the ledger are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/api/generationGuard', () => ({
  guardGeneration: jest.fn(async () => ({ ok: true, userId: 'user-1', locale: 'ka' })),
  insufficientCreditsMessage: () => 'არასაკმარისი კრედიტები',
}));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn(async () => null), RATE_LIMITS: { EXPENSIVE: {} } }));
jest.mock('../../../../lib/orchestrator/ledger', () => ({ deductCredits: jest.fn(), refundCredits: jest.fn(async () => ({ ok: true })) }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({
  reSignIfInternal: jest.fn(async (u: string) => u),
  createSignedAssetUrl: jest.fn(async () => 'https://proj.supabase.co/storage/v1/object/sign/uploads/a.mp3?token=t'),
  parseSupabaseObjectUrl: jest.fn(() => null),
  uploadAndSign: jest.fn(async () => null),
}));
jest.mock('../../../../lib/replicate/client', () => ({
  createPrediction: jest.fn(async () => ({ id: 'p1', status: 'failed' })),
  pollUntilDone: jest.fn(),
}));
jest.mock('../../../../lib/audio/audioOps', () => ({ audioProcess: jest.fn() }));
jest.mock('../../../../lib/orchestrator/saveEditorOutput', () => ({ saveEditorOutput: jest.fn(async () => undefined) }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { deductCredits } from '../../../../lib/orchestrator/ledger';
import { createPrediction } from '../../../../lib/replicate/client';

const ENV = { ...process.env };
const post = () => POST(new NextRequest('https://myavatar.ge/api/ai/edit-audio', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'vocal_isolation', mediaUrl: 'user-1/song.mp3' }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, REPLICATE_API_TOKEN: 'test-token' };
});
afterAll(() => { process.env = ENV; });

test('a ledger error → 503 billing_unavailable (localized), and Demucs never runs', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'error' });
  const res = await post();
  expect(res.status).toBe(503);
  const j = await res.json();
  expect(j).toMatchObject({ url: null, error: 'billing_unavailable' });
  expect(j.message).toMatch(/კრედიტი არ ჩამოგეჭრა/);
  expect(createPrediction).not.toHaveBeenCalled();
});

test('a charged separation runs (unchanged)', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
  await post();
  expect(createPrediction).toHaveBeenCalledTimes(1);
});
