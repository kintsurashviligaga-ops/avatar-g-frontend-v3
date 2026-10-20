/**
 * lib/admin/dashboard.ts — the admin dashboard's numbers for a rolling window: money in (top-ups + BOG plan
 * payments), the bank's cut, what the providers cost (agent_evolution_traces, the same ledger the daily cost caps
 * read), credits sold vs credits spent, and how many people are active. Plus one row per day for the chart.
 *
 * `summarizeDashboard` is pure (rows in, numbers out) so the money math is testable without a database;
 * `loadDashboard` is the only part that reads, with the service-role client, from an isAdmin()-gated route.
 *
 * ⚠️ "CREDITS SOLD" COUNTS ONLY PAID GRANTS. reason 'purchase' also books the sign-up bonus and trials, and an admin
 * comp books a subscription allowance under an `admin:` invoice. Only rows historyActionFor calls a top-up or a
 * subscription, and whose ref is not an admin comp, are sales.
 */
import { historyActionFor } from '@/lib/billing/creditHistory';
import { BANK_FEE_RATE } from '@/lib/financials/constants';
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export interface RevenueRow { amount_gel: unknown; created_at: unknown }
export interface CostRow { cost_wholesale_gel: unknown; worker_kind: unknown; status?: unknown; created_at: unknown }
export interface LedgerRow { user_id: unknown; delta: unknown; reason: unknown; metadata: unknown; created_at: unknown }
export interface ActivityRow { user_id: unknown; created_at: unknown }

export interface DayPoint { day: string; revenueGel: number; apiCostGel: number; creditsSold: number; creditsSpent: number; activeUsers: number }

