/**
 * Tax Status Feature Tests
 * Unit tests for VAT/tax handling in Georgian stores
 */

import { computeOrderTotals, validateOrderCalculation, formatOrderTotals } from '@/lib/finance/orderCalculation';
import { StoreTaxProfile, getDefaultTaxProfile, validateTaxStatusConsistency, isVatEnabled } from '@/lib/finance/taxProfile';
import { computeVatInclusive, GEORGIA_VAT_BPS } from '@/lib/finance/vat';

describe('Tax Profile', () => {
  test('should create default non-VAT profile for new store', () => {
    const storeId = 'store_123';
    const profile = getDefaultTaxProfile(storeId);

    expect(profile.store_id).toBe(storeId);
    expect(profile.tax_status).toBe('non_vat_payer');
    expect(profile.vat_enabled).toBe(false);
    expect(profile.vat_rate_bps).toBe(1800); // 18%
    expect(profile.tax_residency_country).toBe('GE');
  });

  test('should validate VAT payer status consistency', () => {
    const profile: StoreTaxProfile = {
      store_id: 'store_123',
      tax_status: 'vat_payer',
      vat_enabled: true,
      vat_rate_bps: 1800,
      vat_registration_no: 'GE123456789',
      prices_include_vat: true,
      tax_residency_country: 'GE',
      legal_entity_type: 'llc',
    };

    const result = validateTaxStatusConsistency(profile);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should reject VAT payer without vat_enabled', () => {
    const profile: StoreTaxProfile = {
      store_id: 'store_123',
      tax_status: 'vat_payer',
      vat_enabled: false, // Inconsistent!
      vat_rate_bps: 1800,
      vat_registration_no: null,
      prices_include_vat: true,
      tax_residency_country: 'GE',
      legal_entity_type: null,
    };

    const result = validateTaxStatusConsistency(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('should reject non-VAT payer with vat_enabled', () => {
    const profile: StoreTaxProfile = {
      store_id: 'store_123',
      tax_status: 'non_vat_payer',
      vat_enabled: true, // Inconsistent!
      vat_rate_bps: 1800,
      vat_registration_no: null,
      prices_include_vat: true,
      tax_residency_country: 'GE',
      legal_entity_type: null,
    };

    const result = validateTaxStatusConsistency(profile);
    expect(result.valid).toBe(false);
  });

  test('should return true for isVatEnabled when tax_status is vat_payer', () => {
    expect(isVatEnabled('vat_payer')).toBe(true);
    expect(isVatEnabled('non_vat_payer')).toBe(false);
  });
});

describe('Order Calculation: VAT Payer', () => {
  const vatPayerProfile: StoreTaxProfile = {
    store_id: 'store_vat',
    tax_status: 'vat_payer',
    vat_enabled: true,
    vat_rate_bps: 1800, // 18%
    vat_registration_no: 'GE123456789',
    prices_include_vat: true,
    tax_residency_country: 'GE',
    legal_entity_type: 'llc',
  };

  test('should compute VAT when selling to Georgian buyer (VAT payer)', () => {
    const result = computeOrderTotals({
      subtotalCents: 10000, // ₾100
      shippingCostCents: 500, // ₾5
      platformFeeBps: 500, // 5%
      affiliateFeeBps: 1000, // 10%
      buyerCountryCode: 'GE',
      taxProfile: vatPayerProfile,
    });

    expect(result.vatEnabled).toBe(true);
    expect(result.vatAmountCents).toBeGreaterThan(0);
    expect(result.vatRateBps).toBe(1800);
    expect(result.totalCents).toBeGreaterThan(0);

    // Validate calculation
    const validation = validateOrderCalculation(result);
    expect(validation.valid).toBe(true);
  });

  test('should compute correct VAT amount for standard 18% rate', () => {
    // For ₾100 with 18% VAT included:
    // VAT = floor(10000 * 1800 / (10000 + 1800)) = floor(10000 * 1800 / 11800)
    // VAT = floor(1525.42) = 1525 cents
    const result = computeOrderTotals({
      subtotalCents: 10000,
      shippingCostCents: 0,
      platformFeeBps: 0,
      affiliateFeeBps: 0,
      buyerCountryCode: 'GE',
      taxProfile: vatPayerProfile,
    });

    expect(result.vatAmountCents).toBe(1525); // ₾15.25
  });

  test('should NOT compute VAT for non-Georgian buyer even if VAT payer', () => {
    const result = computeOrderTotals({
      subtotalCents: 10000,
      shippingCostCents: 500,
      platformFeeBps: 500,
      affiliateFeeBps: 1000,
      buyerCountryCode: 'US', // Non-GE buyer
      taxProfile: vatPayerProfile,
    });

    expect(result.vatEnabled).toBe(false);
    expect(result.vatAmountCents).toBe(0);
  });

  test('should correctly compute total with all fees for VAT payer', () => {
    const result = computeOrderTotals({
      subtotalCents: 10000, // ₾100
      shippingCostCents: 500, // ₾5
      platformFeeBps: 500, // 5% = 500 cents
      affiliateFeeBps: 1000, // 10% = 1000 cents
      buyerCountryCode: 'GE',
      taxProfile: vatPayerProfile,
    });

    // Total = subtotal + shipping + platformFee + affiliateFee
    // = 10000 + 500 + 500 + 1000 = 12000
    expect(result.totalCents).toBe(12000);
    expect(result.platformFeeCents).toBe(500);
    expect(result.affiliateFeeCents).toBe(1000);
  });
});

describe('Order Calculation: Non-VAT Payer', () => {
  const nonVatPayerProfile: StoreTaxProfile = {
    store_id: 'store_non_vat',
    tax_status: 'non_vat_payer',
    vat_enabled: false,
    vat_rate_bps: 1800,
    vat_registration_no: null,
    prices_include_vat: true,
    tax_residency_country: 'GE',
    legal_entity_type: 'individual',
  };

  test('should NOT compute VAT for non-VAT payer (even GE buyer)', () => {
    const result = computeOrderTotals({
      subtotalCents: 10000,
      shippingCostCents: 500,
      platformFeeBps: 500,
      affiliateFeeBps: 1000,
      buyerCountryCode: 'GE',
      taxProfile: nonVatPayerProfile,
    });

    expect(result.vatEnabled).toBe(false);
    expect(result.vatAmountCents).toBe(0);
    expect(result.vatRateBps).toBe(0);
  });

  test('should still charge fees for non-VAT payer', () => {
    const result = computeOrderTotals({
      subtotalCents: 10000,
      shippingCostCents: 500,
      platformFeeBps: 500,
      affiliateFeeBps: 1000,
      buyerCountryCode: 'GE',
      taxProfile: nonVatPayerProfile,
    });

    // Fees should still be charged
    expect(result.platformFeeCents).toBe(500);
    expect(result.affiliateFeeCents).toBe(1000);
    // Total = 10000 + 500 + 500 + 1000 = 12000
    expect(result.totalCents).toBe(12000);
  });
});

describe('Order Calculation: Edge Cases', () => {
  const vatPayerProfile: StoreTaxProfile = getDefaultTaxProfile('store_test');
  vatPayerProfile.tax_status = 'vat_payer';
  vatPayerProfile.vat_enabled = true;

  test('should handle zero subtotal', () => {
    const result = computeOrderTotals({
      subtotalCents: 0,
      shippingCostCents: 500,
      platformFeeBps: 500,
      affiliateFeeBps: 1000,
      buyerCountryCode: 'GE',
      taxProfile: vatPayerProfile,
    });

    expect(result.vatAmountCents).toBe(0);
    expect(result.platformFeeCents).toBe(0);
    expect(result.affiliateFeeCents).toBe(0);
    expect(result.totalCents).toBe(500); // Only shipping
  });

  test('should handle very high subtotal', () => {
    const result = computeOrderTotals({
      subtotalCents: 1000000000, // ₾10,000,000
      shippingCostCents: 500,
      platformFeeBps: 500,
      affiliateFeeBps: 1000,
      buyerCountryCode: 'GE',
      taxProfile: vatPayerProfile,
    });

    expect(result.vatEnabled).toBe(true);
    expect(result.totalCents).toBeGreaterThan(result.subtotalCents);
    
    const validation = validateOrderCalculation(result);
    expect(validation.valid).toBe(true);
  });

  test('should handle negative inputs gracefully (convert to 0)', () => {
    const result = computeOrderTotals({
      subtotalCents: -100, // Should be converted to 0
      shippingCostCents: -50,
      platformFeeBps: 500,
      affiliateFeeBps: 1000,
      buyerCountryCode: 'GE',
      taxProfile: vatPayerProfile,
    });

    expect(result.subtotalCents).toBe(0);
    expect(result.shippingCostCents).toBe(0);
    expect(result.totalCents).toBe(0);
  });
});

describe('Order Calculation: Validation', () => {
  test('should validate successful calculation', () => {
    const profile = getDefaultTaxProfile('store_test');
    const result = computeOrderTotals({
      subtotalCents: 10000,
      shippingCostCents: 500,
      platformFeeBps: 500,
      affiliateFeeBps: 1000,
      buyerCountryCode: 'GE',
      taxProfile: profile,
    });

    const validation = validateOrderCalculation(result);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  test('should reject calculation with negative values', () => {
    // Manually create invalid result (should be prevented by computation, but test validation)
    const invalidResult = {
      subtotalCents: 10000,
      vatAmountCents: -100, // Invalid!
      vatRateBps: 0,
      vatEnabled: false,
      shippingCostCents: 500,
      platformFeeCents: 500,
      affiliateFeeCents: 1000,
      totalCents: 12000,
      netSellerCents: 10400,
      breakdown: {
        gross: 10000,
        vatTax: -100,
        platformFee: 500,
        affiliateFee: 1000,
        shipping: 500,
        total: 12000,
      },
    };

    const validation = validateOrderCalculation(invalidResult);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });
});

describe('Order Calculation: Formatting', () => {
  test('should format totals with currency symbol', () => {
    const profile = getDefaultTaxProfile('store_test');
    const result = computeOrderTotals({
      subtotalCents: 10000,
      shippingCostCents: 500,
      platformFeeBps: 500,
      affiliateFeeBps: 1000,
      buyerCountryCode: 'GE',
      taxProfile: profile,
    });

    const formatted = formatOrderTotals(result);

    expect(formatted.subtotal).toContain('₾');
    expect(formatted.total).toContain('₾');
    expect(formatted.shipping).toBe('5₾');
  });
});

describe('Standard VAT Included Rounding', () => {
  test('should properly round VAT amount using included formula', () => {
    // VAT included formula: VAT = floor(price * rate / (10000 + rate))
    // For ₾100 (10000 cents) with 18% (1800 bps):
    // VAT = floor(10000 * 1800 / 11800) = floor(1525.42...) = 1525
    const vatResult = computeVatInclusive(10000, 1800);
    expect(vatResult.vat_amount_cents).toBe(1525);
    expect(vatResult.net_amount_cents).toBe(8475); // 10000 - 1525
  });

  test('should handle VAT rounding for various amounts', () => {
    const testCases = [
      { price: 10000, expectedVat: 1525 }, // ₾100
      { price: 5000, expectedVat: 762 }, // ₾50
      { price: 100, expectedVat: 15 }, // ₾1
      { price: 1, expectedVat: 0 }, // ₾0.01 (rounds to 0)
    ];

    testCases.forEach(({ price, expectedVat }) => {
      const result = computeVatInclusive(price, 1800);
      expect(result.vat_amount_cents).toBe(expectedVat);
    });
  });
});
