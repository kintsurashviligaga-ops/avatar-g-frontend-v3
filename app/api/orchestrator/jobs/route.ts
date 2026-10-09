/**
 * GET /api/orchestrator/jobs — reload-recovery feed (#5).
 *
 * Returns the authenticated user's most-recent generation jobs (newest first)
 * so the chat shell can, on mount, re-hydrate finished media and resume polling
 * any still-running pipeline after a browser reload / cross-device handoff.
 *
 * Reads through the user's own session client so RLS enforces owner-only access.
 * Unauthenticated → an empty list (200), never a 401: recovery is additive UI,
 * not a gated action.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest, createServiceRoleClient } from '@/lib/supabase/server';
import { JOB_COLUMNS, type GenerationJobRow } from '@/lib/orchestrator/jobs';
import { serviceTypeForKind } from '@/lib/jobs/durableJobs';
import { describeSupabaseObjectUrl, ownStorageHosts } from '@/lib/orchestrator/storage-adapter';
import { callerMayRead } from '@/lib/security/callerMedia';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const clampPct = (n: unknown): number => {
  const v = Number(n);
  return !Number.isFinite(v) ? 0 : v < 0 ? 0 : v > 100 ? 100 : Math.round(v);
};

interface TrackBody {
  op?: 'create' | 'update' | 'complete' | 'fail' | 'position';
  id?: string;
  kind?: string;
  stage?: string;
  pct?: number;
  url?: string;
  error?: string;
  params?: Record<string, unknown>;
  /** 1-based queue position while waiting; null once rendering / terminal. */
  position?: number | null;
}

/**
 * POST /api/orchestrator/jobs — DURABLE PROGRESS write-side. The local composer persists a
 * placeholder generation_jobs row for each Image / Product / Swap job (row `id` === the
 * tray jobId, so the hydration poll dedupes it via mergeTrayJobs), then syncs stage/pct/
 * result as the render progresses — so a mid-flight reload recovers the correct baseline.
 *
 * ⚠️ A PROGRESS NOTE, NEVER A BILLING RECORD (security, 2026-10-01). The stale-render drainer
 * (/api/cron/drain-renders) refunds a `processing` row older than 30 min that carries `params._reserve`.
 * This route used to write through the USER'S session client (RLS owner insert/update), so a user could
 * (a) create a row whose params carried any `_reserve` ref of their own, or (b) flip a server-written,
 * DELIVERED, charged row back to `processing` by id — and 30 minutes later be refunded for a render
 * they had received. Now: writes go through the service role, scoped to the caller's user_id by hand;
 * client params lose every `_`-prefixed key (server bookkeeping); status changes touch only
 * still-running rows that carry NO server reservation, so a finished or billed row can never be
 * resurrected. The owner insert/update RLS policies are dropped (20261001f) — this route is the only
 * user-facing writer. Fully fail-open + additive: any miss returns 200 and NEVER blocks the render.
 * Unauth → 200 no-op.
 */
/**
 * May this client-reported result URL be filed? Anything not on our storage host, or a public URL (never re-signed),
 * is filed as given. A signed URL of ours must pass the caller check: own upload, own Library row, or a live token.
 */
async function mayFileUrl(url: string, userId: string): Promise<boolean> {
  const ref = describeSupabaseObjectUrl(url);
  if (!ref || ref.access !== 'sign' || !ownStorageHosts().has(ref.host)) return true;
  return callerMayRead(url, ref, userId);
}

/** Client params minus server bookkeeping: every `_`-prefixed key (`_reserve`, …) is the server's alone. */
function clientParams(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([k]) => !k.startsWith('_')));
}

