import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { reconcileWorkflowRun } from '@/lib/workflows/runner';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const rateLimitError = await checkRateLimit(request, RATE_LIMITS.READ);
  if (rateLimitError) return rateLimitError;

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const shouldTick = request.nextUrl.searchParams.get('tick') !== '0';

  if (shouldTick) {
    try {
      const state = await reconcileWorkflowRun({ userId: user.id, runId: params.id });
      return NextResponse.json(state);
    } catch {
      return NextResponse.json({ error: 'Failed to reconcile workflow run' }, { status: 500 });
    }
  }

  const [{ data: runRow, error: runError }, { data: stepRows, error: stepsError }] = await Promise.all([
    supabase
      .from('workflow_runs')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('workflow_step_runs')
      .select('*')
      .eq('workflow_run_id', params.id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
  ]);

  if (runError || !runRow) {
    return NextResponse.json({ error: 'Workflow run not found' }, { status: 404 });
  }

  if (stepsError) {
    return NextResponse.json({ error: 'Failed to load workflow step runs' }, { status: 500 });
  }

  return NextResponse.json({ run: runRow, stepRuns: stepRows ?? [] });
}
