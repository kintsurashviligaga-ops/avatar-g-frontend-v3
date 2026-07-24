/**
 * Single source of truth for the GEL↔USD exchange rate (Iteration 4 — multi-currency SSoT).
 *
 * The ~2.7 rate previously lived independently in TWO places — `GEL_PER_USD` (lib/billing/pricingConfig)
 * and `USD_TO_GEL` (lib/credits/pricing) — two copies that could silently drift and make a DISPLAYED price
 * disagree with a CHARGED one. This leaf module (imports nothing → no import cycles) is now the ONLY
 * definition; pricingConfig re-exports it and credits/pricing aliases it.
 *
 * NOTE: this is the DISPLAY / cost-estimation rate. Real money still moves in the tier's own priceUsd
 * (Stripe) or the GEL the wallet/gateway settles (BOG) — this constant keeps the two currencies' *shown*
 * values in lockstep; it does not itself charge anything. It does NOT resolve the credits-vs-GEL
 * denomination question on profiles.credits_balance (that is the DDL-gated ledger unification — see
 * docs/ledger-unification/). Confirm against the live bank rate before any public pricing change.
 */
export const GEL_PER_USD = 2.7 as const;
