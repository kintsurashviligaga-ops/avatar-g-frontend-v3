// lib/billing/helpers.ts

import { YEARLY_DISCOUNT_PERCENT, type PlanId, PLANS } from './pricingConfig'

export function getYearlyPrice(monthlyUsd: number): number {
  return parseFloat((monthlyUsd * 12 * (1 - YEARLY_DISCOUNT_PERCENT / 100)).toFixed(2))
}

export function getYearlyMonthlyEquivalent(monthlyUsd: number): number {
  return parseFloat((monthlyUsd * (1 - YEARLY_DISCOUNT_PERCENT / 100)).toFixed(2))
}

export function formatCurrency(
  amount: number,
  currency: 'USD' | 'GEL',
  locale: 'ka-GE' | 'en-US' | 'ru-RU' = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency === 'GEL' ? 'GEL' : 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function safePlan(planId: string): PlanId {
  return Object.keys(PLANS).includes(planId) ? (planId as PlanId) : 'trial'
}

export function getPlanOrFallback(planId: string) {
  return PLANS[safePlan(planId)]
}
