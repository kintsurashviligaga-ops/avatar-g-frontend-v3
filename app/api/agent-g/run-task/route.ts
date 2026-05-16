/**
 * POST /api/agent-g/run-task
 *
 * Internal background executor — called by /api/agent-g/orchestrate.
 * Protected by x-agent-g-secret header.
 *
 * Executes pipeline steps sequentially, updating Supabase after each step.
 * Uses the existing /api/agent-g/delegate endpoint for individual agent calls.
 *
 * On Vercel: this is a separate serverless invocation that can run for maxDuration.
 * On Hobby plan: 60s. On Pro: 300s.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180; // Pro tier; Hobby will cap at 60s

const stepSchema = z.object({
  agent: z.string(),
  action: z.string(),
  input: z.record(z.unknown()),
  parallel: z.boolean().optional(),
});

const schema = z.object({
  task_id: z.string().uuid(),
  goal: z.string().max(4000),
  plan: z.array(stepSchema).max(10),
  user_id: z.string().optional(),
});

type StepResult = {
  agent: string;
  action: string;
  status: 'completed' | 'failed';
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
};

async function runStep(
  step: z.infer<typeof stepSchema>,
  origin: string,
  authHeader: string | undefined,
  internalSecret: string,
  demoMode: boolean
): Promise<StepResult> {
  const stepStart = Date.now();

  try {
    const response = await fetch(`${origin}/api/agent-g/delegate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-g-secret': internalSecret,
        ...(authHeader ? { authorization: authHeader } : {}),
      },
      body: JSON.stringify({
        agent_name: step.agent,
        action: step.action,
        input: step.input,
        demo_mode: demoMode,
      }),
      signal: AbortSignal.timeout(90_000), // 90s per step max
    });

    const json = (await response.json().catch(() => null)) as
      | { status?: string; data?: { output?: Record<string, unknown> }; error?: string }
      | null;

    if (!response.ok || !json || json.status === 'error') {
      return {
        agent: step.agent,
        action: step.action,
        status: 'failed',
        input: step.input,
        error: json?.error ?? `Delegate failed (HTTP ${response.status})`,
        durationMs: Date.now() - stepStart,
      };
    }

    return {
      agent: step.agent,
      action: step.action,
      status: 'completed',
      input: step.input,
      output: json.data?.output ?? {},
      durationMs: Date.now() - stepStart,
    };
  } catch (err) {
    return {
      agent: step.agent,
      action: step.action,
      status: 'failed',
      input: step.input,
      error: err instanceof Error ? err.message : 'Step execution failed',
      durationMs: Date.now() - stepStart,
    };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Validate internal secret
  const internalSecret = process.env.AGENT_G_INTERNAL_SECRET || '';
  const providedSecret = request.headers.get('x-agent-g-secret') || '';

  if (internalSecret && providedSecret !== internalSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { task_id, goal, plan, user_id } = parsed.data;
  const supabase = createServiceRoleClient();
  const origin = request.nextUrl.origin;
  const authHeader = request.headers.get('authorization') || undefined;
  const demoMode = !user_id;

  // Mark task as processing
  await supabase
    .from('agent_g_tasks')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', task_id);

  const results: StepResult[] = [];
  let anyFailed = false;
  let anyCompleted = false;

  // Execute steps sequentially, updating Supabase after each
  for (const step of plan) {
    // Mark this subtask as processing
    await supabase
      .from('agent_g_subtasks')
      .update({ status: 'processing' })
      .eq('task_id', task_id)
      .eq('agent_name', step.agent);

    const result = await runStep(step, origin, authHeader, internalSecret, demoMode);
    results.push(result);

    if (result.status === 'completed') {
      anyCompleted = true;
    } else {
      anyFailed = true;
    }

    // Update subtask with result
    await supabase
      .from('agent_g_subtasks')
      .update({
        status: result.status,
        output: result.output ?? { error: result.error ?? null },
      })
      .eq('task_id', task_id)
      .eq('agent_name', step.agent);
  }

  // Compute final task status
  let finalStatus: 'completed' | 'failed' | 'partial';
  if (anyCompleted && anyFailed) finalStatus = 'partial';
  else if (anyCompleted && !anyFailed) finalStatus = 'completed';
  else finalStatus = 'failed';

  // Build aggregated summary
  const successSteps = results.filter(r => r.status === 'completed');
  const summaryText = successSteps.length === 0
    ? `ყველა სერვისი ვერ შესრულდა.`
    : `${successSteps.length}/${results.length} სერვისი წარმატებით შესრულდა: ${successSteps.map(s => s.agent).join(', ')}.`;

  const aggregated = {
    summary: summaryText,
    goal,
    subtasks: results,
    completed_at: new Date().toISOString(),
  };

  // Update task with final status + results
  await supabase
    .from('agent_g_tasks')
    .update({
      status: finalStatus,
      results: aggregated,
      updated_at: new Date().toISOString(),
    })
    .eq('id', task_id);

  console.info('[RunTask] pipeline complete', {
    task_id,
    final_status: finalStatus,
    steps_completed: successSteps.length,
    steps_total: results.length,
  });

  return NextResponse.json(
    { task_id, status: finalStatus, steps: results.length },
    { status: 200 }
  );
}
