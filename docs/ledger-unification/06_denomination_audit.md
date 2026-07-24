# 06 — Multi-currency denomination audit (Iteration 4)

> **Why the wallet chip can show `$55` after a `$15` purchase — and why that is NOT a display bug you can
> fix in the UI.** This is the read-only audit for the dual-denomination discrepancy. The *safe* part
> (a single FX source of truth) shipped with this iteration; the *core* fix is DDL-gated (WS5) — see §4.

## 1. The exchange rate (now a single SSoT — SHIPPED)

The `≈2.7` GEL-per-USD rate was defined **twice, independently**: `GEL_PER_USD` (lib/billing/pricingConfig)
and `USD_TO_GEL` (lib/credits/pricing). Either could drift and make a *displayed* price disagree with a
*charged* one. Iteration 4 moved the definition to a leaf module **`lib/billing/fx.ts`**; pricingConfig
re-exports it and credits/pricing aliases it, so there is now **one** rate.

Still-hardcoded `2.7` (charge-path, same value — consolidate in a follow-up, low urgency): `lib/stripe/
plans.ts` (`gelRate`), `lib/stripe/client.ts`. `lib/tax/georgia.ts` uses a per-profile rate with `2.7` as
the fallback — that one is intentional (it can vary per invoice).

**EUR:** not implemented anywhere. The roadmap names GEL/USD/EUR, but adding EUR is a product decision
(pricing + a settlement rail), not a code gap — do not invent an EUR rate.

## 2. The real discrepancy — a CREDITING-unit mismatch, not a display bug

`profiles.credits_balance` (one integer column, the spend-of-record `deduct_credits` draws from) is
credited by **two paths that add different units**:

| Path | Adds | For a … | Example |
|---|---|---|---|
| GEL wallet top-up (`credit_wallet_gel`, 20260705) | `FLOOR(amountGel)` — GEL units, ~1 per ₾ | 20 ₾ top-up | **+20** |
| USD tier grant (`grantPurchasedCredits`→`refund_credits`) | `creditsIncluded` — marketing credits, ~0.10 ₾ each | $15 Starter tier | **+150** |

So the same column holds two scales. The chip renders every balance through `formatWalletBalance` /
`usdFromGel` (i.e. treats it as **GEL**, then `÷2.7` for USD). That yields two different wrong outcomes:

- **Wallet-only user:** balance is GEL-in, GEL-displayed → the *number looks right* (20 ₾ shows "20 ₾"),
  but the user is **under-credited for spending** — `deduct_credits` spends this against per-action costs,
  so 20 units buys far less than the 200-ish the money implies.
- **Tier buyer:** `+150` is displayed as if 150 ₾ → **`150 ₾` / `~$55` for a `$15` purchase** — the visible
  inflation.

**⇒ No display-only change is universally correct**, because the underlying number's *meaning* differs by
how it was funded. "Fix the chip's `÷2.7`" would trade the tier cohort's inflation for the wallet cohort's
deflation. The money charged is correct on both rails (Stripe charges `priceUsd`; BOG settles the GEL tier);
the defect is which unit each path *deposits*.

## 3. What is verified CORRECT (do not touch)

- Tier **cards** show `priceUsd` ($15/$99/$299) = exactly what Stripe charges. No inflation there.
- `PRICING_TIERS.priceGel = round(priceUsd × GEL_PER_USD)` — display GEL and display USD are in lockstep.
- Every generation debits `profiles.credits_balance` via idempotent `deduct_credits`; the reserve/refund
  saga is intact. The bug is in the *deposit* unit + the *balance display*, never in a charge.

## 4. The actual fix (DDL-gated — WS5, do NOT ship blind)

Requires a product decision + live-DB work, in this order (the scripts already exist in this directory):

1. **Decide the canonical unit** of `profiles.credits_balance` — "credits" (1 = 0.10 ₾) is the natural
   choice since `deduct_credits`/`PRODUCE_COST` already spend in it. *(Product decision.)*
2. Run `01_introspect.sql` + `02_report_divergence.sql` — measure how many balances are in which scale.
3. Make **both** deposit paths add the SAME unit: `credit_wallet_gel` should add `gelToCredits(amountGel)`
   (× `CREDITS_PER_GEL` = ×10), and `grantPurchasedCredits` should keep granting credits. *(DDL — the RPC.)*
4. **Reconcile existing balances** to the chosen unit (`03_reconcile.sql`, guarded).
5. THEN fix the display to convert credits→GEL/USD (`creditsToGel` ÷ then `÷GEL_PER_USD`) — safe only
   *after* step 4, because only then is the balance uniformly one unit.

Until steps 1–4 land, the chip stays as-is (changing it now would just move the wrongness between cohorts).
The FX SSoT (§1) is the only part safe to ship without the DB.
