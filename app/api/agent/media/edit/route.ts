/**
 * /api/agent/media/edit — Agent G edits one of the user's videos, or takes a still from it (lib/agent/media/editExec).
 * Same shape and queue as /api/agent/media/montage and /api/agent/media/audio.
 *
 *   GET                                        { enabled } for THIS user; never 404, so the chat asks instead of assuming.
 *   GET ?jobId=…                               the owner's job: queued | running (stage, pct) | completed (url, output,
 *                                              name, durationSec, width, height, edits) | failed.
 *   POST { action: 'quote', file, edits, name? } one of the caller's own files (an upload, a Library item, a result of
 *                                              ours) and the edits as asked; resolved against the file, planned, free.
 *   POST { action: 'run', request, token }     queue the quote the user confirmed, once; answers at once.
 *   POST { action: 'cancel', jobId }           stops the owner's queued or running edit.
 *
 * ⚠️ CLOSED UNLESS AGENT_G_MEDIA_EXEC OPENS IT (lib/agent/media/access): a closed POST (or job read) answers 404 before
 * anything else. An edit that cannot be done on this file (past its end, too long, no picture) answers 422 with why.
 *
 * WHO EDITS. `run` only queues (lib/orchestrator/jobLease on generation_jobs) and answers; the edit runs in a worker
 * (lib/agent/media/editWorker) that holds a lease on the row, started after this response (Vercel's waitUntil). The
 * owner's next status read, or the per-minute sweep (app/api/agent/media/sweep), starts one when none has the job.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { agentMediaAccess, agentMediaOpenTo } from '@/lib/agent/media/access';
import {
  cancelEditJob,
  editJobStatus,
  enqueueEditJob,
  quoteEdit,
  type EditErrorCode,
  type EditExecDeps,
} from '@/lib/agent/media/editExec';
import { workEditJob } from '@/lib/agent/media/editWorker';
import { liveEditDeps } from '@/lib/agent/media/editLive';
import { newWorkerId } from '@/lib/agent/media/montageLive';
import { runAfterResponse } from '@/lib/platform/afterResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The worker this route starts after its answer downloads up to 200 MB and re-encodes up to five minutes of video.
export const maxDuration = 600;

const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404 });

const STATUS: Partial<Record<EditErrorCode, number>> = {
  bad_input: 400,
  bad_edits: 400,
  nothing_to_do: 422,
  out_of_range: 422,
  too_long: 422,
  too_short: 422,
  conflict: 422,
  no_video: 422,
  media_not_yours: 403,
  unreadable: 422,
  invalid_request: 400,
  quote_invalid: 400,
  quote_changed: 400,
  quote_expired: 409,
  already_failed: 409,
  not_running: 409,
  jobs_unavailable: 503,
  not_configured: 503,
  not_found: 404,
};

/** Start a worker on the job after this response (or now, off Vercel). Its claim decides whether it runs at all. */
function startWorker(deps: EditExecDeps, jobId: string): void {
  const work = () => workEditJob(deps, { jobId, worker: newWorkerId() });
  if (!runAfterResponse(work, 'agent-edit-worker')) void work().catch(() => undefined);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    let enabled = false;
    if (agentMediaAccess() !== 'off') {
      const { user } = await authedClientFromRequest(req);
      enabled = agentMediaOpenTo(user);
    }
    return NextResponse.json({ enabled }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  if (agentMediaAccess() === 'off') return notFound();
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!agentMediaOpenTo(user)) return notFound();
  const limited = await checkRateLimit(req, RATE_LIMITS.READ, user.id);
  if (limited) return limited;

  const deps = liveEditDeps();
  const s = await editJobStatus(deps, { userId: user.id, jobId });
  if ('ok' in s) return NextResponse.json(s, { status: 404 });
  if (s.needsWorker) startWorker(deps, jobId);
  return NextResponse.json(s.view, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (agentMediaAccess() === 'off') return notFound();
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!agentMediaOpenTo(user)) return notFound();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  // A quote downloads the file to probe it; a run starts a download and an encode. Cancel is cheap.
  const limited = await checkRateLimit(req, action === 'cancel' ? RATE_LIMITS.READ : RATE_LIMITS.EXPENSIVE, user.id);
  if (limited) return limited;

  const deps = liveEditDeps();
  const answer = (r: { ok: boolean; error?: EditErrorCode }) =>
    NextResponse.json(r, { status: r.ok ? 200 : (r.error && STATUS[r.error]) || 400 });

  if (action === 'quote') {
    return answer(await quoteEdit(deps, { userId: user.id, file: body?.file, edits: body?.edits, name: body?.name }));
  }
  if (action === 'run') {
    const r = await enqueueEditJob(deps, { userId: user.id, request: body?.request, token: body?.token });
    if (r.ok && (r.status === 'queued' || r.status === 'running')) startWorker(deps, r.jobId);
    return answer(r);
  }
  if (action === 'cancel') return answer(await cancelEditJob(deps, { userId: user.id, jobId: body?.jobId }));
  return NextResponse.json({ error: 'bad_action' }, { status: 400 });
}
