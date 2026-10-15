# FINAL — financial and security evidence (2026-10-14, final P0/P1 repair run)

Branch `claude/global-final-e2e-20261014` (Draft PR #67). All evidence below is from automated tests written in this run
that use in-memory fakes with the database's semantics, plus the existing real-Postgres CI job. **No Production database
was read or written. No paid provider was called. Spend this run: $0.**

## 1. Preview isolation (`lib/env/previewIsolation.ts`)

Before: `PREVIEW_ISOLATED_DB=1` alone counted as isolated whenever `PRODUCTION_SUPABASE_REF` was unset.

Now a Preview (or any `VERCEL_ENV` other than production/development) is isolated only when **all** of these hold:

| # | Requirement | Reason code when it fails |
|---|---|---|
| 1 | `PREVIEW_ISOLATED_DB` truthy | `no_declaration` |
| 2 | `PREVIEW_SUPABASE_REF` = 20 lowercase alphanumerics | `preview_ref_missing_or_malformed` |
| 3 | `PRODUCTION_SUPABASE_REF` = 20 lowercase alphanumerics | `production_ref_missing_or_malformed` |
| 4 | the two refs differ | `refs_equal` |
| 5 | the Preview ref is not a compiled-in Production ref (`zwksnayknzggdcenqqxy`), so a forged `PRODUCTION_SUPABASE_REF` can't launder the real project | `preview_ref_is_known_production` |
| 6 | every Supabase URL present (`SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, at least one) parses to the declared Preview ref | `no_supabase_url` / `supabase_url_unparseable` / `supabase_url_mismatch` |
| 7 | no DB connection string (`DATABASE_URL`, `POSTGRES_URL*`, `SUPABASE_DB_URL`, `DIRECT_URL`) names a Production ref | `db_url_names_production` |

What is refused on an unisolated Preview: `deductCredits`, `deductCreditsOnce`, **`refundCredits` and `grantCredits` (new)**,
every `lib/billing/wallet-ledger` write (grants, refunds, free film / avatar-chat slots; **new**), the admin
grant/adjust (**new**), the agent-trace GEL debit (**new**), `billing/enforce` and `commerce` (already guarded).

Tests: `lib/env/previewIsolation.test.ts`, **16/16 pass**. They cover forged `PREVIEW_ISOLATED_DB=1` on its own, a missing
Production ref, a malformed ref, equal refs, a forged Production ref, a URL that still points at Production, two URLs that
disagree, a custom domain, a Production `DATABASE_URL`, an unknown `VERCEL_ENV`, and the ledger refusing to call its RPC.

## 2. Dubbing and Presentation billing (`app/api/v2/dubbing/start`, `app/api/v2/presentation/build`)

| Invariant | How it is enforced | Test (in `route.test.ts`) |
|---|---|---|
| Off until the owner approves the price | `OWNER_APPROVED_PRICING` must list `dubbing:10` / `presentation:15` — the **exact** price. Unset, a wrong price or a malformed value ⇒ 503 `pricing_not_approved`, before ffmpeg, the ledger or any provider | `owner approval …` (6 + 4 cases) |
| Signed server quote | a POST without a token returns `{requiresConfirm, quote}` and charges nothing. HMAC binds user, job id, request fingerprint (service folded in), credits and expiry | `a first POST is a quote …` |
| Explicit authenticated Confirm | only `confirm === true` plus a valid token runs. Missing confirm, forged or expired token, another user's token, another key, a changed request, or a dubbing token used for a deck ⇒ 409, nothing charged | `confirm without a token, a forged token …` |
| Underdeclared duration | the dub is priced on the **server-measured** length (ffmpeg extract, no provider). `durationSec` is ignored. The pipeline reuses the same track, so no top-up debit exists | `UNDER-DECLARED duration buys nothing` (declared 1 s, measured 241 s ⇒ 50 cr) |
| Unmeasurable source | 422 `duration_unmeasurable`, nothing charged | `an unmeasurable source …` |
| Price drift after quote | longer at confirm than at quote ⇒ 409 `quote_price_changed` | `a source that measures longer …` |
| No provider call without authorization | reservation happens before `guardedCall` (asserted by call order). Short balance ⇒ 402; ledger error ⇒ 503 | `reserves before the provider …`, `402`, `503` |
| Exactly-once debit, concurrent confirms | the job row is inserted under the quote's job id (primary key). Ref `<service>:<jobId>` uses `deduct_credits_once` (replay refused) | `CONCURRENT confirmations` (3 parallel ⇒ 200/409/409, 1 debit, 1 provider run) |
| Retry after a lost response | 409 `duplicate_request` with the existing job's status. No second debit | `a RETRY after success …` |
| Job creation failure | no row ⇒ 503 `job_unavailable` **before** the reservation, so no orphan charge | `JOB CREATION FAILURE` |
| Exactly-once refund | `${ref}:refund` (DB unique ref). In-route refund and drainer refund collapse to one | `a failed leg refunds exactly once` (balance back to 100) |
| Refund failure never reported as refunded | `refundProduce` now returns a boolean. On false the response says `refunded:false, refundPending:true` and the row stays `processing` with `_reserve` for the drainer | `a REFUND THAT DOES NOT LAND …` |
| Worker crash / timeout | once the reservation lands, the row is `processing` with `_reserve {ref, credits}` **before** the provider runs. The drainer (`RENDER_DRAINER_ENABLED=1`) refunds it after 30 min | `WORKER CRASH …` |
| Never "completed" without durable persistence | `persistCompletion` retries once. On failure the response is `status:'unpersisted', persisted:false` (result still delivered) | `PERSISTENCE FAILURE` |
| Never report credits that weren't debited | `creditsCharged` = cost only when `reservation.charged` | `… reports 0 credits charged` |

Counts: dubbing **38/38**, presentation **20/20**, `lib/billing/paidServiceGate.test.ts` **6/6**,
`produceBilling.test.ts` **21/21** (adds the refund-outcome test).

## 3. Provider boundary

- `MEDIA_GOOGLE_ONLY`, `VIDEO_GOOGLE_ONLY` and `AI_GOOGLE_ONLY` stay default ON. A falsy value now re-opens outside engines
  **only together with** `OUTSIDE_ENGINES_APPROVED=<owner approval ref, ≥8 chars>` (`lib/env/providerBoundary.ts`).
  `lib/env/providerBoundary.test.ts` (4 tests + 4 cases) and `mediaPolicy.test.ts` pin this.
- Paid build hooks: `scripts/gcp/preview-inference-check.cjs` and `scripts/global-e2e/preview-media-check.cjs` are not
  referenced by `vercel.json` or any npm build script, and neither request file exists. `lib/env/paidBuildHooks.test.ts`
  pins both. `preview-auth-check.cjs` (still in the build command) makes free auth calls only.
- CI: the live E2E workflows run against an isolated local Supabase with no provider keys. The preview-contract E2E is mocked.

## 4. Video Core defect 51 (PR #64, patch only)

`docs/handoffs/global-e2e/patches/defect51-durable-stitch-settlement.patch` (based on PR #64 `bcb724a1`, **not applied
to #64**):

- After a stitch debit actually lands, a durable `processing` settlement row with `_reserve` is opened. It is closed on
  success, and on an in-route refund only when that refund landed.
- The multi-clip rollback ref changes from `assemble-rollback:<saga>` to `${ref}:refund`. Without that change, adding a
  drainer refund would have paid out twice.
- Verified on `bcb724a1` alone: `git apply --check` passes, tsc is clean, and
  `jest app/api/video app/api/cron lib/orchestrator lib/pipeline/renderDrainer` gives 67 suites / 623 tests passing
  (2 suites skipped). Also verified on the integration tree.
- Remaining risk, documented for #64's owner: a stitch that is delivered but whose close fails stays reapable, which
  would refund a delivered film (narrow window). The free-film slot is not restored after a kill.

## 5. Real-database evidence (unchanged path, CI)

The `billing on real Postgres` job (`scripts/lease-isolation/run.sh`: leaseIsolation, ledgerOnce, runIsolation) runs in
the Video Core E2E workflow on Linux. See FINAL_INTEGRATION_E2E_MATRIX.md for the run on the final SHA.
