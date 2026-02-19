import 'server-only';

import { getServerEnv } from '@/lib/env/server';
import { normalizePlan, type PlanTier } from './plans';

export function getStripePriceId(plan: PlanTier | string): string | null {
  const { STRIPE_PRICE_PRO, STRIPE_PRICE_PREMIUM, STRIPE_PRICE_ENTERPRISE } = getServerEnv();
  const normalized = normalizePlan(plan);

  if (normalized === 'PRO') {
    return STRIPE_PRICE_PRO || null;
  }

  if (normalized === 'PREMIUM') {
    return STRIPE_PRICE_PREMIUM || null;
  }

  if (normalized === 'ENTERPRISE') {
    return STRIPE_PRICE_ENTERPRISE || null;
  }

  return null;
}

export function getPlanByStripePriceId(priceId: string): PlanTier | null {
  const { STRIPE_PRICE_PRO, STRIPE_PRICE_PREMIUM, STRIPE_PRICE_ENTERPRISE } = getServerEnv();

  if (STRIPE_PRICE_PRO && priceId === STRIPE_PRICE_PRO) {
    return 'PRO';
  }

  if (STRIPE_PRICE_PREMIUM && priceId === STRIPE_PRICE_PREMIUM) {
    return 'PREMIUM';
  }

  if (STRIPE_PRICE_ENTERPRISE && priceId === STRIPE_PRICE_ENTERPRISE) {
    return 'ENTERPRISE';
  }

  return null;
}
