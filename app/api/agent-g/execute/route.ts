import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { buildTaskPlan, makeTaskId } from '@/lib/agent-g/orchestrator/planner';
import { executePlan } from '@/lib/agent-g/orchestrator/executor';
import { aggregateResults } from '@/lib/agent-g/orchestrator/aggregator';
import { queueAgentGCallback } from '@/lib/agent-g/voice/callback-dispatch';
import { notifyTelegramTaskCompletion } from '@/lib/agent-g/channels/notify';

export const dynamic = 'force-dynamic';

const schema = z.object({
  goal: z.string().min(3).max(3000),
  advanced_mode: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const payload = schema.safeParse(await request.json());
    if (!payload.success) {
      return apiError(payload.error, 400, 'Invalid execute payload');
    }

    const user = await getAuthenticatedUser(request);
    const demoMode = !user;
    const plan = buildTaskPlan(payload.data.goal);

    const authHeader = request.headers.get('authorization') || undefined;
    const internalSecret = process.env.AGENT_G_INTERNAL_SECRET;

    const supabase = createServiceRoleClient();

    let taskId = makeTaskId();
    if (user) {
      const inserted = await supabase
        .from('agent_g_tasks')
        .insert({
          user_id: user.id,
          goal: payload.data.goal,
          status: 'processing',
          plan,
          results: null,
        })
        .select('id')
        .single();

      if (inserted.error || !inserted.data) {
        return apiError(inserted.error ?? new Error('Task insert failed'), 500, 'Failed to create task');
      }

      taskId = inserted.data.id;

      const seedRows = plan.sub_tasks.map((item) => ({
        task_id: taskId,
        agent_name: item.agent,
        status: 'queued',
        input: item.input,
        output: null,
      }));

      await supabase.from('agent_g_subtasks').insert(seedRows);
    }

    const executed = await executePlan(plan, {
      origin: request.nextUrl.origin,
      authHeader,
      internalSecret,
      demoMode,
    });

    const aggregated = aggregateResults(payload.data.goal, executed.subtasks);

    if (user) {
      await supabase
        .from('agent_g_tasks')
        .update({
          status: executed.status,
          results: aggregated,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)
        .eq('user_id', user.id);

      await supabase.from('agent_g_subtasks').delete().eq('task_id', taskId);
      await supabase.from('agent_g_subtasks').insert(
        executed.subtasks.map((item) => ({
          task_id: taskId,
          agent_name: item.agent,
          status: item.status,
          input: item.input,
          output: item.output ?? { error: item.error ?? null },
        }))
      );

      if (executed.status === 'completed' || executed.status === 'partial') {
        await queueAgentGCallback({
          userId: user.id,
          taskId,
          taskGoal: payload.data.goal,
          summary: aggregated.summary,
          subtasks: aggregated.subtasks,
          dashboardUrl: `${request.nextUrl.origin}/services/agent-g/dashboard`,
        });

        await notifyTelegramTaskCompletion({
          userId: user.id,
          taskId,
          summary: aggregated.summary,
          origin: request.nextUrl.origin,
        });
      }
    }

    return apiSuccess({
      task_id: taskId,
      demo_mode: demoMode,
      status: executed.status,
      plan,
      results: aggregated,
    });
  } catch (error) {
    return apiError(error, 500, 'Execution failed');
  }
}
