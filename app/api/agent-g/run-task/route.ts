/**
 * POST /api/agent-g/run-task
 *
 * Internal background executor — triggered by /api/agent-g/orchestrate.
 * Protected by x-agent-g-secret header.
 *
 * Executes pipeline steps sequentially, updating Supabase subtasks in real-time.
 * Each subtask is identified by its UUID (not agent_name) to avoid collisions.
 * Includes retry logic (max 2 retries per step) and per-step timeout.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const stepSchema = z.object({
  agent: z.string(),
  action: z.string(),
  input: z.record(z.unknown()),
  estimatedSeconds: z.number().optional(),
});

const schema = z.object({
  task_id: z.string().uuid(),
  goal: z.string().max(4000),
  plan: z.array(stepSchema).max(10),
  user_id: z.string().optional(),
});

// Estimated seconds per agent (for ETA display)
const AGENT_ETA: Record<string, number> = {
  chat: 5, image: 20, voice: 20, music: 75, video: 90,
  avatar: 30, 'avatar-builder': 25, 'content-writer': 8,
  terminal: 5, 'prompt-builder': 3, 'business-agent': 10,
  'social-media': 8, 'voice-lab': 20, marketplace: 10,
};

type StepResult = {
  subtaskId?: string;
  agent: string;
  action: string;
  status: 'completed' | 'failed';
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  durationMs: number;
  attempts: number;
};

async function runStepWithRetry(
  subtaskId: string,
  step: z.infer<typeof stepSchema>,
  origin: string,
  authHeader: string | undefined,
  internalSecret: string,
  demoMode: boolean,
  maxRetries = 2
): Promise<StepResult> {
  const stepStart = Date.now();
  const eta = AGENT_ETA[step.agent] ?? 15;
  const perStepTimeout = Math.max(eta * 1500, 30_000); // 1.5× ETA, min 30s

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
        signal: AbortSignal.timeout(perStepTimeout),
      });

      const json = (await response.json().catch(() => null)) as
        | { status?: string; data?: { output?: Record<string, unknown> }; error?: string }
        | null;

      if (!response.ok || !json || json.status === 'error') {
        const errMsg = json?.error ?? `Delegate HTTP ${response.status}`;
        if (attempt < maxRetries) {
          console.warn(`[RunTask] step ${step.agent} attempt ${attempt} failed: ${errMsg}. Retrying...`);
          await new Promise(r => setTimeout(r, 1500 * attempt));
          continue;
        }
        return {
          subtaskId, agent: step.agent, action: step.action,
          status: 'failed', input: step.input,
          error: `${step.agent} სერვისი ვერ შესრულდა: ${errMsg}`,
          durationMs: Date.now() - stepStart, attempts: attempt,
        };
      }

      return {
        subtaskId, agent: step.agent, action: step.action,
        status: 'completed', input: step.input,
        output: json.data?.output ?? {},
        durationMs: Date.now() - stepStart, attempts: attempt,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Network error';
      if (attempt < maxRetries) {
        console.warn(`[RunTask] step ${step.agent} attempt ${attempt} threw: ${errMsg}. Retrying...`);
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }
      return {
        subtaskId, agent: step.agent, action: step.action,
        status: 'failed', input: step.input,
        error: `${step.agent}: ${errMsg}`,
        durationMs: Date.now() - stepStart, attempts: attempt,
      };
    }
  }

  return {
    subtaskId, agent: step.agent, action: step.action,
    status: 'failed', input: step.input,
    error: 'Max retries exceeded',
    durationMs: Date.now() - stepStart, attempts: maxRetries,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const internalSecret = process.env.AGENT_G_INTERNAL_SECRET ?? '';
  const providedSecret = request.headers.get('x-agent-g-secret') ?? '';
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
  const authHeader = request.headers.get('authorization') ?? undefined;
  const demoMode = !user_id;

  await supabase
    .from('agent_g_tasks')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', task_id);

  // Fetch subtask rows to get their UUIDs
  const { data: subtaskRows } = await supabase
    .from('agent_g_subtasks')
    .select('id, agent_name')
    .eq('task_id', task_id)
    .order('created_at', { ascending: true });

  const agentToSubtaskId: Record<string, string> = {};
  for (const row of subtaskRows ?? []) {
    const agentName = row.agent_name as string;
    const rowId = row.id as string;
    if (!agentToSubtaskId[agentName]) {
      agentToSubtaskId[agentName] = rowId;
    }
  }

  const results: StepResult[] = [];
  let anyFailed = false;
  let anyCompleted = false;
  let runningEtaSeconds = plan.reduce((s, p) => s + (AGENT_ETA[p.agent] ?? 15), 0);

  for (const step of plan) {
    const subtaskId = agentToSubtaskId[step.agent] ?? '';

    if (subtaskId) {
      await supabase
        .from('agent_g_subtasks')
        .update({
          status: 'processing',
          output: { eta_seconds: AGENT_ETA[step.agent] ?? 15, remaining_seconds: runningEtaSeconds },
        })
        .eq('id', subtaskId);
    }

    const result = await runStepWithRetry(
      subtaskId, step, origin, authHeader, internalSecret, demoMode
    );
    results.push(result);

    if (result.status === 'completed') anyCompleted = true;
    else anyFailed = true;

    runningEtaSeconds = Math.max(0, runningEtaSeconds - (AGENT_ETA[step.agent] ?? 15));

    if (subtaskId) {
      await supabase
        .from('agent_g_subtasks')
        .update({
          status: result.status,
          output: result.output ?? { error: result.error ?? null, attempts: result.attempts },
        })
        .eq('id', subtaskId);
    }

    console.info('[RunTask] step complete', {
      task_id, agent: step.agent, status: result.status,
      duration_ms: result.durationMs, attempts: result.attempts,
    });
  }

  let finalStatus: 'completed' | 'failed' | 'partial';
  if (anyCompleted && anyFailed) finalStatus = 'partial';
  else if (anyCompleted && !anyFailed) finalStatus = 'completed';
  else finalStatus = 'failed';

  const successSteps = results.filter(r => r.status === 'completed');
  const failedSteps  = results.filter(r => r.status === 'failed');

  const summaryKa =
    successSteps.length === 0
      ? 'ყველა სერვისი ვერ შესრულდა.'
      : failedSteps.length === 0
      ? `${successSteps.length} სერვისი წარმატებით შესრულდა.`
      : `${successSteps.length}/${results.length} სერვისი შესრულდა. ვერ შესრულდა: ${failedSteps.map(s => s.agent).join(', ')}.`;

  const aggregated = {
    summaryKa, goal,
    total: results.length, succeeded: successSteps.length, failed: failedSteps.length,
    subtasks: results,
    completed_at: new Date().toISOString(),
  };

  await supabase
    .from('agent_g_tasks')
    .update({ status: finalStatus, results: aggregated, updated_at: new Date().toISOString() })
    .eq('id', task_id);

  console.info('[RunTask] pipeline complete', {
    task_id, final_status: finalStatus,
    steps_completed: successSteps.length, steps_total: results.length,
  });

  return NextResponse.json(
    { task_id, status: finalStatus, steps: results.length, succeeded: successSteps.length },
    { status: 200 }
  );
}
