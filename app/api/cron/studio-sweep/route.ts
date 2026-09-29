/**
 * /api/cron/studio-sweep — the safety net under the studio saga, every minute (vercel.json).
 *
 * Settles everything a lost webhook or a killed instance could leave behind: stuck reservations, a POST that
 * never answered, provider requests to poll, outputs still to copy into our storage, refunds that failed to
 * land, and the local queue waiting for a provider concurrency slot. Idempotent end to end — every step is a
 * compare-and-set or an idempotent ledger ref — so overlapping ticks are harmless.
 *
 * CRON_SECRET-gated and refusing when the secret is unset (never runs unauthenticated). NOT behind STUDIO_V2.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getStudioRuntime } from '@/lib/studio/runtime';
import { reportError } from '@/lib/observability/report-error';
import { opsMarker } from '@/lib/observability/reliability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}` || req.headers.get('x-cron-token') === secret;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const rt = getStudioRuntime();
  if (!rt) return NextResponse.json({ ok: false, error: 'unavailable' }, { status: 503 });
  try {
    const report = await rt.saga.sweep();
    if (report.errors > 0 || report.unknownExpired > 0) opsMarker('warn', 'studio_sweep', { ...report });
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    reportError(e, { route: '/api/cron/studio-sweep' });
    opsMarker('error', 'studio_sweep_failure', { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
