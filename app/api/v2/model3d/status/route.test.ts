/** @jest-environment node */
/**
 * GET /api/v2/model3d/status — 3D is retired (v5.1 M-14) and its Replicate client is gone. An old job is settled from
 * our side only, and nothing reaches Replicate or any other network.
 *
 * Pinned here:
 *   · a job row that already holds the hosted model is returned as-is;
 *   · our hosted copy exists → it was delivered: hand it over and complete the owner's row;
 *   · hosted copy confirmed absent → nothing was delivered: refund through the ledger (exactly what this job took, no
 *     cap at today's price) and fail the row — REFUND FIRST, so a missed refund leaves the row live for the settle cron;
 *   · the refund needs create's signature over exactly (this user, this job, this prediction): a missing, forged or
 *     swapped signature refunds nothing;
 *   · storage that cannot say → 'processing', never a refund on a guess;
 *   · another user's job row is never written.
 * Storage, the job table and the ledger are mocked.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = { id: 'user-1' };
jest.mock('../../../../../lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(() => ({ auth: { getUser: jest.fn(async () => ({ data: { user: mockUser } })) } })),
}));
jest.mock('../../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { POLL_3D: { maxRequests: 10, windowMs: 60_000 } },
}));
jest.mock('../../../../../lib/orchestrator/storage-adapter', () => ({
  storageObjectExists: jest.fn(async () => null),
  createSignedAssetUrl: jest.fn(async (_b: string, path: string) => `https://x.supabase.co/storage/v1/object/sign/renders/${path}?token=resigned`),
}));
jest.mock('../../../../../lib/orchestrator/jobs', () => ({
  jobSnapshot: jest.fn(async () => ({ userId: 'user-1', status: 'pending', result: null })),
  completeJob: jest.fn(async () => undefined),
  failJob: jest.fn(async () => undefined),
}));
jest.mock('../../../../../lib/orchestrator/ledger', () => ({
  refundDebitByRef: jest.fn(async () => ({ ok: true, refunded: 5 })),
}));
jest.mock('../../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { storageObjectExists } from '../../../../../lib/orchestrator/storage-adapter';
import { jobSnapshot, completeJob, failJob } from '../../../../../lib/orchestrator/jobs';
import { refundDebitByRef } from '../../../../../lib/orchestrator/ledger';
import { reportError } from '../../../../../lib/observability/report-error';
import { signModel3dCharge } from '../../../../../lib/services/model3d/chargeToken';

const JOB = '0b9c8f9e-1111-4222-8333-444455556666';
const PRED = 'pred123';
const REF = `model3d:charge:${JOB}`;

const get = (q: Record<string, string>) =>
  new NextRequest(`https://myavatar.ge/api/v2/model3d/status?${new URLSearchParams(q).toString()}`);

const refund = refundDebitByRef as jest.Mock;
const snapshot = jobSnapshot as jest.Mock;
const hostedExists = storageObjectExists as jest.Mock;

let consoleWarn: jest.SpyInstance;
let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'user-1' };
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-signing-key';
  snapshot.mockResolvedValue({ userId: 'user-1', status: 'pending', result: null });
  hostedExists.mockResolvedValue(null);
  consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
});
afterEach(() => {
  consoleWarn.mockRestore();
  expect(fetchSpy).not.toHaveBeenCalled(); // nothing reaches Replicate, ever
  fetchSpy.mockRestore();
});

const signed = (over: Partial<{ userId: string; jobId: string; predictionId: string }> = {}) =>
  signModel3dCharge({ userId: 'user-1', jobId: JOB, predictionId: PRED, ...over }) as string;

it('signed out → 401; a bad prediction id → 400', async () => {
  mockUser = null;
  expect((await GET(get({ predictionId: PRED }))).status).toBe(401);
  mockUser = { id: 'user-1' };
  expect((await GET(get({ predictionId: '../x' }))).status).toBe(400);
  expect(refund).not.toHaveBeenCalled();
});

it('a completed row is returned as-is', async () => {
  snapshot.mockResolvedValueOnce({ userId: 'user-1', status: 'completed', result: { glbUrl: 'https://x.supabase.co/m.glb', predictionId: PRED } });
  const j = await (await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }))).json();
  expect(j).toEqual({ status: 'succeeded', glbUrl: 'https://x.supabase.co/m.glb', cached: true });
  expect(hostedExists).not.toHaveBeenCalled();
});

it('a hosted copy was delivered: handed over, the row completed, no refund', async () => {
  hostedExists.mockResolvedValueOnce(true);
  const j = await (await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }))).json();
  expect(j).toMatchObject({ status: 'succeeded', recovered: true });
  expect(completeJob).toHaveBeenCalledWith(JOB, expect.objectContaining({ result: expect.objectContaining({ predictionId: PRED }) }));
  expect(refund).not.toHaveBeenCalled();
});

it('storage cannot say → processing, never a refund on a guess', async () => {
  hostedExists.mockResolvedValueOnce(null);
  const j = await (await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }))).json();
  expect(j).toEqual({ status: 'processing' });
  expect(refund).not.toHaveBeenCalled();
  expect(failJob).not.toHaveBeenCalled();
});

describe('hosted copy confirmed absent → nothing was delivered', () => {
  beforeEach(() => hostedExists.mockResolvedValue(false));

  it("with create's signature: refunds what the ledger shows (no price cap), says so, then fails the row", async () => {
    const j = await (await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }))).json();
    expect(refund.mock.calls[0]).toEqual(['user-1', REF]);
    expect(j).toMatchObject({ status: 'failed', refunded: true, message: 'generation_failed' });
    expect(refund.mock.invocationCallOrder[0]).toBeLessThan((failJob as jest.Mock).mock.invocationCallOrder[0]!);
  });

  it('a refund that does not land is not claimed, and the row stays live for the settle cron', async () => {
    refund.mockResolvedValueOnce({ ok: false, reason: 'error', refunded: 0 });
    const j = await (await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }))).json();
    expect(j.refunded).toBe(false);
    expect(j.message).not.toBe('generation_failed');
    expect(failJob).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalled();
  });

  it('nothing left to refund (already refunded) still closes the row', async () => {
    refund.mockResolvedValueOnce({ ok: false, reason: 'skipped', refunded: 0 });
    await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }));
    expect(failJob).toHaveBeenCalled();
  });

  it.each([
    ['no signature', () => ''],
    ['a forged signature', () => 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
    ['a signature for a different prediction', () => signed({ predictionId: 'other' })],
    ['a signature for a different job', () => signed({ jobId: 'another-job' })],
    ["another user's signature", () => signed({ userId: 'user-2' })],
  ])('%s → no refund', async (_label, charge) => {
    const j = await (await GET(get({ predictionId: PRED, jobId: JOB, charge: charge() }))).json();
    expect(refund).not.toHaveBeenCalled();
    expect(j.refunded).toBe(false);
  });

  it("another user's job row is never written", async () => {
    snapshot.mockResolvedValueOnce({ userId: 'user-2', status: 'pending', result: null });
    await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }));
    expect(failJob).not.toHaveBeenCalled();
    expect(completeJob).not.toHaveBeenCalled();
  });
});
