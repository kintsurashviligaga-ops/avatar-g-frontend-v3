/**
 * GET /api/affiliate/dashboard
 * Returns summary metrics for affiliate dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';

type CommissionRow = {
  commission_amount_cents: number;
  status: string;
  created_at: string;
};

export async function GET(_request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!affiliate) {
      return NextResponse.json({ hasAffiliate: false });
    }

    const now = new Date().toISOString();

    await supabase
      .from('affiliate_commission_events')
      .update({ status: 'available' })
      .eq('affiliate_id', affiliate.id)
      .eq('status', 'pending')
      .lte('available_at', now);

    const { count: clicksCount } = await supabase
      .from('affiliate_clicks')
      .select('id', { count: 'exact', head: true })
      .eq('affiliate_id', affiliate.id);

    const { count: referralsCount } = await supabase
      .from('affiliate_referrals')
      .select('id', { count: 'exact', head: true })
      .eq('affiliate_id', affiliate.id);

    const { data: commissions } = await supabase
      .from('affiliate_commission_events')
      .select('commission_amount_cents, status, created_at')
      .eq('affiliate_id', affiliate.id);

    const typedCommissions = (commissions || []) as CommissionRow[];

    const totals = typedCommissions.reduce(
      (acc: { pending: number; available: number; paid: number; total: number }, commission) => {
        if (commission.status === 'pending') acc.pending += commission.commission_amount_cents;
        if (commission.status === 'available') acc.available += commission.commission_amount_cents;
        if (commission.status === 'paid') acc.paid += commission.commission_amount_cents;
        if (commission.status !== 'reversed') acc.total += commission.commission_amount_cents;
        return acc;
      },
      { pending: 0, available: 0, paid: 0, total: 0 }
    );

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 6);

    const seriesMap: Record<string, number> = {};
    for (let i = 0; i < 7; i += 1) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      seriesMap[date.toISOString().slice(0, 10)] = 0;
    }

    typedCommissions.forEach((commission) => {
      const dateKey = new Date(commission.created_at).toISOString().slice(0, 10);
      if (seriesMap[dateKey] !== undefined && commission.status !== 'reversed') {
        seriesMap[dateKey] += commission.commission_amount_cents;
      }
    });

    const timeSeries = Object.entries(seriesMap).map(([date, amount_cents]) => ({
      date,
      amount_cents,
    }));

    const { data: connectAccount } = await supabase
      .from('stripe_connect_accounts')
      .select('payouts_enabled')
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({
      hasAffiliate: true,
      affiliate,
      stats: {
        total_clicks: clicksCount || 0,
        total_signups: referralsCount || 0,
        pending: totals.pending,
        available: totals.available,
        paid: totals.paid,
        total: totals.total,
      },
      chart: timeSeries,
      connect: {
        payouts_enabled: connectAccount?.payouts_enabled ?? false,
      },
    });
  } catch (error) {
    console.error('[Affiliate] Error fetching dashboard:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch dashboard' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed. Use GET.' }, { status: 405 });
}
