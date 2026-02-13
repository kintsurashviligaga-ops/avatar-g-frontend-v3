/**
 * Tax Profile Management
 * Handles VAT/non-VAT status for Georgian stores
 */

export type TaxStatus = 'vat_payer' | 'non_vat_payer';
export type LegalEntityType = 'individual' | 'llc' | null;

export interface StoreTaxProfile {
  store_id: string;
  tax_status: TaxStatus;
  vat_enabled: boolean;
  vat_rate_bps: number;
  vat_registration_no: string | null;
  prices_include_vat: boolean;
  tax_residency_country: string;
  legal_entity_type: LegalEntityType;
  created_at?: string;
  updated_at?: string;
}

/**
 * Determine if VAT should be applied based on tax status
 */
export function isVatEnabled(taxStatus: TaxStatus): boolean {
  return taxStatus === 'vat_payer';
}

/**
 * Default tax profile for new Georgian stores
 */
export function getDefaultTaxProfile(storeId: string): StoreTaxProfile {
  return {
    store_id: storeId,
    tax_status: 'non_vat_payer',
    vat_enabled: false,
    vat_rate_bps: 1800, // 18% standard rate
    vat_registration_no: null,
    prices_include_vat: true,
    tax_residency_country: 'GE',
    legal_entity_type: null,
  };
}

/**
 * Validate tax status consistency
 * If tax_status='vat_payer' then vat_enabled must be true
 * If tax_status='non_vat_payer' then vat_enabled must be false
 */
export function validateTaxStatusConsistency(profile: StoreTaxProfile): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (profile.tax_status === 'vat_payer' && !profile.vat_enabled) {
    errors.push('VAT payer must have vat_enabled=true');
  }

  if (profile.tax_status === 'non_vat_payer' && profile.vat_enabled) {
    errors.push('Non-VAT payer must have vat_enabled=false');
  }

  if (profile.tax_status === 'vat_payer' && !profile.vat_registration_no) {
    errors.push('VAT payer should have VAT registration number');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create tax profile from raw store data
 */
export function createTaxProfileFromStore(storeData: {
  id: string;
  tax_status?: string;
  vat_enabled?: boolean;
  vat_rate_bps?: number;
  vat_registration_no?: string | null;
  prices_include_vat?: boolean;
  tax_residency_country?: string;
  legal_entity_type?: string | null;
}): StoreTaxProfile {
  const taxStatus = (storeData.tax_status as TaxStatus) || 'non_vat_payer';

  return {
    store_id: storeData.id,
    tax_status: taxStatus,
    vat_enabled: storeData.vat_enabled ?? isVatEnabled(taxStatus),
    vat_rate_bps: storeData.vat_rate_bps ?? 1800,
    vat_registration_no: storeData.vat_registration_no ?? null,
    prices_include_vat: storeData.prices_include_vat ?? true,
    tax_residency_country: storeData.tax_residency_country ?? 'GE',
    legal_entity_type: (storeData.legal_entity_type as LegalEntityType) ?? null,
  };
}

/**
 * Get recommended VAT rate for country
 */
export function getVatRateForCountry(countryCode: string): number {
  // Georgia standard rate: 18%
  if (countryCode === 'GE') {
    return 1800; // 18% in basis points
  }
  // Add other countries as needed
  return 0; // No VAT for non-GE
}
