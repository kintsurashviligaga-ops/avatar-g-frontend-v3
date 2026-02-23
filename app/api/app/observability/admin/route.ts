import { NextResponse } from 'next/server';
import { createServiceRoleClient, createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function startOfTodayIso(): string {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  return utc.toISOString();
}

export async function GET() {
  const serverClient = createServerClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const today = startOfTodayIso();

  try {
    const [
      usersRes,
      activeWorkflowsRes,
      queueRes,
      failedJobsRes,
      creditsRes,
      jobsRes,
      revenueRes,
    ] = await Promise.all([
      supabase.from('subscriptions').select('user_id', { count: 'exact', head: true }),
      supabase.from('workflow_runs').select('id', { count: 'exact', head: true }).in('status', ['queued', 'running']),
      supabase.from('service_jobs').select('id', { count: 'exact', head: true }).in('status', ['queued', 'processing']),
      supabase.from('service_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', today),
      supabase
        .from('credit_transactions')
        .select('amount, type, created_at')
        .eq('type', 'deduct')
        .gte('created_at', today),
      supabase.from('service_jobs').select('service_slug, created_at').gte('created_at', today),
      supabase
        .from('payments')
        .select('amount_cents, status, created_at')
        .eq('status', 'succeeded')
        .gte('created_at', today),
    ]);

    const creditsConsumed = (creditsRes.data ?? []).reduce((sum, row) => sum + Math.abs(Number(row.amount ?? 0)), 0);

    const topMap: Record<string, number> = {};
    for (const row of jobsRes.data ?? []) {
      const slug = String(row.service_slug ?? 'unknown');
      topMap[slug] = (topMap[slug] ?? 0) + 1;
    }

    const topServices = Object.entries(topMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([service, count]) => ({ service, count }));

    const revenueTodayCents = (revenueRes.data ?? []).reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0);

    return NextResponse.json({
      metrics: {
        activeUsers: usersRes.count ?? 0,
        activeWorkflows: activeWorkflowsRes.count ?? 0,
        queueSize: queueRes.count ?? 0,
        failedJobsToday: failedJobsRes.count ?? 0,
        revenueTodayCents,
        creditsConsumedToday: creditsConsumed,
        topServices,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load observability metrics' }, { status: 500 });
  }
}
