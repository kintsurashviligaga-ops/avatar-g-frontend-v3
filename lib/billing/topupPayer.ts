/**
 * lib/billing/topupPayer.ts — WHO paid a Stripe GEL wallet top-up (checkout.session.completed, kind=wallet_topup).
 *
 * ⚠️ PAID TOP-UPS WERE NOT CREDITED (found 2026-10-01). The webhook looked the payer up ONLY in `subscriptions` by
 * customer id, through the cookie-based (anon) client — but a webhook carries no session cookie, RLS hides every row
 * from anon, and on production the `subscriptions` table does not even exist (so the top-up route's own upsert of the
 * customer silently failed: supabase-js RETURNS errors). The session carried no user id. Result: the card was charged,
 * the webhook logged "no user for customer" and returned 200, and the balance never moved.
 *
 * The payer is now resolved from the strongest evidence first:
 *   1. `metadata.user_id` — set by OUR server from the authenticated user when it created the session (the event is
 *      signature-verified, and the browser never sees or sets session metadata);
 *   2. `client_reference_id` — the same id, the field Stripe reserves for it;
 *   3. the `subscriptions` row for the customer (service role) — older accounts that have one;
 *   4. the Stripe CUSTOMER's own `metadata.userId` — getOrCreateCustomer has always stamped it, so this recovers every
 *      session created before the fix.
 * Ids must look like a Supabase user id (UUID); anything else is ignored rather than credited.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PayerSource = 'metadata' | 'client_reference_id' | 'subscriptions' | 'customer_metadata';

export interface TopupSessionLike {
  metadata?: Record<string, string | undefined> | null;
  client_reference_id?: string | null;
  customer?: string | { id?: string } | null;
}

export interface TopupPayerDeps {
  /** The `subscriptions` row's user for a Stripe customer, or null. Must not throw. */
  userForCustomer(customerId: string): Promise<string | null>;
  /** The Stripe customer's metadata user id, or null. MAY throw (Stripe down) — the caller asks Stripe to retry. */
  customerMetadataUserId(customerId: string): Promise<string | null>;
}

const asUserId = (v: unknown): string | null => (typeof v === 'string' && UUID_RE.test(v.trim()) ? v.trim() : null);

export function customerIdOf(session: TopupSessionLike): string | null {
  const c = session.customer;
  if (typeof c === 'string') return c || null;
  return c && typeof c.id === 'string' && c.id ? c.id : null;
}

export async function resolveTopupPayer(
  session: TopupSessionLike,
  deps: TopupPayerDeps,
): Promise<{ userId: string; via: PayerSource } | null> {
  const fromMeta = asUserId(session.metadata?.user_id);
  if (fromMeta) return { userId: fromMeta, via: 'metadata' };
  const fromRef = asUserId(session.client_reference_id);
  if (fromRef) return { userId: fromRef, via: 'client_reference_id' };
  const customerId = customerIdOf(session);
  if (!customerId) return null;
  const fromSubs = asUserId(await deps.userForCustomer(customerId).catch(() => null));
  if (fromSubs) return { userId: fromSubs, via: 'subscriptions' };
  const fromCustomer = asUserId(await deps.customerMetadataUserId(customerId));
  if (fromCustomer) return { userId: fromCustomer, via: 'customer_metadata' };
  return null;
}
