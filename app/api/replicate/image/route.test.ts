/** @jest-environment node */
/**
 * POST /api/replicate/image — an image is handed over only once its charge LANDED, on all three success paths
 * (synchronous NanoBanana, a Replicate render that finished inline, and the async poll).
 *
 * ⚠️ Before: every charge was `await deductCredits(...).catch(reportError)` and the image was returned regardless, so
 * a failed deduct (a parallel burst past one stale balance read, a ledger error) was a free image. Providers and the
 * ledger are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/nanobanana/client', () => ({ generateNanoBananaImage: jest.fn() }));
jest.mock('../../../../lib/replicate/client', () => ({ createPrediction: jest.fn(), pollPrediction: jest.fn() }));
jest.mock('../../../../lib/api/guard', () => ({ applyApiGuards: jest.fn(async () => ({ response: null })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({ RATE_LIMITS: { READ: {}, EXPENSIVE: {} } }));
jest.mock('../../../../lib/api/generationGuard', () => ({
  guardGeneration: jest.fn(async () => ({ ok: true, userId: 'user-1', locale: 'en' })),
  insufficientCreditsMessage: () => 'Insufficient Credits',
}));
jest.mock('../../../../lib/orchestrator/ledger', () => ({ deductCredits: jest.fn() }));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { generateNanoBananaImage } from '../../../../lib/nanobanana/client';
import { createPrediction, pollPrediction } from '../../../../lib/replicate/client';
import { deductCredits } from '../../../../lib/orchestrator/ledger';

const ENV = { ...process.env };
const post = (body: unknown) => POST(new NextRequest('https://myavatar.ge/api/replicate/image', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}));

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, NANOBANANA_API_KEY: 'k' };
  (generateNanoBananaImage as jest.Mock).mockResolvedValue({ url: 'https://nb.example/img.png', credits: 1 });
  (createPrediction as jest.Mock).mockResolvedValue({ id: 'pred-1', status: 'succeeded', output: ['https://replicate.delivery/img.png'] });
  (pollPrediction as jest.Mock).mockResolvedValue({ id: 'pred-1', status: 'succeeded', output: ['https://replicate.delivery/img.png'] });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { process.env = ENV; });

describe.each([
  ['the synchronous NanoBanana path', () => post({ prompt: 'a lighthouse' }), /nb\.example/],
  ['a Replicate render that finished inline', () => { delete process.env.NANOBANANA_API_KEY; return post({ prompt: 'a lighthouse' }); }, /replicate\.delivery/],
  ['the async poll', () => post({ predictionId: 'pred-1' }), /replicate\.delivery/],
])('%s', (_label, call, assetPattern) => {
  test('a charged image is delivered (unchanged)', async () => {
    (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
    const res = await call();
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).toMatch(assetPattern);
  });

  test('a short balance WITHHOLDS the image (402) — it used to be delivered free', async () => {
    (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'insufficient' });
    const res = await call();
    expect(res.status).toBe(402);
    expect(JSON.stringify(await res.json())).not.toMatch(assetPattern);
  });

  test('a ledger failure withholds it too (503)', async () => {
    (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'error' });
    const res = await call();
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(assetPattern);
  });

  test('no ledger RPC at all (skipped) still delivers — the documented degrade', async () => {
    (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'skipped' });
    expect(JSON.stringify(await (await call()).json())).toMatch(assetPattern);
  });
});
