import { v4 as uuidv4 } from 'uuid';
import type { SupabaseClient } from '@supabase/supabase-js';

// ========================================
// INVOICE GENERATION ENGINE
// ========================================

export interface InvoiceGenerationInput {
  orderId: string;
  storeId: string;
  buyerId: string;
  buyerEmail: string;
  buyerName: string;
  currency: string;
  taxStatus: 'vat_payer' | 'non_vat_payer';
  vatRateBps: number;
  vatAmountCents: number;
  subtotalCents: number;
  totalCents: number;
  items: Array<{
    title: string;
    quantity: number;
    unitPriceCents: number;
  }>;
  storeName: string;
  storeEmail: string;
  storeAddress?: string;
  vatRegistrationNo?: string;
}

export interface InvoiceSnapshot {
  orderId: string;
  storeId: string;
  storeName: string;
  storeEmail: string;
  storeAddress?: string;
  storeVatRegNo?: string;
  buyerId: string;
  buyerName: string;
  buyerEmail: string;
  items: Array<{
    title: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }>;
  taxStatus: 'vat_payer' | 'non_vat_payer';
  vatRateBps: number;
  vatAmountCents: number;
  subtotalCents: number;
  totalCents: number;
  currency: string;
  discountCents?: number;
  shippingCents?: number;
  fxRateUsdToLocal?: number;
  issuedAt: string;
  invoiceNumber: string;
  invoiceId: string;
}

/**
 * Generate invoice number: INV-{YEAR}-{STORE_SHORT}-{000001}
 */
export async function generateInvoiceNumber(
  storeId: string,
  supabaseClient: SupabaseClient
): Promise<string> {
  const currentYear = new Date().getFullYear();
  const shortStoreId = storeId.substring(0, 6).toUpperCase();

  // Get or create counter
  const { data: counter, error: fetchError } = await supabaseClient
    .from('invoice_counters')
    .select('*')
    .eq('store_id', storeId)
    .eq('year', currentYear)
    .single();

  let nextNumber = 1;

  if (counter) {
    nextNumber = counter.next_number;
  } else if (!fetchError || fetchError.code !== 'PGRST116') {
    // Only create new if doesn't exist and no other error
    const { data: newCounter } = await supabaseClient
      .from('invoice_counters')
      .insert([
        {
          store_id: storeId,
          year: currentYear,
          next_number: 2,
        },
      ])
      .select()
      .single();

    if (newCounter) {
      nextNumber = 1;
    }
  }

  // Increment counter
  await supabaseClient
    .from('invoice_counters')
    .update({ next_number: nextNumber + 1 })
    .eq('store_id', storeId)
    .eq('year', currentYear);

  // Format invoice number
  const paddedNumber = String(nextNumber).padStart(6, '0');
  return `INV-${currentYear}-${shortStoreId}-${paddedNumber}`;
}

/**
 * Create invoice snapshot
 */
export function createInvoiceSnapshot(
  input: InvoiceGenerationInput,
  invoiceNumber: string
): InvoiceSnapshot {
  const items = input.items.map((item) => ({
    title: item.title,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    lineTotalCents: item.unitPriceCents * item.quantity,
  }));

  return {
    invoiceId: uuidv4(),
    orderId: input.orderId,
    storeId: input.storeId,
    storeName: input.storeName,
    storeEmail: input.storeEmail,
    storeAddress: input.storeAddress,
    storeVatRegNo: input.vatRegistrationNo,
    buyerId: input.buyerId,
    buyerName: input.buyerName,
    buyerEmail: input.buyerEmail,
    items,
    taxStatus: input.taxStatus,
    vatRateBps: input.vatRateBps,
    vatAmountCents: input.vatAmountCents,
    subtotalCents: input.subtotalCents,
    totalCents: input.totalCents,
    currency: input.currency,
    issuedAt: new Date().toISOString(),
    invoiceNumber,
  };
}

/**
 * Validate invoice snapshot
 */
export function validateInvoiceSnapshot(snapshot: InvoiceSnapshot): boolean {
  // Verify totals
  const itemsTotal = snapshot.items.reduce((sum, item) => sum + item.lineTotalCents, 0);

  if (itemsTotal !== snapshot.subtotalCents) {
    console.error('Items total mismatch', itemsTotal, snapshot.subtotalCents);
    return false;
  }

  const expectedTotal = snapshot.subtotalCents + snapshot.vatAmountCents;
  if (expectedTotal !== snapshot.totalCents) {
    console.error('Total mismatch', expectedTotal, snapshot.totalCents);
    return false;
  }

  // Verify VAT calculation
  if (snapshot.taxStatus === 'vat_payer') {
    const expectedVat = Math.floor(
      (snapshot.subtotalCents * snapshot.vatRateBps) / (10000 + snapshot.vatRateBps)
    );
    if (expectedVat !== snapshot.vatAmountCents) {
      console.error('VAT amount mismatch', expectedVat, snapshot.vatAmountCents);
      return false;
    }
  } else if (snapshot.vatAmountCents !== 0) {
    console.error('Non-VAT payer should have 0 VAT');
    return false;
  }

  return true;
}

/**
 * Format price for display
 */
export function formatPrice(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2);
  const currencySymbols: Record<string, string> = {
    GEL: '₾',
    USD: '$',
    EUR: '€',
  };
  const symbol = currencySymbols[currency] || currency;
  return `${symbol}${amount}`;
}

/**
 * Format VAT amount display
 */
export function formatVatInfo(
  snapshot: InvoiceSnapshot
): {
  label: string;
  amount: string;
  includsInTotal: boolean;
} {
  if (snapshot.taxStatus === 'vat_payer') {
    return {
      label: `VAT (${(snapshot.vatRateBps / 100).toFixed(1)}%)`,
      amount: formatPrice(snapshot.vatAmountCents, snapshot.currency),
      includsInTotal: true,
    };
  }

  return {
    label: 'Non-VAT Payer (No VAT)',
    amount: formatPrice(0, snapshot.currency),
    includsInTotal: false,
  };
}
