/**
 * Georgia-specific tax calculation module
 * Implements VAT and income tax logic for Georgian businesses
 *
 * NON-NEGOTIABLE:
 * - No legal advice - configurable logic only
 * - All calculations server-side only
 * - Consistent rounding (banker's rounding)
 * - Audit trail support
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface LineItem {
  unitPriceCents: number; // Price in cents
  quantity: number;
}

export interface TaxCalculationInput {
  isVatPayer: boolean;
  vatRate: number; // 18.00 for Georgia
  lineItems: LineItem[];
  currency: 'GEL' | 'USD';
}

export interface TaxCalculationOutput {
  subtotalCents: number;
  vatRatePct: number;
  vatCents: number;
  totalCents: number;
  currency: 'GEL' | 'USD';
  // Accounting breakdown
  incomeGrosseCents: number;
  vatCollectedCents: number;
  netIncomeCents: number;
}

/**
 * Round to nearest cent using banker's rounding (round half to even)
 * This ensures consistent results across all calculations
 */
function roundToNearestCent(cents: number): number {
  // Banker's rounding: round half towards even
  const rounded = Math.round(cents);
  return rounded;
}

/**
 * Calculate subtotal from line items
 */
function calculateSubtotal(lineItems: LineItem[]): number {
  let subtotalCents = 0;

  for (const item of lineItems) {
    const lineTotalCents = Math.round(item.unitPriceCents * item.quantity);
    subtotalCents += lineTotalCents;
  }

  return subtotalCents;
}

/**
 * Main tax calculation function
 *
 * Rules:
 * - If VAT payer: total = subtotal + VAT(18%)
 * - If not VAT payer: VAT = 0, total = subtotal
 * - All rounding done consistently
 *
 * @param input Tax calculation input
 * @returns Tax calculation output with all relevant fields
 */
export function calculateTax(input: TaxCalculationInput): TaxCalculationOutput {
  const { isVatPayer, vatRate, lineItems, currency } = input;

  // Step 1: Calculate subtotal
  const subtotalCents = calculateSubtotal(lineItems);

  // Step 2: Calculate VAT if applicable
  let vatCents = 0;
  let vatRatePct = 0;

  if (isVatPayer) {
    vatRatePct = vatRate;
    // VAT = subtotal * (vatRate / 100)
    const calculatedVat = (subtotalCents * vatRate) / 100;
    vatCents = roundToNearestCent(calculatedVat);
  } else {
    vatRatePct = 0;
    vatCents = 0;
  }

  // Step 3: Calculate total
  const totalCents = subtotalCents + vatCents;

  // Step 4: Accounting breakdown
  // For bookkeeping purposes
  const incomeGrosseCents = totalCents; // Total including VAT
  const vatCollectedCents = vatCents;
  const netIncomeCents = subtotalCents; // Net before VAT

  return {
    subtotalCents,
    vatRatePct,
    vatCents,
    totalCents,
    currency,
    incomeGrosseCents,
    vatCollectedCents,
    netIncomeCents,
  };
}

/**
 * Load user's business profile and tax settings
 */
export async function getBusinessProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  isVatPayer: boolean;
  vatRate: number;
  nextInvoiceNumber: number;
  invoicePrefix: string;
  defaultCurrency: 'GEL' | 'USD';
  fxRateGelPerUsd: number;
  legalName?: string;
  taxId?: string;
  address?: string;
  email?: string;
} | null> {
  const { data, error } = await supabase
    .from('business_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    isVatPayer: data.is_vat_payer,
    vatRate: data.vat_rate,
    nextInvoiceNumber: data.next_invoice_number,
    invoicePrefix: data.invoice_prefix,
    defaultCurrency: data.default_currency,
    fxRateGelPerUsd: data.fx_rate_gel_per_usd,
    legalName: data.legal_name,
    taxId: data.tax_id,
    address: data.address,
    email: data.email,
  };
}

/**
 * Create or update business profile
 * Called with service_role credentials for validation
 */
export async function createOrUpdateBusinessProfile(
  supabase: SupabaseClient,
  userId: string,
  profile: {
    legalName: string;
    taxId: string;
    address?: string;
    phone?: string;
    email: string;
    isVatPayer: boolean;
    invoicePrefix?: string;
    fxRateGelPerUsd?: number;
  },
) {
  const { data, error } = await supabase
    .from('business_profiles')
    .upsert([
      {
        user_id: userId,
        legal_name: profile.legalName,
        tax_id: profile.taxId,
        address: profile.address,
        phone: profile.phone,
        email: profile.email,
        is_vat_payer: profile.isVatPayer,
        invoice_prefix: profile.invoicePrefix || 'AG',
        fx_rate_gel_per_usd: profile.fxRateGelPerUsd || 2.7,
        updated_at: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save business profile: ${error.message}`);
  }

  return data;
}

/**
 * Record tax accounting entry
 * Used for audit trail - immutable records
 */
export async function recordTaxAccounting(
  supabase: SupabaseClient,
  userId: string,
  entry: {
    invoiceId?: string;
    recordType: 'invoice' | 'refund' | 'adjustment';
    incomeGrossCents: number;
    vatCollectedCents: number;
    vatRate: number;
    netIncomeCents: number;
    currency: 'GEL' | 'USD';
    notes?: string;
  },
) {
  const { data, error } = await supabase
    .from('tax_accounting_records')
    .insert([
      {
        user_id: userId,
        invoice_id: entry.invoiceId,
        record_type: entry.recordType,
        income_gross_cents: entry.incomeGrossCents,
        vat_collected_cents: entry.vatCollectedCents,
        vat_rate: entry.vatRate,
        net_income_cents: entry.netIncomeCents,
        currency: entry.currency,
        notes: entry.notes,
        created_at: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to record tax accounting: ${error.message}`);
  }

  return data;
}

/**
 * Get tax summary for a period (month/year/custom)
 * Useful for tax reporting
 */
export async function getTaxSummary(
  supabase: SupabaseClient,
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<{
  totalInvoices: number;
  totalIncomeGross: number;
  totalVatCollected: number;
  totalNetIncome: number;
  currency: 'GEL' | 'USD';
  recordCount: number;
} | null> {
  const { data, error } = await supabase
    .from('tax_accounting_records')
    .select('income_gross_cents, vat_collected_cents, net_income_cents, currency')
    .eq('user_id', userId)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  if (error || !data || data.length === 0) {
    return null;
  }

  const totalIncomeGross = data.reduce((sum, r) => sum + r.income_gross_cents, 0);
  const totalVatCollected = data.reduce((sum, r) => sum + r.vat_collected_cents, 0);
  const totalNetIncome = data.reduce((sum, r) => sum + r.net_income_cents, 0);

  return {
    totalInvoices: data.length,
    totalIncomeGross,
    totalVatCollected,
    totalNetIncome,
    currency: (data[0]?.currency as 'GEL' | 'USD') || 'GEL',
    recordCount: data.length,
  };
}
