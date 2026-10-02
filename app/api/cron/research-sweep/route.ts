/**
 * /api/cron/research-sweep — the safety net under Deep Research, every minute.
 *
 * Polls the running jobs that are due and settles what finished (report stored, ONE notification filed), refunds what failed,
 * timed out or was cancelled, resumes a charged-but-unsent job (exactly one POST, by compare-and-set), refunds a job whose
 * start died mid-POST (never re-sent), and retries refunds that did not land. Idempotent end to end — every step is a
 * compare-and-set or an idempotent ledger ref — so overlapping ticks (or a tick racing a read-through refresh) are harmless.
 *
 * CRON_SECRET-gated through lib/api/cronAuth and REFUSING when the secret is unset (never runs unauthenticated). Skips quietly
 * (200, `skipped`) while the table is not migrated.
 *
 * ⚠️ NEEDS A vercel.json ENTRY (the integrator adds it; the file is the billing owner's):
 *     { "path": "/api/cron/research-sweep", "schedule": "* * * * *" }
 * `app/api/cron/**` already gets maxDuration 60; the sweep stops starting work at 30 s and every poll ends within 12 s.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/api/cronAuth';
import { opsMarker } from '@/lib/observability/reliability';
import { reportError } from '@/lib/observability/report-error';
import { tableReady } from '@/lib/research/capabilities';
import { getResearchRuntime } from '@/lib/research/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

async function handle(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const rt = getResearchRuntime();
  if (!rt) return NextResponse.json({ ok: false, error: 'unavailable' }, { status: 503 });
  if (!(await tableReady(rt.db as never, 'research_jobs'))) return NextResponse.json({ ok: true, skipped: 'schema' });
  try {
    const report = await rt.service.sweep();
    if (report.errors > 0 || report.stuckReserving > 0 || report.stuckSubmitting > 0) opsMarker('warn', 'research_sweep', { ...report });
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    reportError(e, { route: '/api/cron/research-sweep' });
    opsMarker('error', 'research_sweep_failure', { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
