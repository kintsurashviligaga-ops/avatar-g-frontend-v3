/**
 * lib/billing/margin/econ.ts — the 65 % gross-margin rule (Phase 8.1, GG 2026-11-14). Pure and client-safe. PROPOSAL:
 * nothing in Production reads this file until GG approves the new price list and the wiring PR flips PRICING_V8.
 *
 * THE RULE (GG 2026-11-14 06:41Z): "User Price = Cost / (1 − 0.65)". Every paid action must keep at least 65 % gross
 * margin on what we actually receive, measured at the CHEAPEST credit anyone can buy (the biggest plan or top-up
 * discount), so no package, discount or plan can push an action under 65 %.
 *
 *   net ₾ per credit   = floorCreditGel × (1 − cardFee) ÷ (1 + VAT)                 what BOG leaves us for one credit
 *   cost ₾             = list USD × (1 + retryShare) × gelPerUsd × (1 + fxReserve) + infra   (cogs.ts builds the USD side)
 *   gross margin       = (net ₾ − cost ₾) ÷ net ₾
 *   minimum credits    = ⌈ cost ₾ ÷ ((1 − 0.65) × net ₾ per credit) ⌉
 *
 * With today's numbers ($1 = 2.7 ₾, 5 % FX reserve, 3 % card fee, VAT 0, floor credit 0.08 ₾):
 *   $1 of full cost needs ⌈2.835 ÷ (0.35 × 0.0776)⌉ → 104.38 credits.
 *
 * Why the floor and not the 0.10 ₾ sticker price: a Business-plan credit sells for ~0.081 ₾. Pricing at 0.10 ₾ would
 * give 65 % to a top-up buyer and less to our best customers. Pricing at the floor gives every buyer ≥ 65 % (a top-up
 * buyer at 0.10 ₾ gives ~72 %). packages.ts refuses any package that sells a credit under the floor.
 */
import { GEL_PER_USD } from '@/lib/billing/fx';
import { CREDIT_VALUE_GEL } from '@/lib/credits/pricing';
import { ECON } from '@/lib/credits/unitEconomics';

export const MARGIN_ECON = {
  /** GG 2026-11-14: never less than 65 % gross margin. */
  minGrossMargin: 0.65,
  /** The sticker price of one credit on a plain top-up (1 credit = 0.10 ₾). */
  baseCreditGel: CREDIT_VALUE_GEL,
  /** The cheapest a credit may ever be sold, in any plan or pack. Prices are computed here. */
  floorCreditGel: 0.08,
  gelPerUsd: GEL_PER_USD,
  /** Google bills USD, users pay ₾: headroom for the lari moving against us. */
  fxReserve: ECON.fxReserve,
  /** BOG card acquiring. ESTIMATED 3 % until the contract rate is confirmed. */
  cardFee: ECON.paymentFeeRate,
  /** 0 while the merchant is not VAT-registered. At 0.18 every minimum price rises ~22 %; tests re-check. */
  vatRate: ECON.vatRate,
} as const;

export type MarginEcon = { readonly [K in keyof typeof MARGIN_ECON]: number };

const EPS = 1e-9;

/** ₾ we keep from one credit sold at `creditGel`, after the card fee and VAT. */
export function netGelPerCredit(creditGel: number, e: MarginEcon = MARGIN_ECON): number {
  return (creditGel * (1 - e.cardFee)) / (1 + e.vatRate);
}

/** USD of Google cost → ₾, with the FX reserve. */
export function costGelOf(usd: number, e: MarginEcon = MARGIN_ECON): number {
  return usd * e.gelPerUsd * (1 + e.fxReserve);
}

/** Gross margin of selling `credits` for an action that costs `costUsd`, at `creditGel` per credit (floor by default). */
export function grossMargin(credits: number, costUsd: number, creditGel: number = MARGIN_ECON.floorCreditGel, e: MarginEcon = MARGIN_ECON): number {
  const net = credits * netGelPerCredit(creditGel, e);
  if (!(net > 0)) return -Infinity;
  return (net - costGelOf(costUsd, e)) / net;
}

/** Credits per $1 of full cost that exactly hits the minimum margin at the floor (fractional). */
export function creditsPerUsd(e: MarginEcon = MARGIN_ECON): number {
  return costGelOf(1, e) / ((1 - e.minGrossMargin) * netGelPerCredit(e.floorCreditGel, e));
}

/** The smallest WHOLE number of credits that keeps ≥ the minimum margin for an action costing `costUsd`. */
export function minCredits(costUsd: number, e: MarginEcon = MARGIN_ECON): number {
  if (!(costUsd >= 0) || !Number.isFinite(costUsd)) throw new Error(`minCredits: cost must be a finite number ≥ 0 (got ${costUsd})`);
  if (costUsd === 0) return 0;
  let c = Math.max(1, Math.ceil(costUsd * creditsPerUsd(e) - EPS));
  while (grossMargin(c, costUsd, e.floorCreditGel, e) < e.minGrossMargin - EPS) c += 1; // float safety
  return c;
}

/** The smallest credits per unit (4 decimals, the price_versions column scale) at the minimum margin, for a price row. */
export function minCreditsPerUnit(usdPerUnit: number, e: MarginEcon = MARGIN_ECON): number {
  let c = Math.ceil(usdPerUnit * creditsPerUsd(e) * 1e4 - 1e-6) / 1e4;
  while (grossMargin(c, usdPerUnit, e.floorCreditGel, e) < e.minGrossMargin - EPS) c = Math.round((c + 1e-4) * 1e4) / 1e4;
  return c;
}

export type Enforced = { credits: number; raised: boolean; margin: number };

/**
 * THE ENFORCEMENT POINT. Any quote passes through here before a user is charged: a price below the rule is RAISED to the
 * rule's minimum (never sold at a loss of margin). `raised: true` is logged and surfaces as a margin alert.
 */
export function enforceMargin(credits: number, costUsd: number, e: MarginEcon = MARGIN_ECON): Enforced {
  const floor = minCredits(costUsd, e);
  const asked = Number.isFinite(credits) && credits > 0 ? Math.ceil(credits - EPS) : 0;
  const out = Math.max(asked, floor);
  return { credits: out, raised: out > asked, margin: grossMargin(out, costUsd, e.floorCreditGel, e) };
}

/** Converters for display. */
export const creditsToGel = (credits: number, creditGel: number = MARGIN_ECON.baseCreditGel) => Math.round(credits * creditGel * 100) / 100;
export const gelToUsd = (gel: number, e: MarginEcon = MARGIN_ECON) => Math.round((gel / e.gelPerUsd) * 100) / 100;
