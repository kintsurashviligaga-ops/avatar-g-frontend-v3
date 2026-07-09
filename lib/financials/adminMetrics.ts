/**
 * adminMetrics — pure financial-telemetry math for the admin dashboard.
 *
 * Separated from the route so the money math is unit-testable without a DB. Given the raw ledger rows the
 * route fetches (idempotent wallet top-ups + per-render provider-cost traces), it computes:
 *
 *   Gross Revenue   = Σ wallet_topups.amount_gel                (what customers actually paid, GEL)
 *   Bank Fees       = Gross Revenue × BANK_FEE_RATE             (acquiring-bank / processor cut ≈ 2.5%)
 *   API Raw Cost    = Σ agent_evolution_traces.cost_wholesale_gel  (real $ paid to providers, in GEL)
 *   Net Margin      = Gross Revenue − Bank Fees − API Raw Cost
 *   Net Margin %    = Net Margin / Gross Revenue                (null when there is no revenue)
 *
 * Every input is coerced defensively (Postgres NUMERIC arrives as a string over PostgREST; nulls are 0) so a
 * single malformed row can never NaN the whole dashboard.
 */
import { BANK_FEE_RATE } from './constants';

export interface TopupRow { amount_gel: number | string | null }
export interface TraceRow {
  cost_wholesale_gel: number | string | null;
  cost_retail_gel: number | string | null;
  worker_kind: string | null;
  status?: string | null;
}
export interface ProviderCost { workerKind: string; costGel: number; calls: number }

export interface FinancialSummary {
  grossRevenueGel: number;
  topupCount: number;
  bankFeeRate: number;
  bankFeesGel: number;
  apiRawCostGel: number;
  retailChargedGel: number;
  netMarginGel: number;
  /** Net margin as a fraction of gross revenue; null when gross is 0 (avoid divide-by-zero). */
  netMarginPct: number | null;
  costByProvider: ProviderCost[];
}

/** Coerce a Postgres NUMERIC (string | number | null) to a finite number; anything else → 0. */
function num(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function computeFinancials(input: {
  topups: readonly TopupRow[];
  traces: readonly TraceRow[];
  bankFeeRate?: number;
}): FinancialSummary {
  const topups = input.topups ?? [];
  const traces = input.traces ?? [];
  // Clamp the fee to a sane fraction; fall back to the configured default on anything odd.
  const feeRate =
    typeof input.bankFeeRate === 'number' && Number.isFinite(input.bankFeeRate) && input.bankFeeRate >= 0 && input.bankFeeRate < 1
      ? input.bankFeeRate
      : BANK_FEE_RATE;

  // Count SUCCEEDED renders only, to match the reference founder_financial_audit() RPC (which filters
  // status='succeeded'). Failed/timeout traces still carry a nonzero wholesale cost, so summing them would
  // make this endpoint's Net Margin silently disagree with the RPC. A null/absent status (pre-status rows)
  // defaults to succeeded so historical data isn't dropped.
  const okTraces = traces.filter((t) => ((t?.status ?? 'succeeded') === 'succeeded'));

  const grossRevenueGel = round2(topups.reduce((s, t) => s + num(t?.amount_gel), 0));
  // Bank fees are rounded to whole cents (how the processor actually charges); a hand-recomputation from
  // raw ledger rows with a single final rounding may therefore differ by up to a cent. Intentional.
  const bankFeesGel = round2(grossRevenueGel * feeRate);
  const apiRawCostGel = round4(okTraces.reduce((s, t) => s + num(t?.cost_wholesale_gel), 0));
  const retailChargedGel = round2(okTraces.reduce((s, t) => s + num(t?.cost_retail_gel), 0));
  const netMarginGel = round2(grossRevenueGel - bankFeesGel - apiRawCostGel);
  const netMarginPct = grossRevenueGel > 0 ? round4(netMarginGel / grossRevenueGel) : null;

  const byProvider = new Map<string, { costGel: number; calls: number }>();
  for (const t of okTraces) {
    const key = (t?.worker_kind || 'unknown').toString();
    const entry = byProvider.get(key) ?? { costGel: 0, calls: 0 };
    entry.costGel += num(t?.cost_wholesale_gel);
    entry.calls += 1;
    byProvider.set(key, entry);
  }
  const costByProvider: ProviderCost[] = [...byProvider.entries()]
    .map(([workerKind, v]) => ({ workerKind, costGel: round4(v.costGel), calls: v.calls }))
    .sort((a, b) => b.costGel - a.costGel);

  return {
    grossRevenueGel,
    topupCount: topups.length,
    bankFeeRate: feeRate,
    bankFeesGel,
    apiRawCostGel,
    retailChargedGel,
    netMarginGel,
    netMarginPct,
    costByProvider,
  };
}
