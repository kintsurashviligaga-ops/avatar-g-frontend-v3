# v5.1 Phase 5 prep: billing, credits, versioned pricing, BOG certification

**Status: PREPARED, NOT WIRED, NOT APPLIED.** This is a draft PR based on `main`, kept separate from the engine stack (#308 → #311) and Phase 4 (#312).

- No route, cron or UI calls this code.
- No SQL here has run anywhere except a throwaway local Postgres.
- Nothing moves money.
- The one new flag, `AGENT_PRICE_BOOK`, is off.
- Production Supabase is down, so everything is pure code with mocked tests, the same way the engine was built.

Scope is GG's 2026-11-13 12:34Z ask: Phase 5 = M-5 (price book), M-9 (reconciliation), M-10 (legacy ledger retirement), M-11 (BOG certification) and M-12 (Argon/Carbon worst case), from `docs/architecture/v5.1/09` and `08`.

## 1. What is true today (read in code on `main`)

| | Today |
|---|---|
| Balance of record | `profiles.credits_balance`, moved only by `credit_ledger` rows through the canonical RPCs (`deduct_credits`, `refund_credits`). Wrapped by `lib/orchestrator/ledger.ts`, deduped on `metadata->>'ref'`. |
| Legacy ledger | `public.credits` via `lib/billing/enforce.ts` (8 callers). **Not touched** (B-02: waits for GG's `01_introspect.sql` output). |
| Prices | In code. `lib/credits/priceBook.ts` holds credit prices. `lib/credits/unitEconomics.ts` holds provider costs and the owner's rule: 100 % profit over full cost, 1 credit = 0.10 ₾. A quote names a digest of those tables (`lib/credits/pricingVersion.ts`). |
| BOG | Fully built and tested against a fake BOG (`lib/billing/BOG_INTEGRATION.md`): checkout, signed callback, fulfil once, cron reconcile, renewals, limits and refunds. **It has never run against the real BOG sandbox** (B-03: sandbox credentials). |
| Cost tracking | None per call. Nothing compares Google's bill with what we charged. |

## 2. What this PR adds

All code is in `lib/billing/v5/`. It is pure, apart from injected ports.

### 2.1 Versioned price book (`priceVersions.ts`, M-5)
- One row is one provider price of one (capability, model, unit) for a window `[validFrom, validTo)`.
- A row is **usable** only when all of these hold:
  - it has an https source page, a fetch time and an approver;
  - its credits meet the owner's 100 % rule (checked with the same `profitOverCostOf` that `priceBook.test.ts` uses).
- If no usable row exists, the capability is **unavailable**. It is never free.
- If two usable rows cover the same moment, that is an **overlap**. The capability is unavailable (fail closed) and the code never picks one.
- Promo rows must have an end date. `promoAlarms` warns 7 days before the end, and marks it **critical** when no row starts at that moment. Known promo ends:
  - Argon on 2026-11-30;
  - 3.8 Flash and 3.8 TTS on 2026-12-31.
- `AGENT_PRICE_BOOK`:
  - `off` (default; anything unknown also reads as `off`);
  - `shadow`: price every quote from the book too and log the difference, while the user still pays today's price;
  - `on`: the book prices. This is GG's switch, after shadow agrees.

### 2.2 Quotes with a worst case (`quote.ts`, M-5 and M-12)
- A quote gives two numbers:
  - `credits`: what the card shows;
  - `maxCredits`: the most the call can cost. This is reserved before the provider is called, and the user never pays more.
- A quote also gives the `versionIds` it read.
- If any unit has no price, the whole quote fails. A partial quote would understate the price.
- The worst-case builders follow 08 §4:
  - **text:** counted input + full output cap + thinking budget;
  - **video:** the longest allowed duration;
  - **TTS:** characters;
  - **Live and sandbox:** the session cap.
- **Argon and Carbon:** Vertex bills completions over 32K tokens even on a timeout (from 2026-11-13). `timeoutBilledUsage` counts the full cap for them, so a timeout is never treated as free to us.

### 2.3 Reserve → settle over the canonical ledger (`settle.ts`, M-5)
- **No new ledger RPC.**
  - `reserve` = `deductCreditsOnce(maxCredits, '<ref>:hold')`.
  - `settle` = `refundCredits(unused, '<ref>:release')`.
  - Both are ref-idempotent, so retries and replays are no-ops.
- Settlement rules (08 §5; GG D-15 "never charge users for Google-billed failures"):

| Outcome | User pays | We record |
|---|---|---|
| success | the actual price, capped at `maxCredits` | cost; anything above the quote is **our** loss (`over_quote`) |
| Google error, not billed | 0 (full release) | 0 |
| Google error, **billed** | 0 (full release) | what Google billed, as our loss (`google_billed_failure: …`) |
| cancelled | the completed part only | the partial cost |
| usage we can't price | what the card showed, capped at the hold | flagged `unpriced_usage` |

- Fail closed:
  - a hold that isn't confirmed means no provider call;
  - a settle with no hold, or a hold of a different size, moves nothing;
  - a failed release is reported for retry, and the cost row waits.

### 2.4 Daily reconciliation (`reconcile.ts`, M-9)
- Compares the Cloud Billing export (summed by the `cap` label) with `provider_costs`, per capability, per UTC day.
- It raises an alarm when:
  - a capability with at least $0.50 of spend drifts by more than 10 %;
  - more than $1 a day of spend has no label.
- It is read-only: it writes a report and never changes a balance.

### 2.5 BOG sandbox certification (`bogCertification.ts`, M-11)
- The 13 checks of the certification run:
  1. OAuth
  2. order
  3. test-card payment
  4. callback signature
  5. fulfil once
  6. **replay**
  7. forged callback
  8. amount mismatch
  9. lost callback settled by the cron
  10. decline
  11. refund
  12. limits
  13. saved-card renewal (only if the bank enabled automatic payments)
- `certify()` passes a run only when every required check passed with `BOG_ENV=sandbox`.
- The run is **local only**, with `scripts/bog-sandbox-smoke.mjs`. A sandbox pair never goes on Vercel, because every deployment writes to the Production database.

### 2.6 SQL migration (`docs/v5.1-phase5/migrations/`, not applied)
- `20261114a_phase5_money.sql` adds three tables:
  - `price_versions`, with a gist **exclusion constraint** so two approved rows can never overlap. A trigger makes an approved price immutable: only `valid_to` can be set, once, and an approved row is never deleted.
  - `provider_costs`: one row per ledger ref; a loss requires a reason.
  - `reconcile_reports`.
- All three are service-role only (RLS on, no client grants).
- The migration has a VERIFY block and is idempotent.
- `….rollback.sql` drops only what the migration created.
- The file sits in `docs/`, **not** `supabase/migrations/`, so no deploy can apply it.
- `scripts/phase5-sql-check.sh` runs `tests/sql/phase5/10_money.sql` on a **throwaway local Postgres 16**. It covers:
  - overlap refused;
  - approving an overlapping draft refused;
  - an approved price can't be edited or deleted;
  - `valid_to` can be set once only;
  - bad rows refused;
  - one cost row per ref;
  - client roles can't read;
  - rollback, then re-apply.

  All checks pass.

## 3. What is left before any of this can be turned on

1. **Database back, then staging (D-14).** GG runs the migration on the staging project first, then on production. Claude never runs production SQL.
2. **Seed the book.** Each row needs the official Google pricing page, the price on the fetch date, and GG's approval. No price row is written in this PR: prices from memory are not prices.
3. **Shadow.** Wire `quote()` next to today's code prices behind `AGENT_PRICE_BOOK=shadow` and log the differences for a week. The user is still charged today's price.
4. **Engine.** The engine (#308 → #311) already holds a quote per step (`admitQuote`, `StepHold`). Its `priceOf` becomes `quote()` and its reserve/settle becomes `settle.ts`. This is a 3.5-style wiring PR.
5. **Labels and export.** GG enables the Cloud Billing export to BigQuery (an owner action). Every Vertex call then carries `app`, `cap` and `run` labels where the API accepts them, and a daily cron writes `reconcile_reports`.
6. **BOG.** GG gets the sandbox pair from BOG and runs the 13 checks locally. The evidence goes into `certify()`.
7. **M-10, legacy ledger.** Blocked on GG's `01_introspect.sql` output (B-02). The plan stays as in `docs/ledger-unification/` and 08 §7. No code here touches `public.credits` or `enforce.ts`.
8. **M-12, Argon and Carbon.** Only after the book has their rows (the Argon promo ends 2026-11-30) and GG lifts D-06.

## 4. GG answers (2026-11-13 13:06Z) and where they live

| Answer | Done in this PR |
|---|---|
| **Draft all price rows from Google's official pages; GG approves one by one.** | `lib/billing/v5/priceDrafts.ts`: 42 drafts from the Vertex AI pricing page (read 2026-11-13 13:15Z), every one with `approvedBy: null`, so none prices anything. Review list: [`price-drafts.md`](price-drafts.md). Seed SQL: `seed/20261113b_price_drafts.sql` (drafts only, re-runnable; the local SQL check loads it twice and approves one). Both files are generated from the `.ts` and a test keeps them equal. **Policy for GG to confirm:** the drafts use the full billed price, not the "50 % credits back" promo price (3.8 Flash, 3.8 Flash TTS, Argon, Carbon), so no price jumps when a promo ends. Not drafted: embeddings, Chirp / Cloud TTS (other pricing pages), sandbox minutes. |
| **Shadow mode for 7 days, log the differences.** | `lib/billing/v5/shadow.ts`: `shadowPrice(AGENT_PRICE_BOOK, estimate, codeCredits, ports)` prices the same call from the approved rows and logs `{codeCredits, bookCredits, diff, diffPct, versionIds, error}`. It returns nothing chargeable, never throws, and gives up after 800 ms. `off` (default) reads and logs nothing. `shadowSummary` turns a week of records into a per-capability table. Wiring it into the routes is the next PR, after the DB is back; the flag stays `off` until GG sets `shadow`. |
| **BOG sandbox credentials.** The answer arrived as both template options (A: not available now, mark BLOCKED; B: GG adds them to GitHub CI secrets later), so this PR covers both. | `lib/billing/v5/bogScorecard.ts`: the 13-check scorecard. Today it reads **12 BLOCKED, 1 not required** (saved-card renewal, until automatic payments are on). Option B already works: `.github/workflows/bog-e2e.yml` runs S1–S7 against BOG's real sandbox as soon as the Actions secrets `BOG_SANDBOX_CLIENT_ID` / `BOG_SANDBOX_SECRET_KEY` exist (GitHub only, never Vercel). Until then that job **skips and still shows green**, so the scorecard never counts a green check, only a run's evidence. The signed callback and its replay need one run with a public callback URL; a CI runner has none. |

## 5. Questions for GG (none block this preparation)

- **Price rows:** approve the drafts in `price-drafts.md` one by one, and confirm the full-price policy (or ask for promo rows).
- **Shadow week:** approved 13:06Z; starts when the DB is back and the wiring PR is merged.
- **BOG sandbox:** add the pair as GitHub Actions secrets when ready; the scorecard stays BLOCKED until a real run.
