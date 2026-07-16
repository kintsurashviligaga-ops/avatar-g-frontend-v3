/** @jest-environment node */
import { PRICING_TIERS, tierCreditPool, TIER_STRIPE_PRICE_ENV, stripePriceIdForTier, tierByStripePriceId } from './pricingConfig';

describe('PRICING_TIERS (Master Contract V1/V2 — USD launch pricing)', () => {
  it('defines the three launch tiers in USD with a GEL settlement kept in lockstep (× 2.7)', () => {
    expect(PRICING_TIERS.map((t) => [t.id, t.priceUsd, t.billing])).toEqual([
      ['starter', 15, 'monthly'],
      ['pro_creator', 99, 'monthly'],
      ['studio_annual', 299, 'annual'],
    ]);
    // priceGel = round(priceUsd × GEL_PER_USD) so a top-up never bills a number the user didn't see.
    expect(PRICING_TIERS.map((t) => t.priceGel)).toEqual([41, 267, 807]);
  });

  it('carries the fixed marketing credit grants (150 / 1200 / 4500) and ceilings', () => {
    const byId = Object.fromEntries(PRICING_TIERS.map((t) => [t.id, t.creditsIncluded]));
    expect(byId).toEqual({ starter: 150, pro_creator: 1200, studio_annual: 4500 });
    expect(PRICING_TIERS.map((t) => t.creditCeiling)).toEqual([
      { videos: 4, music: 10, images: 30 },
      { videos: 35, music: 80, images: 200 },
      { videos: 120, music: 300, images: 800 },
    ]);
  });

  it('tierCreditPool still derives Σ ceiling × media cost (kept for the pool helper)', () => {
    expect(tierCreditPool({ videos: 2, music: 10, images: 20 })).toBe(140); // 50 + 50 + 40
    expect(tierCreditPool({ videos: 10, music: 50, images: 100 })).toBe(700); // 250 + 250 + 200
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
