/**
 * Durable credit ledger (server-only) — Supabase-backed token accounting
 * used inside the assemble Saga. Debit on reserve, refund on rollback,
 * guaranteeing instant credit-back on any downstream cluster failure.
 *
 * Uses Postgres RPCs (`deduct_credits` / `refund_credits`) so the balance
 * mutation is atomic in the database. Degrades cleanly: when Supabase or
 * the RPCs are absent the helpers report `skipped` (the Redis lock still
 * provides best-effort protection) — never throwing, never blocking.
 */

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';

export type LedgerReason = 'insufficient' | 'skipped' | 'error';

export interface LedgerResult {
  ok: boolean;
  /** present when ok=false */
  reason?: LedgerReason;
  balance?: number;
}

/**
 * Classify a Supabase RPC error string.
 *   - 'insufficient' → business rejection (balance too low) → fail-fast.
 *   - 'skipped'      → the RPC simply isn't created yet (Postgres 42883 /
 *                      "does not exist") → degrade, let the Saga proceed on
 *                      the Redis lock.
 *   - 'error'        → a genuine DB / connection failure → fail-fast.
 */
export function classifyLedgerError(message: string): Exclude<LedgerReason, never> {
  const m = message.toLowerCase();
  if (m.includes('insufficient')) return 'insufficient';
  if (m.includes('does not exist') || m.includes('42883') || m.includes('could not find') || m.includes('not found')) {
    return 'skipped';
  }
  return 'error';
}

function parseBalance(data: unknown): number | undefined {
  if (typeof data === 'number') return data;
  const b = (data as { balance?: number } | null)?.balance;
  return typeof b === 'number' ? b : undefined;
}

function client(): ReturnType<typeof createServiceRoleClient> | null {
  try {
    return createServiceRoleClient();
  } catch {
    return null;
  }
}

/**
 * Atomically debit `amount` credits via the `deduct_credits` RPC.
 *   ok:false reason:'insufficient' → balance too low (Saga aborts).
 *   ok:false reason:'error'        → DB/connection failure (Saga aborts).
 *   ok:false reason:'skipped'      → RPC not provisioned (Saga proceeds).
 */
export async function deductCredits(userId: string, amount: number, ref: string): Promise<LedgerResult> {
  const sb = client();
  if (!sb) return { ok: false, reason: 'skipped' };
  try {
    const { data, error } = await sb.rpc('deduct_credits', { p_user_id: userId, p_amount: amount, p_ref: ref });
    if (error) return { ok: false, reason: classifyLedgerError(error.message) };
    return { ok: true, balance: parseBalance(data) };
  } catch (e) {
    // A thrown exception is a genuine connection failure → fail-fast.
    return { ok: false, reason: classifyLedgerError(e instanceof Error ? e.message : '') };
  }
}

/**
 * Refund `amount` credits (Saga rollback) via the `refund_credits` RPC.
 * Best-effort and never throws — a failed refund is reported, not raised,
 * so the rollback chain always completes.
 */
export async function refundCredits(userId: string, amount: number, ref: string): Promise<LedgerResult> {
  const sb = client();
  if (!sb) return { ok: false, reason: 'skipped' };
  try {
    const { data, error } = await sb.rpc('refund_credits', { p_user_id: userId, p_amount: amount, p_ref: ref });
    if (error) return { ok: false, reason: classifyLedgerError(error.message) };
    return { ok: true, balance: parseBalance(data) };
  } catch (e) {
    return { ok: false, reason: classifyLedgerError(e instanceof Error ? e.message : '') };
  }
}
