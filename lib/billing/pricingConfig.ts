// lib/billing/pricingConfig.ts
// ─── THE ONLY place that defines NEW pricing tiers, credits, limits. ────────
// UI + API + workers ALL import from here. Never duplicate these values.
// ADDITIVE — does NOT replace the existing lib/billing/plans.ts (PlanTier system).

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
