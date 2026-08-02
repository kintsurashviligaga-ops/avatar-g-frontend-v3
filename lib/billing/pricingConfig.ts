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

/**
 * The 4-tier subscription ladder. Ceilings are sized so the PROVIDER cost of a fully-consumed tier lands
 * near ⅓ of its price — the 200%-margin structure — using the Master Task §1.8 unit costs
 * ($0.12/video-second → $0.96 per 8s clip · $0.10/track · $0.03/image):
 *
 *   Basic     4×8s video $3.84 + 10 music $1.00 + 40 images $1.20  = $6.04   of $19.99  (≈3.3×)
 *   Pro       8×8s video $7.68 + 25 music $2.50 + 100 images $3.00 = $13.18  of $39.99  (≈3.0×)
 *   Business 16×8s video $15.36 + 50 music $5.00 + 200 images $6.00 = $26.36 of $79.99  (≈3.0×)
 *
 * Free grants images + chat only — no video/music — matching the §2.5.1 free-tier rate limits.
 * `creditsIncluded` is DERIVED from the ceilings (tierCreditPool) so a media-cost change flows through
 * instead of silently drifting from a hardcoded total.
 */
export const PRICING_TIERS: PricingTier[] = [
  // ⚠️ THE FREE TIER WAS THREE CONTRADICTORY PROMISES. The card advertised 6 images (12 credits), the DB
  // trigger granted 10, and `profiles.free_films_remaining` handed out 3 free VIDEOS that the credit
  // ledger knew nothing about — so a new user was told three different numbers and none of them was what
  // they got. One grant now: 50 credits, with the video quota expressed IN the ceiling.
  //
  // The ceiling sums to exactly 50 (1x25 + 1x5 + 10x2), so `creditsIncluded` stays DERIVED rather than a
  // hardcoded total that can drift — the property the test below pins. It is also a real allocation: a
  // user can genuinely do one video, one track and ten images, or spend the same 50 on 25 images instead.
  //
  // ⚠️ THE 1-VIDEO CAP IS THE WHOLE COST CONTROL, AND IT IS ENFORCED — `free_films_remaining` (default 1)
  // via the race-safe consume_free_film RPC, not by this number. Video is the one medium sold BELOW cost
  // (25 credits = $0.926 of revenue against $0.96 of Veo), so an uncapped free grant spendable on video
  // is a cash transfer. Worst-case provider spend per signup is now $1.46 (1 video + 5 tracks), against
  // $3.06 for the 6-images-plus-3-films it replaces.
  makeTier('free', 'Free', 0, 'monthly', { videos: 1, music: 1, images: 10 }, tierCreditPool({ videos: 1, music: 1, images: 10 })),
  makeTier('basic', 'Basic', 19.99, 'monthly', { videos: 4, music: 10, images: 40 }, tierCreditPool({ videos: 4, music: 10, images: 40 })),
  makeTier('pro', 'Pro', 39.99, 'monthly', { videos: 8, music: 25, images: 100 }, tierCreditPool({ videos: 8, music: 25, images: 100 })),
  // ⚠️ BUSINESS WAS PRO x2 EXACTLY — 16=2x8 videos, 50=2x25 music, 200=2x100 images, at 2x the price — so
  // it delivered 13.1266 credits/$ against Pro's 13.1283. Paying twice as much bought you very slightly
  // FEWER credits per dollar, because the price ratio (2.00025) beat the credit ratio (2.00000). A
  // three-rung ladder that was really two rungs, with no economic reason to climb the last one.
  // Music and images carry the bonus, NOT video: video is the loss-making medium, so buying the same
  // ~1200 credits with 5 extra videos instead would have pushed the margin to 2.57x and made the richer
  // tier worse for the platform. Now 15.00 credits/$ (+14.3% over Pro), margin 2.772x — inside the
  // 2.5-4.5 corridor, price untouched at $79.99.
  makeTier('business', 'Business', 79.99, 'monthly', { videos: 16, music: 60, images: 250 }, tierCreditPool({ videos: 16, music: 60, images: 250 })),
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
// impossible. When you add the IDs, checkout + the webhook credit-grant can be wired to these resolvers.
export const TIER_STRIPE_PRICE_ENV: Record<PricingTierId, string> = {
  // The free tier has no Stripe price object by definition — it is granted, never checked out.
  free: '',
  basic: 'STRIPE_PRICE_BASIC',
  pro: 'STRIPE_PRICE_PRO',
  business: 'STRIPE_PRICE_BUSINESS',
}

/** Resolve a tier's live Stripe Price ID from env; null when unset (tier not yet purchasable). */
export function stripePriceIdForTier(id: PricingTierId): string | null {
  const key = TIER_STRIPE_PRICE_ENV[id]
  if (!key) return null // free tier — never purchasable
  const v = process.env[key]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Reverse lookup: which tier a completed Stripe Price ID belongs to (for the webhook credit grant). */
export function tierByStripePriceId(priceId: string | null | undefined): PricingTier | null {
  if (!priceId) return null
  return PRICING_TIERS.find((t) => stripePriceIdForTier(t.id) === priceId) ?? null
}
