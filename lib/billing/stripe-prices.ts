import 'server-only';

import { getServerEnv } from '@/lib/env/server';
import { normalizePlanTier, type PlanTier, type CanonicalPlanTier } from './plans';

export function getStripePriceId(plan: PlanTier | string): string | null {
  const { STRIPE_PRICE_PRO, STRIPE_PRICE_PREMIUM } = getServerEnv();
  const normalized = normalizePlanTier(plan);

  if (normalized === 'BASIC') {
    return STRIPE_PRICE_PRO || null;
  }

  if (normalized === 'PREMIUM') {
    return STRIPE_PRICE_PREMIUM || null;
  }

  return null;
}

export function getPlanByStripePriceId(priceId: string): CanonicalPlanTier | null {
  const { STRIPE_PRICE_PRO, STRIPE_PRICE_PREMIUM } = getServerEnv();

  if (STRIPE_PRICE_PRO && priceId === STRIPE_PRICE_PRO) {
    return 'BASIC';
  }

  if (STRIPE_PRICE_PREMIUM && priceId === STRIPE_PRICE_PREMIUM) {
    return 'PREMIUM';
  }

  return null;
}
