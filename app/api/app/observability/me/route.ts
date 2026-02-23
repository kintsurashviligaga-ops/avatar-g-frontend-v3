import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function startOfTodayIso(): string {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  return utc.toISOString();
}

export async function GET() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = startOfTodayIso();

  try {
    const [{ data: creditsRow }, { data: jobs }, { data: workflows }] = await Promise.all([
      supabase.from('credits').select('balance').eq('user_id', user.id).single(),
      supabase
        .from('service_jobs')
        .select('status, created_at, updated_at')
        .eq('user_id', user.id)
        .gte('created_at', today),
      supabase
        .from('workflow_runs')
        .select('status, created_at, updated_at')
        .eq('user_id', user.id)
        .gte('created_at', today),
    ]);

    const jobsToday = jobs?.length ?? 0;
    const successfulJobs = (jobs ?? []).filter((job) => job.status === 'completed' || job.status === 'succeeded').length;
    const successRate = jobsToday > 0 ? Math.round((successfulJobs / jobsToday) * 100) : 100;

    const avgExecutionTimeMs = (() => {
      const durations = (jobs ?? [])
        .map((job) => {
          if (!job.updated_at || !job.created_at) return null;
          return new Date(job.updated_at).getTime() - new Date(job.created_at).getTime();
        })
        .filter((duration): duration is number => typeof duration === 'number' && duration >= 0);

      if (durations.length === 0) return 0;
      return Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
    })();

    const activeWorkflowRuns = (workflows ?? []).filter((run) => run.status === 'queued' || run.status === 'running').length;

    return NextResponse.json({
      metrics: {
        creditsRemaining: Number(creditsRow?.balance ?? 0),
        jobsToday,
        successRate,
        averageExecutionTimeMs: avgExecutionTimeMs,
        activeWorkflowRuns,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load user observability metrics' }, { status: 500 });
  }
}
