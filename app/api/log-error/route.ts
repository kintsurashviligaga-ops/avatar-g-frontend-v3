import { NextRequest } from 'next/server';

import { apiError, apiSuccess } from '@/lib/api/response';
import { RATE_LIMITS, checkRateLimit } from '@/lib/api/rate-limit';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sanitizeLiveContext, type LiveTelemetryPayload } from '@/lib/voice/liveTelemetry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Error logging requires nodejs for Supabase

/**
 * POST /api/log-error — client error reports (the app error boundaries, Live voice failures).
 *
 * ⚠️ THREE THINGS MADE THIS A BLACK HOLE, fixed here:
 *  1. The "10 per minute per IP" limit was a comment — the IP was read and stored, never counted. It now runs through
 *     the shared limiter (the WRITE budget, in its own per-IP bucket so reports never spend a user's write budget).
 *  2. The insert used columns (`error_type, error_message, page_url, …`) that the table does not have
 *     (supabase/migrations/20260226_create_error_logs.sql: route, message, code, details, severity, meta), so every
 *     insert failed, and the failure branch logged only the DB error — the report itself vanished. The insert now
 *     matches the migration, AND in production every report is printed as one `[client-report]` line BEFORE the
 *     insert, so it reaches the Vercel logs even when the database cannot take it.
 *  3. Nothing could carry structured context. An optional `context` object is accepted now — allow-listed and capped
 *     at 2 KB by lib/voice/liveTelemetry's sanitizer (the same one the client uses).
 *
 * Reporting must never break the page: every failure past validation still answers 200.
 */

/** Everything a report can legitimately need, with room for a trimmed stack; a larger body is not a report. */
const MAX_BODY_BYTES = 16 * 1024;
const MAX_CONTEXT_BYTES = 2048;

interface ErrorLogBody {
  message?: unknown;
  url?: unknown;
  digest?: unknown;
  stack?: unknown;
  timestamp?: unknown;
  userAgent?: unknown;
  context?: unknown;
}

const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v ? v.slice(0, max) : undefined);

/** Path only: a query string or fragment can carry anything (a shared link, an OAuth code) and is not ours to keep. */
function pathOf(url: string): string {
  try { return new URL(url).pathname.slice(0, 300); } catch { return url.split(/[?#]/)[0]!.slice(0, 300); }
}

export async function POST(request: NextRequest) {
  // Own bucket inside the WRITE budget: `identity` scopes the key to this route (rl:write:<ip>:log-error), so an
  // error storm is capped at 20/min per IP without touching the IP's budget for real writes.
  const limited = await checkRateLimit(request, RATE_LIMITS.WRITE, 'log-error');
  if (limited) return limited;

  let body: ErrorLogBody;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return apiError('Payload too large', 413, 'Payload too large');
    body = JSON.parse(raw) as ErrorLogBody; // sendBeacon posts text/plain — parse the text, not by content type
  } catch {
    return apiError('Invalid JSON', 400, 'Invalid JSON');
  }
  if (!body || typeof body !== 'object') return apiError('Invalid body', 400, 'Invalid body');

  const message = str(body.message, 500);
  const url = str(body.url, 2000);
  if (!message || !url) return apiError('Missing required fields: message, url', 400);

  let context: LiveTelemetryPayload | null = null;
  if (body.context !== undefined && body.context !== null) {
    let size = 0;
    try { size = Buffer.byteLength(JSON.stringify(body.context), 'utf8'); } catch { size = Infinity; }
    if (size > MAX_CONTEXT_BYTES) return apiError('Context too large', 413, 'Context too large');
    context = sanitizeLiveContext(body.context);
    if (!context) return apiError('Invalid context', 400, 'Invalid context');
  }

  const route = pathOf(url);
  const userAgent = str(body.userAgent, 300) ?? str(request.headers.get('user-agent'), 300);
  const report = {
    kind: context ? context.kind : 'client_error',
    message,
    route,
    ...(str(body.digest, 100) ? { digest: str(body.digest, 100) } : {}),
    ...(userAgent ? { ua: userAgent } : {}),
    ...(context ? { context } : {}),
  };

  // Only log in production
  if (process.env.NODE_ENV !== 'production') {
    console.info('[client-report]', JSON.stringify(report));
    return apiSuccess({ logged: false, reason: 'development' });
  }

  // FIRST, unconditionally: the Vercel log line is the report of record; the table is a convenience on top.
  console.warn('[client-report]', JSON.stringify(report));

  try {
    const supabase = createServiceRoleClient();
    const { error: insertError } = await supabase.from('error_logs').insert({
      route,
      message,
      code: context?.name ?? context?.code ?? str(body.digest, 100) ?? null,
      severity: context ? 'warn' : 'error',
      details: {
        ...(context ? { context } : {}),
        ...(str(body.stack, 2000) ? { stack: str(body.stack, 2000) } : {}),
        ...(str(body.digest, 100) ? { digest: str(body.digest, 100) } : {}),
      },
      meta: {
        kind: report.kind,
        ...(userAgent ? { ua: userAgent } : {}),
        ...(str(body.timestamp, 40) ? { clientTimestamp: str(body.timestamp, 40) } : {}),
        env: process.env.VERCEL_ENV || 'unknown',
      },
    });
    if (insertError) {
      // The report itself is already in the logs above; this line only says the table did not take it.
      console.error('[client-report] insert failed', insertError.message ?? insertError);
      return apiSuccess({ logged: false, reason: 'database_unavailable' });
    }
    return apiSuccess({ logged: true });
  } catch (dbError) {
    console.error('[client-report] insert threw', dbError instanceof Error ? dbError.message : dbError);
    return apiSuccess({ logged: false, reason: 'server_error' });
  }
}
