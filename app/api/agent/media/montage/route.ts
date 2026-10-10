/**
 * /api/agent/media/montage — Agent G cuts the user's clips to their music (lib/agent/media/montageExec).
 *
 *   GET                                       { enabled } for THIS user; never 404, so the studio asks instead of assuming.
 *   GET ?jobId=…                              the owner's job: queued | running (stage, pct) | completed (videoUrl) | failed.
 *   POST { action: 'quote', files, prompt?, aspect?, targetSec?, musicFromSec? }   analyse + plan + price; spends nothing.
 *   POST { action: 'run', request, token, prompt?, approval? }      queue the quote the user confirmed, once; answers at once.
 *     `approval` (lib/agent/approval): absent = the card's Start tap; a Live call's voice yes is judged again here.
 *   POST { action: 'cancel', jobId }                                stops the owner's queued or running edit.
 *
 * ⚠️ CLOSED UNLESS AGENT_G_MEDIA_EXEC OPENS IT (lib/agent/media/access): a closed POST (or job read) answers 404 before
 * anything else.
 *
 * WHO RENDERS. `run` only queues (lib/orchestrator/jobLease on generation_jobs) and answers; the render runs in a worker
 * (lib/agent/media/montageWorker) that holds a lease on the row. This route starts one after its answer (Vercel's
 * waitUntil keeps the function alive up to maxDuration; the user's connection no longer matters). When no worker has
 * the job (its start was lost, or its function died and the lease lapsed), the owner's next status read starts one,
 * and the per-minute sweep (app/api/agent/media/sweep) does the same for a tab that was closed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, checkRateLimitByKey, refundRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { agentMediaAccess, agentMediaOpenTo } from '@/lib/agent/media/access';
import {
  cancelMontageJob,
  enqueueMontageJob,
  montageJobStatus,
  quoteMontage,
  type MontageErrorCode,
  type MontageExecDeps,
} from '@/lib/agent/media/montageExec';
import { workMontageJob } from '@/lib/agent/media/montageWorker';
import { liveMontageDeps, newWorkerId } from '@/lib/agent/media/montageLive';
import { runAfterResponse } from '@/lib/platform/afterResponse';
import { parseRunApproval } from '@/lib/agent/approval';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The worker this route starts after its answer conforms up to 12 clips, stitches, mixes the track, then probes the
// master: the montage lane's own budget.
export const maxDuration = 600;

const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404 });

const STATUS: Partial<Record<MontageErrorCode, number>> = {
  media_not_yours: 403,
  quote_invalid: 400,
  quote_changed: 400,
  quote_expired: 409,
  in_progress: 409,
  already_failed: 409,
  not_running: 409,
  insufficient_credits: 402,
  billing_unavailable: 503,
  jobs_unavailable: 503,
  not_configured: 503,
  render_failed: 502,
  qc_failed: 502,
  cancelled: 409,
  not_found: 404,
};

/** Start a worker on the job after this response (or now, off Vercel). Its claim decides whether it runs at all. */
function startWorker(deps: MontageExecDeps, jobId: string): void {
  const work = () => workMontageJob(deps, { jobId, worker: newWorkerId() });
  if (!runAfterResponse(work, 'agent-montage-worker')) void work().catch(() => undefined);
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

  const deps = liveMontageDeps();
  const s = await montageJobStatus(deps, { userId: user.id, jobId });
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
  // A quote downloads and decodes every file; a run starts minutes of rendering. Cancel is cheap.
  const limited = await checkRateLimit(req, action === 'cancel' ? RATE_LIMITS.READ : RATE_LIMITS.EXPENSIVE, user.id);
  if (limited) return limited;

  const deps = liveMontageDeps();
  const answer = (r: { ok: boolean; error?: MontageErrorCode }) =>
    NextResponse.json(r, { status: r.ok ? 200 : (r.error && STATUS[r.error]) || 400 });

  if (action === 'quote') {
    return answer(await quoteMontage(deps, {
      userId: user.id, files: body?.files, prompt: body?.prompt, aspect: body?.aspect, targetSec: body?.targetSec, musicFromSec: body?.musicFromSec,
    }));
  }
  if (action === 'run') {
    // How the user said yes (lib/agent/approval): a voice yes is judged again here; words that are not one start nothing.
    const yes = parseRunApproval(body?.approval);
    if (!yes.ok) {
      await deps.audit({ userId: user.id, op: 'montage', phase: 'run', outcome: 'refused', detail: yes.error });
      return NextResponse.json(yes, { status: 400 });
    }
    // A montage is free (owner's choice, 2026-10-09), so the per-account daily ceiling is what bounds one person's encode
    // minutes (gap M4); shared with /api/v2/montage/render. A run that did not start, or a replay of one that already
    // did, gives its slot back.
    const capped = await checkRateLimitByKey(user.id, RATE_LIMITS.MONTAGE_USER);
    if (capped) return capped;
    const r = await enqueueMontageJob(deps, { userId: user.id, request: body?.request, token: body?.token, prompt: body?.prompt, approval: yes.approval });
    if (!r.ok || ('replay' in r && r.replay)) await refundRateLimitByKey(user.id, RATE_LIMITS.MONTAGE_USER);
    if (r.ok && (r.status === 'queued' || r.status === 'running')) startWorker(deps, r.jobId);
    return answer(r);
  }
  if (action === 'cancel') return answer(await cancelMontageJob(deps, { userId: user.id, jobId: body?.jobId }));
  return NextResponse.json({ error: 'bad_action' }, { status: 400 });
}
