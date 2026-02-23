import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getRedisRuntimeKind } from '@/lib/platform/redis';
import { recordRouteMetric } from '@/lib/platform/request-metrics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function hasValue(name: string): boolean {
  return Boolean(process.env[name] && String(process.env[name]).trim().length > 0);
}

export async function GET(): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  const status = {
    ok: true,
    request_id: requestId,
    timestamp: new Date().toISOString(),
    env: {
      node_env_set: hasValue('NODE_ENV'),
      vercel_env_set: hasValue('VERCEL_ENV'),
      vercel_url_set: hasValue('VERCEL_URL'),
      supabase_url_set: hasValue('NEXT_PUBLIC_SUPABASE_URL') || hasValue('SUPABASE_URL'),
      supabase_service_role_set: hasValue('SUPABASE_SERVICE_ROLE_KEY'),
      stripe_secret_set: hasValue('STRIPE_SECRET_KEY'),
      stripe_webhook_secret_set: hasValue('STRIPE_WEBHOOK_SECRET'),
      worker_token_set: hasValue('WORKER_INTERNAL_TOKEN'),
      telegram_bot_token_set: hasValue('TELEGRAM_BOT_TOKEN'),
      telegram_webhook_secret_set: hasValue('TELEGRAM_WEBHOOK_SECRET'),
      whatsapp_verify_token_set: hasValue('WHATSAPP_VERIFY_TOKEN'),
      whatsapp_app_secret_set: hasValue('WHATSAPP_APP_SECRET'),
      observability_token_set: hasValue('OBSERVABILITY_DASHBOARD_TOKEN'),
    },
    runtime: {
      redis_backend: getRedisRuntimeKind(),
      redis_configured: getRedisRuntimeKind() === 'redis',
    },
  };

  const response = NextResponse.json(status, { status: 200 });
  response.headers.set('x-request-id', requestId);

  recordRouteMetric({
    request_id: requestId,
    route: '/api/env_integrity_status',
    method: 'GET',
    status: 200,
    duration_ms: Date.now() - startedAt,
    at: Date.now(),
  });

  return response;
}
