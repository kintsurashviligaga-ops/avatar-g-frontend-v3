/** @jest-environment node */
/**
 * POST /api/v2/model3d/create — 3D is billed, and billed honestly.
 *
 * ⚠️ The route signed the user in and then spent a Replicate mesh (plus an Imagen reference on the text path)
 * without touching their balance. Pinned here:
 *   · the reservation happens BEFORE any paid leg, under a server-keyed ref, at creditCostFor('model3d');
 *   · a user who cannot pay gets 402 and no provider call; a ledger outage refuses rather than renders free;
 *   · every exit that delivers nothing (reference, submit, budget, throw) refunds through the ledger, once;
 *   · a reservation that never charged (RPC absent) is never "refunded";
 *   · the success response carries the signature status needs to refund a provider failure.
 * Replicate, Imagen, storage, the job table and the ledger are all mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = { id: 'user-1' };
jest.mock('../../../../../lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(() => ({ auth: { getUser: jest.fn(async () => ({ data: { user: mockUser } })) } })),
}));
jest.mock('../../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } },
}));
jest.mock('../../../../../lib/services/model3d/replicate3dClient', () => ({
  submitReconstruction: jest.fn(async () => ({ ok: true, predictionId: 'pred123', pollUrl: 'https://api.replicate.com/v1/predictions/pred123' })),
  hasReplicate3dProvider: jest.fn(() => true),
}));
jest.mock('../../../../../lib/ai/geminiImagen', () => ({
  generateImagenImages: jest.fn(async () => [{ buffer: Buffer.from('png'), mimeType: 'image/png' }]),
  mapImagenAspect: jest.fn(() => '1:1'),
  hasGeminiImagenProvider: jest.fn(() => true),
}));
jest.mock('../../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (t: string) => t) }));
jest.mock('../../../../../lib/orchestrator/storage-adapter', () => ({
  uploadBufferAndSign: jest.fn(async () => 'https://x.supabase.co/storage/v1/object/sign/renders/models3d/ref.png?token=t'),
}));
jest.mock('../../../../../lib/services/billing/guardedCall', () => {
  class BudgetExceededError extends Error {
    reason = 'monthly_cap';
  }
  return { BudgetExceededError, guardedCall: jest.fn(async (_opts: unknown, fn: () => Promise<unknown>) => fn()) };
});
jest.mock('../../../../../lib/security/allowlistedAudioFetch', () => ({ isPublicHttpUrl: jest.fn(() => true) }));
jest.mock('../../../../../lib/services/resolveUpload', () => ({ resolveUploadRef: jest.fn(async (v: unknown) => v) }));
jest.mock('../../../../../lib/orchestrator/jobs', () => ({
  createJob: jest.fn(async () => true),
  failJob: jest.fn(async () => undefined),
}));
jest.mock('../../../../../lib/orchestrator/ledger', () => ({
  deductCredits: jest.fn(async () => ({ ok: true, balance: 95 })),
  refundDebitByRef: jest.fn(async () => ({ ok: true, refunded: 5 })),
}));
jest.mock('../../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { POST, maxDuration } from './route';
import { resolveUploadRef } from '../../../../../lib/services/resolveUpload';
import { submitReconstruction } from '../../../../../lib/services/model3d/replicate3dClient';
import { generateImagenImages } from '../../../../../lib/ai/geminiImagen';
import { guardedCall, BudgetExceededError } from '../../../../../lib/services/billing/guardedCall';
import { createJob, failJob } from '../../../../../lib/orchestrator/jobs';
import { deductCredits, refundDebitByRef } from '../../../../../lib/orchestrator/ledger';
import { creditCostFor } from '../../../../../lib/credits/pricing';
import { verifyModel3dCharge } from '../../../../../lib/services/model3d/chargeToken';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/v2/model3d/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const TEXT = { mode: 'text', prompt: 'an old clay jug with flowers', quality: 'draft' };
const IMAGE = { mode: 'image', imageUrl: 'https://cdn.example.com/jug.jpg', quality: 'draft' };

const deduct = deductCredits as jest.Mock;
const refund = refundDebitByRef as jest.Mock;
const submit = submitReconstruction as jest.Mock;
const imagen = generateImagenImages as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'user-1' };
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-signing-key';
  // The route logs the provider's raw error for diagnosis; expected here, so kept off the test output.
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});
let consoleError: jest.SpyInstance;
afterEach(() => consoleError.mockRestore());

describe('the price', () => {
  it('is 5 credits (0.50 ₾), the figure the product already advertises', () => {
    expect(creditCostFor('model3d')).toBe(5);
  });
});

describe('reserve before render', () => {
  it('debits creditCostFor(model3d) under model3d:charge:<server jobId>, before Imagen and before the submit', async () => {
    const res = await POST(post(TEXT));
    expect(res.status).toBe(200);
    const j = await res.json();

    expect(deduct).toHaveBeenCalledTimes(1);
    const [uid, amount, ref] = deduct.mock.calls[0];
    expect(uid).toBe('user-1');
    expect(amount).toBe(creditCostFor('model3d'));
    expect(ref).toBe(`model3d:charge:${j.jobId}`);
    // Order: the charge lands before ANY paid leg — the Imagen reference included.
    expect(deduct.mock.invocationCallOrder[0]).toBeLessThan(imagen.mock.invocationCallOrder[0]);
    expect(deduct.mock.invocationCallOrder[0]).toBeLessThan((guardedCall as jest.Mock).mock.invocationCallOrder[0]);
    expect(refund).not.toHaveBeenCalled();
  });

  it('ignores any client-supplied id when keying the charge', async () => {
    const res = await POST(post({ ...IMAGE, clientJobId: 'fixed', jobId: 'fixed', idempotencyKey: 'fixed' }));
    const j = await res.json();
    expect(deduct.mock.calls[0][2]).toBe(`model3d:charge:${j.jobId}`);
    expect(j.jobId).not.toBe('fixed');
  });

  it('returns a charge signature bound to this user, job and prediction', async () => {
    const j = await (await POST(post(IMAGE))).json();
    expect(typeof j.charge).toBe('string');
    expect(verifyModel3dCharge(j.charge, { userId: 'user-1', jobId: j.jobId, predictionId: 'pred123' })).toBe(true);
    expect(verifyModel3dCharge(j.charge, { userId: 'user-1', jobId: j.jobId, predictionId: 'other' })).toBe(false);
    expect(verifyModel3dCharge(j.charge, { userId: 'user-2', jobId: j.jobId, predictionId: 'pred123' })).toBe(false);
  });

  it('a user who cannot pay gets 402 — no Imagen, no submit, no job row', async () => {
    deduct.mockResolvedValueOnce({ ok: false, reason: 'insufficient' });
    const res = await POST(post(TEXT));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe('insufficient_credits');
    expect(imagen).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(createJob).not.toHaveBeenCalled();
  });

  it('a ledger outage refuses (503) instead of rendering unbilled', async () => {
    deduct.mockResolvedValueOnce({ ok: false, reason: 'error' });
    const res = await POST(post(IMAGE));
    expect(res.status).toBe(503);
    expect(submit).not.toHaveBeenCalled();
  });

  it('an absent RPC (skipped) proceeds uncharged — and is then never "refunded"', async () => {
    deduct.mockResolvedValueOnce({ ok: false, reason: 'skipped' });
    submit.mockResolvedValueOnce({ ok: false, error: 'replicate_http_500: boom', retryable: true });
    const res = await POST(post(IMAGE));
    expect(res.status).toBe(503);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(refund).not.toHaveBeenCalled();
  });

  it('checks the provider BEFORE charging', async () => {
    const { hasReplicate3dProvider } = jest.requireMock('../../../../../lib/services/model3d/replicate3dClient');
    (hasReplicate3dProvider as jest.Mock).mockReturnValueOnce(false);
    const res = await POST(post(IMAGE));
    expect(res.status).toBe(503);
    expect(deduct).not.toHaveBeenCalled();
  });
});

describe('refund on every exit that delivers nothing', () => {
  const expectRefundedOnce = (jobId: string) => {
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund).toHaveBeenCalledWith('user-1', `model3d:charge:${jobId}`, creditCostFor('model3d'));
    expect(failJob).toHaveBeenCalledWith(jobId, expect.any(String));
  };

  it('submit failure', async () => {
    submit.mockResolvedValueOnce({ ok: false, error: 'replicate_http_402: {"title":"Insufficient credit"}', retryable: false });
    const res = await POST(post(IMAGE));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expectRefundedOnce((await res.json()).jobId);
  });

  it('the text path\'s reference image failing', async () => {
    imagen.mockResolvedValueOnce(null);
    const res = await POST(post(TEXT));
    expect(res.status).toBe(502);
    expect(submit).not.toHaveBeenCalled();
    expectRefundedOnce((await res.json()).jobId);
  });

  it('the budget envelope refusing the submit', async () => {
    (guardedCall as jest.Mock).mockImplementationOnce(async () => { throw new BudgetExceededError('cap'); });
    const res = await POST(post(IMAGE));
    expect(res.status).toBe(429);
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund.mock.calls[0][1]).toBe(deduct.mock.calls[0][2]);
  });

  it('an unexpected throw', async () => {
    submit.mockImplementationOnce(async () => { throw new Error('network'); });
    const res = await POST(post(IMAGE));
    expect(res.status).toBe(500);
    expectRefundedOnce((await res.json()).jobId);
  });

  it('a successful submit refunds nothing', async () => {
    const res = await POST(post(IMAGE));
    expect(res.status).toBe(200);
    expect(refund).not.toHaveBeenCalled();
    expect(failJob).not.toHaveBeenCalled();
  });
});

describe('a charge taken first must not be stranded by the platform timeout', () => {
  // After the debit, the serial worst case is 2 × 12 s translation + 20 s Imagen + 2 × 90 s reference upload
  // + 30 s version lookup + 30 s submit. A lambda killed inside that window strands the charge: no `_reserve`
  // for the drainer, no signature for the client. It was 120 s in the route and 60 s in vercel.json.
  const WORST_CASE_SEC = 2 * 12 + 20 + 2 * 90 + 30 + 30;

  it('the route\'s maxDuration covers it', () => {
    expect(maxDuration).toBeGreaterThanOrEqual(WORST_CASE_SEC);
  });

  it('…and so does vercel.json, which overrides the route', () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as { functions: Record<string, { maxDuration?: number }> };
    expect(vercel.functions['app/api/v2/model3d/create/route.ts']?.maxDuration).toBeGreaterThanOrEqual(WORST_CASE_SEC);
  });
});

describe('the photo-mode reference is signed to outlive the chat thumbnail it becomes', () => {
  it('signs an uploaded path for a week, like the text path\'s reference — not resolveUploadRef\'s 1-hour default', async () => {
    await POST(post({ mode: 'image', imageUrl: 'user-1/uploads/jug.jpg', quality: 'draft' }));
    expect(resolveUploadRef).toHaveBeenCalledWith('user-1/uploads/jug.jpg', 604_800);
  });
});

describe('sign-in', () => {
  it('a guest is refused before anything is charged or spent', async () => {
    mockUser = null;
    const res = await POST(post(IMAGE));
    expect(res.status).toBe(401);
    expect(deduct).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
});
