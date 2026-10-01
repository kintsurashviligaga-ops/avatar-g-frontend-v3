/**
 * lib/billing/resolveTier.ts — which subscription tier a user is on, right now.
 *
 *   1. an ACTIVE or TRIALING Stripe subscription whose current_period_end is still in the future → its tier
 *      (by Stripe price id first, the row's stored `tier` second; the highest if there are several)
 *   2. else a comped `profiles.tier` (hand-set by the owner — see tierFromProfileTier for the vocabulary)
 *   3. else 'free'
 *
 * ⚠️ NEVER THROWS, AND EVERY FAILURE POINTS AT 'free'. Callers ask this to decide what someone may do (Pro turns,
 * film length, Veo quality). An unreadable database must not become a 500 on the chat route, and it must not
 * become an upgrade either. Each step that fails simply contributes no evidence: a broken subscriptions read still
 * lets a comp through (a comp is positive evidence on its own), and nothing at all means free.
 *
 * ⚠️ PASS A SERVICE-ROLE CLIENT FROM SERVER CODE. With migration 20261001a a signed-in user can read their OWN
 * subscriptions/profiles rows, so a session client works for "my tier" — but never resolve someone else's tier
 * through a session client, and never trust a tier the browser reports about itself.
 *
 * ⚠️ THE PERIOD END IS THE REAL GATE, NOT THE STATUS. Today the customer.subscription.* webhook path writes
 * `subscriptions` through a cookie (anon) client and fails under RLS (docs/billing/TIERS.md, known bugs), so a
 * cancellation may never flip `status`. The row IS refreshed by the invoice.paid allowance grant (service role,
 * period from the paid invoice), so an unpaid subscription lapses to free on its own at current_period_end.
 *
 * Not wired into any route yet — /api/chat/gemini and OmniStudio are being edited elsewhere; they call this later.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TIERS,
  isPaidTierId,
  tierFromProfileTier,
  tierFromStripePriceId,
  type TierEnv,
  type TierId,
} from './tiers';

export type TierSource = 'subscription' | 'comp' | 'default';

export interface TierResolution {
  tier: TierId;
  source: TierSource;
  /** Present when source === 'subscription'. */
  stripeSubscriptionId?: string;
  /** ISO timestamp; present when source === 'subscription'. */
  currentPeriodEnd?: string;
}

export interface ResolveTierOptions {
  /** Where STRIPE_PRICE_* live. Defaults to process.env. */
  env?: TierEnv;
  /** Clock, ms since epoch. Defaults to Date.now(). */
  now?: number;
}

/** Only `.from()` is used — a real SupabaseClient satisfies this; tests pass a fake. */
export type TierReader = Pick<SupabaseClient, 'from'>;

/** Stripe statuses that entitle. past_due / unpaid / incomplete / canceled do not. */
const ENTITLING_STATUSES = new Set(['active', 'trialing']);

/** A user has at most a handful of subscription rows; this bounds a pathological account. */
const MAX_SUBSCRIPTION_ROWS = 25;

const DEFAULT: TierResolution = Object.freeze({ tier: 'free', source: 'default' }) as TierResolution;

interface SubscriptionRow {
  tier?: unknown;
  stripe_price_id?: unknown;
  status?: unknown;
  current_period_end?: unknown;
  stripe_subscription_id?: unknown;
}

function warn(step: string, e: unknown): void {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  // eslint-disable-next-line no-console
  console.warn(`[resolveTier] ${step} unreadable → no evidence from it:`, msg.slice(0, 200));
}

async function subscriptionTier(db: TierReader, userId: string, env: TierEnv, now: number): Promise<TierResolution | null> {
  const { data, error } = await db
    .from('subscriptions')
    .select('tier, stripe_price_id, status, current_period_end, stripe_subscription_id')
    .eq('user_id', userId)
    .limit(MAX_SUBSCRIPTION_ROWS);
  if (error) {
    warn('subscriptions', error);
    return null;
  }
  if (!Array.isArray(data)) return null;

  let best: TierResolution | null = null;
  for (const row of data as SubscriptionRow[]) {
    if (!row || !ENTITLING_STATUSES.has(String(row.status ?? '').toLowerCase())) continue;
    const end = typeof row.current_period_end === 'string' ? Date.parse(row.current_period_end) : Number.NaN;
    if (!Number.isFinite(end) || end <= now) continue;
    // ⚠️ THE PRICE ID WINS OVER THE STORED TIER. The price is what Stripe actually bills; `tier` is our copy of it
    // at grant time. The stored tier only matters when the price no longer maps — e.g. the operator rotated
    // STRIPE_PRICE_* to a new price object while old subscribers are still on the old one.
    const byPrice = tierFromStripePriceId(typeof row.stripe_price_id === 'string' ? row.stripe_price_id : null, env);
    const tier: TierId | null = byPrice ?? (isPaidTierId(row.tier) ? row.tier : null);
    if (!tier) continue;
    if (!best || TIERS[tier].rank > TIERS[best.tier].rank) {
      best = {
        tier,
        source: 'subscription',
        stripeSubscriptionId: typeof row.stripe_subscription_id === 'string' ? row.stripe_subscription_id : undefined,
        currentPeriodEnd: new Date(end).toISOString(),
      };
    }
  }
  return best;
}

async function compTier(db: TierReader, userId: string): Promise<TierId> {
  const { data, error } = await db.from('profiles').select('tier').eq('id', userId).maybeSingle();
  if (error) {
    warn('profiles.tier', error);
    return 'free';
  }
  return tierFromProfileTier((data as { tier?: unknown } | null)?.tier);
}

/** The tier and where it came from. Never throws. */
export async function resolveUserTierDetailed(
  db: TierReader | null | undefined,
  userId: string | null | undefined,
  opts: ResolveTierOptions = {},
): Promise<TierResolution> {
  if (!db || typeof userId !== 'string' || !userId.trim()) return { ...DEFAULT };
  const env = opts.env ?? process.env;
  const now = typeof opts.now === 'number' && Number.isFinite(opts.now) ? opts.now : Date.now();

  try {
    const sub = await subscriptionTier(db, userId, env, now);
    if (sub) return sub;
  } catch (e) {
    warn('subscriptions', e);
  }

  try {
    const comp = await compTier(db, userId);
    if (comp !== 'free') return { tier: comp, source: 'comp' };
  } catch (e) {
    warn('profiles.tier', e);
  }

  return { ...DEFAULT };
}

/** The user's tier id. Never throws; 'free' on any doubt. */
export async function resolveUserTier(
  db: TierReader | null | undefined,
  userId: string | null | undefined,
  opts: ResolveTierOptions = {},
): Promise<TierId> {
  return (await resolveUserTierDetailed(db, userId, opts)).tier;
}
