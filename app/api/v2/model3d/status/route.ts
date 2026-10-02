import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { pollReconstruction, fetchGlbBuffer, hasReplicate3dProvider } from '@/lib/services/model3d/replicate3dClient';
import { isTerminal } from '@/lib/services/model3d/model3dPlan';
import { uploadBufferAndSign, storageObjectExists, createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import { completeJob, failJob, jobSnapshot } from '@/lib/orchestrator/jobs';
import { refundDebitByRef } from '@/lib/orchestrator/ledger';
import { model3dChargeRef, verifyModel3dCharge } from '@/lib/services/model3d/chargeToken';
import { reportError } from '@/lib/observability/report-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// One poll tick, plus (on the final tick only) downloading and re-hosting the GLB.
export const maxDuration = 180;

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
 * How long after Replicate FINISHES a prediction a failing download or re-host keeps being retried.
 *
 * Replicate keeps API outputs for about an hour and the panel keeps polling for roughly 25 minutes after a
 * typical reconstruction ends. Ten minutes rides out a CDN blip, a fetch timeout or a storage hiccup (about
 * forty ticks) and still ends a PERMANENT failure — an oversized file, a missing bucket — with a refund while
 * the user is still watching, instead of a spinner that times out with their credits kept.
 */
const REHOST_RETRY_WINDOW_MS = 10 * 60_000;

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
 * One poll tick. On success the GLB is downloaded and RE-HOSTED on our own storage before the URL is
 * returned — the app's CSP has no replicate.delivery in `connect-src`, so handing the browser a Replicate
 * CDN URL yields a viewer that works in local dev and is silently blocked in production.
 *
 * The poll URL is REBUILT from the prediction id rather than accepted from the client: taking a
 * caller-supplied URL and fetching it with our API token attached would be a server-side request forgery
 * with credentials.
 *
 * REFUNDS ONLY WHAT PROVABLY DELIVERED NOTHING — a refund must never be followed by a delivery, nor follow one:
 *   · Replicate failed or canceled the prediction. It never turns that into a success.
 *   · It succeeded, its output is STILL THERE (`data_removed: false`) and holds no .glb. Every tick reads the
 *     same output, so no tick could ever have delivered one. (Version or output-shape drift lands here.)
 *   · The model exists at Replicate, but downloading or storing it kept failing for REHOST_RETRY_WINDOW_MS
 *     after the prediction finished, and no hosted copy exists — so no earlier tick delivered it either.
 * NOT refunded: an output Replicate has DELETED (`data_removed: true`). Outputs are kept for about an hour,
 * so a model delivered at minute five looks exactly like that when polled again at minute ninety.
 *
 * A download or storage failure inside the window is NOT terminal: the panel stops polling on 'failed', so
 * answering that to one CDN 5xx or one fetch timeout burned a charge on a model the next tick would have
 * delivered. It answers 'processing', and the next tick tries again.
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
    // REFUND FIRST: a refund that did not land must leave the row live for the settle cron to retry.
    const { refunded, settled } = await refundUndelivered(user.id, jobId, predictionId, charge);
    if (ownsJob && settled) await failJob(jobId, poll.error || 'replicate reported failure').catch(() => {});
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
    // ⚠️ "NO FILE" IS TWO DIFFERENT OUTCOMES, AND THEY ARE BILLED OPPOSITE WAYS. Replicate's data_removed
    // separates them: FALSE = the output is still there and simply holds no .glb, so the job never had a model
    // and no tick could have delivered one → refund. TRUE = the output was deleted, possibly after this very
    // model was delivered → no refund. Treating both as the second kept 5 credits for every job that ended
    // without a model — and on a version or output-shape drift that is every 3D job. An answer WITHOUT the
    // field falls back to our own hosted copy: confirmed absent means nothing was ever delivered.
    const neverHadModel = poll.dataRemoved === false
      || (poll.dataRemoved === undefined && (await storageObjectExists(HOST_BUCKET, hostedPath(predictionId))) === false);
    const outcome = neverHadModel ? await refundUndelivered(user.id, jobId, predictionId, charge) : { refunded: false, settled: true };
    const refunded = outcome.refunded;
    if (ownsJob && outcome.settled) await failJob(jobId, 'the provider finished without a usable model file').catch(() => {});
    // Reported even when refunded: a model version or output shape that pickGlbUrl no longer reads makes EVERY
    // job end here, and with the refund working that outage would otherwise be silent.
    reportError(new Error('model3d finished without a usable model file'), {
      route: 'model3d.status', ref: model3dChargeRef(jobId), predictionId, refunded,
      dataRemoved: poll.dataRemoved ?? 'unknown',
    });
    return NextResponse.json({
      status: 'failed',
      message: refunded ? 'generation_failed' : 'the generation finished without a usable model file',
      refunded,
    });
  }
  if (!isTerminal(poll.status) || !poll.glbUrl) {
    return NextResponse.json({ status: poll.status });
  }

  const buf = await fetchGlbBuffer(poll.glbUrl);
  // ONE object per prediction (the upload upserts): a concurrent or repeated finalising tick overwrites the
  // same file instead of leaving another orphaned copy, which the timestamped name used to do.
  const hosted = buf ? await uploadBufferAndSign(HOST_BUCKET, hostedPath(predictionId), buf, 'model/gltf-binary', WEEK_SEC) : null;
  if (!buf || !hosted) {
    return rehostFailed({
      stage: buf ? 'storage' : 'download',
      userId: user.id, jobId, predictionId, charge, ownsJob,
      completedAtMs: poll.completedAtMs,
    });
  }

  if (ownsJob) {
    await completeJob(jobId, {
      signedUrl: hosted,
      result: { subtype: 'model3d', glbUrl: hosted, predictionId },
    }).catch(() => {});
  }

  return NextResponse.json({ status: 'succeeded', glbUrl: hosted, bytes: buf.byteLength });
}

