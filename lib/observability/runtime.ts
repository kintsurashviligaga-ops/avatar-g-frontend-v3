import { createServiceRoleClient } from '@/lib/supabase/server';

type LatencySample = {
  route: string;
  provider: string;
  durationMs: number;
  at: number;
};

const SAMPLE_MAX = 1000;
const samples: LatencySample[] = [];

function toPercentile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * percentile)));
  return sorted[index] ?? 0;
}

export async function logRouteExecution(input: {
  request_id: string;
  user_id: string | null;
  org_id: string | null;
  route: string;
  duration_ms: number;
  status_code: number;
  plan: string | null;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from('runtime_logs').insert({
    request_id: input.request_id,
    user_id: input.user_id,
    org_id: input.org_id,
    route: input.route,
    duration_ms: input.duration_ms,
    status_code: input.status_code,
    plan: input.plan,
    created_at: new Date().toISOString(),
  });
}

export async function logJobExecution(input: {
  job_id: string;
  queue: string;
  duration_ms: number;
  retries: number;
  status: string;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from('job_runtime_logs').insert({
    job_id: input.job_id,
    queue: input.queue,
    duration_ms: input.duration_ms,
    retries: input.retries,
    status: input.status,
    created_at: new Date().toISOString(),
  });
}

export function recordLatencySample(route: string, provider: string, durationMs: number): void {
  samples.push({
    route,
    provider,
    durationMs,
    at: Date.now(),
  });

  if (samples.length > SAMPLE_MAX) {
    samples.splice(0, samples.length - SAMPLE_MAX);
  }
}

export function getLatencySummary(): {
  total_samples: number;
  by_route: Record<string, { p50: number; p95: number; count: number }>;
  by_provider: Record<string, { p50: number; p95: number; count: number }>;
} {
  const byRoute: Record<string, number[]> = {};
  const byProvider: Record<string, number[]> = {};

  for (const sample of samples) {
    byRoute[sample.route] = byRoute[sample.route] ?? [];
    byRoute[sample.route]?.push(sample.durationMs);

    byProvider[sample.provider] = byProvider[sample.provider] ?? [];
    byProvider[sample.provider]?.push(sample.durationMs);
  }

  const routeSummary: Record<string, { p50: number; p95: number; count: number }> = {};
  for (const [route, values] of Object.entries(byRoute)) {
    const sorted = [...values].sort((a, b) => a - b);
    routeSummary[route] = {
      p50: toPercentile(sorted, 0.5),
      p95: toPercentile(sorted, 0.95),
      count: sorted.length,
    };
  }

  const providerSummary: Record<string, { p50: number; p95: number; count: number }> = {};
  for (const [provider, values] of Object.entries(byProvider)) {
    const sorted = [...values].sort((a, b) => a - b);
    providerSummary[provider] = {
      p50: toPercentile(sorted, 0.5),
      p95: toPercentile(sorted, 0.95),
      count: sorted.length,
    };
  }

  return {
    total_samples: samples.length,
    by_route: routeSummary,
    by_provider: providerSummary,
  };
}
