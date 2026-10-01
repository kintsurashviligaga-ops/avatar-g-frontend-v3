import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { pollReconstruction, fetchGlbBuffer, hasReplicate3dProvider } from '@/lib/services/model3d/replicate3dClient';
import { isTerminal } from '@/lib/services/model3d/model3dPlan';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { completeJob, failJob, jobSnapshot } from '@/lib/orchestrator/jobs';
import { refundDebitByRef } from '@/lib/orchestrator/ledger';
import { creditCostFor } from '@/lib/credits/pricing';
import { model3dChargeRef, verifyModel3dCharge } from '@/lib/services/model3d/chargeToken';
import { reportError } from '@/lib/observability/report-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// One poll tick, plus (on the final tick only) downloading and re-hosting the GLB.
export const maxDuration = 180;

const WEEK_SEC = 604_800;

/**
 * Refund a 3D reservation whose prediction the PROVIDER failed. True only when credits actually went back.
 *
 * Authorised by the create route's signature over (user, job, prediction) — never by the job row, which
 * the owner can rewrite — and paid from the ledger, never from a claimed amount. Idempotent on the ref, so
 * every later poll of the same failed prediction is a no-op.
 */
async function refundProviderFailure(userId: string, jobId: string, predictionId: string, charge: string): Promise<boolean> {
  if (!verifyModel3dCharge(charge, { userId, jobId, predictionId })) {
    if (charge) console.warn('[model3d.status] refund refused — the charge signature does not match this job and prediction');
    return false;
  }
  const ref = model3dChargeRef(jobId);
  const r = await refundDebitByRef(userId, ref, creditCostFor('model3d')).catch(() => null);
  // 'skipped' = nothing left to give back (already refunded, or never charged) — quiet. Anything else is a
  // user who paid for a failed job and was not refunded, which support must be able to see.
  if (!r?.ok && r?.reason !== 'skipped') reportError(new Error('model3d refund did not land'), { route: 'model3d.status', ref, reason: r?.reason ?? 'threw' });
  return Boolean(r?.ok);
}

