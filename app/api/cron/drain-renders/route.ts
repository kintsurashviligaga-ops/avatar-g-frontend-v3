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
import { selectReapable, drainerEnabled, RENDER_STALE_THRESHOLD_MS, type DrainJobRow } from '@/lib/pipeline/renderDrainer';

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
  try {
    const sb = createServiceRoleClient();
    const staleIso = new Date(Date.now() - RENDER_STALE_THRESHOLD_MS).toISOString();
    const { data } = await sb
      .from('generation_jobs')
      .select('id, status, updated_at')
      .eq('status', 'processing')
      .lt('updated_at', staleIso)
      .order('updated_at', { ascending: true })
      .limit(MAX_REAP_PER_TICK);
    // Double-guard: the SQL filter AND the pure invariant must both agree a row is abandoned.
    const reapable = selectReapable((data ?? []) as DrainJobRow[], Date.now());
    for (const j of reapable) {
      await failJob(j.id, 'render abandoned (tab closed) — reaped by drainer');
      reaped++;
    }
  } catch {
    /* fail-open — a bad tick is a silent no-op, never a 500 that alarms the cron */
  }
  return NextResponse.json({ ok: true, enabled: true, drained: reaped });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
