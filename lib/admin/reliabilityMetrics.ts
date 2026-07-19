/**
 * lib/admin/reliabilityMetrics.ts — pure aggregation for the reliability/observability snapshot.
 *
 * "Measure first, then decide." Turns a batch of generation_jobs rows into per-service success rates
 * + median/avg render timings + a recent-failure list, so the admin can see the TRUTH (which service
 * is degrading, how fast renders really are, what's failing) instead of guessing. Pure + deterministic
 * (nowMs injected) → unit-tested without a DB. The route wraps it with the DB read + provider-key state.
 */

export type ServiceKind = 'film' | 'avatar' | 'interior' | 'image' | 'music' | 'voice';

export interface RelJobRow {
  service_type: string;
  status: string; // pending | processing | completed | failed
  created_at: string;
  updated_at: string;
  /** Optional finer label in params (product | swap | motion …). When present it groups the row under
   *  the subtype instead of the coarse service_type, so hidden subsystems appear as their own service. */
  params?: { subtype?: unknown } | null;
}

/** The dashboard label for a row: params.subtype when it's a non-empty string, else the service_type. */
function labelOf(row: RelJobRow): string {
  const st = row.params && typeof row.params === 'object' ? (row.params as { subtype?: unknown }).subtype : undefined;
  return typeof st === 'string' && st.trim() ? st.trim() : row.service_type;
}

export interface ServiceStat {
  service: string;
  total: number;
  completed: number;
  failed: number;
  inFlight: number; // pending + processing
  /** completed / (completed + failed); null when no terminal jobs yet. 0..1. */
  successRate: number | null;
  /** avg wall-clock seconds for completed jobs (updated_at − created_at); null when none completed. */
  avgDurationSec: number | null;
}

export interface ReliabilitySnapshot {
  windowDays: number;
  totals: { total: number; completed: number; failed: number; inFlight: number; successRate: number | null };
  perService: ServiceStat[];
  /** Newest-first failed jobs (service + when) for a quick "what's breaking" glance. */
  recentFailures: { service: string; at: string }[];
}

const round = (n: number, dp = 3) => Math.round(n * 10 ** dp) / 10 ** dp;

export interface TierBucket { tier: string; count: number; totalGel: number }

/**
 * Bucket top-up amounts (GEL) into the pricing tiers for the package-distribution view. Each top-up maps
 * to the nearest tier by price (within ±20%), else 'Custom'. Pure + deterministic (tiers injected).
 */
export function tierDistribution(amountsGel: readonly number[], tiers: readonly { name: string; priceGel: number }[]): TierBucket[] {
  const sorted = [...(tiers || [])].filter((t) => t && Number.isFinite(t.priceGel) && t.priceGel > 0).sort((a, b) => a.priceGel - b.priceGel);
  const buckets = new Map<string, { count: number; total: number }>();
  for (const raw of amountsGel || []) {
    const a = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
    if (a <= 0) continue;
    let best: { name: string; priceGel: number } | null = null;
    let bestDiff = Infinity;
    for (const t of sorted) { const d = Math.abs(t.priceGel - a); if (d < bestDiff) { bestDiff = d; best = t; } }
    const label = best && bestDiff <= best.priceGel * 0.2 ? best.name : 'Custom';
    const e = buckets.get(label) ?? { count: 0, total: 0 };
    e.count += 1; e.total += a;
    buckets.set(label, e);
  }
  return [...buckets.entries()].map(([tier, v]) => ({ tier, count: v.count, totalGel: round(v.total, 2) })).sort((a, b) => b.totalGel - a.totalGel);
}

function durationSec(row: RelJobRow): number | null {
  const a = Date.parse(row.created_at);
  const b = Date.parse(row.updated_at);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return (b - a) / 1000;
}

/** Compute the reliability snapshot from a job batch already filtered to the window. Never throws. */
export function computeReliability(rows: readonly RelJobRow[], windowDays: number, maxFailures = 20): ReliabilitySnapshot {
  const list = Array.isArray(rows) ? rows.filter((r) => r && typeof r.service_type === 'string' && typeof r.status === 'string') : [];
  const byService = new Map<string, RelJobRow[]>();
  for (const r of list) {
    const key = labelOf(r); // params.subtype (product|swap|motion) when present, else service_type
    const arr = byService.get(key) ?? [];
    arr.push(r);
    byService.set(key, arr);
  }

  const perService: ServiceStat[] = [...byService.entries()]
    .map(([service, arr]) => {
      const completed = arr.filter((r) => r.status === 'completed');
      const failed = arr.filter((r) => r.status === 'failed').length;
      const inFlight = arr.filter((r) => r.status === 'pending' || r.status === 'processing').length;
      const terminal = completed.length + failed;
      const durs = completed.map(durationSec).filter((d): d is number => d !== null);
      return {
        service,
        total: arr.length,
        completed: completed.length,
        failed,
        inFlight,
        successRate: terminal > 0 ? round(completed.length / terminal) : null,
        avgDurationSec: durs.length ? round(durs.reduce((s, d) => s + d, 0) / durs.length, 1) : null,
      };
    })
    .sort((a, b) => b.total - a.total);

  const total = list.length;
  const completedAll = perService.reduce((s, x) => s + x.completed, 0);
  const failedAll = perService.reduce((s, x) => s + x.failed, 0);
  const inFlightAll = perService.reduce((s, x) => s + x.inFlight, 0);
  const terminalAll = completedAll + failedAll;

  const recentFailures = list
    .filter((r) => r.status === 'failed')
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0))
    .slice(0, maxFailures)
    .map((r) => ({ service: labelOf(r), at: r.updated_at }));

  return {
    windowDays,
    totals: {
      total,
      completed: completedAll,
      failed: failedAll,
      inFlight: inFlightAll,
      successRate: terminalAll > 0 ? round(completedAll / terminalAll) : null,
    },
    perService,
    recentFailures,
  };
}
