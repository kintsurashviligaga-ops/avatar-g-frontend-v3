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
    const arr = byService.get(r.service_type) ?? [];
    arr.push(r);
    byService.set(r.service_type, arr);
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
    .map((r) => ({ service: r.service_type, at: r.updated_at }));

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
