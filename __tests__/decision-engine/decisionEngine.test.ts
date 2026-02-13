/**
 * Decision Engine Tests
 */

import { evaluateProductCandidate } from '@/lib/decision-engine/decisionEngine';

describe('Decision Engine', () => {
  test('publish profitable standard product', () => {
    const result = evaluateProductCandidate({
      productType: 'standard',
      retailPriceCents: 10000,
      supplierCostCents: 2000,
      shippingCostCents: 500,
      vatEnabled: true,
      platformFeeBps: 500,
      affiliateBps: 1000,
      refundReserveBps: 200,
    });

    expect(result.decision).toBe('publish');
    expect(result.reasons).toHaveLength(0);
    expect(result.computed.netPerOrderCents).toBeGreaterThan(0);
  });

  test('reject unprofitable product', () => {
    const result = evaluateProductCandidate({
      productType: 'standard',
      retailPriceCents: 1000,
      supplierCostCents: 8000,
      shippingCostCents: 1000,
      vatEnabled: false,
      platformFeeBps: 500,
      affiliateBps: 1000,
      refundReserveBps: 200,
    });

    expect(result.decision).toBe('reject');
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.computed.netPerOrderCents).toBeLessThanOrEqual(0);
  });

  test('reject low-margin product below standard threshold', () => {
    const result = evaluateProductCandidate({
      productType: 'standard',
      retailPriceCents: 5000,
      supplierCostCents: 3500,
      shippingCostCents: 500,
      vatEnabled: true,
      platformFeeBps: 500,
      affiliateBps: 0,
      refundReserveBps: 200,
    });

    expect(result.decision).toBe('reject');
    expect(result.reasons.some((r) => r.includes('Margin'))).toBe(true);
  });

  test('reject digital product below 70% margin', () => {
    const result = evaluateProductCandidate({
      productType: 'digital',
      retailPriceCents: 10000,
      supplierCostCents: 2000, // 20% cost, margin ~60%
      shippingCostCents: 0,
      vatEnabled: false,
      platformFeeBps: 500,
      affiliateBps: 0,
      refundReserveBps: 200,
    });

    expect(result.decision).toBe('reject');
    expect(result.reasons.some((r) => r.includes('Margin'))).toBe(true);
  });

  test('provide price recommendation when rejected for margin', () => {
    const result = evaluateProductCandidate({
      productType: 'standard',
      retailPriceCents: 5000, // Too low to hit 15% margin
      supplierCostCents: 3500,
      shippingCostCents: 500,
      vatEnabled: true,
      platformFeeBps: 500,
      affiliateBps: 0,
      refundReserveBps: 200,
    });

    expect(result.decision).toBe('reject');
    expect(result.recommendedPriceCents).toBeDefined();
    expect(result.recommendedPriceCents).toBeGreaterThan(result.computed.netPerOrderCents === 0 ? 5000 : 0);
  });

  test('warn on high shipping days', () => {
    const result = evaluateProductCandidate({
      productType: 'standard',
      retailPriceCents: 10000,
      supplierCostCents: 2000,
      shippingCostCents: 500,
      vatEnabled: true,
      platformFeeBps: 500,
      affiliateBps: 0,
      refundReserveBps: 200,
      shippingDaysMax: 30,
    });

    expect(result.warnings.some((w) => w.includes('Shipping'))).toBe(true);
  });

  test('warn on low refund reserve', () => {
    const result = evaluateProductCandidate({
      productType: 'standard',
      retailPriceCents: 10000,
      supplierCostCents: 2000,
      shippingCostCents: 500,
      vatEnabled: true,
      platformFeeBps: 500,
      affiliateBps: 0,
      refundReserveBps: 100, // Below 200
    });

    expect(result.warnings.some((w) => w.includes('Refund reserve'))).toBe(true);
  });

  test('accept dropshipping with 25% margin', () => {
    const result = evaluateProductCandidate({
      productType: 'dropshipping',
      retailPriceCents: 10000,
      supplierCostCents: 6000, // 60% supplier cost
      shippingCostCents: 500,
      vatEnabled: true,
      platformFeeBps: 500,
      affiliateBps: 500,
      refundReserveBps: 200,
    });

    // Should pass dropshipping 25% threshold
    expect(result.decision).toBe('publish');
  });
});
