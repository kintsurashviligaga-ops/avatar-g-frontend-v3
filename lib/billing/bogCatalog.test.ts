/**
 * lib/billing/bogCatalog — what BOG sells must be what the pricing page shows and what the server accepts.
 */
import { BOG_PLAN_OFFERS, BOG_TOPUP_PACKS_GEL, bogPlanOffer, planPriceGel, resolvePlanTier, topupCredits } from './bogCatalog';
import { PRICING_TIERS, PRICING_TIER_TO_TIER } from './pricingConfig';
import { REFILL_TIERS_GEL } from './gel';
import { monthlyAllowanceCredits } from './tiers';

test('every plan is charged exactly the ₾ figure the pricing page shows for it', () => {
  for (const rung of PRICING_TIERS.filter((t) => t.priceUsd > 0)) {
    const tier = PRICING_TIER_TO_TIER[rung.id];
    expect(tier).not.toBe('free');
    expect(planPriceGel(tier as Exclude<typeof tier, 'free'>)).toBe(rung.priceGel);
  }
});

test('the plans grant the catalogue’s monthly allowance', () => {
  expect(BOG_PLAN_OFFERS.map((o) => o.tier)).toEqual(['starter', 'creator', 'business']);
  for (const o of BOG_PLAN_OFFERS) {
    expect(o.credits).toBe(monthlyAllowanceCredits(o.tier));
    expect(o.credits).toBeGreaterThan(0);
    expect(o.amountGel).toBeGreaterThan(0);
  }
});

test('the pricing page’s rung ids (basic/pro) resolve to catalogue tiers; anything else is refused', () => {
  expect(resolvePlanTier('basic')).toBe('starter');
  expect(resolvePlanTier('PRO')).toBe('creator');
  expect(resolvePlanTier('business')).toBe('business');
  expect(resolvePlanTier('free')).toBeNull();
  expect(resolvePlanTier('enterprise')).toBeNull();
  expect(resolvePlanTier(42)).toBeNull();
  expect(bogPlanOffer('free')).toBeNull();
});

test('every PAYG pack the checkout shows is purchasable with the default tier store', () => {
  for (const g of BOG_TOPUP_PACKS_GEL) expect(REFILL_TIERS_GEL as readonly number[]).toContain(g);
});

test('a top-up books floor(amount × 10) credits, like credit_wallet_gel', () => {
  expect(topupCredits(10)).toBe(100);
  expect(topupCredits(9.99)).toBe(99);
  expect(topupCredits(0)).toBe(0);
  expect(topupCredits(Number.NaN)).toBe(0);
});
