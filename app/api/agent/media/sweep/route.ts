/**
 * /api/agent/media/sweep — the per-minute keeper of Agent G's montage queue (lib/agent/media/montageWorker).
 *
 *   1. fails every job whose last attempt died (its worker stopped renewing the lease twice) or whose charge never
 *      finished, recording the refund it owes in the same write;
 *   2. pays every refund a finished job still owes (the ledger pays back only what was debited, once);
 *   3. renders the oldest job no worker has: the tab that started it closed before its worker ran, or its worker
 *      died and the retry is due. This invocation is then that job's worker, up to maxDuration.
 *
 * Vercel Cron calls GET with `Authorization: Bearer $CRON_SECRET` (lib/api/cronAuth; no secret = refused). Inert while
 * AGENT_G_MEDIA_EXEC is closed: nothing reads or writes the queue then. It lives outside app/api/cron/** because that
 * folder's functions are capped at 60 s and a render is not.
 */
import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/api/cronAuth';
import { agentMediaAccess } from '@/lib/agent/media/access';
import { sweepMontageJobs } from '@/lib/agent/media/montageWorker';
import { liveMontageDeps, newWorkerId } from '@/lib/agent/media/montageLive';
import { reportError } from '@/lib/observability/report-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function GET(req: Request): Promise<NextResponse> {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (agentMediaAccess() === 'off') return NextResponse.json({ ok: true, skipped: 'agent media execution is closed' });
  try {
    const report = await sweepMontageJobs(liveMontageDeps(), { worker: newWorkerId(), work: true });
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    reportError(e, { route: '/api/agent/media/sweep' });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
