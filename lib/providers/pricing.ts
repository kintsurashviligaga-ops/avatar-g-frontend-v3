/**
 * Provider USD → the price a user sees and pays (brief §4: `usd × rate × margin`, configurable).
 *
 * The ONE rule that matters: the GEL shown on the button and the credits taken from the balance are the
 * same number. So the price is computed in whole CREDITS first (1 credit = 0.10 GEL, the ledger's unit —
 * credit_wallet_gel and lib/credits/pricing agree) and the GEL is derived from the credits, never the
 * other way round. "4.20 ₾" on the button is exactly 42 credits off the balance.
 */
import { GEL_PER_USD } from '@/lib/billing/fx';
import { CREDIT_VALUE_GEL } from '@/lib/credits/pricing';

export interface PricingConfig {
  /** GEL per USD. Default: the SSoT display rate in lib/billing/fx.ts (brief default: NBG rate). */
  gelPerUsd: number;
  /** Multiplier over provider cost. Brief default 1.35. */
  margin: number;
}

export interface Price {
  /** Whole credits reserved from the balance. */
  credits: number;
  /** The same amount in GEL — what the button shows. */
  gel: number;
  /** Provider cost in USD, for margin reporting (admin only). */
  usd: number;
}

const positive = (raw: string | undefined): number | null => {
  const n = Number((raw ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function pricingConfig(env: NodeJS.ProcessEnv = process.env): PricingConfig {
  return {
    gelPerUsd: positive(env.HF_USD_GEL_RATE) ?? GEL_PER_USD,
    margin: positive(env.HF_GEL_MARGIN) ?? 1.35,
  };
}

/** Round UP to a whole credit — a price is never below cost — and never below 1 credit. */
export function priceFromUsd(usd: number, cfg: PricingConfig = pricingConfig()): Price {
  if (!Number.isFinite(usd) || usd < 0) throw new RangeError(`invalid provider cost: ${usd}`);
  const gelRaw = usd * cfg.gelPerUsd * cfg.margin;
  // The epsilon keeps an exact multiple (e.g. 4.2000000000000002) from rounding up a whole credit.
  const credits = Math.max(1, Math.ceil(gelRaw / CREDIT_VALUE_GEL - 1e-9));
  return { credits, gel: creditsToGel(credits), usd };
}

export function creditsToGel(credits: number): number {
  return Math.round(credits * CREDIT_VALUE_GEL * 100) / 100;
}

/** "4.20 ₾" — two decimals always, so a price never jumps width on the button. */
export function formatGel(gel: number): string {
  return `${gel.toFixed(2)} ₾`;
}

/** A confirmed price matches the server's quote when both round to the same credit. */
export function samePrice(confirmedGel: number, price: Price): boolean {
  return Number.isFinite(confirmedGel) && Math.round(confirmedGel / CREDIT_VALUE_GEL) === price.credits;
}
