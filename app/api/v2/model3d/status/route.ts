import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { pollReconstruction, fetchGlbBuffer, hasReplicate3dProvider } from '@/lib/services/model3d/replicate3dClient';
import { isTerminal } from '@/lib/services/model3d/model3dPlan';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { completeJob, failJob } from '@/lib/orchestrator/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// One poll tick, plus (on the final tick only) downloading and re-hosting the GLB.
export const maxDuration = 180;

const WEEK_SEC = 604_800;

/**
 * GET /api/v2/model3d/status?predictionId=…&jobId=…
 *
 * One poll tick. On success the GLB is downloaded and RE-HOSTED on our own storage before the URL is
 * returned — the app's CSP has no replicate.delivery in `connect-src`, so handing the browser a Replicate
 * CDN URL yields a viewer that works in local dev and is silently blocked in production.
 *
 * The poll URL is REBUILT from the prediction id rather than accepted from the client: taking a
 * caller-supplied URL and fetching it with our API token attached would be a server-side request forgery
 * with credentials.
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
  // Replicate ids are opaque alphanumerics; bound and charset-check so nothing hostile reaches the path.
  if (!predictionId || predictionId.length > 128 || !/^[A-Za-z0-9_-]+$/.test(predictionId)) {
    return NextResponse.json({ error: 'invalid_request', message: 'predictionId is required' }, { status: 400 });
  }

  const poll = await pollReconstruction(`https://api.replicate.com/v1/predictions/${predictionId}`);

  if (poll.status === 'failed') {
    if (jobId) await failJob(jobId, poll.error || 'replicate reported failure').catch(() => {});
    return NextResponse.json({ status: 'failed', message: poll.error || 'generation failed' });
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
    if (jobId) await failJob(jobId, 'the provider finished without a usable model file').catch(() => {});
    return NextResponse.json({ status: 'failed', message: 'the generation finished without a usable model file' });
  }
  if (!isTerminal(poll.status) || !poll.glbUrl) {
    return NextResponse.json({ status: poll.status });
  }

  const buf = await fetchGlbBuffer(poll.glbUrl);
  if (!buf) {
    if (jobId) await failJob(jobId, 'could not download the generated model').catch(() => {});
    return NextResponse.json({ status: 'failed', message: 'the model could not be downloaded' }, { status: 502 });
  }

  const hosted = await uploadBufferAndSign(
    'renders',
    `models3d/${predictionId}-${Date.now()}.glb`,
    buf,
    'model/gltf-binary',
    WEEK_SEC,
  );
  if (!hosted) {
    if (jobId) await failJob(jobId, 'could not store the generated model').catch(() => {});
    return NextResponse.json({ status: 'failed', message: 'the model could not be stored' }, { status: 502 });
  }

  if (jobId) {
    await completeJob(jobId, {
      signedUrl: hosted,
      result: { subtype: 'model3d', glbUrl: hosted },
    }).catch(() => {});
  }

  return NextResponse.json({ status: 'succeeded', glbUrl: hosted, bytes: buf.byteLength });
}
