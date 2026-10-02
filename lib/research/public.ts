/**
 * lib/research/public.ts — what a browser may see of a research job. Pure.
 *
 * ⚠️ AN ALLOWLIST, NOT A STRIP. The row carries the provider's interaction id, the ledger ref, internal error text and the
 * idempotency key; none of them is read here, so a column added to the table tomorrow cannot leak by default. `report` and
 * `sources` only on the single-job read (the list stays small).
 */
import type { ResearchJobPublic, ResearchJobRow } from './types';

export function toPublicJob(row: ResearchJobRow, opts: { withReport?: boolean } = {}): ResearchJobPublic {
  const base: ResearchJobPublic = {
    id: row.id,
    status: row.status,
    prompt: row.prompt,
    locale: row.locale,
    title: row.title,
    credits: row.charge_credits,
    createdAt: row.created_at,
    startedAt: row.provider_started_at,
    completedAt: row.completed_at,
    progress: row.progress ?? {},
    hasReport: row.status === 'completed' && row.report_chars > 0,
    reportChars: row.report_chars,
    sourcesCount: row.sources_count,
    incomplete: row.incomplete,
    errorCode: row.error_code,
    refunded: row.refund_state === 'done',
    refundPending: row.refund_state === 'pending',
    cancelRequested: row.cancel_requested,
    contextFiles: (row.context_files ?? []).map((f) => ({ id: f.id, name: f.name, chars: f.chars })),
  };
  if (!opts.withReport) return base;
  return { ...base, report: row.report_md, sources: row.sources ?? [] };
}
