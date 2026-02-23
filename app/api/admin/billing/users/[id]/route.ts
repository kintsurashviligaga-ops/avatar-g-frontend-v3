import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { getRangeStart } from '@/lib/monetization/metering';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const userSupabase = createServerClient();
  const {
    data: { user },
  } = await userSupabase.auth.getUser();

  const admin = assertAdminAccess(request, user);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.reason }, { status: 403 });
  }

  const supabase = createServiceRoleClient();
  const userId = params.id;
  const from = getRangeStart('month');

  const [{ data: subscription }, { data: credits }, { data: usageRows }] = await Promise.all([
    supabase.from('subscriptions').select('plan,status,current_period_end,updated_at').eq('user_id', userId).maybeSingle(),
    supabase.from('credits').select('balance,monthly_allowance,reset_at').eq('user_id', userId).maybeSingle(),
    supabase
      .from('usage_meter_events')
      .select('event_type,units,service_id,route,created_at')
      .eq('user_id', userId)
      .gte('created_at', from)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const totalsByType: Record<string, number> = {};
  for (const row of usageRows ?? []) {
    totalsByType[row.event_type] = (totalsByType[row.event_type] ?? 0) + Number(row.units ?? 0);
  }

  return NextResponse.json({
    user_id: userId,
    plan_snapshot: subscription ?? null,
    credits_snapshot: credits ?? null,
    usage_snapshot: {
      from,
      total_events: usageRows?.length ?? 0,
      totals_by_type: totalsByType,
      rows: usageRows ?? [],
    },
  });
}
