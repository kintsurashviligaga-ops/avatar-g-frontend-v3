/**
 * lib/billing/bogCatalog.ts — what can be bought through Bank of Georgia, in GEL. Isomorphic and pure: the
 * checkout UI renders from it and the checkout route validates against it, so the two cannot disagree.
 *
 *   top-up (PAYG)   a GEL amount → floor(amount × 10) credits, booked by credit_wallet_gel (1 credit = 0.10 ₾)
 *   plan            a catalogue tier (lib/billing/tiers.ts) charged monthly in GEL on a saved card; each paid
 *                   month grants the tier's monthly allowance
 *
 * ⚠️ PLAN PRICES ARE THE PRICING PAGE'S PRICES. planPriceGel uses the same rounding as PRICING_TIERS.priceGel
 * (round(monthlyPriceUsd × GEL_PER_USD)), and bogCatalog.test.ts fails if they ever drift — a customer must be
 * charged exactly the ₾ figure they were shown.
 */
import { GEL_PER_USD } from './fx';
import { PAID_TIER_IDS, TIERS, monthlyAllowanceCredits, type PaidTierId } from './tiers';

/** credit_wallet_gel books floor(amount × 10) credits for a top-up. */
export const BOG_CREDITS_PER_GEL = 10;

/**
 * The PAYG packs the checkout offers. Each must also be purchasable server-side (getActiveTiers — the
 * admin-editable store, REFILL_TIERS_GEL when it is empty); bogCatalog.test.ts pins the defaults.
 */
export const BOG_TOPUP_PACKS_GEL = [10, 20, 50] as const;

/**
 * Bank of Georgia's limits for this merchant, from the bank's activation letter (2026-10-12): 500 ₾ per transaction,
 * 1,000 ₾ per 24 hours, 5,000 ₾ per 30 days. BOG refuses anything above them, so the checkout refuses a single order
 * over BOG_SINGLE_TRANSACTION_LIMIT_GEL before BOG is asked (a tier the admin prices above it stays sellable through
 * the other rail). The 24 h / 30 day limits are not enforced here: the admin BOG card shows how much of them is used.
 */
export const BOG_LIMITS_GEL = { singleTransaction: 500, per24h: 1_000, per30d: 5_000 } as const;
export const BOG_SINGLE_TRANSACTION_LIMIT_GEL = BOG_LIMITS_GEL.singleTransaction;

/** Credits a top-up of `amountGel` books. */
export function topupCredits(amountGel: number): number {
  return Number.isFinite(amountGel) && amountGel > 0 ? Math.floor(amountGel * BOG_CREDITS_PER_GEL) : 0;
}

/** Ids a client may send for a plan: the catalogue's own, plus the pricing page's rung ids (basic/pro). */
const PLAN_ALIASES: Readonly<Record<string, PaidTierId>> = {
  starter: 'starter',
  creator: 'creator',
  business: 'business',
  basic: 'starter',
  pro: 'creator',
};

export function resolvePlanTier(id: unknown): PaidTierId | null {
  return typeof id === 'string' ? (PLAN_ALIASES[id.trim().toLowerCase()] ?? null) : null;
}

/** The GEL charged each month for a plan. */
export function planPriceGel(tier: PaidTierId): number {
  return Math.round(TIERS[tier].monthlyPriceUsd * GEL_PER_USD);
}

export interface BogPlanOffer {
  tier: PaidTierId;
  /** Charged now and on every renewal (BOG renewals inherit the first order's amount). */
  amountGel: number;
  /** Granted for every paid month. */
  credits: number;
}

export function bogPlanOffer(id: unknown): BogPlanOffer | null {
  const tier = resolvePlanTier(id);
  if (!tier) return null;
  return { tier, amountGel: planPriceGel(tier), credits: monthlyAllowanceCredits(tier) };
}

/** Every plan, ascending — what the checkout renders. */
export const BOG_PLAN_OFFERS: readonly BogPlanOffer[] = PAID_TIER_IDS.map((t) => bogPlanOffer(t) as BogPlanOffer);
