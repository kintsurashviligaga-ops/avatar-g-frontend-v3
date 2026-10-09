/**
 * /api/agent/media/audio — Agent G takes the sound out of a video (or an audio file) as an MP3
 * (lib/agent/media/audioExtract). Same shape and queue as /api/agent/media/montage.
 *
 *   GET                                       { enabled } for THIS user; never 404, so the studio asks instead of assuming.
 *   GET ?jobId=…                              the owner's job: queued | running (stage, pct) | completed (audioUrl, name,
 *                                             durationSec, bytes) | failed.
 *   POST { action: 'quote', url }             a link: the source rule (no video platform, no stream), the live check, the
 *        { action: 'quote', file, name? }     rights; or one of the caller's uploads. Plans and prices (free); spends nothing.
 *   POST { action: 'run', request, token }    queue the quote the user confirmed, once; answers at once.
 *   POST { action: 'cancel', jobId }          stops the owner's queued or running extraction.
 *
 * ⚠️ CLOSED UNLESS AGENT_G_MEDIA_EXEC OPENS IT (lib/agent/media/access): a closed POST (or job read) answers 404 before
 * anything else. A refused source answers 422 with its reason (`platform` names the platform), so the chat can offer
 * the user's own upload instead.
 *
 * WHO EXTRACTS. `run` only queues (lib/orchestrator/jobLease on generation_jobs) and answers; the extraction runs in a
 * worker (lib/agent/media/audioWorker) that holds a lease on the row, started after this response (Vercel's waitUntil).
 * The owner's next status read, or the per-minute sweep (app/api/agent/media/sweep), starts one when none has the job.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { agentMediaAccess, agentMediaOpenTo } from '@/lib/agent/media/access';
import {
  audioJobStatus,
  cancelAudioJob,
  enqueueAudioJob,
  quoteAudioExtract,
  type AudioErrorCode,
  type AudioExecDeps,
} from '@/lib/agent/media/audioExtract';
import { workAudioJob } from '@/lib/agent/media/audioWorker';
import { liveAudioDeps } from '@/lib/agent/media/audioLive';
import { newWorkerId } from '@/lib/agent/media/montageLive';
import { runAfterResponse } from '@/lib/platform/afterResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The worker this route starts after its answer downloads up to 200 MB and encodes up to an hour of sound.
export const maxDuration = 600;

const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404 });

const STATUS: Partial<Record<AudioErrorCode, number>> = {
  bad_input: 400,
  invalid_url: 422,
  platform: 422,
  refused: 422,
  stream: 422,
  not_media: 422,
  unavailable: 422,
  blocked_host: 422,
  too_large: 413,
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
function startWorker(deps: AudioExecDeps, jobId: string): void {
  const work = () => workAudioJob(deps, { jobId, worker: newWorkerId() });
  if (!runAfterResponse(work, 'agent-audio-worker')) void work().catch(() => undefined);
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

  const deps = liveAudioDeps();
  const s = await audioJobStatus(deps, { userId: user.id, jobId });
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
  // A quote reaches out to the link's host; a run starts a download and an encode. Cancel is cheap.
  const limited = await checkRateLimit(req, action === 'cancel' ? RATE_LIMITS.READ : RATE_LIMITS.EXPENSIVE, user.id);
  if (limited) return limited;

  const deps = liveAudioDeps();
  const answer = (r: { ok: boolean; error?: AudioErrorCode }) =>
    NextResponse.json(r, { status: r.ok ? 200 : (r.error && STATUS[r.error]) || 400 });

  if (action === 'quote') {
    return answer(await quoteAudioExtract(deps, { userId: user.id, url: body?.url, file: body?.file, name: body?.name }));
  }
  if (action === 'run') {
    const r = await enqueueAudioJob(deps, { userId: user.id, request: body?.request, token: body?.token });
    if (r.ok && (r.status === 'queued' || r.status === 'running')) startWorker(deps, r.jobId);
    return answer(r);
  }
  if (action === 'cancel') return answer(await cancelAudioJob(deps, { userId: user.id, jobId: body?.jobId }));
  return NextResponse.json({ error: 'bad_action' }, { status: 400 });
}
