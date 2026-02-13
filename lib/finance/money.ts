/**
 * Money helpers - integer cents only
 */

export function toCents(amountFloat: number): number {
  return Math.round(amountFloat * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function percentageOf(amountCents: number, bps: number): number {
  return safeRound((amountCents * bps) / 10000);
}

export function safeRound(value: number): number {
  return Math.round(value);
}
