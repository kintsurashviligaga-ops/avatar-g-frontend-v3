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
 *
 * v8 (GG 2026-11-14, DRAFT): with NEXT_PUBLIC_PRICING_V8 on, plans and top-ups come from margin/bogV8 (Start 25 /
 * Creator 55 / Pro 129 / Business 299 ₾; packs 10 / 25 / 50 / 100 ₾ with a bonus). The order row stores what the order
 * is worth, so settlement and renewals follow the row, not the flag. With the flag off nothing here changes.
 */
import { pricingV8Active } from '@/lib/credits/priceBook';
import { GEL_PER_USD } from './fx';
import { BOG_PLAN_OFFERS_V8, BOG_TOPUP_PACKS_GEL_V8, bogPlanOfferV8, topupCreditsV8 } from './margin/bogV8';
import { TODAY_SOLD_TIER_IDS, TIERS, monthlyAllowanceCredits, type PaidTierId } from './tiers';

/** v8 prices switch, read literally so the browser bundle inlines it. */
const V8 = pricingV8Active(process.env.NEXT_PUBLIC_PRICING_V8);

/** credit_wallet_gel books floor(amount × 10) credits for a top-up. */
export const BOG_CREDITS_PER_GEL = 10;

/**
 * The PAYG packs the checkout offers. Each must also be purchasable server-side (getActiveTiers — the
 * admin-editable store, REFILL_TIERS_GEL when it is empty); bogCatalog.test.ts pins the defaults.
 */
export const BOG_TOPUP_PACKS_GEL_TODAY = [10, 20, 50] as const;
export const BOG_TOPUP_PACKS_GEL: readonly number[] = V8 ? BOG_TOPUP_PACKS_GEL_V8 : BOG_TOPUP_PACKS_GEL_TODAY;

/**
 * Bank of Georgia's limits for this merchant, from the bank's activation letter (2026-10-12): 500 ₾ per transaction,
 * 1,000 ₾ per 24 hours, 5,000 ₾ per 30 days. BOG refuses anything above them, so the checkout refuses a single order
 * over BOG_SINGLE_TRANSACTION_LIMIT_GEL before BOG is asked (a tier the admin prices above it stays sellable through
 * the other rail). The 24 h / 30 day limits are not enforced here: the admin BOG card shows how much of them is used.
 */
export const BOG_LIMITS_GEL = { singleTransaction: 500, per24h: 1_000, per30d: 5_000 } as const;
export const BOG_SINGLE_TRANSACTION_LIMIT_GEL = BOG_LIMITS_GEL.singleTransaction;

/**
 * Credits a top-up of `amountGel` books, everything included. Today floor(amount × 10). Under v8 a listed pack books its
 * bonus too: credit_wallet_gel still books floor(amount × 10) and settlement grants the rest (`bog-bonus:<order>`).
 */
export function topupCredits(amountGel: number, v8: boolean = V8): number {
  if (v8) return topupCreditsV8(amountGel);
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

/** v8: the plan ids of packages.ts (start/creator/pro/business), and `pro` is the real Pro tier. */
const PLAN_ALIASES_V8: Readonly<Record<string, PaidTierId>> = {
  starter: 'starter',
  start: 'starter',
  basic: 'starter',
  creator: 'creator',
  pro: 'pro',
  business: 'business',
};

export function resolvePlanTier(id: unknown, v8: boolean = V8): PaidTierId | null {
  if (typeof id !== 'string') return null;
  return (v8 ? PLAN_ALIASES_V8 : PLAN_ALIASES)[id.trim().toLowerCase()] ?? null;
}

/** The GEL charged each month for a plan. */
export function planPriceGel(tier: PaidTierId, v8: boolean = V8): number {
  const o = v8 ? bogPlanOfferV8(tier) : null;
  return o ? o.amountGel : Math.round(TIERS[tier].monthlyPriceUsd * GEL_PER_USD);
}

export interface BogPlanOffer {
  tier: PaidTierId;
  /** Charged now and on every renewal (BOG renewals inherit the first order's amount). */
  amountGel: number;
  /** Granted for every paid month. */
  credits: number;
}

export function bogPlanOffer(id: unknown, v8: boolean = V8): BogPlanOffer | null {
  const tier = resolvePlanTier(id, v8);
  if (!tier) return null;
  if (v8) {
    const o = bogPlanOfferV8(tier);
    return o ? { tier, amountGel: o.amountGel, credits: o.credits } : null;
  }
  if (!TODAY_SOLD_TIER_IDS.includes(tier)) return null;
  return { tier, amountGel: planPriceGel(tier, false), credits: monthlyAllowanceCredits(tier) };
}

/** Every plan, ascending — what the checkout renders. */
export const BOG_PLAN_OFFERS: readonly BogPlanOffer[] = V8
  ? BOG_PLAN_OFFERS_V8.map(({ tier, amountGel, credits }) => ({ tier, amountGel, credits }))
  : TODAY_SOLD_TIER_IDS.map((t) => bogPlanOffer(t, false) as BogPlanOffer);
