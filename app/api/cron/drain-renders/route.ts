/**
 * /api/cron/drain-renders — the serverless render-drainer tick (Phase 92).
 *
 * A Vercel cron fires this on a schedule; it advances background render housekeeping WITHOUT holding a
 * request open (serverless-correct — no daemon). SHIPPED INERT: it does nothing unless BOTH a CRON_SECRET
 * gate passes AND `RENDER_DRAINER_ENABLED` is explicitly set, so it is 100% safe to deploy on main and is
 * activated deliberately (flip the env flag) only after staging. Backward-compatible: the browser still
 * drives live renders; this is an additive safety net.
 *
 * Current leg (the SAFE first capability): REAP genuinely-abandoned jobs — a `processing` generation_jobs
 * row untouched for > RENDER_STALE_THRESHOLD_MS (30 min, well beyond the ~10-min max render, so a live
 * browser-driven render is never touched) is marked `failed`, giving the user a terminal state instead of
 * an eternal spinner. The full leg-advancing drainer (dispatch | poll | assemble) + a refund-on-reap
 * reconciliation are deliberate later steps (see lib/pipeline/renderDrainer). Strictly fail-open.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { failJob } from '@/lib/orchestrator/jobs';
import { refundCredits } from '@/lib/orchestrator/ledger';
import { selectReapable, reapReserve, drainerEnabled, RENDER_STALE_THRESHOLD_MS, type DrainJobRow } from '@/lib/pipeline/renderDrainer';
import { reportError } from '@/lib/observability/report-error';
import { opsMarker } from '@/lib/observability/reliability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_REAP_PER_TICK = 25;

/** Vercel cron sends `Authorization: Bearer $CRON_SECRET`; also accept x-cron-token for manual runs.
 *  With no CRON_SECRET configured we REFUSE (never run unauthenticated). */
function authorized(req: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}` || req.headers.get('x-cron-token') === secret;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  // INERT unless explicitly opted in — a mis-timed claim can never kill a live render on main.
  if (!drainerEnabled()) return NextResponse.json({ ok: true, enabled: false, drained: 0 });

  let reaped = 0;
  let refunded = 0;
  try {
    const sb = createServiceRoleClient();
    const staleIso = new Date(Date.now() - RENDER_STALE_THRESHOLD_MS).toISOString();
    const { data } = await sb
      .from('generation_jobs')
      .select('id, status, updated_at, user_id, params')
      .eq('status', 'processing')
      .lt('updated_at', staleIso)
      .order('updated_at', { ascending: true })
      .limit(MAX_REAP_PER_TICK);
    // Double-guard: the SQL filter AND the pure invariant must both agree a row is abandoned.
    const reapable = selectReapable((data ?? []) as DrainJobRow[], Date.now());
    for (const j of reapable) {
      // Refund the up-front reservation FIRST — while the row is still `processing`. If failJob landed
      // first and the refund then failed, the next tick could no longer re-reap (status → failed) and the
      // credit-back would be lost forever. refund_credits is idempotent on `${ref}:refund` — the exact ref
      // the in-route refundProduce uses — so this collapses to EXACTLY ONE credit-back whether the in-route
      // finally ran, this drainer ran, or (after a failJob miss) a later tick re-runs it. Only charged
      // reservations carry `_reserve`; free-slot / skipped renders yield null → never minted.
      const rr = reapReserve(j);
      if (rr) {
        const res = await refundCredits(rr.userId, rr.credits, `${rr.ref}:refund`).catch(() => null);
        if (res?.ok) refunded++;
      }
      await failJob(j.id, 'render abandoned (tab closed) — reaped by drainer');
      reaped++;
    }
    // WS4 — surface drainer activity: a non-zero reap means renders were abandoned mid-flight (degraded),
    // and a mismatch (reaped > refunded) is a credit-back gap worth watching. Alertable ops marker.
    if (reaped > 0) opsMarker('warn', 'render_drainer_reap', { reaped, refunded, unrefunded: reaped - refunded });
  } catch (e) {
    // WS4 — this catch used to be a fully SILENT fail-open (a broken drainer produced zero signal). Keep
    // fail-open (a bad tick must never 500 the cron) but emit a durable, alertable failure marker + Sentry.
    reportError(e, { route: '/api/cron/drain-renders', reaped, refunded });
    opsMarker('error', 'render_drainer_failure', { reaped, refunded, error: e instanceof Error ? e.message : String(e) });
  }
  return NextResponse.json({ ok: true, enabled: true, drained: reaped, refunded });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
