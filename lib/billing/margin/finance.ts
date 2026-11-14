/**
 * lib/billing/margin/finance.ts — the founder dashboard's numbers (Phase 8.1). Pure: the API route reads the rows, this
 * file does the maths, so every figure on the dashboard is unit-tested.
 *
 * Sources (all read-only, service role, admin only):
 *   revenue   bog_orders where status = 'paid' (₾, BOG is the only payment rail)
 *   usage     credit_ledger rows with amount < 0 (credits spent), per user
 *   cost      provider_costs (#313: one row per Google call, USD + credits charged, by capability/model)
 *             → "estimated" until reconcile_reports (Cloud Billing export) covers the day, then "reconciled"
 *
 * Margin here is the REALISED margin: revenue actually received versus what Google billed for the same window. Free
 * and admin-granted credits are spent without revenue, so the realised margin can sit under the per-action 65 % — the
 * dashboard shows the split ("paid usage margin" vs "after free credits") so the cause is visible.
 */
import { MARGIN_ECON, costGelOf, netGelPerCredit } from './econ';

export interface PaidOrder { amountGel: number; kind: 'topup' | 'subscription' | 'renewal' | string; createdAt: string }
export interface CostRow { userId: string; capability: string; model: string; usd: number; creditsCharged: number; createdAt: string }
export interface SpendRow { userId: string; credits: number; createdAt: string; reason?: string | null }
export interface ReconciledDay { day: string; billedUsd: number }
export interface UserInfo { id: string; email?: string | null; plan?: string | null }

export interface FinanceSummary {
  revenueGel: number;
  revenueNetGel: number; // after card fee and VAT
  googleCostUsd: number;
  googleCostGel: number;
  costBasis: 'estimated' | 'reconciled' | 'mixed' | 'none';
  netProfitGel: number;
  marginPct: number | null; // null when there is no revenue yet
  /** Margin on the credits that were paid for: credits charged × net ₾ per credit vs their cost. */
  paidUsageMarginPct: number | null;
  ordersCount: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const day = (iso: string) => iso.slice(0, 10);

export function summarize(orders: PaidOrder[], costs: CostRow[], reconciled: ReconciledDay[] = []): FinanceSummary {
  const revenueGel = orders.reduce((s, o) => s + (o.amountGel > 0 ? o.amountGel : 0), 0);
  const revenueNetGel = (revenueGel * (1 - MARGIN_ECON.cardFee)) / (1 + MARGIN_ECON.vatRate);

  // Per day: the reconciled Google bill wins over our per-call estimate.
  const recBy = new Map(reconciled.map((r) => [r.day, r.billedUsd]));
  const estBy = new Map<string, number>();
  for (const c of costs) estBy.set(day(c.createdAt), (estBy.get(day(c.createdAt)) ?? 0) + c.usd);
  const days = new Set([...estBy.keys(), ...recBy.keys()]);
  let googleCostUsd = 0;
  let nRec = 0;
  let nEst = 0;
  for (const d of days) {
    if (recBy.has(d)) {
      googleCostUsd += recBy.get(d)!;
      nRec += 1;
    } else {
      googleCostUsd += estBy.get(d) ?? 0;
      nEst += 1;
    }
  }
  const costBasis = days.size === 0 ? 'none' : nRec === 0 ? 'estimated' : nEst === 0 ? 'reconciled' : 'mixed';
  const googleCostGel = googleCostUsd * MARGIN_ECON.gelPerUsd; // actual money, no FX reserve
  const netProfitGel = revenueNetGel - googleCostGel;

  // Paid usage: each credit charged earned at least the floor's net ₾ (the cheapest any credit is sold for).
  const creditsCharged = costs.reduce((s, c) => s + c.creditsCharged, 0);
  const usageNet = creditsCharged * netGelPerCredit(MARGIN_ECON.floorCreditGel);
  const usageCost = costs.reduce((s, c) => s + c.usd, 0) * MARGIN_ECON.gelPerUsd;

  return {
    revenueGel: r2(revenueGel),
    revenueNetGel: r2(revenueNetGel),
    googleCostUsd: r2(googleCostUsd),
    googleCostGel: r2(googleCostGel),
    costBasis,
    netProfitGel: r2(netProfitGel),
    marginPct: revenueNetGel > 0 ? r2((netProfitGel / revenueNetGel) * 100) : null,
    paidUsageMarginPct: usageNet > 0 ? r2(((usageNet - usageCost) / usageNet) * 100) : null,
    ordersCount: orders.length,
  };
}

export interface UserUsageRow {
  userId: string;
  email: string | null;
  plan: string | null;
  creditsSpent: number;
  googleCostUsd: number;
  /** Margin on this user's paid usage at the floor credit; < 65 % = the user hits actions priced too low. */
  marginPct: number | null;
  topCapability: string | null;
}

export function userUsage(spend: SpendRow[], costs: CostRow[], users: UserInfo[] = [], limit = 50): UserUsageRow[] {
  const info = new Map(users.map((u) => [u.id, u]));
  const by = new Map<string, { credits: number; usd: number; charged: number; caps: Map<string, number> }>();
  const get = (id: string) => {
    let v = by.get(id);
    if (!v) by.set(id, (v = { credits: 0, usd: 0, charged: 0, caps: new Map() }));
    return v;
  };
  for (const s of spend) if (s.credits > 0) get(s.userId).credits += s.credits;
  for (const c of costs) {
    const v = get(c.userId);
    v.usd += c.usd;
    v.charged += c.creditsCharged;
    v.caps.set(c.capability, (v.caps.get(c.capability) ?? 0) + c.usd);
  }
  const rows: UserUsageRow[] = [...by.entries()].map(([userId, v]) => {
    const net = v.charged * netGelPerCredit(MARGIN_ECON.floorCreditGel);
    const top = [...v.caps.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      userId,
      email: info.get(userId)?.email ?? null,
      plan: info.get(userId)?.plan ?? null,
      creditsSpent: v.credits,
      googleCostUsd: Math.round(v.usd * 1e4) / 1e4,
      marginPct: net > 0 ? r2(((net - costGelOf(v.usd)) / net) * 100) : null,
      topCapability: top,
    };
  });
  return rows.sort((a, b) => b.creditsSpent - a.creditsSpent || b.googleCostUsd - a.googleCostUsd).slice(0, limit);
}

/** Revenue by day for the chart (₾). */
export function revenueByDay(orders: PaidOrder[]): { day: string; gel: number }[] {
  const m = new Map<string, number>();
  for (const o of orders) m.set(day(o.createdAt), (m.get(day(o.createdAt)) ?? 0) + o.amountGel);
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, gel]) => ({ day: d, gel: r2(gel) }));
}
