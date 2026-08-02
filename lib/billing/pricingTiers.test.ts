/** @jest-environment node */
import { PRICING_TIERS, tierCreditPool, TIER_STRIPE_PRICE_ENV, stripePriceIdForTier, tierByStripePriceId } from './pricingConfig';
import { USD_TIER_PRICES } from './pricingConfig';

describe('PRICING_TIERS — the 4-tier ladder', () => {
  it('defines Free / Basic / Pro / Business in USD with a GEL settlement kept in lockstep (× 2.7)', () => {
    expect(PRICING_TIERS.map((t) => [t.id, t.priceUsd, t.billing])).toEqual([
      ['free', 0, 'monthly'],
      ['basic', 19.99, 'monthly'],
      ['pro', 39.99, 'monthly'],
      ['business', 79.99, 'monthly'],
    ]);
    // priceGel = round(priceUsd × GEL_PER_USD) so a top-up never bills a number the user didn't see.
    expect(PRICING_TIERS.map((t) => t.priceGel)).toEqual([0, 54, 108, 216]);
  });

  it('derives creditsIncluded from the ceilings (no hardcoded total that can drift)', () => {
    for (const tier of PRICING_TIERS) {
      expect(tier.creditsIncluded).toBe(tierCreditPool(tier.creditCeiling));
    }
    // ⚠️ THE FREE TIER IS ONE GRANT NOW, NOT THREE PROMISES. It used to advertise 6 images (12 credits)
    // while the DB trigger granted 10 and free_films_remaining handed out 3 uncounted videos. The trial
    // is 50 credits, and the ceiling is chosen so it SUMS to exactly 50 — keeping creditsIncluded derived
    // rather than a hardcoded total that drifts.
    const free = PRICING_TIERS.find((t) => t.id === 'free')!;
    expect(free.creditCeiling).toEqual({ videos: 1, music: 1, images: 10 });
    expect(free.creditsIncluded).toBe(50);
  });

  it('gives a bigger pack MORE credits per dollar — the reason to buy up', () => {
    // ⚠️ THIS IS THE DEFECT THIS TEST EXISTS TO PREVENT COMING BACK. Business was Pro doubled in every
    // dimension at twice the price, so it delivered 13.1266 credits/$ against Pro's 13.1283 — paying
    // twice as much bought marginally FEWER credits per dollar, because the price ratio (2.00025) beat
    // the credit ratio (2.00000). Three tiers, two of which were the same offer.
    const paid = PRICING_TIERS.filter((t) => t.priceUsd > 0).sort((a, b) => a.priceUsd - b.priceUsd);
    const perDollar = paid.map((t) => t.creditsIncluded / t.priceUsd);
    for (let i = 1; i < perDollar.length; i += 1) {
      // STRICTLY greater, and by a margin a customer would notice — not a rounding artefact.
      expect(perDollar[i]!).toBeGreaterThan(perDollar[i - 1]! * 1.05);
    }
  });

  it('keeps the ~200% margin structure: provider cost of a fully-consumed tier is near ⅓ of its price', () => {
    // Master Task §1.8 unit costs: $0.12/video-second (8s clip = $0.96) · $0.10/track · $0.03/image.
    const providerCost = (c: { videos: number; music: number; images: number }) =>
      c.videos * 0.96 + c.music * 0.1 + c.images * 0.03;
    for (const tier of PRICING_TIERS) {
      if (tier.priceUsd === 0) continue;
      const margin = tier.priceUsd / providerCost(tier.creditCeiling);
      expect(margin).toBeGreaterThanOrEqual(2.5); // never thinner than a 150% margin
      expect(margin).toBeLessThanOrEqual(4.5); // …and never so fat the tier is uncompetitive
    }
  });

  it('tierCreditPool still derives Σ ceiling × media cost (kept for the pool helper)', () => {
    expect(tierCreditPool({ videos: 2, music: 10, images: 20 })).toBe(140); // 50 + 50 + 40
    expect(tierCreditPool({ videos: 10, music: 50, images: 100 })).toBe(700); // 250 + 250 + 200
  });
});

describe('Stripe Price ID env resolution (safe: no env → not purchasable, never a wrong charge)', () => {
  const SAVE: Record<string, string | undefined> = {};
  const ENVS = Object.values(TIER_STRIPE_PRICE_ENV).filter(Boolean);
  beforeEach(() => { for (const k of ENVS) { SAVE[k] = process.env[k]; delete process.env[k]; } });
  afterEach(() => { for (const k of ENVS) { if (SAVE[k] === undefined) delete process.env[k]; else process.env[k] = SAVE[k]; } });

  it('maps each PAID tier to its documented env var; free has none', () => {
    expect(TIER_STRIPE_PRICE_ENV).toEqual({
      free: '',
      basic: 'STRIPE_PRICE_BASIC',
      pro: 'STRIPE_PRICE_PRO',
      business: 'STRIPE_PRICE_BUSINESS',
    });
  });

  it('returns null when the env is unset (tier not yet purchasable)', () => {
    expect(stripePriceIdForTier('basic')).toBeNull();
    expect(tierByStripePriceId('price_anything')).toBeNull();
  });

  it('never resolves a price for the FREE tier — it is granted, never checked out', () => {
    process.env.STRIPE_PRICE_BASIC = 'price_live_basic_123';
    expect(stripePriceIdForTier('free')).toBeNull();
  });

  it('resolves and reverse-resolves once the env holds a price ID', () => {
    process.env.STRIPE_PRICE_PRO = 'price_live_pro_123';
    expect(stripePriceIdForTier('pro')).toBe('price_live_pro_123');
    expect(tierByStripePriceId('price_live_pro_123')?.id).toBe('pro');
    expect(tierByStripePriceId('price_unknown')).toBeNull();
  });

  it('EXCLUDES $0 from the checkout amount allowlist', () => {
    // USD_TIER_PRICES validates a Stripe session amount. Letting the free tier's $0 in would make a $0
    // checkout session for a PAID tier validate successfully.
    expect(USD_TIER_PRICES).toEqual([19.99, 39.99, 79.99]);
    expect(USD_TIER_PRICES).not.toContain(0);
  });
});
