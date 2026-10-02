/** @jest-environment node */
/**
 * GET /api/heygen/avatar — a finished video is handed over only once its charge LANDED.
 *
 * ⚠️ Before: `void deductCredits(...).catch(() => {})` beside a delivery that happened regardless — a failed deduct
 * (parallel POSTs past one stale balance read, a ledger error) was a free avatar video, and a frozen lambda could
 * drop the unawaited charge outright. HeyGen, storage, the job table and the ledger are mocked — no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn(async () => null), RATE_LIMITS: { EXPENSIVE: {} } }));
jest.mock('../../../../lib/api/generationGuard', () => ({
  guardGeneration: jest.fn(async () => ({ ok: true, userId: 'user-1', locale: 'en' })),
  insufficientCreditsMessage: () => 'Insufficient Credits',
}));
jest.mock('../../../../lib/orchestrator/ledger', () => ({ deductCredits: jest.fn() }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ recordCompletedFilm: jest.fn(async () => true) }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => 'https://x.supabase.co/storage/v1/object/sign/uploads/avatar.mp4?token=t') }));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { deductCredits } from '../../../../lib/orchestrator/ledger';
import { recordCompletedFilm } from '../../../../lib/orchestrator/jobs';

const ENV = { ...process.env };
const realFetch = global.fetch;
const get = () => GET(new NextRequest('https://myavatar.ge/api/heygen/avatar?videoId=vid-9'));

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, HEYGEN_API_KEY: 'k' };
  global.fetch = jest.fn(async (u: RequestInfo | URL) => (String(u).includes('video_status.get')
    ? Response.json({ data: { status: 'completed', video_url: 'https://heygen.example/out.mp4' } })
    : new Response(new Uint8Array(4096), { status: 200 }))) as unknown as typeof fetch;
});
afterEach(() => { global.fetch = realFetch; });
afterAll(() => { process.env = ENV; });

test('a charged completion delivers the re-hosted video and files it (unchanged)', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
  const j = await (await get()).json();
  expect(deductCredits).toHaveBeenCalledWith('user-1', 20, 'avatar:vid-9');
  expect(j).toMatchObject({ status: 'completed', url: expect.stringContaining('supabase.co') });
  expect(recordCompletedFilm).toHaveBeenCalledTimes(1);
});

test('a short balance WITHHOLDS the video (402, no url) — it used to be delivered free', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'insufficient' });
  const res = await get();
  expect(res.status).toBe(402);
  const j = await res.json();
  expect(j.url).toBeNull();
  expect(JSON.stringify(j)).not.toMatch(/heygen\.example/);
  expect(recordCompletedFilm).not.toHaveBeenCalled();
});

test('a ledger failure withholds it too (503) — the next poll retries the same idempotent charge', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'error' });
  const res = await get();
  expect(res.status).toBe(503);
  expect((await res.json()).url).toBeNull();
});

test('no ledger RPC at all (skipped) still delivers — the documented degrade', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'skipped' });
  expect((await (await get()).json()).url).toContain('supabase.co');
});
