import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { getPlanDefinition, normalizePlanId } from '@/lib/monetization/plans';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userSupabase = createServerClient();
  const {
    data: { user },
  } = await userSupabase.auth.getUser();
  const admin = assertAdminAccess(request, user);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.reason }, { status: 403 });
  }

  const supabase = createServiceRoleClient();
  const { data: subs } = await supabase.from('subscriptions').select('plan,status,updated_at,user_id');

  const seriesMap: Record<string, number> = {};
  for (const row of subs ?? []) {
    if (!['active', 'trialing'].includes(String(row.status))) continue;
    const plan = normalizePlanId(String(row.plan));
    const price = getPlanDefinition(plan).price_usd;
    const key = String(row.updated_at).slice(0, 10);
    seriesMap[key] = (seriesMap[key] ?? 0) + price;
  }

  const series = Object.entries(seriesMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue_usd]) => ({ date, revenue_usd }));

  return NextResponse.json({
    summary: {
      total_revenue_usd: series.reduce((sum, item) => sum + item.revenue_usd, 0),
      points: series.length,
    },
    series,
  });
}
