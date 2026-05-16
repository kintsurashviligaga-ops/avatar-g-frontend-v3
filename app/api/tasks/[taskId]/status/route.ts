/**
 * GET /api/tasks/{taskId}/status
 *
 * Task status polling endpoint with progress %, ETA, and step-level detail.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: { taskId: string } };

const AGENT_ETA: Record<string, number> = {
  chat: 5, image: 20, voice: 20, music: 75, video: 90,
  avatar: 30, 'avatar-builder': 25, 'content-writer': 8,
  terminal: 5, 'prompt-builder': 3, 'business-agent': 10,
  'social-media': 8, 'voice-lab': 20, marketplace: 10,
};

const AGENT_NAMES_KA: Record<string, string> = {
  chat: 'ჩატი', image: 'სურათი', voice: 'ხმა', music: 'მუსიკა',
  video: 'ვიდეო', avatar: 'ავატარი', 'avatar-builder': 'ავატარი',
  'content-writer': 'კონტენტი', terminal: 'კოდი', 'prompt-builder': 'Prompt',
  'business-agent': 'ბიზნეს გეგმა', 'social-media': 'სოც. მედია',
  'voice-lab': 'ხმოვანი ლაბი', marketplace: 'Marketplace',
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
  await getAuthenticatedUser(request); // optional

  const { data: task, error: taskError } = await supabase
    .from('agent_g_tasks')
    .select('id, status, goal, plan, results, created_at, updated_at')
    .eq('id', taskId)
    .maybeSingle();

  if (taskError) return NextResponse.json({ error: 'Database error' }, { status: 500 });
  if (!task)     return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const { data: subtasks } = await supabase
    .from('agent_g_subtasks')
    .select('id, agent_name, status, input, output, created_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  const taskStatus = task.status as string;
  const isDone     = ['completed', 'failed', 'partial'].includes(taskStatus);

  const completedSteps = (subtasks ?? []).filter(s => s.status === 'completed').length;
  const totalSteps     = (subtasks ?? []).length;
  const progressPct    = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const processingStep = (subtasks ?? []).find(s => s.status === 'processing');
  const currentStepKa  = processingStep
    ? (AGENT_NAMES_KA[processingStep.agent_name as string] ?? String(processingStep.agent_name))
    : null;

  const etaRemainingSeconds = processingStep
    ? ((processingStep.output as { remaining_seconds?: number } | null)?.remaining_seconds
       ?? AGENT_ETA[processingStep.agent_name as string]
       ?? 0)
    : 0;

  const plan = task.plan as { summaryKa?: string; estimatedSeconds?: number; creditCost?: number } | null;

  return NextResponse.json(
    {
      taskId: task.id,
      status: taskStatus,
      goal: task.goal,
      plan,
      results: isDone ? task.results : null,
      progress: { percent: progressPct, completedSteps, totalSteps, currentStepKa, etaRemainingSeconds },
      subtasks: (subtasks ?? []).map(s => ({
        id: s.id as string,
        agent: s.agent_name as string,
        agentKa: AGENT_NAMES_KA[s.agent_name as string] ?? String(s.agent_name),
        status: s.status as string,
        output:  s.status === 'completed' ? s.output : undefined,
        error:   s.status === 'failed' && s.output
          ? (s.output as { error?: string }).error
          : undefined,
      })),
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': isDone ? '0' : '3' },
    }
  );
}
