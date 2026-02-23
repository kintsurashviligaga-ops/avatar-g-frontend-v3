import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-internal-worker-token');
  if (!process.env.WORKER_INTERNAL_TOKEN || token !== process.env.WORKER_INTERNAL_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServiceRoleClient();
  const inactiveSince = new Date();
  inactiveSince.setDate(inactiveSince.getDate() - 14);

  const { data: subs } = await supabase
    .from('subscriptions')
    .select('user_id,plan,status,updated_at')
    .in('status', ['past_due', 'canceled', 'unpaid']);

  let emitted = 0;
  for (const sub of subs ?? []) {
    const { count: activityCount } = await supabase
      .from('usage_meter_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', sub.user_id)
      .gte('created_at', inactiveSince.toISOString());

    if ((activityCount ?? 0) > 0) continue;

    await supabase.from('events').insert({
      type: 'churn_risk_reminder',
      user_id: sub.user_id,
      metadata: {
        plan: sub.plan,
        status: sub.status,
        reason: 'No usage in last 14 days and inactive subscription status',
      },
    });
    emitted += 1;
  }

  return NextResponse.json({ ok: true, emitted });
}
