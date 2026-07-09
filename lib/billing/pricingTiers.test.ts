/** @jest-environment node */
import { PRICING_TIERS, tierCreditPool, TIER_STRIPE_PRICE_ENV, stripePriceIdForTier, tierByStripePriceId } from './pricingConfig';

describe('PRICING_TIERS (Day-1 Task 6 — credit-pool mapping)', () => {
  it('defines the three verified tiers with the confirmed GEL prices', () => {
    expect(PRICING_TIERS.map((t) => [t.id, t.priceGel, t.billing])).toEqual([
      ['starter', 38, 'monthly'],
      ['pro_creator', 299, 'monthly'],
      ['studio_annual', 899, 'annual'],
    ]);
  });

  it('derives the credit pool from the per-asset ceilings × media costs (video 25 · music 5 · image 2)', () => {
    // Σ ceiling × cost — never hardcoded, so a media-cost change flows through.
    expect(tierCreditPool({ videos: 2, music: 10, images: 20 })).toBe(140); // 50 + 50 + 40
    expect(tierCreditPool({ videos: 10, music: 50, images: 100 })).toBe(700); // 250 + 250 + 200
    expect(tierCreditPool({ videos: 40, music: 250, images: 500 })).toBe(3250); // 1000 + 1250 + 1000
    const byId = Object.fromEntries(PRICING_TIERS.map((t) => [t.id, t.creditsIncluded]));
    expect(byId).toEqual({ starter: 140, pro_creator: 700, studio_annual: 3250 });
  });
});

describe('Stripe Price ID env resolution (safe: no env → not purchasable, never a wrong charge)', () => {
  const SAVE: Record<string, string | undefined> = {};
  const ENVS = Object.values(TIER_STRIPE_PRICE_ENV);
  beforeEach(() => { for (const k of ENVS) { SAVE[k] = process.env[k]; delete process.env[k]; } });
  afterEach(() => { for (const k of ENVS) { if (SAVE[k] === undefined) delete process.env[k]; else process.env[k] = SAVE[k]; } });

  it('maps each tier to its documented env var', () => {
    expect(TIER_STRIPE_PRICE_ENV).toEqual({
      starter: 'STRIPE_PRICE_STARTER',
      pro_creator: 'STRIPE_PRICE_PRO_CREATOR',
      studio_annual: 'STRIPE_PRICE_STUDIO_ANNUAL',
    });
  });

  it('returns null when the env is unset (tier not yet purchasable)', () => {
    expect(stripePriceIdForTier('starter')).toBeNull();
    expect(tierByStripePriceId('price_anything')).toBeNull();
  });

  it('resolves and reverse-resolves once the env holds a price ID', () => {
    process.env.STRIPE_PRICE_PRO_CREATOR = 'price_live_pro_123';
    expect(stripePriceIdForTier('pro_creator')).toBe('price_live_pro_123');
    expect(tierByStripePriceId('price_live_pro_123')?.id).toBe('pro_creator');
    expect(tierByStripePriceId('price_unknown')).toBeNull();
  });
});
