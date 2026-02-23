import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { cancelWorkflowRun, retryWorkflowStep } from '@/lib/workflows/runner';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { id: string; stepId: string } }) {
  const rateLimitError = await checkRateLimit(request, RATE_LIMITS.WRITE);
  if (rateLimitError) return rateLimitError;

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as { action?: 'retry-step' | 'cancel-run' };

  try {
    if (body.action === 'cancel-run') {
      const state = await cancelWorkflowRun({ userId: user.id, runId: params.id });
      return NextResponse.json(state);
    }

    const state = await retryWorkflowStep({
      userId: user.id,
      runId: params.id,
      stepId: params.stepId,
    });

    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ error: 'Unable to process workflow step action' }, { status: 500 });
  }
}
