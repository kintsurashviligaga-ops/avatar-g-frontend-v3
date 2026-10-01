// lib/billing/pricingConfig.ts
// ─── Pricing-page ladder (PRICING_TIERS) + the older PLANS / CREDIT_PACKS / CREDIT_COSTS tables. ────────
// ⚠️ SUBSCRIPTION TIERS ARE DEFINED IN ./tiers (TIERS) — PRICING_TIERS below is DERIVED from it. Do not put a
// tier price or credit number in this file; change the catalogue and the page follows.
// ADDITIVE — does NOT replace the existing lib/billing/plans.ts (PlanTier system).
import { GEL_PER_USD } from './fx'
import { TIERS, priceIdForTier, tierCreditPool, tierFromStripePriceId, type TierId } from './tiers'

export type PlanId = 'trial' | 'pro' | 'business' | 'executive'
export type Priority = 'standard' | 'priority' | 'executive'
export type BillingCycle = 'monthly' | 'yearly'
export type CreditsMonthly = number | 'unlimited'

export interface PlanSpec {
  id: PlanId
  nameKey: string // next-intl key
  taglineKey: string
  priceMonthlyUsd: number
  priceMonthlyGel: number | null
  creditsMonthly: CreditsMonthly
  fairUseSoftCapCredits?: number // only for unlimited plans
  seats: number
  packsPerWeek: number | 'unlimited'
  priority: Priority
  featuresKeys: string[]
  highlighted?: boolean
}

export const YEARLY_DISCOUNT_PERCENT = 20 as const

export const PLANS: Record<PlanId, PlanSpec> = {
  trial: {
    id: 'trial',
    nameKey: 'pricing.plan.trial.name',
    taglineKey: 'pricing.plan.trial.tagline',
    priceMonthlyUsd: 0,
    priceMonthlyGel: 0,
    creditsMonthly: 50,
    seats: 1,
    packsPerWeek: 1,
    priority: 'standard',
    featuresKeys: [
      'pricing.plan.trial.f1',
      'pricing.plan.trial.f2',
      'pricing.plan.trial.f3',
      'pricing.plan.trial.f4',
      'pricing.plan.trial.f5',
      'pricing.plan.trial.f6',
    ],
  },
  pro: {
    id: 'pro',
    nameKey: 'pricing.plan.pro.name',
    taglineKey: 'pricing.plan.pro.tagline',
    priceMonthlyUsd: 19,
    priceMonthlyGel: 49,
    creditsMonthly: 500,
    seats: 1,
    packsPerWeek: 3,
    priority: 'standard',
    featuresKeys: [
      'pricing.plan.pro.f1', 'pricing.plan.pro.f2', 'pricing.plan.pro.f3',
      'pricing.plan.pro.f4', 'pricing.plan.pro.f5', 'pricing.plan.pro.f6',
      'pricing.plan.pro.f7',
    ],
  },
  business: {
    id: 'business',
    nameKey: 'pricing.plan.business.name',
    taglineKey: 'pricing.plan.business.tagline',
    priceMonthlyUsd: 59,
    priceMonthlyGel: 149,
    creditsMonthly: 2000,
    seats: 3,
    packsPerWeek: 10,
    priority: 'priority',
    highlighted: true,
    featuresKeys: [
      'pricing.plan.business.f1', 'pricing.plan.business.f2', 'pricing.plan.business.f3',
      'pricing.plan.business.f4', 'pricing.plan.business.f5', 'pricing.plan.business.f6',
    ],
  },
  executive: {
    id: 'executive',
    nameKey: 'pricing.plan.executive.name',
    taglineKey: 'pricing.plan.executive.tagline',
    priceMonthlyUsd: 500,
    priceMonthlyGel: null,
    creditsMonthly: 'unlimited',
    fairUseSoftCapCredits: 20_000,
    seats: 1,
    packsPerWeek: 'unlimited',
    priority: 'executive',
    featuresKeys: [
      'pricing.plan.executive.f1', 'pricing.plan.executive.f2', 'pricing.plan.executive.f3',
      'pricing.plan.executive.f4', 'pricing.plan.executive.f5', 'pricing.plan.executive.f6',
      'pricing.plan.executive.f7', 'pricing.plan.executive.f8', 'pricing.plan.executive.f9',
    ],
  },
}

