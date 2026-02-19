/**
 * FX helpers - manual rate input first
 */

import { safeRound } from './money';
import type { CurrencyCode } from './types';

export function convertCents(
  amountCents: number,
  rate: number,
  baseCurrency: CurrencyCode,
  quoteCurrency: CurrencyCode,
  targetCurrency: CurrencyCode
): number {
  if (baseCurrency === quoteCurrency || rate <= 0) {
    return safeRound(amountCents);
  }

  if (targetCurrency === baseCurrency) {
    return safeRound(amountCents / rate);
  }

  if (targetCurrency === quoteCurrency) {
    return safeRound(amountCents * rate);
  }

  return safeRound(amountCents);
}
