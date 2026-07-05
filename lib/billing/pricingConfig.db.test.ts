/** @jest-environment node */
// createServiceRoleClient → null makes every DB read fail open, so we assert the checkout-critical
// fallback to the hardcoded REFILL_TIERS_GEL (an admin can never lock out tiers / break a top-up pre-migration).
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => { throw new Error('no service role in test'); } }));

import { getActiveTiers, isPurchasableTierGel, getCommissionRules, getTierConfig, invalidatePricingCache, CREDITS_PER_GEL } from './pricingConfig.db';
import { REFILL_TIERS_GEL } from './gel';

beforeEach(() => invalidatePricingCache());

describe('pricingConfig.db fail-open', () => {
  it('getActiveTiers falls back to the hardcoded REFILL_TIERS_GEL (credits = ₾×10)', async () => {
    const tiers = await getActiveTiers();
    expect(tiers.map((t) => t.gelAmount)).toEqual([...REFILL_TIERS_GEL]);
    const five = tiers.find((t) => t.gelAmount === 5)!;
    expect(five.creditsAmount).toBe(5 * CREDITS_PER_GEL);
    expect(five.isActive).toBe(true);
  });

  it('isPurchasableTierGel accepts the constant tiers and rejects others', async () => {
    for (const g of REFILL_TIERS_GEL) expect(await isPurchasableTierGel(g)).toBe(true);
    for (const bad of [7, 0, -5, 3.5, Number.NaN]) expect(await isPurchasableTierGel(bad)).toBe(false);
  });

  it('getTierConfig reports usingDefaults when nothing is stored', async () => {
    const cfg = await getTierConfig();
    expect(cfg.usingDefaults).toBe(true);
    expect(cfg.configured).toEqual([]);
    expect(cfg.effective.length).toBe(REFILL_TIERS_GEL.length);
  });

  it('getCommissionRules fails open to []', async () => {
    expect(await getCommissionRules()).toEqual([]);
  });
});