/**
 * The model exists at Replicate, but this tick could not download it or store it.
 *
 * Inside REHOST_RETRY_WINDOW_MS (or when Replicate gave no completion time) this is NOT a failure: answer
 * 'processing' and let the next tick try again. Past the window, our hosted copy decides — it is the only
 * place a delivery ever lands:
 *   · it exists → an earlier tick stored the model; hand THAT over rather than fail a delivered job;
 *   · it is confirmed absent → nothing was ever delivered: fail the job and refund (signature-gated);
 *   · storage cannot say → keep answering 'processing'; a refund on a guess could pay back a delivered model.
 */
async function rehostFailed(c: {
  stage: 'download' | 'storage';
  userId: string;
  jobId: string;
  predictionId: string;
  charge: string;
  ownsJob: boolean;
  completedAtMs?: number;
}): Promise<NextResponse> {
  const ref = model3dChargeRef(c.jobId);
  const sinceDone = typeof c.completedAtMs === 'number' ? Date.now() - c.completedAtMs : null;
  if (sinceDone === null || sinceDone < REHOST_RETRY_WINDOW_MS) {
    reportError(new Error(`model3d ${c.stage} failed`), { route: 'model3d.status', ref, predictionId: c.predictionId, retrying: true });
    return NextResponse.json({ status: 'processing' });
  }

  const path = hostedPath(c.predictionId);
  const exists = await storageObjectExists(HOST_BUCKET, path);
  if (exists === true) {
    const url = await createSignedAssetUrl(HOST_BUCKET, path, WEEK_SEC);
    if (url) {
      if (c.ownsJob) {
        await completeJob(c.jobId, { signedUrl: url, result: { subtype: 'model3d', glbUrl: url, predictionId: c.predictionId } }).catch(() => {});
      }
      return NextResponse.json({ status: 'succeeded', glbUrl: url, recovered: true });
    }
  }
  if (exists !== false) {
    reportError(new Error(`model3d ${c.stage} failed`), { route: 'model3d.status', ref, predictionId: c.predictionId, retrying: true, hostedCopy: exists === true ? 'unsignable' : 'unknown' });
    return NextResponse.json({ status: 'processing' });
  }

  const { refunded, settled } = await refundUndelivered(c.userId, c.jobId, c.predictionId, c.charge);
  if (c.ownsJob && settled) {
    await failJob(c.jobId, c.stage === 'download' ? 'could not download the generated model' : 'could not store the generated model').catch(() => {});
  }
  reportError(new Error(`model3d ${c.stage} failed`), { route: 'model3d.status', ref, predictionId: c.predictionId, retrying: false, refunded });
  return NextResponse.json(
    {
      status: 'failed',
      message: refunded ? 'generation_failed' : (c.stage === 'download' ? 'the model could not be downloaded' : 'the model could not be stored'),
      refunded,
    },
    { status: 502 },
  );
}
