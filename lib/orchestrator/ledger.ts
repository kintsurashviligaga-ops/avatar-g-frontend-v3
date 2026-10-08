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

/**
 * Credits ACTUALLY taken under `ref` and not yet given back — read from the ledger, never from a job row.
 *
 * ⚠️ WHY THIS EXISTS: the render drainer used to refund `generation_jobs.params._reserve.credits`, and
 * generation_jobs is OWNER-WRITABLE (RLS lets a signed-in user insert and update their own rows). A user
 * could insert a stale `processing` row claiming `_reserve: { ref: <anything new>, credits: 1000000 }` and
 * the drainer would pay it out. A row can claim what it likes; only the ledger knows what was charged.
 *
 * net = |sum of debits whose ref is exactly `ref`| − sum of credit-backs whose ref starts with `${ref}:`
 * (`:refund`, `:settle`, …), floored at 0. Returns null when the ledger cannot be read — callers must then
 * refund NOTHING rather than guess.
 */
export async function netDebitedForRef(userId: string, ref: string): Promise<number | null> {
  const sb = client();
  if (!sb || !userId || !ref) return null;
  try {
    const debits = await sb
      .from('credit_ledger')
      .select('delta')
      .eq('user_id', userId)
      .eq('metadata->>ref', ref)
      .lt('delta', 0);
    if (debits.error) return null;
    // `_` and `%` are LIKE wildcards and refs contain underscores — escape them, then re-check the prefix
    // exactly in JS so a wildcard can never widen the match.
    const prefix = `${ref}:`;
    const credits = await sb
      .from('credit_ledger')
      .select('delta, metadata')
      .eq('user_id', userId)
      .like('metadata->>ref', `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
      .gt('delta', 0);
    if (credits.error) return null;
    const taken = ((debits.data ?? []) as Array<{ delta: number }>).reduce((s, r) => s + Math.abs(Number(r.delta) || 0), 0);
    const given = ((credits.data ?? []) as Array<{ delta: number; metadata?: { ref?: unknown } | null }>)
      .filter((r) => typeof r.metadata?.ref === 'string' && (r.metadata.ref as string).startsWith(prefix))
      .reduce((s, r) => s + (Number(r.delta) || 0), 0);
    return Math.max(0, taken - given);
  } catch {
    return null;
  }
}

/**
 * Has a debit EVER been taken from this user under exactly `ref` — whatever happened to it since?
 * true / false from the ledger; null when it cannot be read (the caller then lets deduct_credits decide).
 *
 * ⚠️ WHY A ROUTE MUST ASK BEFORE IT DEDUCTS. deduct_credits dedupes on (user_id, ref) FOREVER and answers a
 * replayed ref with SUCCESS — no new row, no money moved. A route that keys its ref on a client job id plus the
 * request body therefore treats a byte-identical replay as "charged" and renders AGAIN for free: once per replay
 * after a success, and after a refunded failure every replay is free. Worse, if the replay then fails, its
 * `${ref}:refund` pays back the FIRST request's legitimate charge. Asking first turns a replay into a refusal
 * (nothing charged, nothing rendered) while a genuine first attempt is untouched.
 */
export async function debitExistsForRef(userId: string, ref: string): Promise<boolean | null> {
  const sb = client();
  if (!sb || !userId || !ref) return null;
  try {
    const { data, error } = await sb
      .from('credit_ledger')
      .select('id')
      .eq('user_id', userId)
      .eq('metadata->>ref', ref)
      .lt('delta', 0)
      .limit(1);
    if (error) return null;
    return Array.isArray(data) && data.length > 0;
  } catch {
    return null;
  }
}

/**
 * Refund what the LEDGER shows was taken under `ref` (as `${ref}:refund`, the same idempotency ref every
 * in-route rollback uses), capped at `claimed` when the caller has an expected amount. Never refunds more
 * than was charged, never refunds on an unreadable ledger.
 */
export async function refundDebitByRef(
  userId: string,
  ref: string,
  claimed?: number,
): Promise<LedgerResult & { refunded: number }> {
  const net = await netDebitedForRef(userId, ref);
  if (net === null) return { ok: false, reason: 'error', refunded: 0 };
  const cap = typeof claimed === 'number' && Number.isFinite(claimed) && claimed > 0 ? Math.round(claimed) : net;
  const amount = Math.min(net, cap);
  if (!(amount > 0)) return { ok: false, reason: 'skipped', refunded: 0 };
  const res = await refundCredits(userId, amount, `${ref}:refund`);
  return { ...res, refunded: res.ok ? amount : 0 };
}

/**
 * Grant credits THROUGH THE LEDGER (bonuses, promos). Idempotent on `ref`: the unique index
 * credit_ledger_user_ref_positive_uniq (user_id, metadata->>'ref') WHERE delta > 0 turns a repeat into a
 * 23505, which is reported as success — the grant already happened. The AFTER INSERT trigger moves
 * profiles.credits_balance.
 *
 * ⚠️ Replaces the `add_credits` RPC, which UPDATEd credits_balance directly and wrote no ledger row — every
 * referral bonus it paid is a balance the ledger cannot explain (5 accounts on 2026-09-29).
 */
export async function grantCredits(userId: string, amount: number, ref: string, source: string): Promise<LedgerResult> {
  const sb = client();
  if (!sb) return { ok: false, reason: 'skipped' };
  const credits = Math.round(amount);
  if (!userId || !ref || !(credits > 0)) return { ok: false, reason: 'error' };
  try {
    const { error } = await sb
      .from('credit_ledger')
      .insert({ user_id: userId, delta: credits, reason: 'admin_adjustment', metadata: { source, ref } });
    if (error) {
      if ((error as { code?: string }).code === '23505') return { ok: true };
      reportError(error, { fn: 'grantCredits', userId, amount: credits, ref, source });
      return { ok: false, reason: 'error' };
    }
    return { ok: true };
  } catch (e) {
    reportError(e, { fn: 'grantCredits', userId, amount: credits, ref, source });
    return { ok: false, reason: 'error' };
  }
}

/** `_` and `%` are LIKE wildcards and refs contain underscores: escape them (the caller re-checks the prefix). */
function likePrefix(prefix: string): string {
  return `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Who was granted credits under exactly `ref`, and how many (the sum of its POSITIVE ledger rows) — the
 * purchase a Stripe refund or dispute must reverse. `ref` is a payment ref (`stripe:<checkout session>`,
 * `sub:<invoice>`), unique to one payer.
 *   { ok:true, grant:null } → nothing was ever granted under it (not a credit purchase): nothing to reverse.
 *   { ok:false }            → the ledger could not be read; the caller must retry, never guess.
 */
export async function grantedForRef(
  ref: string,
): Promise<{ ok: true; grant: { userId: string; credits: number } | null } | { ok: false }> {
  const sb = client();
  if (!sb || !ref) return { ok: false };
  try {
    const { data, error } = await sb
      .from('credit_ledger')
      .select('user_id, delta')
      .eq('metadata->>ref', ref)
      .gt('delta', 0);
    if (error) return { ok: false };
    const rows = (Array.isArray(data) ? data : []) as Array<{ user_id?: unknown; delta?: unknown }>;
    const userId = rows.find((r) => typeof r.user_id === 'string')?.user_id as string | undefined;
    if (!userId) return { ok: true, grant: null };
    if (rows.some((r) => r.user_id !== userId)) {
      // Two payers under one payment ref should be impossible; never reverse on an ambiguous grant.
      reportError(new Error('one payment ref granted to more than one user'), { fn: 'grantedForRef', ref });
      return { ok: false };
    }
    const credits = rows.reduce((s, r) => s + (Number(r.delta) || 0), 0);
    return { ok: true, grant: credits > 0 ? { userId, credits } : null };
  } catch {
    return { ok: false };
  }
}

/** Credits debited from `userId` under any ref starting with `prefix` (absolute sum); null when unreadable. */
export async function debitedUnderPrefix(userId: string, prefix: string): Promise<number | null> {
  const sb = client();
  if (!sb || !userId || !prefix) return null;
  try {
    const { data, error } = await sb
      .from('credit_ledger')
      .select('delta, metadata')
      .eq('user_id', userId)
      .like('metadata->>ref', likePrefix(prefix))
      .lt('delta', 0);
    if (error) return null;
    return ((data ?? []) as Array<{ delta: number; metadata?: { ref?: unknown } | null }>)
      .filter((r) => typeof r.metadata?.ref === 'string' && (r.metadata.ref as string).startsWith(prefix))
      .reduce((s, r) => s + Math.abs(Number(r.delta) || 0), 0);
  } catch {
    return null;
  }
}

/** The user's spendable balance (profiles.credits_balance); null when it cannot be read. */
export async function creditsBalanceOf(userId: string): Promise<number | null> {
  const sb = client();
  if (!sb || !userId) return null;
  try {
    const { data, error } = await sb.from('profiles').select('credits_balance').eq('id', userId).maybeSingle();
    if (error || !data) return null;
    const bal = Number((data as { credits_balance?: unknown }).credits_balance);
    return Number.isFinite(bal) ? bal : null;
  } catch {
    return null;
  }
}
