/** @jest-environment node */
import { PRICING_TIERS, tierCreditPool, TIER_STRIPE_PRICE_ENV, stripePriceIdForTier, tierByStripePriceId } from './pricingConfig';
import { USD_TIER_PRICES, PRICING_TIER_TO_TIER } from './pricingConfig';
import { TIERS, monthlyAllowanceCredits } from './tiers';

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

  it('a paid rung includes exactly what its ceiling buys at the price book (a price change fails here, not on the page)', () => {
    for (const tier of PRICING_TIERS.filter((t) => t.priceUsd > 0)) {
      expect(tier.creditsIncluded).toBe(tierCreditPool(tier.creditCeiling));
    }
    // ⚠️ THE FREE TIER IS ONE GRANT, NOT THREE PROMISES: the 50 credits the DB trigger grants, framed as tracks +
    // images, plus the one free film from its own quota (free_films_remaining), which the 50 do not pay for.
    const free = PRICING_TIERS.find((t) => t.id === 'free')!;
    expect(free.creditCeiling).toEqual({ videos: 1, music: 5, images: 7 });
    expect(free.creditsIncluded).toBe(50);
    expect(tierCreditPool({ ...free.creditCeiling, videos: 0 })).toBe(50);
  });

  it('no plan sells a credit below the price book\'s credit value (10 credits per lari of its BOG price)', () => {
    // ⚠️ THE OWNER'S 100 %-PROFIT RULE (PRD v2 §1.1, 2026-10-18) IS WHY THERE IS NO VOLUME BONUS. Every service is priced
    // at exactly twice its cost against a 0.10 ₾ credit; a plan credit sold for less would sell every service below the
    // rule. A plan may give MORE only if the price book is re-priced against that cheaper credit (the owner's option 2).
    for (const tier of PRICING_TIERS.filter((t) => t.priceUsd > 0)) {
      expect(tier.creditsIncluded).toBeLessThanOrEqual(tier.priceGel * 10);
      expect(tier.creditsIncluded).toBe(tier.priceGel * 10);
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

  it('tierCreditPool prices a ceiling at the price book (an 8 s Fast film, a 30 s track, an image)', () => {
    expect(tierCreditPool({ videos: 2, music: 10, images: 20 })).toBe(280); // 150 + 30 + 100
    expect(tierCreditPool({ videos: 10, music: 50, images: 100 })).toBe(1400); // 750 + 150 + 500
  });
});

describe('Stripe Price ID env resolution (safe: no env → not purchasable, never a wrong charge)', () => {
  const SAVE: Record<string, string | undefined> = {};
  const ENVS = Object.values(TIER_STRIPE_PRICE_ENV).filter(Boolean);
  beforeEach(() => { for (const k of ENVS) { SAVE[k] = process.env[k]; delete process.env[k]; } });
  afterEach(() => { for (const k of ENVS) { if (SAVE[k] === undefined) delete process.env[k]; else process.env[k] = SAVE[k]; } });

  it('maps each PAID tier to the catalogue env var; free has none', () => {
    // ⚠️ NOT STRIPE_PRICE_PRO ANY MORE. That name is the legacy PlanTier 'PRO' price (lib/billing/stripe-prices.ts),
    // so pro → STRIPE_PRICE_PRO would have resolved the old system's subscription into this ladder's $39.99 rung.
    expect(TIER_STRIPE_PRICE_ENV).toEqual({
      free: '',
      basic: 'STRIPE_PRICE_STARTER',
      pro: 'STRIPE_PRICE_CREATOR',
      business: 'STRIPE_PRICE_BUSINESS',
    });
    expect(Object.values(TIER_STRIPE_PRICE_ENV)).not.toContain('STRIPE_PRICE_PRO');
  });

  it('returns null when the env is unset (tier not yet purchasable)', () => {
    expect(stripePriceIdForTier('basic')).toBeNull();
    expect(tierByStripePriceId('price_anything')).toBeNull();
  });

  it('never resolves a price for the FREE tier — it is granted, never checked out', () => {
    process.env.STRIPE_PRICE_STARTER = 'price_live_starter_123';
    expect(stripePriceIdForTier('free')).toBeNull();
  });

  it('resolves and reverse-resolves once the env holds a price ID', () => {
    process.env.STRIPE_PRICE_CREATOR = 'price_live_creator_123';
    expect(stripePriceIdForTier('pro')).toBe('price_live_creator_123');
    expect(tierByStripePriceId('price_live_creator_123')?.id).toBe('pro');
    expect(tierByStripePriceId('price_unknown')).toBeNull();
  });

  it('EXCLUDES $0 from the checkout amount allowlist', () => {
    // USD_TIER_PRICES validates a Stripe session amount. Letting the free tier's $0 in would make a $0
    // checkout session for a PAID tier validate successfully.
    expect(USD_TIER_PRICES).toEqual([19.99, 39.99, 79.99]);
    expect(USD_TIER_PRICES).not.toContain(0);
  });
});

describe('PRICING_TIERS is derived from the subscription catalogue (lib/billing/tiers.ts)', () => {
  // ⚠️ SIX CATALOGUES USED TO DISAGREE. The pricing page's ladder keeps its wire ids (basic/pro) but every money
  // number must be the catalogue's — the page is the promise, the catalogue is what the webhook grants.
  it('maps basic→starter, pro→creator, business→business with identical price and credits', () => {
    expect(PRICING_TIER_TO_TIER).toEqual({ free: 'free', basic: 'starter', pro: 'creator', business: 'business' });
    for (const rung of PRICING_TIERS) {
      const tier = TIERS[PRICING_TIER_TO_TIER[rung.id]];
      expect(rung.priceUsd).toBe(tier.monthlyPriceUsd);
      expect(rung.creditCeiling).toEqual(tier.creditCeiling);
      expect(rung.creditsIncluded).toBe(tier.includedCredits);
    }
    expect(PRICING_TIERS.map((t) => t.creditsIncluded)).toEqual([50, 540, 1080, 2160]);
  });

  it('a paid rung grants on its invoice exactly what the page says is included', () => {
    for (const rung of PRICING_TIERS.filter((t) => t.priceUsd > 0)) {
      expect(monthlyAllowanceCredits(PRICING_TIER_TO_TIER[rung.id])).toBe(rung.creditsIncluded);
    }
  });

  it('hands the page COPIES of the ceilings, so nothing rendering them can mutate the catalogue', () => {
    const basic = PRICING_TIERS.find((t) => t.id === 'basic')!;
    expect(basic.creditCeiling).toEqual(TIERS.starter.creditCeiling);
    expect(basic.creditCeiling).not.toBe(TIERS.starter.creditCeiling);
  });
});
