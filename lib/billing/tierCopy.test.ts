/** @jest-environment node */
/**
 * The billing modal's bullets must state the SAME numbers as the tier ceilings.
 *
 * ⚠️ THIS TEST EXISTS BECAUSE THE COPY DRIFTED THE DAY THE CEILINGS MOVED. Business was rebalanced to
 * {16 videos, 60 music, 250 images} so a bigger pack finally bought more per dollar than Pro — and the
 * hand-written bullets in CreditsModal kept saying 200 images / 50 tracks. The pricing PAGE advertised
 * 250/60 while the billing MODAL, the screen someone reads with their card out, advertised less.
 *
 * It was caught by opening the modal as a signed-in user, not by reading the diff — which is exactly the
 * kind of miss a test should absorb instead.
 */
import { PRICING_TIERS } from './pricingConfig';
import { TIER_FEATURES } from '@/components/studio/CreditsModal';

const paid = PRICING_TIERS.filter((t) => t.priceUsd > 0);

describe('billing-modal copy matches the tier ceilings', () => {
  it.each(paid.map((t) => [t.id, t] as const))('%s states its real video/music/image counts', (_id, tier) => {
    // Georgian is the authoritative copy; en/ru are translations of it.
    const text = TIER_FEATURES[tier.id].ka.join(' · ');
    for (const n of [tier.creditCeiling.videos, tier.creditCeiling.music, tier.creditCeiling.images]) {
      expect(text).toMatch(new RegExp(`(^|[^0-9])${n}([^0-9]|$)`));
    }
  });

  it.each(paid.map((t) => [t.id, t] as const))('%s says the same thing in all three languages', (_id, tier) => {
    const counts = (s: string[]) => (s.join(' ').match(/\d+/g) ?? []).map(Number).sort((a, b) => a - b);
    expect(counts(TIER_FEATURES[tier.id].en)).toEqual(counts(TIER_FEATURES[tier.id].ka));
    expect(counts(TIER_FEATURES[tier.id].ru)).toEqual(counts(TIER_FEATURES[tier.id].ka));
  });
});
