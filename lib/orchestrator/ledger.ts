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
import { ensureProfileRow, isMissingProfileError } from '@/lib/orchestrator/ensureProfile';
import { reportError } from '@/lib/observability/report-error';

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
    if (error) {
      // ⚠️ "insufficient_credits" DOES NOT ALWAYS MEAN AN EMPTY BALANCE.
      //
      // The RPC reports a MISSING PROFILE ROW with the same message and only distinguishes it in
      // `details`. Probed live: { code:'P0001', details:'no profile record', message:'insufficient_credits' }.
      // So a validly signed-in user whose profile row never got created is told to top up — and topping
      // up cannot help, because the row the balance would land in does not exist. Measured on the live
      // database: 2 of 17 auth users were in exactly this state, permanently unable to pay for anything.
      //
      // Create the row and retry ONCE. The repair is idempotent, so concurrent requests race harmlessly,
      // and this closes the gap however it happened — a signup path that bypassed the trigger, a row
      // deleted later, an account older than the trigger itself.
      const details = (error as { details?: string }).details;
      if (isMissingProfileError(details, error.message) && (await ensureProfileRow(userId))) {
        const retry = await sb.rpc('deduct_credits', { p_user_id: userId, p_amount: amount, p_ref: ref });
        if (!retry.error) return { ok: true, balance: parseBalance(retry.data) };
        return { ok: false, reason: classifyLedgerError(retry.error.message) };
      }
      return { ok: false, reason: classifyLedgerError(error.message) };
    }
    return { ok: true, balance: parseBalance(data) };
  } catch (e) {
    // A thrown exception is a genuine connection failure → fail-fast.
    return { ok: false, reason: classifyLedgerError(e instanceof Error ? e.message : '') };
  }
}

/**
 * Best-effort PRE-render balance check. Returns false ONLY when we can positively
 * confirm the user's balance is below `cost`. Fail-OPEN (returns true) on any read
 * miss / absent client so a transient DB blip never blocks a paying user — the
 * post-success deduct_credits (which rejects overdraw) stays the real backstop.
 *
 * Without this gate a 0-balance user could generate UNLIMITED free assets: every
 * generation delivers the asset, then deduct_credits rejects the overdraw and the
 * caller's `.catch` swallows it. The gate stops the paid provider call up front.
 */
export async function hasSufficientBalance(userId: string, cost: number): Promise<boolean> {
  if (!(cost > 0)) return true;
  const sb = client();
  if (!sb) return true;
  try {
    const { data, error } = await sb.from('profiles').select('credits_balance').eq('id', userId).maybeSingle();
    if (error) return true; // read failed → fail-open (deduct is the backstop)
    if (!data) {
      // NO ROW, not a zero balance. This used to fail open straight into a paid provider call that the
      // post-render deduct could never charge for. Create the row now so the user has somewhere to be
      // billed; the deduct that follows is still the real gate on the amount.
      await ensureProfileRow(userId);
      return true;
    }
    const bal = (data as { credits_balance?: number } | null)?.credits_balance;
    return typeof bal === 'number' ? bal >= cost : true;
  } catch {
    return true; // fail-open
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
    if (error) {
      const reason = classifyLedgerError(error.message);
      // Report only a REAL DB/connection failure — a genuine refund miss means the user was charged but
      // never refunded (silent money loss). 'skipped' (RPC not provisioned) stays quiet, no noise.
      if (reason === 'error') reportError(error, { fn: 'refundCredits', userId, amount, ref });
      return { ok: false, reason };
    }
    return { ok: true, balance: parseBalance(data) };
  } catch (e) {
    const reason = classifyLedgerError(e instanceof Error ? e.message : '');
    if (reason === 'error') reportError(e, { fn: 'refundCredits', userId, amount, ref });
    return { ok: false, reason };
  }
}
