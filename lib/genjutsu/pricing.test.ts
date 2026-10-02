/**
 * The VFX price. For `scene` it IS the film clip's price (videoCredits for one 8 s Veo clip), pinned to exact numbers
 * and to the function it must be built from; for the provider-quoted ops it is null by design ("ask the server").
 */
import { CREDIT_VALUE_GEL } from '@/lib/credits/pricing';
import { videoCredits } from '@/lib/credits/videoPricing';
import { GEL_PER_USD } from '@/lib/billing/fx';
import { costPerSecondUsd } from '@/lib/veo/capabilities';
import { genjutsuCredits, genjutsuPriceSource } from './pricing';

test('a scene is one Veo clip: Fast 25 credits, Standard 83 — the film\'s own per-second pricing', () => {
  expect(genjutsuCredits({ op: 'scene', quality: 'fast' })).toBe(25);
  expect(genjutsuCredits({ op: 'scene', quality: 'standard' })).toBe(83);
  expect(genjutsuCredits({ op: 'scene' })).toBe(25); // the default tier is Fast
});

test('it is built from videoCredits, never a literal of its own', () => {
  expect(genjutsuCredits({ op: 'scene', quality: 'fast' })).toBe(videoCredits({ seconds: 8, quality: 'fast' }));
  expect(genjutsuCredits({ op: 'scene', quality: 'standard' })).toBe(videoCredits({ seconds: 8, quality: 'standard' }));
});

test('the reference photos are conditioning, not a billed unit — refsUsed and seconds do not move a scene\'s price', () => {
  const base = genjutsuCredits({ op: 'scene', quality: 'fast' });
  for (const refsUsed of [0, 1, 3]) expect(genjutsuCredits({ op: 'scene', quality: 'fast', refsUsed })).toBe(base);
  expect(genjutsuCredits({ op: 'scene', quality: 'fast', seconds: 30 })).toBe(base);
});

test('a quality the op does not offer falls back to the default tier, never a surprise upgrade', () => {
  expect(genjutsuCredits({ op: 'scene', quality: 'pro' })).toBe(25);
});

test('margin stays where the film\'s is: a scene sells within ~10 % of the Veo list cost (never a silent loss)', () => {
  // Veo 3.1 Fast and Standard at 1080p with audio, 8 s (reference mode forces 8 s → 1080p) — the engine's own price table.
  const cost = { fast: costPerSecondUsd('veo-3.1-fast-generate-001', '1080p', true, 'vertex') * 8, standard: costPerSecondUsd('veo-3.1-generate-001', '1080p', true, 'vertex') * 8 };
  for (const q of ['fast', 'standard'] as const) {
    const credits = genjutsuCredits({ op: 'scene', quality: q }) as number;
    const revenueUsd = (credits * CREDIT_VALUE_GEL) / GEL_PER_USD;
    expect(revenueUsd / cost[q]).toBeGreaterThanOrEqual(0.9);
    expect(revenueUsd / cost[q]).toBeLessThanOrEqual(1.3);
  }
});

test('motion and swap are provider-quoted: no local number, because no constant here can be the bill', () => {
  expect(genjutsuCredits({ op: 'motion', seconds: 12, refsUsed: 1 })).toBeNull();
  expect(genjutsuCredits({ op: 'motion', seconds: 30, quality: 'pro' })).toBeNull();
  expect(genjutsuCredits({ op: 'swap', seconds: 8, refsUsed: 5 })).toBeNull();
  expect(genjutsuPriceSource('scene')).toBe('local');
  expect(genjutsuPriceSource('motion')).toBe('provider-quote');
  expect(genjutsuPriceSource('swap')).toBe('provider-quote');
});
