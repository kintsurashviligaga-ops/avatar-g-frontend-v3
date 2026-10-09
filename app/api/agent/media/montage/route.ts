/**
 * /api/agent/media/montage — Agent G cuts the user's clips to their music (lib/agent/media/montageExec).
 *
 *   GET                                       { enabled } for THIS user; never 404, so the studio asks instead of assuming.
 *   POST { action: 'quote', files, prompt?, aspect?, targetSec? }   analyse + plan + price; spends nothing.
 *   POST { action: 'run', request, token, prompt? }                 the quote the user confirmed; renders it once.
 *   POST { action: 'cancel', jobId }                                stops the owner's running edit.
 *
 * ⚠️ CLOSED UNLESS AGENT_G_MEDIA_EXEC OPENS IT (lib/agent/media/access): a closed POST answers 404 before anything
 * else. `run` is synchronous like /api/v2/montage/render (the request is the worker; Vercel has no daemon); progress
 * is on the generation_jobs row the studio polls, and the result lands in the Library even if the tab closes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { agentMediaAccess, agentMediaOpenTo } from '@/lib/agent/media/access';
import { cancelMontageJob, quoteMontage, runMontageJob, type MontageErrorCode } from '@/lib/agent/media/montageExec';
import { liveMontageDeps } from '@/lib/agent/media/montageLive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A run conforms up to 12 clips, stitches, mixes the track, then probes the master: the montage lane's own budget.
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  let enabled = false;
  if (agentMediaAccess() !== 'off') {
    const { user } = await authedClientFromRequest(req);
    enabled = agentMediaOpenTo(user);
  }
  return NextResponse.json({ enabled }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (agentMediaAccess() === 'off') return notFound();
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!agentMediaOpenTo(user)) return notFound();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  // A quote downloads and decodes every file; a run occupies a function for minutes. Cancel is cheap.
  const limited = await checkRateLimit(req, action === 'cancel' ? RATE_LIMITS.READ : RATE_LIMITS.EXPENSIVE, user.id);
  if (limited) return limited;

  const deps = liveMontageDeps();
  const answer = (r: { ok: boolean; error?: MontageErrorCode }) =>
    NextResponse.json(r, { status: r.ok ? 200 : (r.error && STATUS[r.error]) || 400 });

  if (action === 'quote') {
    return answer(await quoteMontage(deps, {
      userId: user.id, files: body?.files, prompt: body?.prompt, aspect: body?.aspect, targetSec: body?.targetSec,
    }));
  }
  if (action === 'run') {
    return answer(await runMontageJob(deps, { userId: user.id, request: body?.request, token: body?.token, prompt: body?.prompt }));
  }
  if (action === 'cancel') return answer(await cancelMontageJob(deps, { userId: user.id, jobId: body?.jobId }));
  return NextResponse.json({ error: 'bad_action' }, { status: 400 });
}
