/** @jest-environment node */
/**
 * POST /api/motion-control — the price is RESERVED before the Kling submit, never charged after it.
 *
 * ⚠️ Before: submit first, then `deductCredits(...).catch(() => null)` "fail-open on a reserve miss → the render still
 * runs". A parallel burst passed one stale balance read and only the first charge fit (N−1 free renders); a ledger
 * error rendered free; the job row was `void createJob(...)` (droppable when the lambda freezes) and the raw provider
 * error went to the client. Pinned here, every provider and the ledger mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('sharp', () => () => ({ rotate: () => ({ jpeg: () => ({ toBuffer: async () => Buffer.from('x') }) }) }));

jest.mock('../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn(async () => null), RATE_LIMITS: { EXPENSIVE: {} } }));
jest.mock('../../../lib/ai/klingClient', () => ({
  klingConfigured: jest.fn(() => true),
  klingSubmit: jest.fn(async () => 'pred-abc'),
  KLING_MODELS: { V21_MASTER: 'v2.1-master', V16_PRO: 'v1.6-pro' },
}));
jest.mock('../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../../../lib/orchestrator/storage-adapter', () => ({ uploadBufferAndSign: jest.fn(async () => null), createSignedAssetUrl: jest.fn(async () => null) }));
jest.mock('../../../lib/orchestrator/jobs', () => ({ createJob: jest.fn(async () => true), updateJobStage: jest.fn(async () => undefined) }));
jest.mock('../../../lib/orchestrator/ledger', () => ({
  hasSufficientBalance: jest.fn(async () => true),
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundDebitByRef: jest.fn(async () => ({ ok: true, refunded: 15 })),
}));
jest.mock('../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { POST } from './route';
import { klingSubmit } from '../../../lib/ai/klingClient';
import { createJob } from '../../../lib/orchestrator/jobs';
import { deductCredits, refundDebitByRef } from '../../../lib/orchestrator/ledger';
import { motionChargeForPolledId } from '../../../lib/services/motion/chargeToken';

const ENV = { ...process.env };
const BODY = { characterImageUrl: 'data:image/png;base64,AAAA', motionPrompt: 'dancing', duration: 5, aspectRatio: '9:16' };
const post = (body: unknown = BODY) =>
  new Request('https://myavatar.ge/api/motion-control', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, MOTION_CHARGE_SECRET: 'test-motion-secret' };
  (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
  (klingSubmit as jest.Mock).mockResolvedValue('pred-abc');
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { process.env = ENV; });

test('the reservation lands BEFORE the paid submit, under a fresh server ref', async () => {
  const res = await POST(post());
  expect(res.status).toBe(200);
  const order = [(deductCredits as jest.Mock).mock.invocationCallOrder[0], (klingSubmit as jest.Mock).mock.invocationCallOrder[0]];
  expect(order[0]).toBeLessThan(order[1]!);
  const [uid, amount, ref] = (deductCredits as jest.Mock).mock.calls[0];
  expect(uid).toBe('user-1');
  expect(amount).toBe(15);
  expect(ref).toMatch(/^motion:reserve:[0-9a-f-]{36}:user-1$/);
});

test('the returned jobId carries a charge token naming exactly that reservation and prediction', async () => {
  const j = await (await POST(post())).json();
  const ref = (deductCredits as jest.Mock).mock.calls[0][2];
  expect(motionChargeForPolledId(j.jobId)).toEqual({ jobId: 'pred-abc', charge: { u: 'user-1', r: ref, j: 'pred-abc' } });
});

test('the job row is AWAITED, born processing, and carries `_settle` for the cron — not a blind `_reserve`', async () => {
  await POST(post());
  expect(createJob).toHaveBeenCalledTimes(1);
  const row = (createJob as jest.Mock).mock.calls[0][0];
  expect(row).toMatchObject({ id: 'motion:pred-abc', userId: 'user-1', status: 'processing' });
  expect(row.params._settle).toEqual({ v: 1, kind: 'motion', job: 'pred-abc', ref: (deductCredits as jest.Mock).mock.calls[0][2], credits: 15 });
  expect(row.params._reserve).toBeUndefined();
});

test('insufficient credits → 402 and NO render', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'insufficient' });
  const res = await POST(post());
  expect(res.status).toBe(402);
  expect(klingSubmit).not.toHaveBeenCalled();
});

test('a ledger that definitively failed → 503 billing_unavailable and NO render (it used to render free)', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'error' });
  const res = await POST(post());
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ error: 'billing_unavailable' });
  expect(klingSubmit).not.toHaveBeenCalled();
});

test('no signing key → refuse BEFORE reserving (a charge nothing could refund is never taken)', async () => {
  delete process.env.MOTION_CHARGE_SECRET;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await POST(post());
  expect(res.status).toBe(503);
  expect(deductCredits).not.toHaveBeenCalled();
  expect(klingSubmit).not.toHaveBeenCalled();
});

test('a submit that throws refunds the reservation through the ledger and never echoes the provider', async () => {
  (klingSubmit as jest.Mock).mockRejectedValue(new Error('Replicate API 402: {"detail":"Go to https://replicate.com/account/billing"}'));
  const res = await POST(post());
  expect(res.status).toBe(502);
  const j = await res.json();
  const ref = (deductCredits as jest.Mock).mock.calls[0][2];
  expect(refundDebitByRef).toHaveBeenCalledWith('user-1', ref, 15);
  expect(j.refunded).toBe(true);
  expect(JSON.stringify(j)).not.toMatch(/replicate|billing/i);
  expect(createJob).not.toHaveBeenCalled();
});

test('a ledger without the RPC (skipped) renders uncharged: no `_settle`, a bare jobId — the documented degrade', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'skipped' });
  const j = await (await POST(post())).json();
  expect(j.jobId).toBe('pred-abc');
  expect((createJob as jest.Mock).mock.calls[0][0].params._settle).toBeUndefined();
});

test('another account’s bare upload path → 403 before any charge or render; the caller’s own path goes through', async () => {
  for (const p of ['omni-uploads/user-2/face.jpg', 'user-2/face.jpg', 'photo-studio/1-a.png']) {
    const res = await POST(post({ ...BODY, characterImageUrl: p }));
    expect(res.status).toBe(403);
  }
  expect(deductCredits).not.toHaveBeenCalled();
  expect(klingSubmit).not.toHaveBeenCalled();
  expect((await POST(post({ ...BODY, characterImageUrl: 'omni-uploads/user-1/face.jpg' }))).status).toBe(200);
});

test('a reference video is never claimed: the run is image-to-video and the reply and job row say so', async () => {
  // Replicate's Kling has no video-to-video model; a `referenceVideoUrl` used to make the reply say 'v2v' while the same
  // image-to-video ran and the video was never read.
  const res = await POST(post({ ...BODY, referenceVideoUrl: 'https://x.supabase.co/moves.mp4' }));
  expect(((await res.json()) as { method: string }).method).toBe('i2v');
  expect((klingSubmit as jest.Mock).mock.calls[0][0]).not.toHaveProperty('videoUrl');
  expect((createJob as jest.Mock).mock.calls[0][0].params.method).toBe('i2v');
});
