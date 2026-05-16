/**
 * POST /api/tasks/{taskId}/cancel
 *
 * Cancel a queued or processing pipeline task.
 * Sets status to 'failed' with a cancellation reason.
 * Running serverless invocations cannot be killed, but once they finish
 * they'll see status='failed' and won't update results.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';

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

  const supabase = createServiceRoleClient();
  const user = await getAuthenticatedUser(request);

  // Fetch the task first
  const { data: task } = await supabase
    .from('agent_g_tasks')
    .select('id, status, user_id')
    .eq('id', taskId)
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
  await supabase
    .from('agent_g_tasks')
    .update({
      status: 'failed',
      results: { summaryKa: 'დავალება გაუქმდა მომხმარებლის მიერ.', cancelled: true },
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);

  // Mark all queued subtasks as failed
  await supabase
    .from('agent_g_subtasks')
    .update({ status: 'failed', output: { error: 'გაუქმდა', cancelled: true } })
    .eq('task_id', taskId)
    .in('status', ['queued', 'processing']);

  return NextResponse.json({ taskId, status: 'cancelled' }, { status: 200 });
}
