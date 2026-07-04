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
import { authedClientFromRequest } from '@/lib/supabase/server';
import { JOB_COLUMNS, type GenerationJobRow } from '@/lib/orchestrator/jobs';
import { serviceTypeForKind } from '@/lib/jobs/durableJobs';

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
 * Writes go through the USER'S OWN session client, so RLS (owner insert/update) guarantees
 * a caller can only touch their own rows. Fully fail-open + additive: any miss returns 200
 * and NEVER blocks the render (the client fires these best-effort). Unauth → 200 no-op.
 */
export async function POST(req: NextRequest) {
  const { supabase, user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ ok: false, skipped: 'unauth' });

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
        params: body.params && typeof body.params === 'object' ? body.params : {},
      };
      const pos = typeof body.position === 'number' && body.position > 0 ? Math.floor(body.position) : null;
      // Try WITH the position column; if the migration hasn't landed yet the column is unknown, so
      // retry WITHOUT it — the core placeholder row must always be written (migration-order-safe).
      let { error } = await supabase.from('generation_jobs').upsert({ ...base, position_in_queue: pos }, { onConflict: 'id' });
      if (error && /position_in_queue/i.test(error.message)) {
        ({ error } = await supabase.from('generation_jobs').upsert(base, { onConflict: 'id' }));
      }
      if (error) return NextResponse.json({ ok: false, error: error.message });
    } else if (body.op === 'position') {
      // ISOLATED position write (Task 6): mirror the live queue position WITHOUT touching status,
      // so a still-queued job stays pending. Best-effort — a pre-migration column-miss just no-ops.
      const pos = typeof body.position === 'number' && body.position > 0 ? Math.floor(body.position) : null;
      const { error } = await supabase.from('generation_jobs').update({ position_in_queue: pos }).eq('id', id);
      if (error) return NextResponse.json({ ok: false, error: error.message });
    } else if (body.op === 'update') {
      // RLS scopes the update to the owner; we match by id only.
      const { error } = await supabase
        .from('generation_jobs')
        .update({ status: 'processing', current_stage: typeof body.stage === 'string' ? body.stage.slice(0, 120) : null, pct: clampPct(body.pct) })
        .eq('id', id);
      if (error) return NextResponse.json({ ok: false, error: error.message });
    } else if (body.op === 'complete') {
      const { error } = await supabase
        .from('generation_jobs')
        .update({ status: 'completed', pct: 100, signed_url: typeof body.url === 'string' ? body.url.slice(0, 2000) : null })
        .eq('id', id);
      if (error) return NextResponse.json({ ok: false, error: error.message });
    } else if (body.op === 'fail') {
      const { error } = await supabase
        .from('generation_jobs')
        .update({ status: 'failed', error: typeof body.error === 'string' ? body.error.slice(0, 500) : 'failed' })
        .eq('id', id);
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
