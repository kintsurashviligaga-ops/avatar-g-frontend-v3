/** @jest-environment node */
/**
 * GET /api/v2/model3d/status — refunds that cannot be farmed, and no second re-host.
 *
 * Pinned here:
 *   · a prediction the PROVIDER failed refunds the 3D charge — through the ledger, exactly what this job took
 *     (never capped at today's price, which the owner can change while jobs are in flight);
 *   · only with create's signature over exactly (this user, this job, this prediction). A missing, forged,
 *     swapped-prediction or other-user signature refunds nothing — otherwise "keep the model, then poll the
 *     paid job with any failed prediction id" pays the price back;
 *   · "succeeded without a .glb" is refunded when Replicate still holds the output (data_removed: false — no
 *     tick could ever have delivered it), and NOT when the output was deleted (data_removed: true — it may
 *     have been delivered first); with no such field, our own hosted copy decides;
 *   · a download or storage failure is retried ('processing'), not terminal, until REHOST_RETRY_WINDOW_MS after
 *     the prediction finished; past it, a hosted copy is handed over, a confirmed-absent one is refunded, and
 *     an unknown one keeps retrying;
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
import { pollReconstruction, fetchGlbBuffer } from '../../../../../lib/services/model3d/replicate3dClient';
import { uploadBufferAndSign, storageObjectExists, createSignedAssetUrl } from '../../../../../lib/orchestrator/storage-adapter';
import { jobSnapshot, completeJob, failJob } from '../../../../../lib/orchestrator/jobs';
import { refundDebitByRef } from '../../../../../lib/orchestrator/ledger';
import { reportError } from '../../../../../lib/observability/report-error';
import { signModel3dCharge } from '../../../../../lib/services/model3d/chargeToken';

const JOB = '0b9c8f9e-1111-4222-8333-444455556666';
const PRED = 'pred123';

const get = (q: Record<string, string>) =>
  new NextRequest(`https://myavatar.ge/api/v2/model3d/status?${new URLSearchParams(q).toString()}`);

const poll = pollReconstruction as jest.Mock;
const refund = refundDebitByRef as jest.Mock;
const snapshot = jobSnapshot as jest.Mock;
const hostedExists = storageObjectExists as jest.Mock;
const download = fetchGlbBuffer as jest.Mock;
const upload = uploadBufferAndSign as jest.Mock;
const REF = `model3d:charge:${JOB}`;
const GLB = 'https://replicate.delivery/x/model.glb';
const MIN = 60_000;

let consoleWarn: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'user-1' };
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-signing-key';
  snapshot.mockResolvedValue({ userId: 'user-1', status: 'pending', result: null });
  hostedExists.mockResolvedValue(null);
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
    expect(refund.mock.calls[0].slice(0, 2)).toEqual(['user-1', REF]);
    expect(j).toMatchObject({ status: 'failed', refunded: true, message: 'generation_failed' });
    expect(failJob).toHaveBeenCalledWith(JOB, 'CUDA out of memory');
  });

  it('refunds what the LEDGER shows this job took — no cap at today\'s price, which may have changed since', async () => {
    await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }));
    // refundDebitByRef pays min(net, claimed): passing the CURRENT price would short a job reserved at an older,
    // higher one. The ref is per job and create is its only debit, so the net is exactly what was taken.
    expect(refund.mock.calls[0]).toEqual(['user-1', REF]);
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

describe('succeeded without a usable .glb — Replicate\'s data_removed decides the bill', () => {
  it('output still there and no .glb in it (data_removed: false): refunded — no tick could ever have delivered it', async () => {
    poll.mockResolvedValueOnce({ status: 'succeeded', glbUrl: null, dataRemoved: false });
    const j = await (await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }))).json();
    expect(j).toMatchObject({ status: 'failed', refunded: true, message: 'generation_failed' });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund.mock.calls[0]).toEqual(['user-1', REF]);
    expect(failJob).toHaveBeenCalledWith(JOB, expect.any(String));
    // Still reported: a model/output-shape drift ends EVERY job here, and a working refund must not hide it.
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ refunded: true, dataRemoved: false }));
  });

  it('…but still only with create\'s signature', async () => {
    poll.mockResolvedValueOnce({ status: 'succeeded', glbUrl: null, dataRemoved: false });
    const j = await (await GET(get({ predictionId: PRED, jobId: JOB, charge: signed({ predictionId: 'goodPrediction' }) }))).json();
    expect(j).toMatchObject({ status: 'failed', refunded: false });
    expect(refund).not.toHaveBeenCalled();
  });

  it('output DELETED (data_removed: true): not refunded — that is what a delivered model looks like an hour later', async () => {
    poll.mockResolvedValueOnce({ status: 'succeeded', glbUrl: null, dataRemoved: true });
    const j = await (await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }))).json();
    expect(j).toMatchObject({ status: 'failed', refunded: false });
    expect(refund).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ refunded: false, dataRemoved: true }));
  });

  it.each([
    [false, true],  // hosted copy confirmed absent → nothing was ever delivered → refund
    [true, false],  // a hosted copy exists → it WAS delivered → no refund
    [null, false],  // storage cannot say → no refund on a guess
  ])('no data_removed field: hosted copy exists=%s → refunded=%s', async (exists, expected) => {
    poll.mockResolvedValueOnce({ status: 'succeeded', glbUrl: null });
    hostedExists.mockResolvedValueOnce(exists);
    const j = await (await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }))).json();
    expect(hostedExists).toHaveBeenCalledWith('renders', `models3d/${PRED}.glb`);
    expect(j.status).toBe('failed');
    expect(j.refunded).toBe(expected);
    expect(refund).toHaveBeenCalledTimes(expected ? 1 : 0);
  });
});

describe('download and storage failures are retried, not terminal', () => {
  const finished = (agoMs: number) => ({ status: 'succeeded', glbUrl: GLB, dataRemoved: false, completedAtMs: Date.now() - agoMs });

  it.each([
    ['download', () => download.mockResolvedValueOnce(null)],
    ['storage', () => upload.mockResolvedValueOnce(null)],
  ])('a %s failure inside the window answers processing — the panel keeps polling, nothing is failed or refunded', async (_stage, arrange) => {
    poll.mockResolvedValueOnce(finished(1 * MIN));
    arrange();
    const res = await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }));
    const j = await res.json();
    // 'failed' here was terminal: the panel stops on it, so one CDN 5xx burned the charge on a model the next
    // tick would have delivered.
    expect(j.status).toBe('processing');
    expect(failJob).not.toHaveBeenCalled();
    expect(refund).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ retrying: true }));
  });

  it('…and the next tick that gets through delivers it', async () => {
    poll.mockResolvedValue(finished(1 * MIN));
    download.mockResolvedValueOnce(null);
    expect((await (await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }))).json()).status).toBe('processing');
    const j = await (await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }))).json();
    expect(j.status).toBe('succeeded');
    expect(completeJob).toHaveBeenCalledTimes(1);
    expect(refund).not.toHaveBeenCalled();
  });

  it('with no completion time from Replicate it never gives up on its own', async () => {
    poll.mockResolvedValueOnce({ status: 'succeeded', glbUrl: GLB, dataRemoved: false });
    download.mockResolvedValueOnce(null);
    const j = await (await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }))).json();
    expect(j.status).toBe('processing');
    expect(hostedExists).not.toHaveBeenCalled();
    expect(refund).not.toHaveBeenCalled();
  });

  it('past the window with no hosted copy: nothing was ever delivered → failed, and refunded', async () => {
    poll.mockResolvedValueOnce(finished(11 * MIN));
    download.mockResolvedValueOnce(null);
    hostedExists.mockResolvedValueOnce(false);
    const res = await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }));
    const j = await res.json();
    expect(res.status).toBe(502);
    expect(j).toMatchObject({ status: 'failed', refunded: true, message: 'generation_failed' });
    expect(hostedExists).toHaveBeenCalledWith('renders', `models3d/${PRED}.glb`);
    expect(refund.mock.calls[0]).toEqual(['user-1', REF]);
    expect(failJob).toHaveBeenCalledWith(JOB, 'could not download the generated model');
  });

  it('past the window, a storage failure refunds only with create\'s signature', async () => {
    poll.mockResolvedValueOnce(finished(11 * MIN));
    upload.mockResolvedValueOnce(null);
    hostedExists.mockResolvedValueOnce(false);
    const j = await (await GET(get({ predictionId: PRED, jobId: JOB, charge: 'forged' }))).json();
    expect(j).toMatchObject({ status: 'failed', refunded: false, message: 'the model could not be stored' });
    expect(refund).not.toHaveBeenCalled();
  });

  it('past the window with a hosted copy: an earlier tick stored it — hand that over, refund nothing', async () => {
    poll.mockResolvedValueOnce(finished(11 * MIN));
    download.mockResolvedValueOnce(null);
    hostedExists.mockResolvedValueOnce(true);
    const j = await (await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }))).json();
    expect(j).toMatchObject({ status: 'succeeded', recovered: true });
    expect(createSignedAssetUrl).toHaveBeenCalledWith('renders', `models3d/${PRED}.glb`, expect.any(Number));
    expect(completeJob).toHaveBeenCalledWith(JOB, expect.objectContaining({ result: expect.objectContaining({ glbUrl: j.glbUrl, predictionId: PRED }) }));
    expect(refund).not.toHaveBeenCalled();
    expect(failJob).not.toHaveBeenCalled();
  });

  it('past the window when storage cannot say: keep retrying — a refund on a guess could repay a delivered model', async () => {
    poll.mockResolvedValueOnce(finished(11 * MIN));
    download.mockResolvedValueOnce(null);
    hostedExists.mockResolvedValueOnce(null);
    const j = await (await GET(get({ predictionId: PRED, jobId: JOB, charge: signed() }))).json();
    expect(j.status).toBe('processing');
    expect(refund).not.toHaveBeenCalled();
    expect(failJob).not.toHaveBeenCalled();
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