// ─── CREDIT PACKS ────────────────────────────────────────────────────────────

export const CREDIT_PACKS = [
  { id: 'pack_300', priceGel: 25, priceUsd: 10, credits: 300 },
  { id: 'pack_1200', priceGel: 75, priceUsd: 29, credits: 1200 },
  { id: 'pack_2800', priceGel: 149, priceUsd: 59, credits: 2800 },
] as const

export type CreditPackId = typeof CREDIT_PACKS[number]['id']

// ─── CREDIT COSTS PER OPERATION ──────────────────────────────────────────────

export const CREDIT_COSTS = {
  profit_calc: 5,
  product_analysis: 60,
  business_plan: 120,
  listing_pack: 180,
  resell_pipeline: 220,
  promo_video: 200,
  executive_task_base: 50, // base cost per executive orchestration step
} as const

export type CreditOperation = keyof typeof CREDIT_COSTS

// ─── HELPERS ─────────────────────────────────────────────────────────────────

export function isUnlimitedPlan(planId: PlanId): boolean {
  return PLANS[planId].creditsMonthly === 'unlimited'
}

export function getSoftCap(planId: PlanId): number | null {
  return PLANS[planId].fairUseSoftCapCredits ?? null
}

// ─── PRICING TIERS — the live pricing page's ladder, DERIVED from lib/billing/tiers.ts ───────────────────────
//
// ⚠️ THE NUMBERS NO LONGER LIVE HERE. Price, ceiling and credit pool of every rung come from the subscription
// catalogue (lib/billing/tiers.ts) through PRICING_TIER_TO_TIER below. This ladder keeps its OWN ids and English
// names because they are on the wire and in the copy: /api/billing/tier-checkout takes `tierId: basic|pro|business`,
// PricingSection / CreditsModal key their localized names and bullets on them, and the JSON-LD product names must
// match what the page shows. Renaming the visible rungs to Starter / Creator is a product call for launch day,
// not a side effect of this refactor.
//
// ⚠️ NOT YET WIRED TO LIVE CHECKOUT. /api/billing/tier-checkout sells these as ONE-TIME packs (mode:'payment',
// inline USD price_data validated against USD_TIER_PRICES). The recurring subscription for the same rung is
// /api/billing/subscribe, inert until STRIPE_PRICE_<TIER> is set (docs/billing/TIERS.md).

export type PricingTierId = 'free' | 'basic' | 'pro' | 'business'

export interface PricingTier {
  id: PricingTierId
  name: string
  /** PHASE 39 (Master Contract V1/V2) — the tier is now priced in USD ($). This is the DISPLAYED price. */
  priceUsd: number
  /** GEL equivalent (priceUsd × GEL_PER_USD) — the amount the GEL wallet/gateway charges, kept in lockstep
   *  with the USD display so a top-up never bills a number the user didn't see. */
  priceGel: number
  billing: 'monthly' | 'annual'
  /** Marketing ceilings the price is framed around. */
  creditCeiling: { videos: number; music: number; images: number }
  /** Credit-pool grant on the tier (Σ ceiling × media cost — see tierCreditPool). */
  creditsIncluded: number
}

// PHASE 39 — the product is priced in USD; the wallet/gateway settles in GEL. ONE documented FX constant keeps
// the charged GEL coherent with the displayed USD. Iteration 4 — the definition moved to the leaf ./fx SSoT so
// it can't drift from credits/pricing's USD_TO_GEL; re-exported here so every existing importer is unchanged.
export { GEL_PER_USD }

// Σ (ceiling × per-asset media credit cost) — now defined next to the catalogue it prices; re-exported so every
// existing importer (and pricingTiers.test.ts) is unchanged.
export { tierCreditPool }

