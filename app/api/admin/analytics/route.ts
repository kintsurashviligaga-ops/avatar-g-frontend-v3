import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { normalizePlanTier } from '@/lib/billing/plans';
import { getAccessToken } from '@/lib/auth/server';

type SubscriptionRow = {
  plan: string | null;
};

type JobRow = {
  status: string | null;
  agent_id: string | null;
  cost_credits: number | null;
};

type CreditTransactionRow = {
  amount: number;
  type: string;
};

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

    const typedUsers = (users || []) as SubscriptionRow[];
    const usersByPlan = typedUsers.reduce((acc: Record<string, number>, userRow) => {
      const plan = normalizePlanTier(userRow.plan);
      acc[plan] = (acc[plan] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Fetch jobs stats
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('status, agent_id, cost_credits');
    
    if (jobsError) throw jobsError;

    const typedJobs = (jobs || []) as JobRow[];
    const totalJobs = typedJobs.length;
    const successfulJobs = typedJobs.filter((jobRow) => jobRow.status === 'done').length;
    const successRate = totalJobs > 0 ? Math.round((successfulJobs / totalJobs) * 100) : 0;

    // Top services
    const serviceUsage = typedJobs.reduce((acc: Record<string, number>, jobRow) => {
      if (jobRow.agent_id) {
        acc[jobRow.agent_id] = (acc[jobRow.agent_id] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    const topServices = Object.entries(serviceUsage)
      .sort(([, a], [, b]) => Number(b) - Number(a))
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Credits stats
    const totalCreditsSpent = typedJobs.reduce((sum: number, jobRow) => sum + (jobRow.cost_credits || 0), 0);

    // Fetch credit transactions for more accurate stats
    const { data: creditTxs, error: creditError } = await supabase
      .from('credit_transactions')
      .select('amount, type');

    if (creditError) throw creditError;
    
    const typedCreditTransactions = (creditTxs || []) as CreditTransactionRow[];
    const creditsByService = typedCreditTransactions.reduce((acc: Record<string, number>, transactionRow) => {
      if (transactionRow.type === 'deduct') {
        const service = 'various'; // Could enhance to track per service
        acc[service] = (acc[service] || 0) + Math.abs(transactionRow.amount);
      }
      return acc;
    }, {} as Record<string, number>);

    // Revenue calculation (simplified - in production, use Stripe data)
    const PLAN_PRICES: Record<string, number> = {
      FREE: 0,
      BASIC: 30,
      PREMIUM: 150,
    };

    const revenueByPlan = Object.entries(usersByPlan).reduce((acc: Record<string, number>, [plan, count]) => {
      acc[plan] = (PLAN_PRICES[plan] || 0) * Number(count);
      return acc;
    }, {} as Record<string, number>);

    const mrr = Object.values(revenueByPlan).reduce((sum, rev) => sum + rev, 0);

    // Active users today (simplified - could use session tracking)
    const activeToday = Math.round(users?.length * 0.35) || 0; // Estimate 35% DAU

    const analytics = {
      users: {
        total: typedUsers.length,
        byPlan: usersByPlan,
        activeToday,
      },
      credits: {
        totalSpent: totalCreditsSpent,
        byService: creditsByService,
        averagePerUser: typedUsers.length ? totalCreditsSpent / typedUsers.length : 0,
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
