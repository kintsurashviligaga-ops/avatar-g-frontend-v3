/**
 * POST /api/finance/admin/summary
 * Admin-only: Global financial summary
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/adminGuard';

type AggregateRow = {
  mrr_cents?: number | null;
  subscriptions_active?: number | null;
  revenue_subscriptions_cents?: number | null;
  revenue_one_time_cents?: number | null;
  gmv_marketplace_cents?: number | null;
  platform_fees_cents?: number | null;
};

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
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
      .order('day', { ascending: false });

    if (aggError) {
      throw aggError;
    }

    // Calculate summary
    const typedAgg = (agg || []) as AggregateRow[];

    const mrr = typedAgg[0]?.mrr_cents || 0;
    const arr = mrr * 12;
    const activeSubs = typedAgg[0]?.subscriptions_active || 0;
    const revenue30d = typedAgg.reduce((sum: number, row) => sum + (row.revenue_subscriptions_cents || 0) + (row.revenue_one_time_cents || 0), 0);
    const gmv30d = typedAgg.reduce((sum: number, row) => sum + (row.gmv_marketplace_cents || 0), 0);
    const fees30d = typedAgg.reduce((sum: number, row) => sum + (row.platform_fees_cents || 0), 0);
    const refunds30d = 0; // TODO: track refunds
    const churn = 0; // TODO: compute monthly churn

    return NextResponse.json({
      summary: {
        mrr,
        arr,
        activeSubs,
        revenue30d,
        gmv30d,
        fees30d,
        refunds30d,
        churn,
      },
    });
  } catch (error) {
    console.error('[POST /api/finance/admin/summary]', error);
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
  }
}

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
      .order('day', { ascending: false });

    if (aggError) {
      throw aggError;
    }

    // Calculate summary
    const typedAgg = (agg || []) as AggregateRow[];

    const mrr = typedAgg[0]?.mrr_cents || 0;
    const arr = mrr * 12;
    const activeSubs = typedAgg[0]?.subscriptions_active || 0;
    const revenue30d = typedAgg.reduce((sum: number, row) => sum + (row.revenue_subscriptions_cents || 0) + (row.revenue_one_time_cents || 0), 0);
    const gmv30d = typedAgg.reduce((sum: number, row) => sum + (row.gmv_marketplace_cents || 0), 0);
    const fees30d = typedAgg.reduce((sum: number, row) => sum + (row.platform_fees_cents || 0), 0);
    const refunds30d = 0; // TODO: track refunds
    const churn = 0; // TODO: compute monthly churn

    return NextResponse.json({
      summary: {
        mrr,
        arr,
        activeSubs,
        revenue30d,
        gmv30d,
        fees30d,
        refunds30d,
        churn,
      },
    });
  } catch (error) {
    console.error('[GET /api/finance/admin/summary]', error);
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
  }
}
