/**
 * The VFX price. For `scene` it IS one bare 8 s Veo clip's price in the price book (lib/credits/priceBook clipCredits),
 * pinned to exact numbers and to the function it must be built from; for the provider-quoted ops it is null by design
 * ("ask the server").
 */
import { CREDIT_VALUE_GEL } from '@/lib/credits/pricing';
import { clipCredits } from '@/lib/credits/priceBook';
import { clipCostGel, profitOverCostOf } from '@/lib/credits/unitEconomics';
import { GEL_PER_USD } from '@/lib/billing/fx';
import { costPerSecondUsd } from '@/lib/veo/capabilities';
import { genjutsuCredits, genjutsuPriceSource } from './pricing';

test('a scene is one Veo clip: Fast 64 credits, Standard 213 — the price book\'s bare clip', () => {
  expect(genjutsuCredits({ op: 'scene', quality: 'fast' })).toBe(64);
  expect(genjutsuCredits({ op: 'scene', quality: 'standard' })).toBe(213);
  expect(genjutsuCredits({ op: 'scene' })).toBe(64); // the default tier is Fast
});

test('it is built from the price book\'s clipCredits, never a literal of its own', () => {
  expect(genjutsuCredits({ op: 'scene', quality: 'fast' })).toBe(clipCredits('fast'));
  expect(genjutsuCredits({ op: 'scene', quality: 'standard' })).toBe(clipCredits('standard'));
});

test('the reference photos are conditioning, not a billed unit — refsUsed and seconds do not move a scene\'s price', () => {
  const base = genjutsuCredits({ op: 'scene', quality: 'fast' });
  for (const refsUsed of [0, 1, 3]) expect(genjutsuCredits({ op: 'scene', quality: 'fast', refsUsed })).toBe(base);
  expect(genjutsuCredits({ op: 'scene', quality: 'fast', seconds: 30 })).toBe(base);
});

test('a quality the op does not offer falls back to the default tier, never a surprise upgrade', () => {
  expect(genjutsuCredits({ op: 'scene', quality: 'pro' })).toBe(clipCredits('fast'));
});

test('the owner\'s rule: a scene earns 100 % over its full cost, at least twice the Veo list price (never a silent loss)', () => {
  // Veo 3.1 Fast and Standard at 1080p with audio, 8 s (reference mode forces 8 s → 1080p) — the engine's own price table.
  const cost = { fast: costPerSecondUsd('veo-3.1-fast-generate-001', '1080p', true, 'vertex') * 8, standard: costPerSecondUsd('veo-3.1-generate-001', '1080p', true, 'vertex') * 8 };
  for (const q of ['fast', 'standard'] as const) {
    const credits = genjutsuCredits({ op: 'scene', quality: q }) as number;
    expect(profitOverCostOf(credits, clipCostGel(8, q))).toBeGreaterThanOrEqual(1);
    const revenueUsd = (credits * CREDIT_VALUE_GEL) / GEL_PER_USD;
    // Twice the list price, plus the retries, the FX reserve, the hosting and the card fee the rule also covers.
    expect(revenueUsd / cost[q]).toBeGreaterThanOrEqual(2);
    expect(revenueUsd / cost[q]).toBeLessThanOrEqual(2.6);
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
