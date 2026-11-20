# 06 — Financial and BOG audit (v5.1 Phase 0)

Base `main` @ `4c502c7`. Code and migrations read only. **No charge, refund, balance change or BOG call was made.** The
production database was not read (Claude has no Supabase permission; the last owner-run read-only SQL was 2026-11-06).

## 1. Credit balance source of truth

| Item | Finding | Evidence |
|---|---|---|
| Canonical balance | `public.profiles.credits_balance`, maintained by a trigger on `public.credit_ledger` (`delta`, `reason`, `metadata`) | `supabase/migrations/20260521_credits_rpc_ledger.sql`, `docs/ledger-unification/README.md` §1 |
| Canonical write RPCs | `deduct_credits(uuid,int,text)`, `deduct_credits_once`, `refund_credits(uuid,int,text)` → called from `lib/orchestrator/ledger.ts:71,86,121,186`, admin `lib/admin/users.ts:155`, `lib/admin/userDetail.ts:209,249` | grep |
| GEL wallet | `credit_wallet_gel(uuid,numeric,text,text)` = single top-up primitive, `wallet_topups.ref` PK → at most once; `debit_wallet_gel` (`lib/observability/agentTrace.ts:126`) | `20261002a_bog_billing.sql:7`, `20261002c_debit_wallet_gel.sql` |
| Production presence | `credit_ledger`, `request_idempotency`, `sandbox_spend` + reserve/settle present (owner SQL 2026-11-06) | production-truth §2 |
| **Legacy ledger still in code** | `public.credits` + `deduct_credits_transaction(...)` via `lib/billing/enforce.ts:133`, called by 8 entries: `/api/video/generate`, `/api/voice-lab/jobs`, `/api/agents/execute`, `/api/app/services/[slug]/run`, `/api/app/workflows{,/[id]{,/run}}`, `lib/workflows/runner.ts`; `/api/credits/balance` reads `credits`; `/api/billing/webhook` upserts `credits` | grep |
| Status of unification | `docs/ledger-unification/` = "PREPARED, NOT APPLIED" runbook | README |

Verdict: the canonical ledger is the source of truth for the media/Agent G paths that are in daily use. Whether the 8
legacy callers are reachable in production, and whether `public.credits` still exists live, is **UNKNOWN** → blocker B-02.
v5.1 §15 forbids a second ledger; this is an **existing** second ledger, not a new one.

## 2. Invariants and race protection

- Debit idempotency: unique partial index `credit_ledger_user_ref_negative_uniq` on `(user_id, metadata->>'ref')` for
  debits, mirroring the positive one for credits; functions catch `unique_violation` and answer like the EXISTS path, so a
  lost race is a no-op success (`20261002d_ledger_ref_race_hardening.sql:14-29,46-62,113-115`).
- **The idempotency key is our own `ref` string** (`metadata->>'ref'`), not a provider id. For BOG it is
  `'bog:' || shop_order_id` (our order id) (`20261002a_bog_billing.sql:319,390`).
- Request idempotency table `request_idempotency` (20261013a) for paid POSTs.
- Sandbox spend: `reserve_sandbox_spend` / `settle_sandbox_spend`, $20 lifetime cap, fails closed (CODE-01).
- Preview isolation: Previews share the production DB and wallet; `lib/env/previewIsolation` blocks paid writes on a
  Preview (tests).

## 3. Quote, reserve, settle, reconcile

| Step | Present | Evidence |
|---|---|---|
| Quote | yes — media quote token v2 (`lib/agent/media/quoteToken.ts`), code-run quote, browser quote, Live price card | files |
| Approval binding | yes for Live („კი"), code run (Start), quote token binds user/job/fingerprint/credits/expiry | v3.1 audit, files |
| Reserve / release | yes — reserve before provider call, refund on miss (`lib/orchestrator/ledger.ts`) | PROVEN_PRODUCTION for video/Live |
| Settlement | partial — debit equals the quoted credits; no settlement against the real Google cost | — |
| Provider reconciliation | **MISSING** — no Cloud Billing export is read; `lib/services/billing/costModel.ts` and `lib/credits/unitEconomics.ts` are estimates | files |
| Long-decode / timeout cost | **MISSING** — refund-on-miss assumes a failed call is free; Vertex charges Argon completions >32K tokens even on timeout from 2026-11-13 | `04` §6 |
| Pricing versioning | partial — `lib/billing/pricingConfig.db.ts`, `pricingApproval.ts`; Google promo prices end 2026-11-30 (Argon) and 2026-12-31 (3.8/3.6 Flash, 3.8 TTS) | files, Vertex pricing |

## 4. BOG

| Item | Finding | Evidence |
|---|---|---|
| Routes | `POST /api/billing/bog/checkout`, `POST /api/billing/bog/webhook`, `GET /api/billing/bog/orders/[id]` (return page reconcile), `/api/billing/bog/subscription`, `/api/admin/billing/bog`, cron `/api/cron/bog-billing` | `app/api/...` |
| Signature | SHA256withRSA over the **raw** body in `Callback-Signature`, BOG's published key (live/sandbox by `BOG_ENV`); bad/missing → 401 before parsing | `app/api/billing/bog/webhook/route.ts:4-6,37-41` |
| IP allowlist | optional extra AND gate (`BOG_CALLBACK_IP_ALLOWLIST`); X-Forwarded-For noted as client-controlled | same, `:42-47` |
| Replay / duplicates | `bog_fulfill_order` locks the order row `FOR UPDATE`, returns early if `completed`; top-up keyed `bog:<shop_order_id>` (PK) → a replayed valid callback credits once. No timestamp/nonce window (not needed for correctness given idempotency) | `20261002a_bog_billing.sql:351-390` |
| Retry model | BOG documents **no callback retry**; cron + return page reconcile from `GET /receipt` | webhook header `:9-11` |
| Sandbox on prod DB | `bogSandboxBlocked` refuses sandbox credentials on a deployment that writes to the production DB (503) | `:34` |
| Subscriptions | renewal id `myavatar-renew-<yyyymmdd>-<n>-<sub>`, partial unique index = one live renewal per period; BOG Idempotency-Key derived from it | `20261002a:492-528` |
| Refunds / failed states | order statuses tracked; BOG-side refund flow: NOT VERIFIED in code review depth | — |
| Tests | SQL scenarios + concurrency (`tests/sql/bog/10_scenarios.sql`, `20_concurrency.sh`), `bog-e2e.yml`; real BOG sandbox job **skips itself (no credentials)** | project record Phase 6 |
| Exposure | checkout `BOG_CHECKOUT_MODE=admin` (admins only) | production-truth §3 |
| Verdict | **BLOCKED** — design is sound on paper; never certified against BOG sandbox | B-03 |

## 5. Other money paths still in the tree

Stripe routes (`/api/stripe/webhook`, `/api/billing/webhook`, `lib/billing/stripe*.ts`) and iOS IAP (`lib/iap`,
`docs/IAP_STOREKIT_SETUP.md`) exist. Whether Stripe is still live in production is UNKNOWN (env not read today). Admin
credit top-ups are done by the owner in `/ka/admin` Billing; Claude never writes the production wallet.

## 6. Financial risks (ranked)

1. B-02 two ledgers (legacy `credits` callers) — possible free or double charge on those routes.
2. Timeout-is-not-free for Gemini 4 long decodes (from 2026-11-13) — refund-on-miss would lose money.
3. Price promotions end 2026-11-30 / 2026-12-31 — credit prices set on promo rates would halve margins (Flash, Argon, TTS).
4. No reconciliation with Google billing — estimates only.
5. BOG never sandbox-certified.
