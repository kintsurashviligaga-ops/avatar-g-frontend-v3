/**
 * GET /api/affiliate/analytics
 * Returns affiliate time-series metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';

type CommissionRow = {
  commission_amount_cents: number;
  created_at: string;
  status: string;
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
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!affiliate) {
      return NextResponse.json({ series: [] });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const { data: commissions } = await supabase
      .from('affiliate_commission_events')
      .select('commission_amount_cents, created_at, status')
      .eq('affiliate_id', affiliate.id)
      .gte('created_at', startDate.toISOString());

    const daily: Record<string, number> = {};
    ((commissions || []) as CommissionRow[]).forEach((commission) => {
      if (commission.status === 'reversed') return;
      const dateKey = new Date(commission.created_at).toISOString().slice(0, 10);
      daily[dateKey] = (daily[dateKey] || 0) + commission.commission_amount_cents;
    });

    const series = Object.entries(daily)
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([date, amount_cents]) => ({ date, amount_cents }));

    return NextResponse.json({ series });
  } catch (error) {
    console.error('[Affiliate] Error fetching analytics:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed. Use GET.' }, { status: 405 });
}
