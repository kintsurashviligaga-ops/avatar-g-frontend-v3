import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { storageObjectExists, createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import { completeJob, failJob, jobSnapshot } from '@/lib/orchestrator/jobs';
import { refundDebitByRef } from '@/lib/orchestrator/ledger';
import { model3dChargeRef, verifyModel3dCharge } from '@/lib/services/model3d/chargeToken';
import { reportError } from '@/lib/observability/report-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const WEEK_SEC = 604_800;

const HOST_BUCKET = 'renders';
/**
 * The ONE object a prediction's model is re-hosted as. Only this route writes it, at a name derived from the
 * prediction, and every delivery lands there before a URL is handed out — so "does it exist?" answers "was
 * this model ever delivered?". Nothing in the codebase deletes under models3d/, and no storage policy in our
 * migrations lets a user write or delete in the renders bucket. ⚠️ Adding a retention/cleanup job for these
 * objects would turn "absent" into "maybe deleted" — gate the refunds below on more than existence first.
 */
const hostedPath = (predictionId: string) => `models3d/${predictionId}.glb`;

/**
 * Refund a 3D reservation for a job that PROVABLY delivered nothing. True only when credits actually went back.
 *
 * Authorised by the create route's signature over (user, job, prediction) — never by the job row, which
 * the owner can rewrite — and paid from the ledger, never from a claimed amount. Idempotent on the ref, so
 * every later poll of the same failed prediction is a no-op.
 *
 * ⚠️ NO `claimed` CAP. The amount used to be capped at creditCostFor('model3d') — the CURRENT price, which
 * the owner can change. A job reserved at 5 and refunded after the price dropped to 3 gave back 3: the user
 * lost the difference on a model they never got. The ref is per job and create is its only debit, so the
 * ledger's net under it is exactly what this job took.
 */
async function refundUndelivered(userId: string, jobId: string, predictionId: string, charge: string): Promise<{ refunded: boolean; settled: boolean }> {
  if (!verifyModel3dCharge(charge, { userId, jobId, predictionId })) {
    if (charge) console.warn('[model3d.status] refund refused — the charge signature does not match this job and prediction');
    return { refunded: false, settled: false };
  }
  const ref = model3dChargeRef(jobId);
  const r = await refundDebitByRef(userId, ref).catch(() => null);
  // 'skipped' = nothing left to give back (already refunded, or never charged) — quiet. Anything else is a
  // user who paid for a failed job and was not refunded, which support must be able to see.
  if (!r?.ok && r?.reason !== 'skipped') reportError(new Error('model3d refund did not land'), { route: 'model3d.status', ref, reason: r?.reason ?? 'threw' });
  // `settled` = the money question is closed (credits back, or nothing left to give). Only then may the row turn
  // terminal — a row left live is one the settle cron (`_settle`) can still refund through the ledger.
  return { refunded: Boolean(r?.ok), settled: Boolean(r?.ok) || r?.reason === 'skipped' };
}

/**
 * GET /api/v2/model3d/status?predictionId=…&jobId=…&charge=…
 *
 * 3D is retired (v5.1 M-14, GG 2026-11-13: no Google engine, create answers 503 google_only), and the Replicate client
 * this route used to poll is gone. No reconstruction can still be running: create stopped long ago and Replicate keeps
 * outputs for about an hour. So one tick now settles an old job from OUR side only — nothing reaches Replicate:
 *   · the owner's row is already completed → hand back the URL it holds;
 *   · our hosted copy of the model exists → an earlier tick delivered it; hand THAT over;
 *   · the hosted copy is confirmed absent → nothing was ever delivered: refund (signature-gated) and fail the row;
 *   · storage cannot say → 'processing'; a refund on a guess could pay back a delivered model, and the settle cron
 *     (`_settle`) asks again later.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  // POLL_3D, not AI: the AI bucket is SHARED with /api/ai/chat and friends.
  const limited = await checkRateLimit(req, RATE_LIMITS.POLL_3D);
  if (limited) return limited;

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const predictionId = (req.nextUrl.searchParams.get('predictionId') || '').trim();
  const jobId = (req.nextUrl.searchParams.get('jobId') || '').trim();
  const charge = (req.nextUrl.searchParams.get('charge') || '').trim();
  // jobId arrives from the client: every row write below is gated on the caller owning the row.
  const job = jobId ? await jobSnapshot(jobId) : null;
  const ownsJob = job?.userId === user.id;
  if (!predictionId || predictionId.length > 128 || !/^[A-Za-z0-9_-]+$/.test(predictionId)) {
    return NextResponse.json({ error: 'invalid_request', message: 'predictionId is required' }, { status: 400 });
  }

  if (ownsJob && job?.status === 'completed') {
    const cached = job.result?.glbUrl;
    const forPrediction = job.result?.predictionId;
    if (typeof cached === 'string' && /^https:\/\//i.test(cached) && (forPrediction === undefined || forPrediction === predictionId)) {
      return NextResponse.json({ status: 'succeeded', glbUrl: cached, cached: true });
    }
  }

  const path = hostedPath(predictionId);
  const exists = await storageObjectExists(HOST_BUCKET, path);
  if (exists === true) {
    const url = await createSignedAssetUrl(HOST_BUCKET, path, WEEK_SEC);
    if (url) {
      if (ownsJob) {
        await completeJob(jobId, { signedUrl: url, result: { subtype: 'model3d', glbUrl: url, predictionId } }).catch(() => {});
      }
      return NextResponse.json({ status: 'succeeded', glbUrl: url, recovered: true });
    }
  }
  if (exists !== false) {
    return NextResponse.json({ status: 'processing' });
  }

  // REFUND FIRST: a refund that did not land must leave the row live for the settle cron to retry.
  const { refunded, settled } = await refundUndelivered(user.id, jobId, predictionId, charge);
  if (ownsJob && settled) await failJob(jobId, '3D generation was retired before this model was delivered').catch(() => {});
  return NextResponse.json({ status: 'failed', message: refunded ? 'generation_failed' : 'retired', refunded });
}