/** Which catalogue tier each pricing-page rung IS. basic→starter and pro→creator are renames, not new offers. */
export const PRICING_TIER_TO_TIER: Readonly<Record<PricingTierId, TierId>> = {
  free: 'free',
  basic: 'starter',
  pro: 'creator',
  business: 'business',
}

function fromCatalogue(id: PricingTierId, name: string): PricingTier {
  const t = TIERS[PRICING_TIER_TO_TIER[id]]
  const creditCeiling = { ...t.creditCeiling }
  return {
    id,
    name,
    priceUsd: t.monthlyPriceUsd,
    priceGel: Math.round(t.monthlyPriceUsd * GEL_PER_USD),
    billing: 'monthly',
    creditCeiling,
    creditsIncluded: tierCreditPool(creditCeiling),
  }
}

/**
 * The 4-rung ladder the live pricing page renders: Free $0 · Basic $19.99 · Pro $39.99 · Business $79.99, with
 * 50 / 230 / 525 / 1200 credits. The margin structure and the history of every ceiling are documented on TIERS.
 */
export const PRICING_TIERS: PricingTier[] = [
  fromCatalogue('free', 'Free'),
  fromCatalogue('basic', 'Basic'),
  fromCatalogue('pro', 'Pro'),
  fromCatalogue('business', 'Business'),
]

/**
 * The USD amounts a checkout session may legitimately carry — a session amount is VALIDATED against this
 * list so a wrong amount can never reach Stripe.
 *
 * Lives HERE, not in stripe.ts, for two reasons: it is pricing data (stripe.ts is the client), and stripe.ts
 * transitively imports an ESM-only env package that jest cannot parse — so an allowlist defined there is
 * untestable. The FREE tier is filtered out deliberately: it is granted, never checked out, and $0 in this
 * list would make a $0 checkout session for a PAID tier validate successfully.
 */
export const USD_TIER_PRICES: readonly number[] = PRICING_TIERS.filter((t) => t.priceUsd > 0).map((t) => t.priceUsd)

// ─── Live Stripe Price ID resolution (env placeholders — you insert the real IDs in Vercel) ─────────────────
// The code NEVER hardcodes a price ID. Each tier's live Stripe Price ID lives in an env var; until it's set,
// the tier is NOT purchasable — and that is the SAFETY property: no env → no charge → a wrong-amount charge is
// impossible.
//
// ⚠️ THE ENV NAMES MOVED TO THE CATALOGUE'S, AND THE OLD ONES WERE A TRAP. This map used to say basic →
// STRIPE_PRICE_BASIC and pro → STRIPE_PRICE_PRO — but STRIPE_PRICE_PRO is ALREADY the legacy PlanTier 'PRO' price
// (lib/billing/stripe-prices.ts, .env.example, README's "$30 Basic"). Setting it for one system would have
// resolved the other's subscription into the wrong tier. One name per tier now, owned by lib/billing/tiers.ts:
// STRIPE_PRICE_STARTER / STRIPE_PRICE_CREATOR / STRIPE_PRICE_BUSINESS (each a RECURRING monthly price).
export const TIER_STRIPE_PRICE_ENV: Record<PricingTierId, string> = {
  // The free tier has no Stripe price object by definition — it is granted, never checked out.
  free: TIERS.free.stripePriceEnv ?? '',
  basic: TIERS.starter.stripePriceEnv ?? '',
  pro: TIERS.creator.stripePriceEnv ?? '',
  business: TIERS.business.stripePriceEnv ?? '',
}

/** Resolve a tier's live Stripe Price ID from env; null when unset (tier not yet purchasable). */
export function stripePriceIdForTier(id: PricingTierId): string | null {
  return priceIdForTier(PRICING_TIER_TO_TIER[id], process.env)
}

/** Reverse lookup: which pricing-page rung a Stripe Price ID belongs to (null when unknown or ambiguous). */
export function tierByStripePriceId(priceId: string | null | undefined): PricingTier | null {
  const tier = tierFromStripePriceId(priceId, process.env)
  if (!tier) return null
  return PRICING_TIERS.find((t) => PRICING_TIER_TO_TIER[t.id] === tier) ?? null
}
