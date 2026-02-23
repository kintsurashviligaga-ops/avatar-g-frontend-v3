import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { getPlanDefinition, normalizePlanId } from '@/lib/monetization/plans';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  range: z.enum(['month']).default('month'),
});

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

export async function GET(request: NextRequest) {
  const parsed = QuerySchema.safeParse({ range: request.nextUrl.searchParams.get('range') ?? 'month' });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid range parameter' }, { status: 400 });
  }

  const userSupabase = createServerClient();
  const {
    data: { user },
  } = await userSupabase.auth.getUser();
  const admin = assertAdminAccess(request, user);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.reason }, { status: 403 });
  }

  const supabase = createServiceRoleClient();
  const monthStart = daysAgoIso(30);
  const weekStart = daysAgoIso(7);
  const dayStart = daysAgoIso(1);

  const [{ data: mRows }, { data: wRows }, { data: dRows }, { data: subscriptions }, { data: usageRows }] = await Promise.all([
    supabase.from('usage_meter_events').select('user_id').gte('created_at', monthStart),
    supabase.from('usage_meter_events').select('user_id').gte('created_at', weekStart),
    supabase.from('usage_meter_events').select('user_id').gte('created_at', dayStart),
    supabase.from('subscriptions').select('plan,status,user_id,updated_at'),
    supabase.from('usage_meter_events').select('units,event_type,metadata').gte('created_at', monthStart),
  ]);

  const unique = (rows: Array<{ user_id: string }> | null | undefined) => new Set((rows ?? []).map((row) => row.user_id)).size;
  const dau = unique(dRows);
  const wau = unique(wRows);
  const mau = unique(mRows);

  const paidStatuses = new Set(['active', 'trialing']);
  const paidSubscriptions = (subscriptions ?? []).filter((row) => row.plan && row.plan !== 'FREE' && paidStatuses.has(row.status));
  const mrr = paidSubscriptions.reduce((sum, row) => {
    const normalizedPlan = normalizePlanId(String(row.plan));
    const price = getPlanDefinition(normalizedPlan).price_usd;
    return sum + price;
  }, 0);
  const arr = mrr * 12;

  const paidUsers = new Set(paidSubscriptions.map((row) => row.user_id)).size;
  const arpu = paidUsers > 0 ? Number((mrr / paidUsers).toFixed(2)) : 0;
  const ltvProxy = Number((arpu * 8).toFixed(2));

  const freeUsers = new Set((subscriptions ?? []).filter((row) => row.plan === 'FREE').map((row) => row.user_id)).size;
  const conversionRateFreeToPaid = freeUsers + paidUsers > 0 ? Number((paidUsers / (freeUsers + paidUsers)).toFixed(4)) : 0;

  const churnCandidates = (subscriptions ?? []).filter((row) => row.status === 'canceled' || row.status === 'unpaid').length;
  const churnProxy = paidSubscriptions.length > 0 ? Number((churnCandidates / paidSubscriptions.length).toFixed(4)) : 0;

  const costUnits = (usageRows ?? [])
    .filter((row) => row.event_type === 'tokens' || row.event_type === 'job_execution')
    .reduce((sum, row) => sum + Number(row.units ?? 0), 0);
  const grossMarginProxy = mrr > 0 ? Number((((mrr - costUnits / 1000) / mrr) * 100).toFixed(2)) : 0;

  return NextResponse.json({
    range: parsed.data.range,
    kpis: {
      dau,
      wau,
      mau,
      mrr,
      arr,
      arpu,
      ltv_proxy: ltvProxy,
      conversion_rate_free_to_paid: conversionRateFreeToPaid,
      churn_proxy: churnProxy,
      gross_margin_proxy: grossMarginProxy,
    },
  });
}