export async function POST(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ ok: false, skipped: 'unauth' });
  let supabase: ReturnType<typeof createServiceRoleClient>;
  try { supabase = createServiceRoleClient(); } catch { return NextResponse.json({ ok: false, skipped: 'unconfigured' }); }
  // Every status write is confined to the caller's OWN, still-running, client-tracked rows.
  const ownLive = () => supabase.from('generation_jobs');

  let body: TrackBody;
  try {
    body = (await req.json()) as TrackBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id.slice(0, 120) : '';
  if (!id || !body.op) return NextResponse.json({ ok: false, error: 'id + op required' }, { status: 400 });

  try {
    if (body.op === 'create') {
      // Upsert a placeholder (pending). onConflict:id keeps a re-fired create idempotent.
      const base: Record<string, unknown> = {
        id,
        user_id: user.id,
        service_type: serviceTypeForKind(body.kind),
        status: 'pending',
        current_stage: typeof body.stage === 'string' ? body.stage.slice(0, 120) : 'queued',
        pct: clampPct(body.pct),
        params: clientParams(body.params),
      };
      const pos = typeof body.position === 'number' && body.position > 0 ? Math.floor(body.position) : null;
      // Try WITH the position column; if the migration hasn't landed yet the column is unknown, so
      // retry WITHOUT it — the core placeholder row must always be written (migration-order-safe).
      // ⚠️ CREATE MUST NOT CLOBBER A ROW THAT HAS ALREADY ADVANCED. The queue starts the runner
      // SYNCHRONOUSLY inside submit(), so the runner's first trackJobUpdate('Rendering', 8) is dispatched
      // BEFORE this create — and then this create landed second and overwrote it back to
      // status:'pending' / stage:'queued' / pct:0. Nothing wrote the row again for the rest of the
      // render, which is why another device's tray showed the literal word "queued" at 0% for the whole
      // job. `ignoreDuplicates` makes the create a no-op once the row exists, so the later real progress
      // write wins regardless of which of the two arrives first.
      let { error } = await supabase.from('generation_jobs').upsert({ ...base, position_in_queue: pos }, { onConflict: 'id', ignoreDuplicates: true });
      if (error && /position_in_queue/i.test(error.message)) {
        // ignoreDuplicates here too: through the service role an overwrite would reach ANY user's row with that id.
        ({ error } = await supabase.from('generation_jobs').upsert(base, { onConflict: 'id', ignoreDuplicates: true }));
      }
      if (error) return NextResponse.json({ ok: false, error: error.message });
    } else if (body.op === 'position') {
      // ISOLATED position write (Task 6): mirror the live queue position WITHOUT touching status,
      // so a still-queued job stays pending. Best-effort — a pre-migration column-miss just no-ops.
      const pos = typeof body.position === 'number' && body.position > 0 ? Math.floor(body.position) : null;
      const { error } = await ownLive().update({ position_in_queue: pos }).eq('id', id).eq('user_id', user.id).in('status', ['pending', 'processing']);
      if (error) return NextResponse.json({ ok: false, error: error.message });
    } else if (body.op === 'update') {
      // Never resurrects a finished row, never touches one the server billed (it carries `_reserve`).
      const { error } = await ownLive()
        .update({ status: 'processing', current_stage: typeof body.stage === 'string' ? body.stage.slice(0, 120) : null, pct: clampPct(body.pct) })
        .eq('id', id).eq('user_id', user.id).in('status', ['pending', 'processing']).is('params->_reserve', null);
      if (error) return NextResponse.json({ ok: false, error: error.message });
    } else if (body.op === 'complete') {
      const url = typeof body.url === 'string' ? body.url.slice(0, 2000) : null;
      // ⚠️ THE LIBRARY RE-SIGNS THIS URL WITH THE SERVICE ROLE on every read (app/api/studio/library), and so does
      // every editor that trusts the caller's own Library rows (lib/security/callerMedia). A client-chosen URL naming
      // ANOTHER account's object (a path learnt elsewhere, an expired link someone kept) would have become a
      // permanent, freshly signed link to it. A URL of ours is filed only when the caller can read it right now.
      if (url && !(await mayFileUrl(url, user.id))) return NextResponse.json({ ok: false, error: 'url_not_verified' });
      const { error } = await ownLive()
        .update({ status: 'completed', pct: 100, signed_url: url })
        .eq('id', id).eq('user_id', user.id).in('status', ['pending', 'processing']).is('params->_reserve', null);
      if (error) return NextResponse.json({ ok: false, error: error.message });
    } else if (body.op === 'fail') {
      const { error } = await ownLive()
        .update({ status: 'failed', error: typeof body.error === 'string' ? body.error.slice(0, 500) : 'failed' })
        .eq('id', id).eq('user_id', user.id).in('status', ['pending', 'processing']).is('params->_reserve', null);
      if (error) return NextResponse.json({ ok: false, error: error.message });
    } else {
      return NextResponse.json({ ok: false, error: 'unknown op' }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Fail-open: a DB/table miss must never surface as a render error.
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' });
  }
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ jobs: [] });

  // Optional `?status=active` narrows to in-flight rows.
  const onlyActive = req.nextUrl.searchParams.get('status') === 'active';
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 12) || 12));

  // Include position_in_queue so the tray can restore the queue layout; fall back to the base
  // columns if the migration hasn't landed yet (so hydration keeps working, just without positions).
  const run = async (cols: string) => {
    let query = supabase
      .from('generation_jobs')
      .select(cols)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (onlyActive) query = query.in('status', ['pending', 'processing']);
    return query;
  };

  try {
    let { data, error } = await run(`${JOB_COLUMNS},position_in_queue`);
    if (error && /position_in_queue/i.test(error.message ?? '')) {
      ({ data, error } = await run(JOB_COLUMNS));
    }
    if (error || !Array.isArray(data)) return NextResponse.json({ jobs: [] });
    return NextResponse.json({ jobs: data as unknown as GenerationJobRow[] });
  } catch {
    return NextResponse.json({ jobs: [] });
  }
}
