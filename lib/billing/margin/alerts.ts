/**
 * lib/billing/margin/alerts.ts — Margin Alerts for the founder dashboard (Phase 8.1). Pure.
 *
 * For each (capability, model) in the window, from provider_costs:
 *   realised margin = (credits charged × net ₾ per credit at the floor − cost ₾ with FX reserve) ÷ that net
 * An alert fires when:
 *   MARGIN_LOW   realised margin < 65 % (the rule) — the price is too low for what Google now bills;
 *   COST_SPIKE   average cost per call is ≥ 15 % above the previous window's (Google price change, longer outputs,
 *                retries, a prompt that grew) — even while the margin still holds, so GG sees it early;
 *   UNPRICED     calls cost money but charged 0 credits (free caps, admin, a bug) above $1 in the window.
 * Severity: 'critical' under 50 % margin or any unpriced spend over $10, otherwise 'warning'.
 */
import { MARGIN_ECON, costGelOf, netGelPerCredit } from './econ';
import type { CostRow } from './finance';

export const SPIKE_PCT = 15;
export const UNPRICED_ALERT_USD = 1;

export type AlertKind = 'MARGIN_LOW' | 'COST_SPIKE' | 'UNPRICED';
export interface MarginAlert {
  kind: AlertKind;
  severity: 'warning' | 'critical';
  capability: string;
  model: string;
  calls: number;
  costUsd: number;
  marginPct: number | null;
  /** Change in average cost per call vs the previous window, % (COST_SPIKE only). */
  changePct?: number;
  message: { ka: string; en: string };
}

export interface ModelMargin {
  capability: string;
  model: string;
  calls: number;
  costUsd: number;
  creditsCharged: number;
  avgCostUsd: number;
  marginPct: number | null;
}

const key = (c: { capability: string; model: string }) => `${c.capability}|${c.model}`;
const r1 = (n: number) => Math.round(n * 10) / 10;

export function marginByModel(rows: CostRow[]): ModelMargin[] {
  const m = new Map<string, ModelMargin>();
  for (const r of rows) {
    const k = key(r);
    const v = m.get(k) ?? { capability: r.capability, model: r.model, calls: 0, costUsd: 0, creditsCharged: 0, avgCostUsd: 0, marginPct: null };
    v.calls += 1;
    v.costUsd += r.usd;
    v.creditsCharged += r.creditsCharged;
    m.set(k, v);
  }
  return [...m.values()]
    .map((v) => {
      const net = v.creditsCharged * netGelPerCredit(MARGIN_ECON.floorCreditGel);
      return {
        ...v,
        costUsd: Math.round(v.costUsd * 1e4) / 1e4,
        avgCostUsd: v.calls ? Math.round((v.costUsd / v.calls) * 1e5) / 1e5 : 0,
        marginPct: net > 0 ? r1(((net - costGelOf(v.costUsd)) / net) * 100) : null,
      };
    })
    .sort((a, b) => b.costUsd - a.costUsd);
}

export function marginAlerts(current: CostRow[], previous: CostRow[] = []): MarginAlert[] {
  const min = MARGIN_ECON.minGrossMargin * 100;
  const prev = new Map(marginByModel(previous).map((p) => [key(p), p]));
  const out: MarginAlert[] = [];
  for (const m of marginByModel(current)) {
    const base = { capability: m.capability, model: m.model, calls: m.calls, costUsd: m.costUsd, marginPct: m.marginPct };
    if (m.creditsCharged === 0) {
      if (m.costUsd > UNPRICED_ALERT_USD)
        out.push({
          ...base,
          kind: 'UNPRICED',
          severity: m.costUsd > 10 ? 'critical' : 'warning',
          message: {
            ka: `${m.model}: $${m.costUsd.toFixed(2)} დაიხარჯა კრედიტის ჩამოჭრის გარეშე (${m.calls} გამოძახება)`,
            en: `${m.model}: $${m.costUsd.toFixed(2)} spent with no credits charged (${m.calls} calls)`,
          },
        });
      continue;
    }
    if (m.marginPct !== null && m.marginPct < min)
      out.push({
        ...base,
        kind: 'MARGIN_LOW',
        severity: m.marginPct < 50 ? 'critical' : 'warning',
        message: {
          ka: `${m.model}: მარჟა ${m.marginPct}% — 65%-ზე დაბალია. ფასი უნდა გაიზარდოს.`,
          en: `${m.model}: margin ${m.marginPct}% is under 65%. Raise the price.`,
        },
      });
    const p = prev.get(key(m));
    if (p && p.avgCostUsd > 0) {
      const changePct = r1(((m.avgCostUsd - p.avgCostUsd) / p.avgCostUsd) * 100);
      if (changePct >= SPIKE_PCT)
        out.push({
          ...base,
          kind: 'COST_SPIKE',
          severity: m.marginPct !== null && m.marginPct < min ? 'critical' : 'warning',
          changePct,
          message: {
            ka: `${m.model}: ერთი გამოძახების ხარჯი ${changePct}%-ით გაიზარდა`,
            en: `${m.model}: cost per call up ${changePct}%`,
          },
        });
    }
  }
  const rank = { critical: 0, warning: 1 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.costUsd - a.costUsd);
}
