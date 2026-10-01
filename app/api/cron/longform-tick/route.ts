/**
 * /api/cron/longform-tick — advances long-form (8 s … 240 s) films one step: lease jobs, apply the state machine
 * (lib/video/longform/stateMachine.ts), submit / poll Veo clips, reserve credits per act, refund failed scenes,
 * stitch finished films. All the logic lives in lib/video/longform/tick.ts; this route is the gate and the wiring.
 *
 * ⚠️ SHIPS DARK. Unless LONGFORM_VIDEO_ENABLED is truthy the route answers 404 BEFORE authenticating or touching
 * anything — a disabled feature neither runs nor confirms it exists. When enabled it is CRON_SECRET-gated through
 * the shared lib/api/cronAuth (Bearer from Vercel Cron, x-cron-token for manual runs) and refuses when the secret is
 * unset — never "no secret, no check".
 *
 * ⚠️ NO vercel.json cron entry yet — scheduling it is an activation step (docs/video/LONGFORM.md), as is a
 * `functions` entry giving this route the 300 s below: the `app/api/cron/**` glob in vercel.json grants 60 s, so the
 * tick budget defaults to 50 s (LONGFORM_TICK_BUDGET_MS) and a stitch, which needs more, is deferred until it is raised.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/api/cronAuth';
import { reportError } from '@/lib/observability/report-error';
import { opsMarker } from '@/lib/observability/reliability';
import { isLongformEnabled } from '@/lib/video/longform/plan';
import { createLongformTickDeps } from '@/lib/video/longform/runtime';
import { runLongformTick, type LongformTickDeps } from '@/lib/video/longform/tick';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function envMs(name: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

async function handle(req: NextRequest) {
  if (!isLongformEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let deps: LongformTickDeps;
  try {
    deps = createLongformTickDeps();
  } catch (e) {
    reportError(e, { route: '/api/cron/longform-tick', stage: 'deps' });
    return NextResponse.json({ ok: false, error: 'unavailable' }, { status: 503 });
  }

  try {
    const timeBudgetMs = envMs('LONGFORM_TICK_BUDGET_MS', 50_000, 10_000, 285_000);
    const report = await runLongformTick(deps, {
      timeBudgetMs,
      // The lease outlives the tick, so a slow tick is never overlapped on the same job.
      leaseSec: Math.ceil(timeBudgetMs / 1000) + 60,
      maxJobs: envMs('LONGFORM_TICK_MAX_JOBS', 5, 1, 20),
      minStitchBudgetMs: envMs('LONGFORM_MIN_STITCH_BUDGET_MS', 120_000, 10_000, 285_000),
    });
    if (
      report.errors > 0 || report.refundMisses > 0 || report.stitchDeferred > 0 || report.timeBudgetExhausted ||
      report.fileMisses > 0 || report.cleanupMisses > 0
    ) {
      opsMarker('warn', 'longform_tick', { ...report });
    }
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    // runLongformTick never throws by contract; this is the belt to that brace.
    reportError(e, { route: '/api/cron/longform-tick' });
    opsMarker('error', 'longform_tick_failure', { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
