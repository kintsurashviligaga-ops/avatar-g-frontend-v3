/**
 * /api/agent/media/sweep — the per-minute keeper of Agent G's media queues: the montage (lib/agent/media/montageWorker),
 * the audio extraction (lib/agent/media/audioWorker) and the edit (lib/agent/media/editWorker).
 *
 *   1. fails every job whose last attempt died (its worker stopped renewing the lease twice) or whose charge never
 *      finished, recording the refund it owes in the same write;
 *   2. pays every refund a finished job still owes (the ledger pays back only what was debited, once);
 *   3. runs the oldest job no worker has: the tab that started it closed before its worker ran, or its worker
 *      died and the retry is due. This invocation is then that job's worker, up to maxDuration: one montage, or when
 *      no montage was waiting, one audio extraction, or when neither was, one edit (two long jobs in one invocation
 *      could outrun maxDuration). Every queue's dead rows are failed either way.
 *
 * Before all that it ticks the live multi-step runs (lib/agent/run, oldest first, a few per minute): a run whose tab
 * closed still starts its next step, folds in a finished one and ends. Their step jobs are queue rows like any other,
 * so step 3 works them.
 *
 * Vercel Cron calls GET with `Authorization: Bearer $CRON_SECRET` (lib/api/cronAuth; no secret = refused). Inert while
 * AGENT_G_MEDIA_EXEC is closed: nothing reads or writes the queue then. It lives outside app/api/cron/** because that
 * folder's functions are capped at 60 s and a render is not.
 */
import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/api/cronAuth';
import { agentMediaAccess } from '@/lib/agent/media/access';
import { sweepMontageJobs } from '@/lib/agent/media/montageWorker';
import { sweepAudioJobs } from '@/lib/agent/media/audioWorker';
import { sweepEditJobs } from '@/lib/agent/media/editWorker';
import { liveMontageDeps, newWorkerId } from '@/lib/agent/media/montageLive';
import { liveAudioDeps } from '@/lib/agent/media/audioLive';
import { liveEditDeps } from '@/lib/agent/media/editLive';
import { sweepRuns } from '@/lib/agent/run/runExec';
import { liveRunDeps } from '@/lib/agent/run/runLive';
import { reportError } from '@/lib/observability/report-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function GET(req: Request): Promise<NextResponse> {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (agentMediaAccess() === 'off') return NextResponse.json({ ok: true, skipped: 'agent media execution is closed' });
  try {
    const worker = newWorkerId();
    const runs = await sweepRuns(liveRunDeps(), { limit: 10 });
    const report = await sweepMontageJobs(liveMontageDeps(), { worker, work: true });
    const audio = await sweepAudioJobs(liveAudioDeps(), { worker, work: !report.worked });
    const edit = await sweepEditJobs(liveEditDeps(), { worker, work: !report.worked && !audio.worked });
    return NextResponse.json({ ok: true, ...report, audio, edit, runs });
  } catch (e) {
    reportError(e, { route: '/api/agent/media/sweep' });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
