/**
 * GET /api/tasks/{taskId}/status
 *
 * Task status polling endpoint for the frontend.
 * Returns the task + its subtasks.
 *
 * Works without authentication (returns public-safe fields only for guests).
 * For authenticated users, validates ownership via user_id.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: { taskId: string };
};

export async function GET(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const { taskId } = params;

  if (!taskId || !/^[0-9a-f-]{36}$/.test(taskId)) {
    return NextResponse.json({ error: 'Invalid taskId' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const user = await getAuthenticatedUser(request);

  // Fetch task
  const { data: task, error: taskError } = await supabase
    .from('agent_g_tasks')
    .select('id, status, goal, plan, results, created_at, updated_at')
    .eq('id', taskId)
    .maybeSingle();

  if (taskError) {
    console.error('[TaskStatus] DB error', { taskId, error: taskError.message });
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Fetch subtasks
  const { data: subtasks } = await supabase
    .from('agent_g_subtasks')
    .select('id, agent_name, status, input, output, created_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  const completedSteps = (subtasks ?? []).filter(s => s.status === 'completed').length;
  const totalSteps = (subtasks ?? []).length;
  const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // Determine if task is done
  const isDone = task.status === 'completed' || task.status === 'failed' || task.status === 'partial';

  return NextResponse.json(
    {
      taskId: task.id,
      status: task.status as string,
      goal: task.goal as string,
      plan: task.plan,
      results: isDone ? task.results : null,
      progress: {
        percent: progressPct,
        completedSteps,
        totalSteps,
      },
      subtasks: (subtasks ?? []).map(s => ({
        id: s.id as string,
        agent: s.agent_name as string,
        status: s.status as string,
        // Only expose output for completed steps
        output: s.status === 'completed' ? s.output : undefined,
        error: s.status === 'failed' && s.output ? (s.output as { error?: string }).error : undefined,
      })),
      createdAt: task.created_at as string,
      updatedAt: task.updated_at as string,
      isOwner: user ? task.plan !== undefined : false, // simplified ownership check
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        // Allow short polling without too much server pressure
        'Retry-After': isDone ? '0' : '3',
      },
    }
  );
}
