type RouteMetricSample = {
  request_id: string;
  route: string;
  method: string;
  status: number;
  duration_ms: number;
  at: number;
};

const METRIC_MAX = 5000;
const routeSamples: RouteMetricSample[] = [];

function toPercentile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * percentile)));
  return sorted[index] ?? 0;
}

export function recordRouteMetric(sample: RouteMetricSample): void {
  routeSamples.push(sample);
  if (routeSamples.length > METRIC_MAX) {
    routeSamples.splice(0, routeSamples.length - METRIC_MAX);
  }
}

export function getRouteMetricsSummary(): {
  total_samples: number;
  by_route: Record<string, { count: number; p50: number; p95: number; p99: number }>;
  recent_request_ids: string[];
} {
  const grouped: Record<string, number[]> = {};
  for (const sample of routeSamples) {
    const key = `${sample.method} ${sample.route} ${sample.status}`;
    grouped[key] = grouped[key] ?? [];
    grouped[key]?.push(sample.duration_ms);
  }

  const byRoute: Record<string, { count: number; p50: number; p95: number; p99: number }> = {};
  for (const [key, values] of Object.entries(grouped)) {
    const sorted = [...values].sort((a, b) => a - b);
    byRoute[key] = {
      count: sorted.length,
      p50: toPercentile(sorted, 0.5),
      p95: toPercentile(sorted, 0.95),
      p99: toPercentile(sorted, 0.99),
    };
  }

  return {
    total_samples: routeSamples.length,
    by_route: byRoute,
    recent_request_ids: routeSamples.slice(-20).map((sample) => sample.request_id),
  };
}
