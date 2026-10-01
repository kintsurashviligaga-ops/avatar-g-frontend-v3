/**
 * POST /api/video/longform/[id]/cancel — stop a long-form film, for its OWNER only.
 *
 *   404  flag off (before auth), a malformed id, or not the caller's job
 *   401  no verified session
 *   409  already finished (done / failed / canceled)
 *   200  a `directing` job, canceled on the spot — it never reached the queue, so nothing was charged
 *   202  any other active job: cancel REQUESTED; the next tick abandons what is in flight and refunds every charged
 *        scene that was not delivered (stateMachine.refundableScenes — delivered clips stay the user's, and paid)
 *
 * ⚠️ AN ACTIVE JOB IS NEVER MOVED TO `canceled` FROM HERE. A tick may hold its lease right now; it writes the job back
 * as a DIFF of what it read (planned → rendering, an act reserved), which would resurrect a row this route had
 * canceled — with a fresh debit. The flag is the one field the tick never writes, so the tick is the one that cancels,
 * and the refunds it owes run in that same step.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { reportError } from '@/lib/observability/report-error';
import { authedClientFromRequest, createServiceRoleClient } from '@/lib/supabase/server';
import { isLongformJobId } from '@/lib/video/longform/api';
import { isLongformEnabled } from '@/lib/video/longform/plan';
import { jobPatchToColumns } from '@/lib/video/longform/rows';
import { isTerminalJob, JOB_STATUSES, type JobStatus } from '@/lib/video/longform/stateMachine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });
const unavailable = () => NextResponse.json({ error: 'unavailable' }, { status: 503 });
const statusOf = (v: unknown): JobStatus | null => (typeof v === 'string' && (JOB_STATUSES as readonly string[]).includes(v) ? (v as JobStatus) : null);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isLongformEnabled()) return notFound();

  let userId: string | null = null;
  try {
    userId = (await authedClientFromRequest(req)).user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (limited) return limited;

  const id = params?.id;
  if (!isLongformJobId(id)) return notFound();

  let svc: ReturnType<typeof createServiceRoleClient>;
  try {
    svc = createServiceRoleClient();
  } catch (e) {
    reportError(e, { route: '/api/video/longform/[id]/cancel', stage: 'service_role' });
    return unavailable();
  }

  const read = await svc.from('longform_jobs').select('id, status, cancel_requested').eq('id', id).eq('user_id', userId).maybeSingle();
  if (read.error) return unavailable();
  if (!read.data) return notFound();
  const status = statusOf((read.data as { status?: unknown }).status);
  if (!status || isTerminalJob(status)) return NextResponse.json({ error: 'already_finished', status }, { status: 409 });

  if (status === 'directing') {
    // Not in the queue yet (no tick works a directing job before its deadline), so no lease to race and no charge.
    const canceled = await svc
      .from('longform_jobs')
      .update(jobPatchToColumns({ status: 'canceled', errorCode: 'canceled_by_user', cancelRequested: true, completedAt: Date.now() }))
      .eq('id', id)
      .eq('user_id', userId)
      .eq('status', 'directing')
      .select('id');
    if (canceled.error) return unavailable();
    if (Array.isArray(canceled.data) && canceled.data.length === 1) return NextResponse.json({ id, status: 'canceled' }, { status: 200 });
    // Promoted in between: fall through to the queue's own cancel.
  }

  const requested = await svc
    .from('longform_jobs')
    .update({ cancel_requested: true })
    .eq('id', id)
    .eq('user_id', userId)
    .in('status', ['planned', 'rendering', 'stitching'])
    .select('id, status');
  if (requested.error) return unavailable();
  const row = Array.isArray(requested.data) ? (requested.data[0] as { status?: unknown } | undefined) : undefined;
  if (!row) return NextResponse.json({ error: 'already_finished' }, { status: 409 });
  return NextResponse.json({ id, status: statusOf(row.status), cancelRequested: true }, { status: 202 });
}
