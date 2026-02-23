import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getLatencySummary } from '@/lib/observability/runtime';
import { getRouteMetricsSummary, recordRouteMetric } from '@/lib/platform/request-metrics';
import { getQueueSnapshot } from '@/lib/platform/queues';
import { getRedisRuntimeKind } from '@/lib/platform/redis';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function normalize(value: string | null | undefined): string {
  return String(value || '').trim();
}

function isAuthorized(request: Request): boolean {
  const expected = normalize(process.env.OBSERVABILITY_DASHBOARD_TOKEN);
  if (!expected) {
    return process.env.NODE_ENV !== 'production';
  }

  const bearer = normalize(request.headers.get('authorization')).replace(/^Bearer\s+/i, '');
  const custom = normalize(request.headers.get('x-observability-token'));
  return bearer === expected || custom === expected;
}

export async function GET(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  if (!isAuthorized(request)) {
    const denied = NextResponse.json({ ok: false, error: 'forbidden', request_id: requestId }, { status: 403 });
    denied.headers.set('x-request-id', requestId);
    recordRouteMetric({
      request_id: requestId,
      route: '/api/observability/dashboard',
      method: 'GET',
      status: 403,
      duration_ms: Date.now() - startedAt,
      at: Date.now(),
    });
    return denied;
  }

  const payload = {
    ok: true,
    request_id: requestId,
    timestamp: new Date().toISOString(),
    runtime: {
      redis_backend: getRedisRuntimeKind(),
    },
    queues: await getQueueSnapshot(),
    latency: getLatencySummary(),
    routes: getRouteMetricsSummary(),
  };

  const response = NextResponse.json(payload, { status: 200 });
  response.headers.set('x-request-id', requestId);

  recordRouteMetric({
    request_id: requestId,
    route: '/api/observability/dashboard',
    method: 'GET',
    status: 200,
    duration_ms: Date.now() - startedAt,
    at: Date.now(),
  });

  return response;
}
