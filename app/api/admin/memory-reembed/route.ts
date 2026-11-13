import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest, createServiceRoleClient } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { embed, EMBEDDING_MODEL_TAG } from '@/lib/memory/embed';
import {
  pendingFilter,
  reembedBatch,
  REEMBED_TEXT_COLUMN,
  type ReembedDeps,
} from '@/lib/memory/reembed';
import { reportError } from '@/lib/observability/report-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/admin/memory-reembed — give rows written before supabase/migrations/20261113a_embedding_model.sql a
 * gemini-embedding-001 vector (v5.1 M-14, chat memory OpenAI → Google). ADMIN ONLY (404 otherwise).
 *
 * Body: { table?: 'memories' (the default and the only one), dryRun?: boolean (default TRUE), limit?: 1..200
 *         (default 50), cursor?: string | null }
 * The RAG corpus (rag_documents) is not in Production; where it exists, rebuild it with
 * `node scripts/rag-ingest.mjs <dir> --reset`, which now embeds on Vertex and tags each row.
 * Answers one batch: { pendingBefore, scanned, updated, failed, failedIds, nextCursor, stopped? }. Call again with nextCursor
 * until it is null. A batch stops early at ~40 s ('time_budget', just call again) or after 3 misses in a row
 * ('repeated_failures': Vertex or the DB is down, check /api/health/embed first). A dry run embeds and writes nothing. A real run is a paid Vertex embed per row
 * (gemini-embedding-001, a fraction of a cent per thousand rows); the fact text never leaves Google and Supabase.
 * Requires the migration to be applied first (the route answers 409 if the column is missing).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req);
  if (!(await assertAdminAccess(req, user)).ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const table = body?.table ?? 'memories';
  if (!body || table !== 'memories') {
    return NextResponse.json({ error: "table must be 'memories'" }, { status: 400 });
  }
  const cursor = typeof body.cursor === 'string' && body.cursor ? body.cursor : null;

  const db = createServiceRoleClient();
  // A literal name, so the schema-drift scanner (__tests__/schema-drift.test.ts) can read the table this route touches.
  const from = () => db.from('memories');
  const deps: ReembedDeps = {
    async countPending({ tag }) {
      const { count, error } = await from().select('id', { count: 'exact', head: true }).or(pendingFilter(tag));
      if (error) throw error;
      return count ?? 0;
    },
    async fetchBatch({ table: t, cursor: after, limit, tag }) {
      const col = REEMBED_TEXT_COLUMN[t];
      let q = from().select(`id, ${col}`).or(pendingFilter(tag)).order('id', { ascending: true }).limit(limit);
      if (after) q = q.gt('id', after);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({ id: String(r.id), text: String(r[col] ?? '') }));
    },
    embed,
    async save({ table: t, id, embedding, tag }) {
      const { error } = await from().update({ embedding, embedding_model: tag }).eq('id', id);
      if (error) reportError(error, { route: '/api/admin/memory-reembed', table: t, id });
      return !error;
    },
  };

  try {
    const report = await reembedBatch(
      { table, tag: EMBEDDING_MODEL_TAG, cursor, limit: body.limit as number | undefined, dryRun: body.dryRun !== false },
      deps,
    );
    return NextResponse.json({ model: EMBEDDING_MODEL_TAG, ...report });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
    if (/embedding_model/.test(msg) && /column|does not exist/i.test(msg)) {
      return NextResponse.json({ error: 'apply supabase/migrations/20261113a_embedding_model.sql first' }, { status: 409 });
    }
    reportError(error, { route: '/api/admin/memory-reembed' });
    return NextResponse.json({ error: 'reembed failed' }, { status: 500 });
  }
}
