/**
 * POST /api/music/studio/jobs — start a quoted track: { plan, token, confirmed: true }. Reserves exactly the quoted
 * credits, queues the job, and starts its worker after the response (the render no longer depends on this connection;
 * the status poll and the cron sweep take over a worker that died). A replay of the same quote returns the same job.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { startMusic, workMusic } from '@/lib/music/studio/engine';
import { liveMusicDeps } from '@/lib/music/studio/live';
import { musicErrorResponse, musicUser, readJson } from '@/lib/music/studio/http';
import { newWorkerId } from '@/lib/agent/media/montageLive';
import { runAfterResponse } from '@/lib/platform/afterResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE);
  if (rl) return rl;
  const who = await musicUser(req);
  if ('response' in who) return who.response;
  try {
    const body = await readJson(req);
    const deps = liveMusicDeps();
    const view = await startMusic(deps, who.userId, body.plan, body.token, body.confirmed);
    if (view.status === 'queued') runAfterResponse(() => workMusic(deps, view.jobId, newWorkerId()), 'music-studio.work');
    return NextResponse.json(view, { status: view.replay ? 200 : 202 });
  } catch (e) {
    return musicErrorResponse(e, req);
  }
}
