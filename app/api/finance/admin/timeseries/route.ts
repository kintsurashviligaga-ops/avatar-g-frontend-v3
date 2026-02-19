/**
 * GET /api/finance/admin/timeseries
 * Admin-only: Finance timeseries data for charts
 * Params: range=30d|90d|180d
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/adminGuard';

type AggregateRow = {
  day: string;
  mrr_cents?: number | null;
  revenue_subscriptions_cents?: number | null;
  revenue_one_time_cents?: number | null;
  gmv_marketplace_cents?: number | null;
  platform_fees_cents?: number | null;
  affiliate_commissions_cents?: number | null;
  seller_payouts_cents?: number | null;
  subscriptions_active?: number | null;
};

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const supabase = createRouteHandlerClient();

    const parsedUrl = new URL(request.url);
    const rangeParam = parsedUrl.searchParams?.get?.('range') || '30d';
    const days = rangeParam === '30d' ? 30 : rangeParam === '90d' ? 90 : 180;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDay = startDate.toISOString().slice(0, 10);

    const { data: agg, error: aggError } = await supabase
      .from('finance_daily_aggregates')
      .select('*')
      .gte('day', startDay)
      .order('day', { ascending: true });

    if (aggError) {
      throw aggError;
    }

    // Transform to chart format
    const timeseries = ((agg || []) as AggregateRow[]).map((row) => ({
      date: row.day,
      mrr: row.mrr_cents || 0,
      revenue: (row.revenue_subscriptions_cents || 0) + (row.revenue_one_time_cents || 0),
      gmv: row.gmv_marketplace_cents || 0,
      fees: row.platform_fees_cents || 0,
      affiliateCommissions: row.affiliate_commissions_cents || 0,
      payouts: row.seller_payouts_cents || 0,
      subscriptionsActive: row.subscriptions_active || 0,
    }));

    return NextResponse.json({
      range: rangeParam,
      days,
      data: timeseries,
    });
  } catch (error) {
    console.error('[GET /api/finance/admin/timeseries]', error);
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to fetch timeseries' }, { status: 500 });
  }
}
