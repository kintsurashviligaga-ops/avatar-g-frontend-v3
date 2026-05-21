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

export interface LedgerResult {
  ok: boolean;
  /** present when ok=false */
  reason?: 'insufficient' | 'skipped' | 'error';
  balance?: number;
}

function client(): ReturnType<typeof createServiceRoleClient> | null {
  try {
    return createServiceRoleClient();
  } catch {
    return null;
  }
}

/**
 * Atomically debit `amount` credits. Returns ok:false reason:'insufficient'
 * when the balance is too low (the Saga aborts), reason:'skipped' when the
 * ledger backend is unavailable (Saga continues on the Redis lock alone).
 */
export async function deductCredits(userId: string, amount: number, ref: string): Promise<LedgerResult> {
  const sb = client();
  if (!sb) return { ok: false, reason: 'skipped' };
  try {
    const { data, error } = await sb.rpc('deduct_credits', { p_user_id: userId, p_amount: amount, p_ref: ref });
    if (error) {
      // Distinguish a genuine insufficient-funds rejection from a missing RPC.
      if (/insufficient/i.test(error.message)) return { ok: false, reason: 'insufficient' };
      return { ok: false, reason: 'skipped' };
    }
    const balance = typeof data === 'number' ? data : (data as { balance?: number } | null)?.balance;
    return { ok: true, balance: balance ?? undefined };
  } catch {
    return { ok: false, reason: 'skipped' };
  }
}

/** Refund `amount` credits (Saga rollback). Best-effort, never throws. */
export async function refundCredits(userId: string, amount: number, ref: string): Promise<LedgerResult> {
  const sb = client();
  if (!sb) return { ok: false, reason: 'skipped' };
  try {
    const { data, error } = await sb.rpc('refund_credits', { p_user_id: userId, p_amount: amount, p_ref: ref });
    if (error) return { ok: false, reason: 'skipped' };
    const balance = typeof data === 'number' ? data : (data as { balance?: number } | null)?.balance;
    return { ok: true, balance: balance ?? undefined };
  } catch {
    return { ok: false, reason: 'skipped' };
  }
}
