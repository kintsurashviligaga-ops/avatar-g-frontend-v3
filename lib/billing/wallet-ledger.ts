/**
 * Wallet + onboarding server lifecycle (server-only).
 *
 * Thin, fail-OPEN wrappers over the SECURITY DEFINER RPCs from
 * 20260523_wallet_and_onboarding.sql, called with the service-role client so they
 * run above RLS (webhook + produce routes have no user session). Every helper
 * degrades cleanly when the RPC/migration isn't present yet — callers fall back
 * to existing behavior, so this is strictly additive (zero regression).
 */

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';

function client(): ReturnType<typeof createServiceRoleClient> | null {
  try { return createServiceRoleClient(); } catch { return null; }
}

/**
 * Idempotently credit `amountGel` to the user's GEL balance (via credit_ledger).
 * `ref` (e.g. `stripe:<session_id>`) makes a re-delivered webhook a no-op.
 * Returns the new balance, or null when unavailable (fail-open).
 */
export async function creditWalletGel(userId: string, amountGel: number, ref: string): Promise<number | null> {
  const sb = client();
  if (!sb || !Number.isFinite(amountGel) || amountGel <= 0) return null;
  try {
    const { data, error } = await sb.rpc('credit_wallet_gel', { p_user_id: userId, p_amount: amountGel, p_ref: ref });
    if (error) return null;
    return typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}

/**
 * Idempotently GRANT purchased credits to `profiles.credits_balance` — the spendable balance-of-record
 * that every generation debits (NOT the legacy `credits.balance_gel` wallet). Used by the Stripe webhook
 * when a USD tier checkout completes.
 *
 * Implemented over the ref-idempotent `refund_credits` RPC (appends a POSITIVE ledger delta deduped on
 * `metadata->>'ref'`). `ref` = `stripe:<session_id>`. Returns the new balance, or null when unavailable.
 *
 * RACE-SAFETY depends on migration 008's partial UNIQUE index (user_id, ref) WHERE delta > 0: refund_credits'
 * EXISTS check is NOT atomic on its own, so under concurrent double-delivery the second INSERT relies on that
 * unique constraint to fail (→ this returns null → the webhook throws → Stripe retries → the retry finds the
 * committed row and no-ops). WITHOUT migration 008 a concurrent double-webhook can double-grant, so the caller
 * MUST treat a null return as "retry", never as "granted".
 *
 * NOTE: the ledger row's `reason` is 'refund' (refund_credits is the existing ref-idempotent positive-credit
 * primitive; no new RPC/DDL required). The `ref` + amount keep the purchase fully auditable.
 */
export async function grantPurchasedCredits(userId: string, credits: number, ref: string): Promise<number | null> {
  const sb = client();
  if (!sb || !Number.isFinite(credits) || credits <= 0) return null;
  try {
    const { data, error } = await sb.rpc('refund_credits', { p_user_id: userId, p_amount: Math.floor(credits), p_ref: ref });
    if (error) return null;
    return typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}

/** Input to the subscription allowance grant — the shape lib/billing/subscriptionAllowance hands over. */
export interface SubscriptionAllowanceGrant {
  userId: string;
  invoiceId: string;
  tier: string;
  credits: number;
  subscriptionId: string;
  customerId: string | null;
  priceId: string;
  periodStart: string | null;
  periodEnd: string | null;
}

/**
 * Grant one paid invoice's monthly allowance via the `grant_subscription_allowance` RPC (migration 20261001a):
 * ONE transaction that records the grant (PK invoice_id), writes the ledger row with reason 'purchase' and ref
 * `sub:<invoice id>`, and refreshes the entitlement row in `subscriptions`.
 *
 * Returns { granted, balance } — granted=false means this invoice was already granted (a redelivery), which is
 * success. null means the grant did NOT happen (RPC missing, DB error, unknown user) and the caller must make Stripe
 * retry; never read null as "granted".
 *
 * ⚠️ NOT refund_credits. One-time tier packs still go through grantPurchasedCredits above and are booked as
 * 'refund' — that mislabel is documented in docs/billing/TIERS.md; subscription revenue does not inherit it.
 */
export async function grantSubscriptionAllowance(
  g: SubscriptionAllowanceGrant,
): Promise<{ granted: boolean; balance: number } | null> {
  const sb = client();
  if (!sb || !g.userId || !g.invoiceId || !Number.isInteger(g.credits) || g.credits <= 0) return null;
  try {
    const { data, error } = await sb.rpc('grant_subscription_allowance', {
      p_user_id: g.userId,
      p_invoice_id: g.invoiceId,
      p_tier: g.tier,
      p_credits: g.credits,
      p_subscription_id: g.subscriptionId,
      p_customer_id: g.customerId,
      p_price_id: g.priceId,
      p_period_start: g.periodStart,
      p_period_end: g.periodEnd,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[wallet-ledger] grant_subscription_allowance failed:', (error as { message?: string }).message ?? error);
      return null;
    }
    const row = (data ?? null) as { granted?: unknown; balance?: unknown } | null;
    if (!row || typeof row !== 'object') return null;
    const balance = Number(row.balance);
    return { granted: row.granted === true, balance: Number.isFinite(balance) ? balance : 0 };
  } catch {
    return null;
  }
}

/**
 * Which user a Stripe subscription belongs to, from `subscriptions` (service role). Fallback for invoices whose
 * subscription metadata carries no user_id — subscriptions created outside /api/billing/subscribe. Subscription id
 * first (unique), then the customer id. null when unknown or unreadable.
 */
export async function findUserIdForStripeSubscription(q: {
  subscriptionId: string;
  customerId: string | null;
}): Promise<string | null> {
  const sb = client();
  if (!sb) return null;
  const lookup = async (column: string, value: string | null): Promise<string | null> => {
    if (!value) return null;
    const { data, error } = await sb.from('subscriptions').select('user_id').eq(column, value).limit(1).maybeSingle();
    if (error || !data) return null;
    const id = (data as { user_id?: unknown }).user_id;
    return typeof id === 'string' && id ? id : null;
  };
  try {
    return (await lookup('stripe_subscription_id', q.subscriptionId)) ?? (await lookup('stripe_customer_id', q.customerId));
  } catch {
    return null;
  }
}

/**
 * Atomically consume one free avatar response.
 *   >= 0 → a free slot was burned (new remaining count)
 *   -1   → none remaining (caller should charge)
 *   null → RPC/migration absent or errored (caller keeps existing behavior)
 */
export async function consumeFreeAvatarChat(userId: string): Promise<number | null> {
  const sb = client();
  if (!sb) return null;
  try {
    const { data, error } = await sb.rpc('consume_free_avatar_chat', { p_user_id: userId });
    if (error) return null;
    return typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}

/**
 * Atomically consume the user's one free 30-second film.
 *   >= 0 → the free film was burned (new remaining count) → caller WAIVES the charge
 *   -1   → none remaining → caller charges normally
 *   null → RPC/migration absent or errored → caller charges normally (fail-SAFE:
 *          we only ever waive the charge when the DB positively confirms a slot,
 *          so a missing migration can never create an infinite free loophole)
 */
export async function consumeFreeFilm(userId: string): Promise<number | null> {
  const sb = client();
  if (!sb) return null;
  try {
    const { data, error } = await sb.rpc('consume_free_film', { p_user_id: userId });
    if (error) return null;
    return typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}

/**
 * Compensation for consumeFreeFilm: returns the free slot when a render that
 * consumed it later fails (saga rollback). Best-effort — a miss here only means
 * the user keeps having spent their free film, never a charge. Returns the new
 * remaining count, or null when unavailable.
 */
export async function restoreFreeFilm(userId: string): Promise<number | null> {
  const sb = client();
  if (!sb) return null;
  try {
    const { data, error } = await sb.rpc('restore_free_film', { p_user_id: userId });
    if (error) return null;
    return typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}

/**
 * Compensation for consumeFreeAvatarChat: returns a free avatar-chat slot when a render that consumed it
 * later fails (saga rollback). Best-effort + fail-open — if the `restore_free_avatar_chat` RPC isn't
 * provisioned yet this simply no-ops (the user keeps having spent the slot, never a charge). Returns the
 * new remaining count, or null when unavailable.
 */
export async function restoreFreeAvatarChat(userId: string): Promise<number | null> {
  const sb = client();
  if (!sb) return null;
  try {
    const { data, error } = await sb.rpc('restore_free_avatar_chat', { p_user_id: userId });
    if (error) return null;
    return typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}

/** Persist the avatar name + flip is_avatar_named server-side. Best-effort. */
export async function setAvatarName(userId: string, name: string): Promise<boolean> {
  const sb = client();
  if (!sb) return false;
  try {
    const { error } = await sb.rpc('set_avatar_name', { p_user_id: userId, p_name: name.slice(0, 40) });
    return !error;
  } catch {
    return false;
  }
}

export interface OnboardingState {
  avatarName: string | null;
  isAvatarNamed: boolean;
  freeRemaining: number;
  /** Free 30-second films left (starter grant, default 3 since 2026-06-23; was 1).
   *  Drives the honest "0.00 GEL · N Free Videos Remaining" ledger on the studio home. */
  freeFilmsRemaining: number;
}

/** Read the authed user's onboarding state from their profile row. Fail-open null. */
export async function getOnboardingState(userId: string): Promise<OnboardingState | null> {
  const sb = client();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('avatar_name,is_avatar_named,free_avatar_chats_remaining,free_films_remaining')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as {
      avatar_name?: string | null;
      is_avatar_named?: boolean | null;
      free_avatar_chats_remaining?: number | null;
      free_films_remaining?: number | null;
    };
    return {
      avatarName: row.avatar_name ?? null,
      isAvatarNamed: Boolean(row.is_avatar_named),
      freeRemaining: typeof row.free_avatar_chats_remaining === 'number' ? row.free_avatar_chats_remaining : 3,
      freeFilmsRemaining: typeof row.free_films_remaining === 'number' ? row.free_films_remaining : 0,
    };
  } catch {
    return null;
  }
}
