// lib/billing/pricingConfig.ts
// ─── THE ONLY place that defines NEW pricing tiers, credits, limits. ────────
// UI + API + workers ALL import from here. Never duplicate these values.
// ADDITIVE — does NOT replace the existing lib/billing/plans.ts (PlanTier system).
import { CREDIT_COSTS as MEDIA_CREDIT_COSTS } from '@/lib/credits/pricing'
import { GEL_PER_USD } from './fx'

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

// ─── PRICING TIERS (Day-1 Task 6) — single source of truth for the credit-pool subscription tiers ───────────
// creditsIncluded is DERIVED from the media credit costs (Σ ceiling × cost) so a cost change flows through
// automatically — no hardcoded totals to drift. Render the pricing UI FROM this constant.
//
// ⚠️ NOT YET WIRED TO LIVE CHECKOUT. app/api/billing/checkout charges via FIXED Stripe price IDs, so the amount
// billed is the Stripe price object, NOT priceGel here. Flipping the displayed price without a matching Stripe
// (or dynamic BOG) price object would charge the WRONG amount. Going live needs those price objects + wiring.

export type PricingTierId = 'starter' | 'pro_creator' | 'studio_annual'

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
  /** Credit-pool grant on the tier (Master Contract V1/V2 fixed the marketing totals: 150 / 1200 / 4500). */
  creditsIncluded: number
}

// PHASE 39 — the product is priced in USD; the wallet/gateway settles in GEL. ONE documented FX constant keeps
// the charged GEL coherent with the displayed USD. Iteration 4 — the definition moved to the leaf ./fx SSoT so
// it can't drift from credits/pricing's USD_TO_GEL; re-exported here so every existing importer is unchanged.
export { GEL_PER_USD }

/** Σ (ceiling × per-asset media credit cost). Retained: the credit-pool equivalent of the per-asset ceilings. */
export function tierCreditPool(ceiling: { videos: number; music: number; images: number }): number {
  return (
    ceiling.videos * MEDIA_CREDIT_COSTS.video_30s +
    ceiling.music * MEDIA_CREDIT_COSTS.music_30s +
    ceiling.images * MEDIA_CREDIT_COSTS.image_generate
  )
}

function makeTier(id: PricingTierId, name: string, priceUsd: number, billing: 'monthly' | 'annual', creditCeiling: PricingTier['creditCeiling'], creditsIncluded: number): PricingTier {
  return { id, name, priceUsd, priceGel: Math.round(priceUsd * GEL_PER_USD), billing, creditCeiling, creditsIncluded }
}

// Master Contract V1/V2 — the launch USD tier list + marketing ceilings + fixed credit grants.
export const PRICING_TIERS: PricingTier[] = [
  makeTier('starter', 'Starter', 15, 'monthly', { videos: 4, music: 10, images: 30 }, 150),
  makeTier('pro_creator', 'Pro Creator', 99, 'monthly', { videos: 35, music: 80, images: 200 }, 1200),
  makeTier('studio_annual', 'Studio Annual', 299, 'annual', { videos: 120, music: 300, images: 800 }, 4500),
]

// ─── Live Stripe Price ID resolution (env placeholders — you insert the real IDs in Vercel) ─────────────────
// The code NEVER hardcodes a price ID. Each tier's live Stripe Price ID lives in an env var; until it's set,
// the tier is NOT purchasable — and that is the SAFETY property: no env → no charge → a wrong-amount charge is
// impossible. When you add the IDs, checkout + the webhook credit-grant can be wired to these resolvers.
export const TIER_STRIPE_PRICE_ENV: Record<PricingTierId, string> = {
  starter: 'STRIPE_PRICE_STARTER',
  pro_creator: 'STRIPE_PRICE_PRO_CREATOR',
  studio_annual: 'STRIPE_PRICE_STUDIO_ANNUAL',
}

/** Resolve a tier's live Stripe Price ID from env; null when unset (tier not yet purchasable). */
export function stripePriceIdForTier(id: PricingTierId): string | null {
  const v = process.env[TIER_STRIPE_PRICE_ENV[id]]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Reverse lookup: which tier a completed Stripe Price ID belongs to (for the webhook credit grant). */
export function tierByStripePriceId(priceId: string | null | undefined): PricingTier | null {
  if (!priceId) return null
  return PRICING_TIERS.find((t) => stripePriceIdForTier(t.id) === priceId) ?? null
}
