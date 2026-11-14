/**
 * Re-embed stored rows with the current Google model (v5.1 M-14, chat memory OpenAI → Google).
 *
 * Rows written before supabase/migrations/20261113a_embedding_model.sql have `embedding_model` null: their vector may
 * come from the old OpenAI fallback (same 1536 size, different space). match_memories / match_rag_documents skip them
 * until this gives each one a gemini-embedding-001 vector and the current tag. Rows whose embedding is null (an embed
 * that failed at write time) are filled the same way.
 *
 * Pure: the database reads and writes and the embed call are passed in, so the batching, cursor and dry-run rules are
 * tested without a database or Google. One call handles one batch; the caller passes `nextCursor` back to continue,
 * so a run can stop and resume at any point. A row that fails to embed is counted and skipped (left as it was), never
 * written with a null vector.
 */

export type ReembedTable = 'memories' | 'rag_documents';

/** The text column each table embeds. */
export const REEMBED_TEXT_COLUMN: Record<ReembedTable, 'fact' | 'content'> = {
  memories: 'fact',
  rag_documents: 'content',
};

export const REEMBED_DEFAULT_LIMIT = 50;
export const REEMBED_MAX_LIMIT = 200;
/**
 * Stop starting new rows after this long, so one batch always answers inside the route's 60 s limit. Each embed is
 * capped at 8 s (EMBED_TIMEOUT_MS), so 200 slow rows would otherwise run for minutes and be killed mid-batch.
 */
export const REEMBED_TIME_BUDGET_MS = 40_000;
/** This many failures in a row means a service is down, not one bad row: stop instead of paying to fail them all. */
export const REEMBED_MAX_CONSECUTIVE_FAILURES = 3;

export type ReembedRow = { id: string; text: string };

export type ReembedDeps = {
  /** Up to `limit` rows that need a vector (model tag not current, or no embedding), with id > cursor, by id. */
  fetchBatch: (args: { table: ReembedTable; cursor: string | null; limit: number; tag: string }) => Promise<ReembedRow[]>;
  /** How many rows still need a vector in total (for the report). */
  countPending: (args: { table: ReembedTable; tag: string }) => Promise<number>;
  embed: (text: string) => Promise<number[] | null>;
  save: (args: { table: ReembedTable; id: string; embedding: number[]; tag: string }) => Promise<boolean>;
  /** Clock for the time budget (tests pass a fake one). */
  now?: () => number;
};

export type ReembedInput = {
  table: ReembedTable;
  tag: string;
  cursor?: string | null;
  limit?: number;
  /** Default true: count and list, embed nothing, write nothing. */
  dryRun?: boolean;
  /** Default REEMBED_TIME_BUDGET_MS. */
  timeBudgetMs?: number;
};

export type ReembedReport = {
  table: ReembedTable;
  dryRun: boolean;
  pendingBefore: number;
  scanned: number;
  updated: number;
  failed: number;
  /** Ids that failed to embed or save in this batch (left untouched). */
  failedIds: string[];
  /** Pass back as `cursor` to continue; null when this batch reached the end. */
  nextCursor: string | null;
  /**
   * Why the batch stopped before its last row: 'time_budget' (call again with nextCursor) or 'repeated_failures'
   * (several embeds or saves in a row failed, so Vertex or the database is likely down; check /api/health/embed before calling again). Absent when the batch finished.
   */
  stopped?: 'time_budget' | 'repeated_failures';
  /** Rows of this batch that were not tried because it stopped early. */
  skipped?: number;
};

export function clampLimit(limit: unknown): number {
  const n = typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : REEMBED_DEFAULT_LIMIT;
  return Math.min(REEMBED_MAX_LIMIT, Math.max(1, n));
}

export function isReembedTable(v: unknown): v is ReembedTable {
  return v === 'memories' || v === 'rag_documents';
}

export async function reembedBatch(input: ReembedInput, deps: ReembedDeps): Promise<ReembedReport> {
  const dryRun = input.dryRun !== false;
  const limit = clampLimit(input.limit);
  const cursor = input.cursor ?? null;
  const pendingBefore = await deps.countPending({ table: input.table, tag: input.tag });
  const rows = await deps.fetchBatch({ table: input.table, cursor, limit, tag: input.tag });

  const report: ReembedReport = {
    table: input.table,
    dryRun,
    pendingBefore,
    scanned: rows.length,
    updated: 0,
    failed: 0,
    failedIds: [],
    // A full batch may have more behind it; a short one reached the end.
    nextCursor: rows.length === limit ? rows[rows.length - 1]!.id : null,
  };
  if (dryRun) return report;

  // One at a time: the batch is small and the embed endpoint is rate-limited per project; a burst gains nothing.
  const now = deps.now ?? Date.now;
  const started = now();
  const budget = input.timeBudgetMs ?? REEMBED_TIME_BUDGET_MS;
  let streak = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const stop: ReembedReport['stopped'] | null =
      streak >= REEMBED_MAX_CONSECUTIVE_FAILURES ? 'repeated_failures' : now() - started >= budget ? 'time_budget' : null;
    if (stop) {
      report.stopped = stop;
      report.skipped = rows.length - i;
      // Resume right after the last row this batch tried; rows not tried are picked up by the next call.
      report.nextCursor = i > 0 ? rows[i - 1]!.id : cursor;
      break;
    }
    const text = (row.text ?? '').trim();
    let saved = false;
    try {
      const vec = text ? await deps.embed(text) : null;
      saved = vec ? await deps.save({ table: input.table, id: row.id, embedding: vec, tag: input.tag }) : false;
    } catch {
      // A thrown embed or save (network) is the same as a miss: the row stays as it was and is reported.
      saved = false;
    }
    if (saved) {
      report.updated++;
      streak = 0;
    } else {
      report.failed++;
      report.failedIds.push(row.id);
      // An empty text is that row's problem; an embed or save miss may be the service's (Vertex or the DB down).
      if (text) streak++;
    }
  }
  return report;
}

/**
 * PostgREST filter for "needs a vector": no embedding, no tag, or another tag. The value is quoted because it holds
 * '@' and '.', which the or() grammar would otherwise read as syntax.
 */
export function pendingFilter(tag: string): string {
  return `embedding.is.null,embedding_model.is.null,embedding_model.neq."${tag.replace(/"/g, '')}"`;
}
