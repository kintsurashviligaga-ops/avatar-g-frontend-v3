import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { structuredLog } from '@/lib/logger';
import { runExecutiveTask } from '@/lib/agent/executiveOrchestrator';

export const dynamic = 'force-dynamic';

const TaskSchema = z.object({
  text: z.string().min(1).max(2000),
  channel: z
    .enum(['phone', 'sms', 'email', 'dashboard'] as const)
    .default('dashboard'),
  phone: z.string().optional(),
});

/**
 * POST /api/executive/task
 * Submit a new executive task for the orchestrator.
 * Body: { text: string, channel?: string, phone?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = TaskSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_input', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const result = await runExecutiveTask({
      userId: user.id,
      channel: parsed.data.channel,
      text: parsed.data.text,
      phone: parsed.data.phone,
    });

    structuredLog('info', 'executive.task.submitted', {
      userId: user.id,
      taskId: result.taskId,
    });

    return NextResponse.json(result);
  } catch (err) {
    structuredLog('error', 'executive.task.submit.error', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
