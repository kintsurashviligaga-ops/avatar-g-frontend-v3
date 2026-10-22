/**
 * lib/observability/agentTrace.ts
 * ================================
 * Append-only trace writer for `agent_evolution_traces`.
 *
 * Every downstream worker call (Udio, Replicate, NanoBanana, ElevenLabs,
 * LTX, HeyGen, Gemini) should emit one row so the Founder Audit RPC has a
 * canonical wholesale-vs-retail ledger to aggregate over.
 *
 * Failure-safe: if the service-role client is unconfigured or the insert
 * errors out, the trace is dropped (logged, never thrown). The user-facing
 * flow MUST NOT depend on the trace landing. recordTrace answers whether the
 * row landed, so a caller whose row IS money (BillingGuard.recordUsage) can
 * keep what was lost instead of silently forgetting it.
 */

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { paidWritesBlockedOnPreview } from '@/lib/env/previewIsolation';

export type WorkerKind =
  | 'replicate'
  | 'udio'
  | 'elevenlabs'
  | 'openai'
  | 'gemini'
  | 'nanobanana'
  | 'veo'
  | 'ltx'
  | 'heygen'
  | 'worldlabs'
  | 'runpod';

export type TraceStatus = 'succeeded' | 'failed' | 'timeout';

export interface AgentTraceRow {
  userId: string | null;
  agentId: string;
  workerKind: WorkerKind;
  action?: string;
  promptSummary?: string;
  outputSummary?: string | null;
  costWholesaleGel?: number;
  costRetailGel?: number;
  latencyMs?: number;
  status?: TraceStatus;
  metadata?: Record<string, unknown>;
  /**
   * When `true` AND status === 'succeeded' AND costRetailGel > 0 AND userId is
   * present, the trace also debits the user's wallet via the
   * `debit_wallet_gel` Postgres RPC. Debit failures are swallowed (logged
   * only); the worker output has already been delivered by the time we get
   * here, so a debit failure must not surface as a user-visible error.
   *
   * Pre-flight balance checks in the dispatcher (see musicVideoComposite
   * forecastComposite) ensure this debit ordinarily succeeds.
   */
  deduct?: boolean;
  /**
   * Idempotency ref for the debit. Falls back to a synthesised key
   * (`agentId:action:userId:Date.now()`) when omitted.
   */
  deductRef?: string;
}

/**
 * Insert one row. Never throws. Resolves true when the row landed, false when it did not: no service-role client, the
 * insert threw, or the insert ANSWERED an error (supabase-js returns `{ error }` instead of throwing, and that answer
 * used to be ignored, so a rejected row looked exactly like a written one).
 */
export async function recordTrace(row: AgentTraceRow): Promise<boolean> {
  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (err) {
    // No service-role client configured — the trace is dropped.
    // eslint-disable-next-line no-console
    console.warn('[agentTrace] service-role client unavailable:', err instanceof Error ? err.message : err);
    return false;
  }

  let landed = false;
  try {
    const res = await supabase.from('agent_evolution_traces').insert({
      user_id: row.userId,
      agent_id: row.agentId,
      worker_kind: row.workerKind,
      action: row.action ?? null,
      prompt_summary: row.promptSummary ? row.promptSummary.slice(0, 200) : null,
      output_summary: row.outputSummary ? row.outputSummary.slice(0, 200) : null,
      cost_wholesale_gel: row.costWholesaleGel ?? 0,
      cost_retail_gel: row.costRetailGel ?? 0,
      latency_ms: row.latencyMs ?? null,
      status: row.status ?? 'succeeded',
      metadata: row.metadata ?? {},
    });
    const error = (res as { error?: { message?: string } | null } | null | undefined)?.error;
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[agentTrace] insert rejected:', error.message ?? 'unknown error');
    } else {
      landed = true;
    }
  } catch (err) {
    // Trace is observability, never user-facing — log and move on.
    // eslint-disable-next-line no-console
    console.warn('[agentTrace] insert failed:', err instanceof Error ? err.message : err);
  }

  // Debit pass (best-effort). Only fires on successful succeeded traces with
  // a positive retail price and a real user id.
  const shouldDebit =
    row.deduct === true &&
    (row.status ?? 'succeeded') === 'succeeded' &&
    typeof row.userId === 'string' &&
    row.userId.length > 0 &&
    typeof row.costRetailGel === 'number' &&
    row.costRetailGel > 0;

  // Never debit Production wallets from an unisolated Preview (lib/env/previewIsolation).
  if (!shouldDebit || paidWritesBlockedOnPreview()) return landed;

  const ref = row.deductRef ?? `${row.agentId}:${row.action ?? 'run'}:${row.userId}:${Date.now()}`;

  try {
    const { error } = await supabase.rpc('debit_wallet_gel', {
      p_user_id: row.userId,
      p_amount: row.costRetailGel,
      p_ref: ref,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[agentTrace] debit_wallet_gel rejected:', error.message);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[agentTrace] debit_wallet_gel call failed:', err instanceof Error ? err.message : err);
  }
  return landed;
}

/**
 * Wrap an async worker call and emit a trace row at the end.
 * Captures latency + status automatically. Wholesale/retail prices are
 * passed in by the caller because they vary per worker.
 *
 * Usage:
 *   const result = await withTrace({
 *     userId, agentId: 'music-agent', workerKind: 'udio', action: 'generate',
 *     costWholesaleGel: 0.057, costRetailGel: 0.2,
 *     promptSummary: prompt,
 *   }, () => startUdioGeneration({...}));
 */
export async function withTrace<T>(
  meta: Omit<AgentTraceRow, 'latencyMs' | 'status' | 'outputSummary'>,
  fn: () => Promise<T>,
  describeOutput?: (result: T) => string | null,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const out = describeOutput ? describeOutput(result) : null;
    void recordTrace({
      ...meta,
      latencyMs: Date.now() - start,
      status: 'succeeded',
      outputSummary: out,
    });
    return result;
  } catch (err) {
    void recordTrace({
      ...meta,
      latencyMs: Date.now() - start,
      status: 'failed',
      outputSummary: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
