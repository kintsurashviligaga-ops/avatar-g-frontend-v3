import type { SupabaseClient } from '@supabase/supabase-js';

type DateRange = {
  start: Date;
  end: Date;
};

type AggregateRow = {
  day: string;
  mrr_cents: number;
  arr_cents: number;
  subscriptions_active: number;
  revenue_subscriptions_cents: number;
  revenue_one_time_cents: number;
  gmv_marketplace_cents: number;
  platform_fees_cents: number;
  affiliate_commissions_cents: number;
  payouts_cents: number;
};

const toDayKey = (date: Date) => date.toISOString().slice(0, 10);

const toDayStart = (date: Date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const toDayEnd = (date: Date) => {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
};

const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

export async function recomputeFinanceDailyAggregates(
  supabase: SupabaseClient,
  range: DateRange
) {
  const start = toDayStart(range.start);
  const end = toDayEnd(range.end);

  const dayKeys: string[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    dayKeys.push(toDayKey(cursor));
  }

  const initial: Record<string, AggregateRow> = {};
  dayKeys.forEach((day) => {
    initial[day] = {
      day,
      mrr_cents: 0,
      arr_cents: 0,
      subscriptions_active: 0,
      revenue_subscriptions_cents: 0,
      revenue_one_time_cents: 0,
      gmv_marketplace_cents: 0,
      platform_fees_cents: 0,
      affiliate_commissions_cents: 0,
      payouts_cents: 0,
    };
  });

  const [invoicesRes, paymentsRes, ordersRes, commissionsRes, sellerPayoutsRes, affiliatePayoutsRes, subsRes] = await Promise.all([
    supabase
      .from('stripe_invoices')
      .select('amount_paid_cents, status, created_at, paid_at')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString()),
    supabase
      .from('stripe_payments')
      .select('amount_cents, status, created_at, refunded_at')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString()),
    supabase
      .from('marketplace_orders')
      .select('gross_amount_cents, platform_fee_cents, status, created_at, refunded_at')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString()),
    supabase
      .from('affiliate_commission_events')
      .select('commission_amount_cents, status, created_at')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString()),
    supabase
      .from('seller_payouts')
      .select('amount_cents, status, created_at')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString()),
    supabase
      .from('affiliate_payouts')
      .select('amount_cents, status, requested_at')
      .gte('requested_at', start.toISOString())
      .lte('requested_at', end.toISOString()),
    supabase
      .from('subscriptions')
      .select('status, current_period_start, current_period_end')
      .in('status', ['active', 'trialing']),
  ]);

  const invoices = invoicesRes.data || [];
  invoices.forEach((invoice) => {
    if (invoice.status !== 'paid') return;
    const date = invoice.paid_at || invoice.created_at;
    if (!date) return;
    const key = toDayKey(new Date(date));
    const row = initial[key];
    if (!row) return;
    const amount = Number(invoice.amount_paid_cents || 0);
    row.revenue_subscriptions_cents += amount;
    row.mrr_cents += amount;
  });

  const payments = paymentsRes.data || [];
  payments.forEach((payment) => {
    if (payment.status !== 'succeeded') return;
    if (!payment.created_at) return;
    const key = toDayKey(new Date(payment.created_at));
    const row = initial[key];
    if (!row) return;
    row.revenue_one_time_cents += Number(payment.amount_cents || 0);
  });

  const orders = ordersRes.data || [];
  orders.forEach((order) => {
    if (order.status !== 'paid') return;
    if (!order.created_at) return;
    const key = toDayKey(new Date(order.created_at));
    const row = initial[key];
    if (!row) return;
    row.gmv_marketplace_cents += Number(order.gross_amount_cents || 0);
    row.platform_fees_cents += Number(order.platform_fee_cents || 0);
  });

  const commissions = commissionsRes.data || [];
  commissions.forEach((event) => {
    if (event.status === 'reversed') return;
    if (!event.created_at) return;
    const key = toDayKey(new Date(event.created_at));
    const row = initial[key];
    if (!row) return;
    row.affiliate_commissions_cents += Number(event.commission_amount_cents || 0);
  });

  const sellerPayouts = sellerPayoutsRes.data || [];
  sellerPayouts.forEach((payout) => {
    if (payout.status !== 'paid') return;
    if (!payout.created_at) return;
    const key = toDayKey(new Date(payout.created_at));
    const row = initial[key];
    if (!row) return;
    row.payouts_cents += Number(payout.amount_cents || 0);
  });

  const affiliatePayouts = affiliatePayoutsRes.data || [];
  affiliatePayouts.forEach((payout) => {
    if (payout.status !== 'paid') return;
    if (!payout.requested_at) return;
    const key = toDayKey(new Date(payout.requested_at));
    const row = initial[key];
    if (!row) return;
    row.payouts_cents += Number(payout.amount_cents || 0);
  });

  const subscriptions = subsRes.data || [];
  dayKeys.forEach((day) => {
    const dayStart = new Date(`${day}T00:00:00.000Z`);
    const dayEnd = new Date(`${day}T23:59:59.999Z`);

    let activeCount = 0;
    subscriptions.forEach((sub) => {
      if (!sub.current_period_start || !sub.current_period_end) return;
      const startDate = new Date(sub.current_period_start);
      const endDate = new Date(sub.current_period_end);
      if (startDate <= dayEnd && endDate >= dayStart) {
        activeCount += 1;
      }
    });

    const dayRow = initial[day];
    if (!dayRow) return;

    dayRow.subscriptions_active = activeCount;
    dayRow.arr_cents = dayRow.mrr_cents * 12;
  });

  const upsertPayload = Object.values(initial);

  if (upsertPayload.length === 0) return;

  await supabase
    .from('finance_daily_aggregates')
    .upsert(
      upsertPayload.map((row) => ({
        ...row,
        day: row.day,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'day' }
    );
}