/**
 * GET /api/v2/model3d/status?predictionId=…&jobId=…&charge=…
 *
 * One poll tick. On success the GLB is downloaded and RE-HOSTED on our own storage before the URL is
 * returned — the app's CSP has no replicate.delivery in `connect-src`, so handing the browser a Replicate
 * CDN URL yields a viewer that works in local dev and is silently blocked in production.
 *
 * The poll URL is REBUILT from the prediction id rather than accepted from the client: taking a
 * caller-supplied URL and fetching it with our API token attached would be a server-side request forgery
 * with credentials.
 *
 * REFUNDS ONLY A PROVIDER-REPORTED FAILURE. Replicate never turns a failed prediction into a succeeded one,
 * so that refund can never be followed by a delivery. The other failures below (finished without a usable
 * file, download, storage) are NOT auto-refunded: Replicate deletes API outputs after about an hour, so a
 * model delivered at minute five looks exactly like those failures when polled again at minute ninety —
 * refunding them would hand back the price of a model the user already has. They are reported instead.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  // POLL_3D, not AI: the AI bucket is SHARED with /api/ai/chat and friends, and this poll spends eight of
  // its ten requests in the first minute — so a running 3D job made the chat box (which is where this
  // surface lives) answer "Too many requests". See the note on POLL_3D.
  const limited = await checkRateLimit(req, RATE_LIMITS.POLL_3D);
  if (limited) return limited;

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!hasReplicate3dProvider()) {
    return NextResponse.json({ error: 'provider_not_configured' }, { status: 503 });
  }

  const predictionId = (req.nextUrl.searchParams.get('predictionId') || '').trim();
  const jobId = (req.nextUrl.searchParams.get('jobId') || '').trim();
  const charge = (req.nextUrl.searchParams.get('charge') || '').trim();
  // ⚠️ jobId ARRIVES FROM THE CLIENT AND WAS TRUSTED. Every completeJob/failJob below fired on whatever
  // id the caller passed, with no check that the row belongs to them — so any signed-in user could
  // complete or fail ANOTHER user's job by guessing an id, corrupting someone else's Library entry and
  // their view of what finished. The poll itself is safe (predictionId only reaches Replicate), but the
  // job-row writes are not. Resolved ONCE here so every write site below shares one authorization.
  const job = jobId ? await jobSnapshot(jobId) : null;
  const ownsJob = job?.userId === user.id;
  // Replicate ids are opaque alphanumerics; bound and charset-check so nothing hostile reaches the path.
  if (!predictionId || predictionId.length > 128 || !/^[A-Za-z0-9_-]+$/.test(predictionId)) {
    return NextResponse.json({ error: 'invalid_request', message: 'predictionId is required' }, { status: 400 });
  }

  // ⚠️ ALREADY DELIVERED → HAND BACK WHAT WAS DELIVERED. Every succeeded tick used to download the GLB from
  // Replicate and upload it again, so a repeated poll (a retry, a second tab, a re-mount) re-spent up to
  // 60MB of transfer each way and left another copy in storage. The completed row already holds the hosted
  // URL. It is the owner's own row, so at worst they are shown a URL they wrote themselves.
  if (ownsJob && job?.status === 'completed') {
    const cached = job.result?.glbUrl;
    const forPrediction = job.result?.predictionId;
    if (typeof cached === 'string' && /^https:\/\//i.test(cached) && (forPrediction === undefined || forPrediction === predictionId)) {
      return NextResponse.json({ status: 'succeeded', glbUrl: cached, cached: true });
    }
  }

  const poll = await pollReconstruction(`https://api.replicate.com/v1/predictions/${predictionId}`);

  if (poll.status === 'failed') {
    if (ownsJob) await failJob(jobId, poll.error || 'replicate reported failure').catch(() => {});
    const refunded = await refundProviderFailure(user.id, jobId, predictionId, charge);
    // 'generation_failed' is the code the panel renders as "did not finish — you were refunded"; it is only
    // sent when the refund actually landed, so the sentence is never a promise the ledger did not keep.
    return NextResponse.json({ status: 'failed', message: refunded ? 'generation_failed' : (poll.error || 'generation failed'), refunded });
  }

  // ⚠️ TERMINAL WITHOUT A MESH IS A FAILURE, NOT "STILL WORKING".
  //
  // This used to answer `{ status: poll.status }` for BOTH cases, so a prediction Replicate reported as
  // SUCCEEDED whose output pickGlbUrl could not resolve to a .glb came back as {status:'succeeded'} with
  // no glbUrl — and both clients only finish on `succeeded && glbUrl` and only abort on `failed`. So
  // neither ever terminated: the user watched "Generating…" for the full 120-attempt loop (~29 minutes)
  // and was then told it took too long, for a job that had actually succeeded and been billed. The job
  // row was never completed or failed either, so nothing reached the Library and the abandoned-render
  // cron could not see it. The same dead end was reached on a token rotation, since a non-ok HTTP maps
  // to 'processing'. A terminal status with nothing to deliver now ENDS the loop and says so.
  if (isTerminal(poll.status) && !poll.glbUrl) {
    if (ownsJob) await failJob(jobId, 'the provider finished without a usable model file').catch(() => {});
    reportError(new Error('model3d finished without a usable model file'), { route: 'model3d.status', ref: model3dChargeRef(jobId), predictionId, refunded: false });
    return NextResponse.json({ status: 'failed', message: 'the generation finished without a usable model file' });
  }
  if (!isTerminal(poll.status) || !poll.glbUrl) {
    return NextResponse.json({ status: poll.status });
  }

  const buf = await fetchGlbBuffer(poll.glbUrl);
  if (!buf) {
    if (ownsJob) await failJob(jobId, 'could not download the generated model').catch(() => {});
    reportError(new Error('model3d download failed'), { route: 'model3d.status', ref: model3dChargeRef(jobId), predictionId, refunded: false });
    return NextResponse.json({ status: 'failed', message: 'the model could not be downloaded' }, { status: 502 });
  }

  const hosted = await uploadBufferAndSign(
    'renders',
    // ONE object per prediction (the upload upserts): a concurrent or repeated finalising tick overwrites the
    // same file instead of leaving another orphaned copy, which the timestamped name used to do.
    `models3d/${predictionId}.glb`,
    buf,
    'model/gltf-binary',
    WEEK_SEC,
  );
  if (!hosted) {
    if (ownsJob) await failJob(jobId, 'could not store the generated model').catch(() => {});
    reportError(new Error('model3d storage failed'), { route: 'model3d.status', ref: model3dChargeRef(jobId), predictionId, refunded: false });
    return NextResponse.json({ status: 'failed', message: 'the model could not be stored' }, { status: 502 });
  }

  if (ownsJob) {
    await completeJob(jobId, {
      signedUrl: hosted,
      result: { subtype: 'model3d', glbUrl: hosted, predictionId },
    }).catch(() => {});
  }

  return NextResponse.json({ status: 'succeeded', glbUrl: hosted, bytes: buf.byteLength });
}
