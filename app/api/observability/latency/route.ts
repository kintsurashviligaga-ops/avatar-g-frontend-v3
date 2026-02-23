import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getLatencySummary } from '@/lib/observability/runtime';
import { getRouteMetricsSummary, recordRouteMetric } from '@/lib/platform/request-metrics';

export const dynamic = 'force-dynamic';

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

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  if (!isAuthorized(request)) {
    const denied = NextResponse.json({ ok: false, error: 'forbidden', request_id: requestId }, { status: 403 });
    denied.headers.set('x-request-id', requestId);
    recordRouteMetric({
      request_id: requestId,
      route: '/api/observability/latency',
      method: 'GET',
      status: 403,
      duration_ms: Date.now() - startedAt,
      at: Date.now(),
    });
    return denied;
  }

  const response = NextResponse.json({
    ok: true,
    request_id: requestId,
    summary: getLatencySummary(),
    routes: getRouteMetricsSummary(),
  });
  response.headers.set('x-request-id', requestId);

  recordRouteMetric({
    request_id: requestId,
    route: '/api/observability/latency',
    method: 'GET',
    status: 200,
    duration_ms: Date.now() - startedAt,
    at: Date.now(),
  });

  return response;
}
