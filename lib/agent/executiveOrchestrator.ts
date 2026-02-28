/**
 * Executive Orchestrator
 * ─────────────────────────────────────────────────────────────────────────────
 * Takes a natural-language executive request, builds a multi-agent workflow
 * plan, executes each step, deducts credits, and persists the result.
 *
 * This runs server-side only (route handlers / server actions).
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { structuredLog } from '@/lib/logger';
import { CREDIT_COSTS } from '@/lib/billing/pricingConfig';
import type {
  ExecutiveTaskInput,
  ExecutiveWorkflowStep,
  ExecutiveOutputs,
} from '@/types/billing';

/* ── Intent detection (lightweight keyword scan) ──────────────────────────── */

const EXECUTIVE_INTENTS: Record<
  string,
  { keywords: string[]; steps: Omit<ExecutiveWorkflowStep, 'status'>[] }
> = {
  schedule_meeting: {
    keywords: ['meeting', 'schedule', 'შეხვედრა', 'встреча', 'calendar'],
    steps: [
      { agentId: 'text-agent', label: 'Draft invitation', creditsEstimate: 10 },
      { agentId: 'workflow-agent', label: 'Calendar integration', creditsEstimate: 20 },
    ],
  },
  write_document: {
    keywords: ['document', 'write', 'draft', 'დოკუმენტი', 'документ', 'report'],
    steps: [
      { agentId: 'text-agent', label: 'Write document', creditsEstimate: 30 },
    ],
  },
  research: {
    keywords: ['research', 'investigate', 'find out', 'კვლევა', 'исследование'],
    steps: [
      { agentId: 'business-agent', label: 'Deep research', creditsEstimate: 40 },
      { agentId: 'text-agent', label: 'Compile report', creditsEstimate: 20 },
    ],
  },
  create_content: {
    keywords: ['video', 'image', 'design', 'content', 'ვიდეო', 'სურათი', 'видео'],
    steps: [
      { agentId: 'image-agent', label: 'Generate visuals', creditsEstimate: 30 },
      { agentId: 'editing-agent', label: 'Produce video', creditsEstimate: 40 },
    ],
  },
  place_call: {
    keywords: ['call', 'phone', 'ზარი', 'звонок', 'dial'],
    steps: [
      { agentId: 'workflow-agent', label: 'Place outbound call', creditsEstimate: 30 },
    ],
  },
};

function detectIntent(text: string): {
  intent: string;
  steps: Omit<ExecutiveWorkflowStep, 'status'>[];
} {
  const lower = text.toLowerCase();

  for (const [intent, config] of Object.entries(EXECUTIVE_INTENTS)) {
    if (config.keywords.some((k) => lower.includes(k))) {
      return { intent, steps: config.steps };
    }
  }

  // Fallback: generic task
  return {
    intent: 'general_task',
    steps: [
      { agentId: 'text-agent', label: 'Process request', creditsEstimate: CREDIT_COSTS.executive_task_base },
    ],
  };
}

/* ── Orchestrator ─────────────────────────────────────────────────────────── */

export async function runExecutiveTask(
  input: ExecutiveTaskInput,
): Promise<{ taskId: string; outputs: ExecutiveOutputs }> {
  const db = createServiceRoleClient();
  const traceId = crypto.randomUUID();

  structuredLog('info', 'executive.task.start', {
    userId: input.userId,
    channel: input.channel,
  }, traceId);

  /* 1. Detect intent & build plan ──────────────────────────────────────────── */
  const { intent, steps } = detectIntent(input.text);
  const workflowSteps: ExecutiveWorkflowStep[] = steps.map((s) => ({
    ...s,
    status: 'pending' as const,
  }));

  /* 2. Insert task row (status = queued) ───────────────────────────────────── */
  const { data: task, error: insertErr } = await db
    .from('executive_task_logs')
    .insert({
      user_id: input.userId,
      input_channel: input.channel,
      input_text: input.text,
      phone_e164: input.phone ?? null,
      detected_intent: intent,
      workflow: workflowSteps,
      outputs: { summaryText: '', artifacts: [], deliveries: [] },
      status: 'queued',
    })
    .select('id')
    .single();

  if (insertErr || !task) {
    structuredLog('error', 'executive.task.insert_fail', {
      error: insertErr?.message ?? 'no row returned',
    }, traceId);
    throw new Error('Failed to create executive task');
  }

  const taskId = task.id as string;

  /* 3. Mark running ────────────────────────────────────────────────────────── */
  await db
    .from('executive_task_logs')
    .update({ status: 'running' })
    .eq('id', taskId);

  /* 4. Execute each step (simulate — real version calls worker queue) ──────── */
  let totalCredits = 0;

  for (const [i, step] of workflowSteps.entries()) {
    const start = Date.now();

    try {
      step.status = 'running';
      await db
        .from('executive_task_logs')
        .update({ workflow: workflowSteps })
        .eq('id', taskId);

      // Simulated agent work — in production this dispatches to the job queue.
      // The delay here represents a placeholder for actual agent execution time.
      await new Promise((r) => setTimeout(r, 200));

      step.status = 'done';
      step.durationMs = Date.now() - start;
      totalCredits += step.creditsEstimate;

      structuredLog('info', 'executive.step.done', {
        taskId,
        stepIndex: i,
        agentId: step.agentId,
        credits: step.creditsEstimate,
      }, traceId);
    } catch (err) {
      step.status = 'failed';
      step.durationMs = Date.now() - start;
      step.error = err instanceof Error ? err.message : 'unknown';

      structuredLog('error', 'executive.step.fail', {
        taskId,
        stepIndex: i,
        agentId: step.agentId,
        error: step.error,
      }, traceId);
    }
  }

  /* 5. Build outputs ──────────────────────────────────────────────────────── */
  const outputs: ExecutiveOutputs = {
    summaryText: `Executive task "${intent}" completed with ${workflowSteps.filter((s) => s.status === 'done').length}/${workflowSteps.length} steps.`,
    artifacts: [],
    deliveries: [
      {
        channel: 'dashboard',
        status: 'sent',
        sentAt: new Date().toISOString(),
      },
    ],
  };

  /* 6. Deduct credits ─────────────────────────────────────────────────────── */
  if (totalCredits > 0) {
    const { data: row } = await db
      .from('user_credits')
      .select('balance')
      .eq('user_id', input.userId)
      .single();

    if (row) {
      await db
        .from('user_credits')
        .update({ balance: Math.max(0, (row.balance as number) - totalCredits) })
        .eq('user_id', input.userId);

      await db.from('credits_ledger').insert({
        user_id: input.userId,
        delta: -totalCredits,
        reason: `executive_task:${intent}`,
        meta: { task_id: taskId, steps: workflowSteps.length },
      });
    }
  }

  /* 7. Finalise task row ──────────────────────────────────────────────────── */
  const allDone = workflowSteps.every((s) => s.status === 'done');

  await db
    .from('executive_task_logs')
    .update({
      status: allDone ? 'completed' : 'failed',
      workflow: workflowSteps,
      outputs,
      credits_used: totalCredits,
      error: allDone ? null : 'One or more steps failed',
    })
    .eq('id', taskId);

  structuredLog('info', 'executive.task.done', {
    taskId,
    intent,
    totalCredits,
    status: allDone ? 'completed' : 'failed',
  }, traceId);

  return { taskId, outputs };
}
