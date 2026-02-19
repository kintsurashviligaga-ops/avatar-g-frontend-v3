/**
 * GET /api/analytics/revenue
 * Admin-only revenue time-series for affiliate commissions
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/adminGuard';

type CommissionRow = {
  commission_amount_cents: number;
  created_at: string;
  status: string;
};

export async function GET(_request: NextRequest) {
  try {
    await requireAdmin();
    const supabase = createRouteHandlerClient();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const { data: commissions, error } = await supabase
      .from('affiliate_commission_events')
      .select('commission_amount_cents, created_at, status')
      .gte('created_at', startDate.toISOString());

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch revenue' }, { status: 500 });
    }

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
    console.error('[Analytics] Error:', error);
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed. Use GET.' }, { status: 405 });
}
