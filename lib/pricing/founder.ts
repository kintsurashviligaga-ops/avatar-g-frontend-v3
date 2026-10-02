/**
 * lib/pricing/founder.ts — the FOUNDER'S MARGIN: the one place a provider's wholesale cost becomes a retail price.
 *
 *   retail = wholesale (USD, what the provider charges US) × FOUNDER_MARGIN, rounded UP to a whole credit.
 *
 * ⚠️ SERVER-ONLY ON PURPOSE. The multiplier is the owner's business secret and a client bundle is public: nothing that
 * imports this file may reach the browser. The browser asks the server (POST /api/quote) and is told only the final
 * `{ usd, credits }` — never the base cost, never the multiplier. `import 'server-only'` makes the build fail if a client
 * component ever imports it.
 *
 * WHY IT EXISTS. Before this, pay-as-you-go prices were set per tool and several sold at (or barely above) cost: a film
 * was 3.125 credits/s ≈ $0.116 against Veo Fast's $0.10–0.12/s; Higgsfield used HF_GEL_MARGIN (default 1.35);
 * long-form used LONGFORM_MARGIN (unset = a 503). Every price now goes through retailQuote().
 *
 * THE UNIT. The wallet holds CREDITS (1 credit = ₾0.10 ≈ $0.0370 at the top-up rate, lib/credits/pricing + lib/billing/fx).
 * A price is computed in whole credits first and the USD shown is derived FROM those credits — "$2.41" on the button is
 * exactly 65 credits off the balance, never the other way round (the same rule lib/providers/pricing.ts already follows).
 *
 * THE OWNER'S LEVER: FOUNDER_MARGIN (Vercel env, default 2.5, accepted 1–10). Changing it re-prices every tool at the
 * next request; no deploy. An invalid value falls back to the default, never to 1.
 */
import 'server-only';
import { GEL_PER_USD } from '@/lib/billing/fx';
import { CREDIT_VALUE_GEL } from '@/lib/credits/pricing';

/** USD value of ONE credit at the top-up rate (₾0.10 ÷ GEL-per-USD ≈ $0.0370). */
export const CREDIT_USD = CREDIT_VALUE_GEL / GEL_PER_USD;

export const FOUNDER_MARGIN_DEFAULT = 2.5;
export const FOUNDER_MARGIN_MIN = 1;
export const FOUNDER_MARGIN_MAX = 10;

/** The multiplier over wholesale cost. Read at CALL time, so a Vercel env change needs no deploy. */
export function founderMargin(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number((env.FOUNDER_MARGIN ?? '').trim());
  return Number.isFinite(n) && n >= FOUNDER_MARGIN_MIN && n <= FOUNDER_MARGIN_MAX ? n : FOUNDER_MARGIN_DEFAULT;
}

/** What the user sees and pays: whole credits, and the USD those credits are worth (to the cent). */
export interface RetailQuote {
  usd: number;
  credits: number;
}

/** USD value of a credit amount, to the cent. */
export function creditsToUsd(credits: number): number {
  return Math.round((Number.isFinite(credits) ? credits : 0) * CREDIT_USD * 100) / 100;
}

/**
 * Wholesale USD → the retail price. Rounds UP to a whole credit (a price is never below cost × margin) and never
 * below one credit for a paid action. A zero-cost action stays free.
 */
export function retailQuote(baseUsd: number, env: NodeJS.ProcessEnv = process.env): RetailQuote {
  if (!Number.isFinite(baseUsd) || baseUsd < 0) throw new RangeError(`invalid base cost: ${baseUsd}`);
  if (baseUsd === 0) return { usd: 0, credits: 0 };
  // The epsilon keeps an exact multiple (e.g. 2.4000000000000004) from costing a whole extra credit.
  const credits = Math.max(1, Math.ceil((baseUsd * founderMargin(env)) / CREDIT_USD - 1e-9));
  return { usd: creditsToUsd(credits), credits };
}

/** "$2.41" — two decimals always, so a price never changes width on a button. */
export function formatUsd(usd: number): string {
  return `$${(Number.isFinite(usd) ? usd : 0).toFixed(2)}`;
}
