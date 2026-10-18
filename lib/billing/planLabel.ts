/**
 * lib/billing/planLabel.ts — how a plan's name and price read on screen, in one place. Pure and client-safe.
 *
 * ⚠️ THE GEORGIAN PAGE LEADS WITH LARI (owner, PRD v2 §1.2, 2026-10-18). Bank of Georgia charges a plan in ₾, so on the
 * Georgian interface the ₾ amount is the price and the dollar figure is for reference; English and Russian keep the
 * dollar first. The amounts are PRICING_TIERS' own (priceGel is the ₾ the BOG checkout charges, lib/billing/bogCatalog).
 */
import { PRICING_TIERS, type PricingTier, type PricingTierId } from './pricingConfig';

export type PlanLang = 'ka' | 'en' | 'ru';

/** The visible plan names (pricingConfig keeps the English canonical names, which are on the wire). */
export const PLAN_NAME: Readonly<Record<PricingTierId, Record<PlanLang, string>>> = {
  free: { en: 'Free', ka: 'უფასო', ru: 'Бесплатно' },
  basic: { en: 'Basic', ka: 'საბაზისო', ru: 'Базовый' },
  pro: { en: 'Pro', ka: 'პრო', ru: 'Про' },
  business: { en: 'Business', ka: 'ბიზნესი', ru: 'Бизнес' },
};

/** A plan's monthly price: the amount to lead with, and the other currency for reference (null for a free plan). */
export function planPriceLabel(tier: Pick<PricingTier, 'priceUsd' | 'priceGel'>, locale: PlanLang): { main: string; sub: string | null } {
  if (tier.priceUsd <= 0) return { main: locale === 'ka' ? '0 ₾' : '$0', sub: null };
  return locale === 'ka'
    ? { main: `${tier.priceGel} ₾`, sub: `≈ $${tier.priceUsd}` }
    : { main: `$${tier.priceUsd}`, sub: `≈ ${tier.priceGel} ₾` };
}

/** The paid plan a sign-in link named (`?plan=basic`), or null when it names none, an unknown one, or the free plan. */
export function paidPlanById(id: string | null | undefined): PricingTier | null {
  if (!id) return null;
  return PRICING_TIERS.find((t) => t.id === id && t.priceUsd > 0) ?? null;
}
