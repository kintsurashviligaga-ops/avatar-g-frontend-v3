/** @jest-environment node */
/** Phase 8.1: the founder dashboard loader reads the right rows and degrades per source instead of failing. */
import { loadFinanceReport, type ReadClient } from './report';

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

/** A tiny in-memory stand-in for the Supabase query builder. Tables set to 'missing' answer with an error. */
function fakeClient(tables: Record<string, Row[] | 'missing'>, seen: string[] = []): ReadClient {
  return {
    from(table: string) {
      seen.push(table);
      const filters: Filter[] = [];
      const q = {
        select: () => q,
        gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), q),
        lt: (c: string, v: string) => (filters.push((r) => (typeof r[c] === 'number' ? (r[c] as number) < Number(v) : String(r[c]) < v)), q),
        eq: (c: string, v: string) => (filters.push((r) => r[c] === v), q),
        in: (c: string, v: string[]) => (filters.push((r) => v.includes(String(r[c]))), q),
        limit: () => q,
        then(ok: (r: { data: Row[] | null; error: unknown }) => unknown) {
          const t = tables[table];
          if (t === 'missing' || t === undefined) return Promise.resolve({ data: null, error: { message: 'relation does not exist' } }).then(ok);
          return Promise.resolve({ data: t.filter((r) => filters.every((f) => f(r))), error: null }).then(ok);
        },
      };
      return q as unknown as ReturnType<ReadClient['from']>;
    },
  };
}

const NOW = new Date('2026-11-20T12:00:00Z');

describe('loadFinanceReport', () => {
  test('revenue = top-ups + completed plan orders; usage, cost, alerts and users come from their tables', async () => {
    const client = fakeClient({
      wallet_topups: [{ amount_gel: 25, created_at: '2026-11-19T10:00:00Z' }, { amount_gel: 99, created_at: '2026-09-01T00:00:00Z' }],
      bog_orders: [
        { amount_gel: 129, kind: 'subscription', status: 'completed', credited_at: '2026-11-18T10:00:00Z' },
        { amount_gel: 10, kind: 'topup', status: 'completed', credited_at: '2026-11-18T10:00:00Z' }, // already a wallet_topups row
        { amount_gel: 55, kind: 'renewal', status: 'pending', credited_at: '2026-11-18T10:00:00Z' },
      ],
      provider_costs: [
        { user_id: 'u1', capability: 'video.omni', model: 'gemini-omni-1.2-flash', usd: 0.5, credits_charged: 66, created_at: '2026-11-19T10:00:00Z' },
        { user_id: 'u1', capability: 'video.omni', model: 'gemini-omni-1.2-flash', usd: 0.4, credits_charged: 66, created_at: '2026-10-10T10:00:00Z' },
      ],
      reconcile_reports: [],
      credit_ledger: [
        { user_id: 'u1', delta: -66, reason: 'video', created_at: '2026-11-19T10:00:00Z' },
        { user_id: 'u1', delta: 500, reason: 'topup', created_at: '2026-11-19T09:00:00Z' },
      ],
      profiles: [{ id: 'u1', email: 'gg@example.ge' }],
      subscriptions: [{ user_id: 'u1', tier: 'pro', status: 'active' }],
    });
    const r = await loadFinanceReport(client, 30, NOW);
    expect(r.summary.revenueGel).toBe(154);
    expect(r.summary.ordersCount).toBe(2);
    expect(r.summary.googleCostUsd).toBe(0.5);
    expect(r.users[0]).toMatchObject({ userId: 'u1', email: 'gg@example.ge', plan: 'pro', creditsSpent: 66 });
    expect(r.alerts[0]).toMatchObject({ kind: 'COST_SPIKE', changePct: 25 }); // 0.4 → 0.5 per call vs the previous 30 days
    expect(r.unavailable).toEqual([]);
  });

  test('before #313 runs (no provider_costs / reconcile_reports) the report still returns revenue and says what is missing', async () => {
    const r = await loadFinanceReport(
      fakeClient({ wallet_topups: [{ amount_gel: 10, created_at: '2026-11-19T10:00:00Z' }], bog_orders: [], provider_costs: 'missing', reconcile_reports: 'missing', credit_ledger: [] }),
      30,
      NOW,
    );
    expect(r.summary).toMatchObject({ revenueGel: 10, googleCostUsd: 0, costBasis: 'none' });
    expect(r.unavailable).toEqual(expect.arrayContaining(['provider_costs', 'reconcile_reports']));
  });

  test('reads only — never touches a write path', async () => {
    const seen: string[] = [];
    await loadFinanceReport(fakeClient({}, seen), 7, NOW);
    expect(new Set(seen)).toEqual(new Set(['wallet_topups', 'bog_orders', 'provider_costs', 'reconcile_reports', 'credit_ledger']));
  });
});

describe('flags', () => {
  test('both Phase 8.1 switches are off unless set', () => {
    const { financeDashboardOn, pricingV8On } = jest.requireActual('./flags') as typeof import('./flags');
    expect(financeDashboardOn({})).toBe(false);
    expect(pricingV8On({})).toBe(false);
    expect(financeDashboardOn({ ADMIN_FINANCE_DASHBOARD: 'on' })).toBe(true);
    expect(pricingV8On({ NEXT_PUBLIC_PRICING_V8: '1' })).toBe(true);
    expect(financeDashboardOn({ ADMIN_FINANCE_DASHBOARD: 'off' })).toBe(false);
  });
});
