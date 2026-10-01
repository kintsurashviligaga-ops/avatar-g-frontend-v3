/** @jest-environment node */
/**
 * GET /api/v2/model3d/status — refunds that cannot be farmed, and no second re-host.
 *
 * Pinned here:
 *   · a prediction the PROVIDER failed refunds the 3D charge — through the ledger, at most what was taken;
 *   · only with create's signature over exactly (this user, this job, this prediction). A missing, forged,
 *     swapped-prediction or other-user signature refunds nothing — otherwise "keep the model, then poll the
 *     paid job with any failed prediction id" pays the price back;
 *   · outcomes that may follow a delivery (no usable file, download, storage) are reported, not refunded;
 *   · a job row that already holds the hosted model is returned as-is: no Replicate poll, no download, no
 *     upload;
 *   · a finalising tick writes ONE object per prediction and records which prediction it came from.
 * Replicate, storage, the job table and the ledger are all mocked — no network, no spend.
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
jest.mock('../../../../../lib/services/model3d/replicate3dClient', () => ({
  pollReconstruction: jest.fn(),
  fetchGlbBuffer: jest.fn(async () => Buffer.from('glTF-binary')),
  hasReplicate3dProvider: jest.fn(() => true),
}));
jest.mock('../../../../../lib/orchestrator/storage-adapter', () => ({
  uploadBufferAndSign: jest.fn(async (_b: string, path: string) => `https://x.supabase.co/storage/v1/object/sign/renders/${path}?token=t`),
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
import { pollReconstruction, fetchGlbBuffer } from '../../../../../lib/services/model3d/replicate3dClient';
import { uploadBufferAndSign } from '../../../../../lib/orchestrator/storage-adapter';
import { jobSnapshot, completeJob, failJob } from '../../../../../lib/orchestrator/jobs';
import { refundDebitByRef } from '../../../../../lib/orchestrator/ledger';
import { reportError } from '../../../../../lib/observability/report-error';
import { creditCostFor } from '../../../../../lib/credits/pricing';
import { signModel3dCharge } from '../../../../../lib/services/model3d/chargeToken';

const JOB = '0b9c8f9e-1111-4222-8333-444455556666';
const PRED = 'pred123';

const get = (q: Record<string, string>) =>
  new NextRequest(`https://myavatar.ge/api/v2/model3d/status?${new URLSearchParams(q).toString()}`);

const poll = pollReconstruction as jest.Mock;
const refund = refundDebitByRef as jest.Mock;
const snapshot = jobSnapshot as jest.Mock;

let consoleWarn: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'user-1' };
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-signing-key';
  snapshot.mockResolvedValue({ userId: 'user-1', status: 'pending', result: null });
  consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => consoleWarn.mockRestore());

const signed = (over: Partial<{ userId: string; jobId: string; predictionId: string }> = {}) =>
  signModel3dCharge({ userId: 'user-1', jobId: JOB, predictionId: PRED, ...over }) as string;

describe('a provider-failed prediction refunds the 3D charge', () => {
  beforeEach(() => poll.mockResolvedValue({ status: 'failed', glbUrl: null, error: 'CUDA out of memory' }));

  it('with create\'s signature: refunds through the ledger, says so, and fails the job', async () => {
    const res = await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }));
    const j = await res.json();
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund).toHaveBeenCalledWith('user-1', `model3d:charge:${JOB}`, creditCostFor('model3d'));
    expect(j).toMatchObject({ status: 'failed', refunded: true, message: 'generation_failed' });
    expect(failJob).toHaveBeenCalledWith(JOB, 'CUDA out of memory');
  });

  it('a refund that does not land is not claimed to the user', async () => {
    refund.mockResolvedValueOnce({ ok: false, reason: 'error', refunded: 0 });
    const j = await (await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }))).json();
    expect(j.refunded).toBe(false);
    expect(j.message).not.toBe('generation_failed');
    expect(reportError).toHaveBeenCalled();
  });

  it.each([
    ['no signature', ''],
    ['a forged signature', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
    ['a signature for a DIFFERENT prediction (keep the good model, claim with a failed one)', 'swap-prediction'],
    ['a signature for a DIFFERENT job', 'swap-job'],
    ['another user\'s signature', 'swap-user'],
  ])('%s → no refund', async (_label, kind) => {
    const charge = kind === 'swap-prediction' ? signed({ predictionId: 'goodPrediction' })
      : kind === 'swap-job' ? signed({ jobId: 'another-job' })
        : kind === 'swap-user' ? signed({ userId: 'user-2' })
          : kind;
    const j = await (await GET(get({ predictionId: PRED, jobId: JOB, charge }))).json();
    expect(j.status).toBe('failed');
    expect(j.refunded).toBe(false);
    expect(refund).not.toHaveBeenCalled();
  });

  it('with no signing key configured, nothing can be refunded (fail-closed)', async () => {
    const charge = signed();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.MODEL3D_CHARGE_SECRET;
    await GET(get({ predictionId: PRED, jobId: JOB, charge }));
    expect(refund).not.toHaveBeenCalled();
  });

  it('refunds even when the job row could not be read — the signature, not the row, authorises it', async () => {
    snapshot.mockResolvedValueOnce(null);
    await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }));
    expect(refund).toHaveBeenCalledTimes(1);
    expect(failJob).not.toHaveBeenCalled(); // but the row is only written by its owner
  });
});

describe('failures that may FOLLOW a delivery are reported, never refunded', () => {
  it('succeeded without a usable file (what a delivered model looks like after Replicate deletes outputs)', async () => {
    poll.mockResolvedValueOnce({ status: 'succeeded', glbUrl: null });
    const j = await (await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }))).json();
    expect(j.status).toBe('failed');
    expect(refund).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalled();
  });

  it('download failure', async () => {
    poll.mockResolvedValueOnce({ status: 'succeeded', glbUrl: 'https://replicate.delivery/x/model.glb' });
    (fetchGlbBuffer as jest.Mock).mockResolvedValueOnce(null);
    const res = await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }));
    expect(res.status).toBe(502);
    expect(refund).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalled();
  });

  it('storage failure', async () => {
    poll.mockResolvedValueOnce({ status: 'succeeded', glbUrl: 'https://replicate.delivery/x/model.glb' });
    (uploadBufferAndSign as jest.Mock).mockResolvedValueOnce(null);
    const res = await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }));
    expect(res.status).toBe(502);
    expect(refund).not.toHaveBeenCalled();
  });

  it('a still-running prediction neither refunds nor fails', async () => {
    poll.mockResolvedValueOnce({ status: 'processing', glbUrl: null });
    const j = await (await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }))).json();
    expect(j.status).toBe('processing');
    expect(refund).not.toHaveBeenCalled();
    expect(failJob).not.toHaveBeenCalled();
  });
});

describe('no duplicate re-hosting', () => {
  const HOSTED = 'https://x.supabase.co/storage/v1/object/sign/renders/models3d/pred123.glb?token=old';

  it('a completed row with a result is returned as-is — no poll, no download, no upload', async () => {
    snapshot.mockResolvedValueOnce({ userId: 'user-1', status: 'completed', result: { subtype: 'model3d', glbUrl: HOSTED, predictionId: PRED } });
    const j = await (await GET(get({ predictionId: PRED, jobId: JOB }))).json();
    expect(j).toMatchObject({ status: 'succeeded', glbUrl: HOSTED });
    expect(poll).not.toHaveBeenCalled();
    expect(fetchGlbBuffer).not.toHaveBeenCalled();
    expect(uploadBufferAndSign).not.toHaveBeenCalled();
  });

  it('also for rows written before the prediction id was recorded', async () => {
    snapshot.mockResolvedValueOnce({ userId: 'user-1', status: 'completed', result: { subtype: 'model3d', glbUrl: HOSTED } });
    const j = await (await GET(get({ predictionId: PRED, jobId: JOB }))).json();
    expect(j.glbUrl).toBe(HOSTED);
    expect(uploadBufferAndSign).not.toHaveBeenCalled();
  });

  it('not for somebody else\'s row, nor for a row holding a different prediction\'s model', async () => {
    poll.mockResolvedValue({ status: 'processing', glbUrl: null });
    snapshot.mockResolvedValueOnce({ userId: 'user-2', status: 'completed', result: { glbUrl: HOSTED } });
    expect((await (await GET(get({ predictionId: PRED, jobId: JOB }))).json()).status).toBe('processing');
    snapshot.mockResolvedValueOnce({ userId: 'user-1', status: 'completed', result: { glbUrl: HOSTED, predictionId: 'other' } });
    expect((await (await GET(get({ predictionId: PRED, jobId: JOB }))).json()).status).toBe('processing');
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('the finalising tick writes one object per prediction and records which prediction it holds', async () => {
    poll.mockResolvedValueOnce({ status: 'succeeded', glbUrl: 'https://replicate.delivery/x/model.glb' });
    const j = await (await GET(get({ predictionId: PRED, jobId: JOB }))).json();
    expect(j.status).toBe('succeeded');
    expect((uploadBufferAndSign as jest.Mock).mock.calls[0][1]).toBe(`models3d/${PRED}.glb`);
    expect(completeJob).toHaveBeenCalledWith(JOB, expect.objectContaining({ result: expect.objectContaining({ glbUrl: j.glbUrl, predictionId: PRED }) }));
    expect(refund).not.toHaveBeenCalled();
  });
});
