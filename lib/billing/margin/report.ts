/**
 * lib/billing/margin/report.ts — loads the founder dashboard's rows and builds the report (Phase 8.1). Read-only.
 *
 * The caller passes a service-role client (the route gates on admin first). Every source is fail-open: a missing table
 * (provider_costs / reconcile_reports before #313's migration runs) or a query error leaves that part empty and is
 * listed in `unavailable`, so the dashboard still shows what it can. Nothing here writes.
 */
import { marginAlerts, marginByModel, type MarginAlert, type ModelMargin } from './alerts';
import { revenueByDay, summarize, userUsage, type CostRow, type FinanceSummary, type PaidOrder, type ReconciledDay, type SpendRow, type UserInfo, type UserUsageRow } from './finance';

export interface FinanceReport {
  window: { days: number; since: string; until: string };
  summary: FinanceSummary;
  revenueByDay: { day: string; gel: number }[];
  users: UserUsageRow[];
  models: ModelMargin[];
  alerts: MarginAlert[];
  unavailable: string[];
}

/** The small slice of the Supabase query builder this file uses (keeps it testable without a database). */
type Res = { data: unknown[] | null; error: unknown };
interface Query extends PromiseLike<Res> {
  select(cols: string): Query;
  gte(col: string, v: string): Query;
  lt(col: string, v: string): Query;
  eq(col: string, v: string): Query;
  in(col: string, v: string[]): Query;
  limit(n: number): Query;
}
export interface ReadClient {
  from(table: string): Query;
}

const ROW_CAP = 20_000;
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0)) || 0;
const str = (v: unknown) => (v == null ? '' : String(v));

async function rows(q: PromiseLike<Res>, name: string, unavailable: string[]): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await q;
    if (error) {
      unavailable.push(name);
      return [];
    }
    return (data ?? []) as Record<string, unknown>[];
  } catch {
    unavailable.push(name);
    return [];
  }
}

export async function loadFinanceReport(client: ReadClient, days: number, now = new Date()): Promise<FinanceReport> {
  const until = now.toISOString();
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const prevSince = new Date(now.getTime() - 2 * days * 86_400_000).toISOString();
  const unavailable: string[] = [];

  const [topups, plans, costsNow, costsPrev, reconciled, spend] = await Promise.all([
    rows(client.from('wallet_topups').select('amount_gel, created_at').gte('created_at', since).limit(ROW_CAP), 'wallet_topups', unavailable),
    rows(
      client.from('bog_orders').select('amount_gel, kind, credited_at').eq('status', 'completed').in('kind', ['subscription', 'renewal']).gte('credited_at', since).limit(ROW_CAP),
      'bog_orders',
      unavailable,
    ),
    rows(client.from('provider_costs').select('user_id, capability, model, usd, credits_charged, created_at').gte('created_at', since).limit(ROW_CAP), 'provider_costs', unavailable),
    rows(client.from('provider_costs').select('capability, model, usd, credits_charged, created_at').gte('created_at', prevSince).lt('created_at', since).limit(ROW_CAP), 'provider_costs (previous window)', unavailable),
    rows(client.from('reconcile_reports').select('day, billed_usd').gte('day', since.slice(0, 10)).limit(ROW_CAP), 'reconcile_reports', unavailable),
    rows(client.from('credit_ledger').select('user_id, delta, reason, created_at').lt('delta', '0').gte('created_at', since).limit(ROW_CAP), 'credit_ledger', unavailable),
  ]);

  const orders: PaidOrder[] = [
    ...topups.map((r) => ({ amountGel: num(r.amount_gel), kind: 'topup', createdAt: str(r.created_at) })),
    ...plans.map((r) => ({ amountGel: num(r.amount_gel), kind: str(r.kind) || 'subscription', createdAt: str(r.credited_at) })),
  ];
  const toCost = (r: Record<string, unknown>): CostRow => ({
    userId: str(r.user_id),
    capability: str(r.capability),
    model: str(r.model),
    usd: num(r.usd),
    creditsCharged: num(r.credits_charged),
    createdAt: str(r.created_at),
  });
  const costs = costsNow.map(toCost);
  const previous = costsPrev.map(toCost);
  const recByDay = new Map<string, number>();
  for (const r of reconciled) recByDay.set(str(r.day).slice(0, 10), (recByDay.get(str(r.day).slice(0, 10)) ?? 0) + num(r.billed_usd));
  const rec: ReconciledDay[] = [...recByDay.entries()].map(([day, billedUsd]) => ({ day, billedUsd }));
  const spendRows: SpendRow[] = spend.map((r) => ({ userId: str(r.user_id), credits: -num(r.delta), createdAt: str(r.created_at), reason: (r.reason as string | null) ?? null }));

  // Emails and plans only for the users who make the table (top 50).
  const top = userUsage(spendRows, costs, [], 50);
  const ids = top.map((u) => u.userId).filter(Boolean);
  let users: UserInfo[] = [];
  if (ids.length) {
    const [profiles, subs] = await Promise.all([
      rows(client.from('profiles').select('id, email').in('id', ids).limit(ids.length), 'profiles', unavailable),
      rows(client.from('subscriptions').select('user_id, tier, status').in('user_id', ids).in('status', ['active', 'past_due', 'trialing']).limit(ids.length * 2), 'subscriptions', unavailable),
    ]);
    const plan = new Map(subs.map((s) => [str(s.user_id), str(s.tier) || null]));
    users = profiles.map((p) => ({ id: str(p.id), email: (p.email as string | null) ?? null, plan: plan.get(str(p.id)) ?? null }));
  }

  return {
    window: { days, since, until },
    summary: summarize(orders, costs, rec),
    revenueByDay: revenueByDay(orders),
    users: userUsage(spendRows, costs, users, 50),
    models: marginByModel(costs),
    alerts: marginAlerts(costs, previous),
    unavailable: [...new Set(unavailable)],
  };
}
