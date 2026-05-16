/**
 * POST /api/agent-g/orchestrate
 *
 * Async 202 orchestration endpoint.
 * 1. Parses intent with Gemini (or heuristic fallback)
 * 2. Creates agent_g_tasks row in Supabase
 * 3. Returns 202 { taskId, estimatedSeconds, creditCost } immediately
 * 4. Fires background execution via non-awaited internal fetch to /api/agent-g/run-task
 *
 * The client polls /api/tasks/{taskId}/status or uses Supabase Realtime for progress.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { parseIntent } from '@/lib/agentg/intent-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const schema = z.object({
  goal: z.string().min(1).max(4000),
  locale: z.enum(['ka', 'en', 'ru']).optional(),
  sessionId: z.string().max(128).optional(),
  /** If true, parse the plan but do NOT execute — useful for plan preview */
  dry_run: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten(), requestId },
        { status: 400 }
      );
    }

    const { goal, dry_run } = parsed.data;

    // Parse intent (Gemini 2.5 Flash → heuristic fallback)
    const plan = await parseIntent(goal);

    if (dry_run) {
      return NextResponse.json(
        { requestId, plan },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Auth — works for both logged-in users and guest/demo
    const user = await getAuthenticatedUser(request);
    const supabase = createServiceRoleClient();

    // Upsert task row
    const taskInsert = await supabase
      .from('agent_g_tasks')
      .insert({
        user_id: user?.id ?? '00000000-0000-0000-0000-000000000000', // demo UUID
        goal,
        status: 'queued',
        plan: {
          main_goal: plan.main_goal,
          locale: plan.locale,
          category: plan.category,
          steps: plan.steps,
          summaryKa: plan.summaryKa,
          estimatedSeconds: plan.estimatedSeconds,
          creditCost: plan.creditCost,
        },
        results: null,
      })
      .select('id')
      .single();

    if (taskInsert.error || !taskInsert.data) {
      console.error('[Orchestrate] task insert failed', taskInsert.error);
      return NextResponse.json(
        { error: 'Failed to create task', requestId },
        { status: 500 }
      );
    }

    const taskId = taskInsert.data.id as string;

    // Seed subtasks rows
    if (plan.steps.length > 0) {
      await supabase.from('agent_g_subtasks').insert(
        plan.steps.map((step) => ({
          task_id: taskId,
          agent_name: step.agent,
          status: 'queued',
          input: step.input,
          output: null,
        }))
      );
    }

    // Fire background execution — do NOT await
    const internalSecret = process.env.AGENT_G_INTERNAL_SECRET || '';
    const origin = request.nextUrl.origin;
    const authHeader = request.headers.get('authorization') || undefined;

    // This fetch triggers a NEW independent serverless invocation
    void fetch(`${origin}/api/agent-g/run-task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-g-secret': internalSecret,
        ...(authHeader ? { authorization: authHeader } : {}),
      },
      body: JSON.stringify({
        task_id: taskId,
        goal,
        plan: plan.steps,
        user_id: user?.id,
      }),
      // No signal / no timeout — runs independently
    }).catch((err) => {
      console.warn('[Orchestrate] background run-task trigger failed', { taskId, err: String(err) });
    });

    console.info('[Orchestrate] task queued', {
      request_id: requestId,
      task_id: taskId,
      category: plan.category,
      steps: plan.steps.length,
      estimated_seconds: plan.estimatedSeconds,
      duration_ms: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        taskId,
        status: 'queued',
        plan: {
          category: plan.category,
          summaryKa: plan.summaryKa,
          steps: plan.steps.length,
          estimatedSeconds: plan.estimatedSeconds,
          creditCost: plan.creditCost,
        },
        requestId,
      },
      {
        status: 202,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    console.error('[Orchestrate] unexpected error', {
      request_id: requestId,
      message: error instanceof Error ? error.message : 'Unknown',
      duration_ms: Date.now() - startedAt,
    });

    return NextResponse.json(
      { error: 'Orchestration service temporarily unavailable', requestId },
      { status: 503 }
    );
  }
}
