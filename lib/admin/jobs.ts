import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Admin job-queue operations for the Master Control Panel (v358 #4).
 *
 * The queue is generation_jobs (status pending → processing → completed|failed; id === the SSE pipelineId).
 * Renders are CLIENT-DRIVEN and Kling/Replicate run as BLOCKING calls, so no live provider handle is retained
 * — there is nothing to abort remotely. These ops therefore manage the DB job STATE, which is safe by design:
 *   • cancel → mark a NON-terminal job failed (a genuinely-still-running render overwrites the row back to
 *     'completed' when it finishes, so only a truly-dead/stuck job stays failed). No refund (forfeit decision).
 *   • retry  → reset a FAILED job to pending + clear the error (un-sticks the state for a fresh run).
 * Both are idempotent (they only act on a row in the expected state) and go through the service-role client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export interface AdminJobRow {
  id: string;
  user_id: string | null;
  service_type: string;
  status: string;
  current_stage: string | null;
  pct: number;
  error: string | null;
  created_at: string;
  updated_at: string | null;
}

const ACTIVE_LIMIT = 100;
const FAILED_LIMIT = 25;
const SELECT_COLS = 'id, user_id, service_type, status, current_stage, pct, error, created_at, updated_at';

function mapRows(data: unknown): AdminJobRow[] {
  return (Array.isArray(data) ? data : []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id ?? ''),
      user_id: (row.user_id as string | null) ?? null,
      service_type: String(row.service_type ?? ''),
      status: String(row.status ?? ''),
      current_stage: (row.current_stage as string | null) ?? null,
      pct: Number(row.pct) || 0,
      error: (row.error as string | null) ?? null,
      created_at: String(row.created_at ?? ''),
      updated_at: (row.updated_at as string | null) ?? null,
    };
  });
}

/** The live queue (pending + processing, newest first) plus recent failures. Fail-open to empty lists. */
export async function listJobs(client: Client): Promise<{ active: AdminJobRow[]; recentFailed: AdminJobRow[] }> {
  try {
    const [activeRes, failedRes] = await Promise.all([
      client.from('generation_jobs').select(SELECT_COLS).in('status', ['pending', 'processing']).order('created_at', { ascending: false }).limit(ACTIVE_LIMIT),
      client.from('generation_jobs').select(SELECT_COLS).eq('status', 'failed').order('created_at', { ascending: false }).limit(FAILED_LIMIT),
    ]);
    return { active: mapRows(activeRes.data), recentFailed: mapRows(failedRes.data) };
  } catch {
    return { active: [], recentFailed: [] };
  }
}

/** Mark a non-terminal job failed (advisory; forfeit — no refund). Idempotent: no-ops a terminal job. */
export async function cancelJob(client: Client, id: string): Promise<{ ok: boolean; changed: boolean; error?: string }> {
  if (!id) return { ok: false, changed: false, error: 'invalid_id' };
  try {
    const { data, error } = await client
      .from('generation_jobs')
      .update({ status: 'failed', error: 'canceled_by_admin', updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('status', ['pending', 'processing'])
      .select('id');
    if (error) return { ok: false, changed: false, error: error.message };
    return { ok: true, changed: Array.isArray(data) && data.length > 0 };
  } catch (e) {
    return { ok: false, changed: false, error: e instanceof Error ? e.message : 'cancel_failed' };
  }
}

/** Reset a FAILED job to pending + clear the error. Idempotent: only acts on a failed row. */
export async function retryJob(client: Client, id: string): Promise<{ ok: boolean; changed: boolean; error?: string }> {
  if (!id) return { ok: false, changed: false, error: 'invalid_id' };
  try {
    const { data, error } = await client
      .from('generation_jobs')
      .update({ status: 'pending', error: null, pct: 0, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'failed')
      .select('id');
    if (error) return { ok: false, changed: false, error: error.message };
    return { ok: true, changed: Array.isArray(data) && data.length > 0 };
  } catch (e) {
    return { ok: false, changed: false, error: e instanceof Error ? e.message : 'retry_failed' };
  }
}
