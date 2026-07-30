import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { pollMeshyTask, fetchGlbBuffer, hasMeshyProvider } from '@/lib/services/model3d/meshyClient';
import { isTerminal } from '@/lib/services/model3d/meshyPlan';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { completeJob, failJob } from '@/lib/orchestrator/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// One poll tick, plus (on the final tick only) downloading and re-hosting the GLB.
export const maxDuration = 180;

const WEEK_SEC = 604_800;

/**
 * GET /api/v2/model3d/status?taskId=…&mode=text|image&jobId=…
 *
 * One poll tick. On success the GLB is downloaded and RE-HOSTED on our own storage before the URL is
 * returned — the app's CSP has no Meshy host in `connect-src`, so handing the browser a Meshy CDN URL
 * produces a viewer that works in local dev and is silently blocked in production.
 *
 * AI rate limit, not EXPENSIVE: this is called repeatedly by the poll loop by design, and a 5/min cap
 * would 429 the client's own progress checks.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const limited = await checkRateLimit(req, RATE_LIMITS.AI);
  if (limited) return limited;

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!hasMeshyProvider()) {
    return NextResponse.json({ error: 'provider_not_configured' }, { status: 503 });
  }

  const taskId = (req.nextUrl.searchParams.get('taskId') || '').trim();
  const jobId = (req.nextUrl.searchParams.get('jobId') || '').trim();
  const mode = req.nextUrl.searchParams.get('mode') === 'image' ? 'image' : 'text';
  // Meshy ids are opaque; bound them so a hostile value cannot be pasted into the upstream URL path.
  if (!taskId || taskId.length > 128 || !/^[A-Za-z0-9_-]+$/.test(taskId)) {
    return NextResponse.json({ error: 'invalid_request', message: 'taskId is required' }, { status: 400 });
  }

  const poll = await pollMeshyTask(taskId, mode);

  if (poll.status === 'failed') {
    if (jobId) await failJob(jobId, poll.error || 'meshy reported failure').catch(() => {});
    return NextResponse.json({ status: 'failed', message: poll.error || 'generation failed' });
  }

  if (!isTerminal(poll.status) || !poll.glbUrl) {
    return NextResponse.json({ status: poll.status, progress: poll.progress });
  }

  // Succeeded — re-host before handing anything to the browser.
  const buf = await fetchGlbBuffer(poll.glbUrl);
  if (!buf) {
    if (jobId) await failJob(jobId, 'could not download the generated model').catch(() => {});
    return NextResponse.json({ status: 'failed', message: 'the model could not be downloaded' }, { status: 502 });
  }

  const hosted = await uploadBufferAndSign(
    'renders',
    `models3d/${taskId}-${Date.now()}.glb`,
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
      result: { subtype: 'model3d', glbUrl: hosted, thumbnailUrl: poll.thumbnailUrl },
    }).catch(() => {});
  }

  return NextResponse.json({
    status: 'succeeded',
    progress: 100,
    glbUrl: hosted,
    thumbnailUrl: poll.thumbnailUrl,
    bytes: buf.byteLength,
  });
}
