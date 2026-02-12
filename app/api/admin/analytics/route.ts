import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAccessToken } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

/**
 * Admin Analytics API
 * Returns aggregated platform metrics
 * 
 * Security: In production, add role-based access control
 */
export async function GET() {
  try {
    // Verify authentication
    const token = await getAccessToken();
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createSupabaseServerClient();

    // TODO: Add admin role check
    // const { data: profile } = await supabase
    //   .from('profiles')
    //   .select('role')
    //   .eq('id', token.sub)
    //   .single();
    // if (profile?.role !== 'admin') {
    //   return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    // }

    // Fetch users stats
    const { data: users, error: usersError } = await supabase
      .from('subscriptions')
      .select('plan');
    
    if (usersError) throw usersError;

    const usersByPlan = users?.reduce((acc, u) => {
      acc[u.plan] = (acc[u.plan] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    // Fetch jobs stats
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('status, agent_id, cost_credits');
    
    if (jobsError) throw jobsError;

    const totalJobs = jobs?.length || 0;
    const successfulJobs = jobs?.filter(j => j.status === 'done').length || 0;
    const successRate = totalJobs > 0 ? Math.round((successfulJobs / totalJobs) * 100) : 0;

    // Top services
    const serviceUsage = jobs?.reduce((acc, j) => {
      if (j.agent_id) {
        acc[j.agent_id] = (acc[j.agent_id] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>) || {};

    const topServices = Object.entries(serviceUsage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Credits stats
    const totalCreditsSpent = jobs?.reduce((sum, j) => sum + (j.cost_credits || 0), 0) || 0;

    // Fetch credit transactions for more accurate stats
    const { data: creditTxs, error: creditError } = await supabase
      .from('credit_transactions')
      .select('amount, type');
    
    const creditsByService = creditTxs?.reduce((acc, tx) => {
      if (tx.type === 'deduct') {
        const service = 'various'; // Could enhance to track per service
        acc[service] = (acc[service] || 0) + Math.abs(tx.amount);
      }
      return acc;
    }, {} as Record<string, number>) || {};

    // Revenue calculation (simplified - in production, use Stripe data)
    const PLAN_PRICES: Record<string, number> = {
      'FREE': 0,
      'PRO': 30,
      'PREMIUM': 150,
      'ENTERPRISE': 499,
    };

    const revenueByPlan = Object.entries(usersByPlan).reduce((acc, [plan, count]) => {
      acc[plan] = (PLAN_PRICES[plan] || 0) * count;
      return acc;
    }, {} as Record<string, number>);

    const mrr = Object.values(revenueByPlan).reduce((sum, rev) => sum + rev, 0);

    // Active users today (simplified - could use session tracking)
    const activeToday = Math.round(users?.length * 0.35) || 0; // Estimate 35% DAU

    const analytics = {
      users: {
        total: users?.length || 0,
        byPlan: usersByPlan,
        activeToday,
      },
      credits: {
        totalSpent: totalCreditsSpent,
        byService: creditsByService,
        averagePerUser: users?.length ? totalCreditsSpent / users.length : 0,
      },
      revenue: {
        mrr,
        totalLifetime: mrr * 12, // Estimate
        byPlan: revenueByPlan,
      },
      usage: {
        totalJobs,
        successRate,
        topServices,
      },
    };

    return NextResponse.json({ analytics });
  } catch (error) {
    console.error('Admin analytics error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
