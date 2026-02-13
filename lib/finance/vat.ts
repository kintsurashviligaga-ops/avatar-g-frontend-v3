/**
 * VAT helpers - Georgia default 18% (1800 bps)
 * VAT is included in retail price.
 */

import { safeRound } from './money';

export const GEORGIA_VAT_BPS = 1800;

export interface VatResult {
  vat_amount_cents: number;
  net_amount_cents: number;
}

export function computeVatInclusive(priceCents: number, vatRateBps = GEORGIA_VAT_BPS): VatResult {
  const price = Math.max(0, safeRound(priceCents));
  const rate = Math.max(0, vatRateBps);

  if (price === 0 || rate === 0) {
    return { vat_amount_cents: 0, net_amount_cents: price };
  }

  // VAT included formula: VAT = floor(P * rate / (10000 + rate))
  const vatAmount = Math.floor((price * rate) / (10000 + rate));
  const netAmount = Math.max(0, price - vatAmount);

  return {
    vat_amount_cents: vatAmount,
    net_amount_cents: netAmount,
  };
}
