/**
 * POST /api/tasks/{taskId}/cancel
 *
 * Cancel a queued or processing pipeline task.
 * Sets status to 'failed' with a cancellation reason.
 * Running serverless invocations cannot be killed, but once they finish
 * they'll see status='failed' and won't update results.
 *
 * Owner-only: a session is required and both the read and the update carry the caller's user id, so anyone else's task
 * is the same 404 as none (the service role bypasses RLS, so the filter here is the only check).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { cancelRaceGuardOn } from '@/lib/tasks/cancelGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: { taskId: string } };

export async function POST(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const { taskId } = params;

  if (!taskId || !/^[0-9a-f-]{36}$/.test(taskId)) {
    return NextResponse.json({ error: 'Invalid taskId' }, { status: 400 });
  }

  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceRoleClient();

  // Fetch the caller's task first
  const { data: task } = await supabase
    .from('agent_g_tasks')
    .select('id, status, user_id')
    .eq('id', taskId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Only allow cancellation of queued/processing tasks
  const taskStatus = task.status as string;
  if (taskStatus !== 'queued' && taskStatus !== 'processing') {
    return NextResponse.json(
      { error: `Task is already ${taskStatus} — cannot cancel` },
      { status: 409 }
    );
  }

  // Mark task as failed with cancellation note
  const patch = {
    status: 'failed',
    results: { summaryKa: 'დავალება გაუქმდა მომხმარებლის მიერ.', cancelled: true },
    updated_at: new Date().toISOString(),
  };

  if (cancelRaceGuardOn()) {
    // Phase 8.25 (CANCEL_RACE_GUARD=1): Cancel pressed the second the task finishes. The read above saw `processing`, the
    // worker then wrote `completed` + its results, and the old unconditional update below overwrote them with
    // „cancelled" — the finished (and paid) result was lost. Compare-and-set: only a row that is STILL queued/processing
    // is cancelled; otherwise answer 409 with the status it reached, and nothing is touched.
    const { data: cancelled, error } = await supabase
      .from('agent_g_tasks')
      .update(patch)
      .eq('id', taskId)
      .eq('user_id', user.id)
      .in('status', ['queued', 'processing'])
      .select('id');
    if (error) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
    if (!Array.isArray(cancelled) || cancelled.length === 0) {
      const { data: now } = await supabase.from('agent_g_tasks').select('status').eq('id', taskId).eq('user_id', user.id).maybeSingle();
      const reached = (now as { status?: string } | null)?.status ?? 'finished';
      return NextResponse.json({ error: 'already_finished', status: reached }, { status: 409 });
    }
  } else {
    await supabase
      .from('agent_g_tasks')
      .update(patch)
      .eq('id', taskId)
      .eq('user_id', user.id);
  }

  // Mark all queued subtasks as failed
  await supabase
    .from('agent_g_subtasks')
    .update({ status: 'failed', output: { error: 'გაუქმდა', cancelled: true } })
    .eq('task_id', taskId)
    .in('status', ['queued', 'processing']);

  return NextResponse.json({ taskId, status: 'cancelled' }, { status: 200 });
}
