/** @jest-environment node */
import { MIN_MARKUP, buildPlanRows, buildPriceRows, priceAssumptions } from './priceSheet';
import { quoteCredits } from '@/lib/credits/quote';
import { ECON, netGelPerCredit } from '@/lib/credits/unitEconomics';
import { PAID_TIER_IDS } from '@/lib/billing/tiers';

describe('buildPriceRows', () => {
  const rows = buildPriceRows();

  it('reads credits from the same quote the buttons show', () => {
    const image = rows.find((r) => r.id === 'image.1')!;
    expect(image.credits).toBe(quoteCredits({ tool: 'image', count: 1 }));
    expect(image.priceGel).toBeCloseTo(image.credits * ECON.creditGel, 2);
    // netGel is rounded to the tetri for display, so it sits within half a tetri of the exact net (5 × 0.097 = 0.485 → 0.49).
    expect(Math.abs(image.netGel - image.credits * netGelPerCredit())).toBeLessThanOrEqual(0.005 + 1e-9);
  });

  it('computes markup as (net − cost) / cost and flags the owner rule', () => {
    for (const r of rows) {
      if (r.costGel === null || r.costGel === 0) {
        expect(r.markup).toBeNull();
        expect(r.ok).toBeNull();
        continue;
      }
      // costGel is rounded to the tetri for display; the markup is computed from the exact cost, so it sits within
      // the band the rounding allows.
      const net = r.credits * netGelPerCredit();
      const hi = (net - (r.costGel - 0.005)) / (r.costGel - 0.005);
      const lo = (net - (r.costGel + 0.005)) / (r.costGel + 0.005);
      expect(r.markup as number).toBeGreaterThanOrEqual(lo - 0.001);
      expect(r.markup as number).toBeLessThanOrEqual(hi + 0.001);
      expect(r.ok).toBe((r.markup as number) >= MIN_MARKUP);
    }
  });

  it('every row with a known cost clears the rule under the price book (a VFX scene is costed as its bare clip)', () => {
    for (const r of rows) if (r.costGel !== null && r.costGel > 0) expect([r.id, r.ok]).toEqual([r.id, true]);
  });

  it('shows no cost for an engine the provider rule blocks', () => {
    expect(rows.find((r) => r.id === 'model3d')!.costGel).toBeNull();
  });
});

describe('buildPlanRows / priceAssumptions', () => {
  it('lists every paid plan with a positive price', () => {
    const plans = buildPlanRows();
    expect(plans.map((p) => p.tier)).toEqual([...PAID_TIER_IDS]);
    for (const p of plans) expect(p.priceGel).toBeGreaterThan(0);
  });
  it('states the 100% rule', () => {
    expect(priceAssumptions().minMarkup).toBe(1);
  });
});