export interface DashboardSummary {
  days: number;
  since: string;
  revenueGel: number;
  payments: number;
  bankFeesGel: number;
  apiCostGel: number;
  /** Revenue − bank fees − provider cost. */
  grossProfitGel: number;
  /** Profit over provider + bank cost (the owner's "100%" = 1.0); null with no cost. */
  markup: number | null;
  creditsSold: number;
  creditsSpent: number;
  creditsRefunded: number;
  creditsComped: number;
  activeUsers: number;
  activeToday: number;
  payingUsers: number;
  newSignups: number;
  costByProvider: { kind: string; costGel: number; calls: number }[];
  series: DayPoint[];
  /** Sources that could not be read (a missing table degrades to zeros, never a 500). */
  degraded: string[];
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const dayOf = (v: unknown): string => String(v ?? '').slice(0, 10);

function refOf(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const ref = (metadata as { ref?: unknown }).ref;
  return typeof ref === 'string' ? ref : '';
}

/** A paid credit grant (top-up or a paid subscription month), not a bonus and not an admin comp. */
export function isSoldCredit(row: Pick<LedgerRow, 'delta' | 'reason' | 'metadata'>): boolean {
  if (num(row.delta) <= 0) return false;
  const ref = refOf(row.metadata).toLowerCase();
  if (ref.startsWith('admin:') || ref.startsWith('sub:admin:')) return false;
  const action = historyActionFor({ delta: row.delta, reason: row.reason, metadata: row.metadata });
  return action === 'topup' || action === 'subscription';
}

export function summarizeDashboard(input: {
  days: number;
  since: Date;
  until: Date;
  revenue: readonly RevenueRow[];
  costs: readonly CostRow[];
  ledger: readonly LedgerRow[];
  activity: readonly ActivityRow[];
  newSignups: number;
  bankFeeRate?: number;
  degraded?: string[];
}): DashboardSummary {
  const fee = input.bankFeeRate ?? BANK_FEE_RATE;
  const todayKey = dayOf(input.until.toISOString());

  const series = new Map<string, DayPoint & { users: Set<string> }>();
  for (let t = Date.UTC(input.since.getUTCFullYear(), input.since.getUTCMonth(), input.since.getUTCDate()); t <= input.until.getTime(); t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    series.set(day, { day, revenueGel: 0, apiCostGel: 0, creditsSold: 0, creditsSpent: 0, activeUsers: 0, users: new Set() });
  }
  const at = (v: unknown) => series.get(dayOf(v));

  let revenueGel = 0;
  for (const r of input.revenue) {
    const a = num(r.amount_gel);
    revenueGel += a;
    const d = at(r.created_at);
    if (d) d.revenueGel += a;
  }

  let apiCostGel = 0;
  const byKind = new Map<string, { costGel: number; calls: number }>();
  for (const c of input.costs) {
    if ((c.status ?? 'succeeded') !== 'succeeded') continue;
    const a = num(c.cost_wholesale_gel);
    apiCostGel += a;
    const rawK = typeof c.worker_kind === 'string' && c.worker_kind ? c.worker_kind.toLowerCase() : 'unknown';
    const k = rawK === 'ltx' || rawK === 'veo' || rawK === 'vertex-veo' || rawK === 'video'
      ? 'Google Vertex AI (Veo)'
      : rawK === 'gemini' || rawK === 'gemini-image'
        ? 'Google Gemini'
        : rawK === 'lyria'
          ? 'Google Lyria 3'
          : rawK === 'nanobanana'
            ? 'Gemini Image (NanoBanana)'
            : rawK === 'elevenlabs'
              ? 'ElevenLabs Audio'
              : typeof c.worker_kind === 'string' && c.worker_kind ? c.worker_kind : 'Google AI';
    const e = byKind.get(k) ?? { costGel: 0, calls: 0 };
    e.costGel += a;
    e.calls += 1;
    byKind.set(k, e);
    const d = at(c.created_at);
    if (d) d.apiCostGel += a;
  }

  let creditsSold = 0, creditsSpent = 0, creditsRefunded = 0, creditsComped = 0;
  const payers = new Set<string>();
  const active = new Set<string>();
  const activeToday = new Set<string>();
  const touch = (uid: unknown, when: unknown) => {
    if (typeof uid !== 'string' || !uid) return;
    active.add(uid);
    if (dayOf(when) === todayKey) activeToday.add(uid);
    at(when)?.users.add(uid);
  };

  for (const l of input.ledger) {
    const delta = Math.trunc(num(l.delta));
    const reason = typeof l.reason === 'string' ? l.reason : '';
    const d = at(l.created_at);
    if (delta < 0) {
      creditsSpent += -delta;
      if (d) d.creditsSpent += -delta;
      touch(l.user_id, l.created_at);
    } else if (delta > 0) {
      if (isSoldCredit(l)) {
        creditsSold += delta;
        if (d) d.creditsSold += delta;
        if (typeof l.user_id === 'string') payers.add(l.user_id);
      } else if (reason === 'refund' || /:refund(?::|$)/.test(refOf(l.metadata))) {
        creditsRefunded += delta;
      } else if (reason === 'admin_adjustment' || refOf(l.metadata).toLowerCase().startsWith('sub:admin:')) {
        creditsComped += delta;
      }
    }
  }
  for (const a of input.activity) touch(a.user_id, a.created_at);

  const bankFeesGel = revenueGel * fee;
  const cost = apiCostGel + bankFeesGel;
  const grossProfitGel = revenueGel - cost;

  return {
    days: input.days,
    since: input.since.toISOString(),
    revenueGel: r2(revenueGel),
    payments: input.revenue.length,
    bankFeesGel: r2(bankFeesGel),
    apiCostGel: r2(apiCostGel),
    grossProfitGel: r2(grossProfitGel),
    markup: cost > 0 ? Math.round((grossProfitGel / cost) * 1000) / 1000 : null,
    creditsSold,
    creditsSpent,
    creditsRefunded,
    creditsComped,
    activeUsers: active.size,
    activeToday: activeToday.size,
    payingUsers: payers.size,
    newSignups: input.newSignups,
    costByProvider: [...byKind.entries()]
      .map(([kind, v]) => ({ kind, costGel: r2(v.costGel), calls: v.calls }))
      .sort((a, b) => b.costGel - a.costGel),
    series: [...series.values()].map(({ users, ...p }) => ({
      ...p,
      revenueGel: r2(p.revenueGel),
      apiCostGel: r2(p.apiCostGel),
      activeUsers: users.size,
    })),
    degraded: input.degraded ?? [],
  };
}

/** Upper bound on rows per source; a window this busy is a good problem, and the summary says it was capped. */
const ROW_CAP = 20_000;

export async function loadDashboard(client: Client, days: number, now = new Date()): Promise<DashboardSummary> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const sinceIso = since.toISOString();
  const degraded: string[] = [];
  const rows = async <T>(name: string, q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> => {
    try {
      const { data, error } = await q;
      if (error) { degraded.push(name); return []; }
      const list = (Array.isArray(data) ? data : []) as T[];
      if (list.length >= ROW_CAP) degraded.push(`${name}:capped`);
      return list;
    } catch {
      degraded.push(name);
      return [];
    }
  };

  const [topups, plans, costs, ledger, jobs, signups] = await Promise.all([
    rows<RevenueRow>('wallet_topups', client.from('wallet_topups').select('amount_gel, created_at').gte('created_at', sinceIso).limit(ROW_CAP)),
    // A BOG top-up is already a wallet_topups row (ref bog:<order>); only plan payments are added from bog_orders.
    rows<{ amount_gel: unknown; credited_at: unknown }>('bog_orders', client.from('bog_orders').select('amount_gel, credited_at')
      .eq('status', 'completed').in('kind', ['subscription', 'renewal']).gte('credited_at', sinceIso).limit(ROW_CAP)),
    rows<CostRow>('agent_evolution_traces', client.from('agent_evolution_traces').select('cost_wholesale_gel, worker_kind, status, created_at')
      .gte('created_at', sinceIso).limit(ROW_CAP)),
    rows<LedgerRow>('credit_ledger', client.from('credit_ledger').select('user_id, delta, reason, metadata, created_at')
      .gte('created_at', sinceIso).limit(ROW_CAP)),
    rows<ActivityRow>('generation_jobs', client.from('generation_jobs').select('user_id, created_at').gte('created_at', sinceIso)
      .not('user_id', 'is', null).limit(ROW_CAP)),
    (async () => {
      try {
        const { count, error } = await client.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', sinceIso);
        if (error) { degraded.push('profiles'); return 0; }
        return count ?? 0;
      } catch { degraded.push('profiles'); return 0; }
    })(),
  ]);

  return summarizeDashboard({
    days,
    since,
    until: now,
    revenue: [...topups, ...plans.map((p) => ({ amount_gel: p.amount_gel, created_at: p.credited_at }))],
    costs,
    ledger,
    activity: jobs,
    newSignups: signups,
    degraded,
  });
}
