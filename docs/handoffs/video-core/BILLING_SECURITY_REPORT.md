# Video Core v1.0 — Billing & Security report (round 3, PHASE 6)

Branch `claude/video-core-v1-6gh97e`, measured on `fc1971b` (2026-10-12). Rule of the task: **no destructive financial test
against a real customer balance, no write to the Production database, no paid provider call.** Everything below ran at
T1 (mocked ledger / Supabase client, real route and saga code) or T3 (real ffmpeg, isolated temp dirs). Nothing ran at
T4–T6; what that leaves unproven is listed in §6. Labels: PROVEN (test executed here, green) · BUILT_NOT_PROVEN (code
read, test not executable here) · NOT RUN.

## 1. What ran

```text
npx jest --silent --json --outputFile=<scratch>/phase6.json \
  __tests__/api-security.test.ts __tests__/api-lockdown.test.ts __tests__/billing-routes-auth.test.ts \
  __tests__/provider-boundary.test.ts __tests__/schema-drift.test.ts \
  app/api/video/assemble app/api/video/director/routes.test.ts app/api/video/status \
  app/api/video/remix/fallbackRefund.test.ts app/api/video/remix/noSilentSwitch.test.ts app/api/video/longform \
  app/api/agent/media app/api/agent/approvals app/api/credits \
  lib/orchestrator/ledger.test.ts lib/orchestrator/ledger.once.test.ts lib/orchestrator/ledger.reversal.test.ts \
  lib/orchestrator/ledger.refundByRef.test.ts lib/orchestrator/ledgerOnce.pg.test.ts lib/orchestrator/idempotency.test.ts \
  lib/orchestrator/produceBilling.test.ts lib/orchestrator/produceBilling.idem.test.ts lib/orchestrator/unpolledSettle.test.ts \
  lib/orchestrator/unpolledSettleRuntime.test.ts lib/orchestrator/assembleQcGate.test.ts lib/orchestrator/jobLease.test.ts \
  lib/orchestrator/jobs.test.ts lib/orchestrator/masterQa.test.ts lib/security lib/credits/videoPricing.test.ts \
  lib/agent/media/montageExec.test.ts lib/agent/media/montageWorker.test.ts lib/video/contracts.test.ts lib/video/director
npx jest --silent --json --outputFile=<scratch>/phase6b.json \
  app/api/orchestrate app/api/agent-g/orchestrate app/api/orchestrator app/api/chat/orchestrate lib/orchestrator/saga
```

Result: **69 suites · 890 tests passed · 8 skipped · 0 failed.** The 8 skipped are `lib/orchestrator/ledgerOnce.pg.test.ts`
(needs a real PostgREST with the `deduct_credits_once` RPC; none is isolated here — see §6). The per-suite table is in §7.

## 2. Settlement: once, and only after a delivered master

| Invariant (task §6) | Status | Evidence (suite › test) |
| --- | --- | --- |
| No double settlement: reserve → dispatch → commit; a failed dispatch is compensated **once** | PROVEN T1 | `lib/orchestrator/assembleQcGate.test.ts` › "890 of 891 frames → dispatch fails, commit never runs, the reservation is refunded exactly once"; "any other dispatch failure still compensates once"; `lib/orchestrator/saga.test.ts` (6) |
| A retry is a new attempt with its own debit and its own single refund | PROVEN T1 | `assembleQcGate.test.ts` › "a retry is a new attempt: its own debit, its own single refund — the first refund is never repeated"; `app/api/video/assemble/singleClipRef.test.ts` › "the charge ref carries a fresh UUID per attempt" / "every rollback refunds exactly that attempt's ref" |
| A master whose frames do not match, or **could not be counted**, is never settled as delivered (round 3 P0) | PROVEN T1 + T3 | `lib/orchestrator/masterQa.test.ts` (frame_count_mismatch critical), `lib/video/finalCut.ts` via `assembleQcGate.test.ts` › "the single-clip cut counts its own frames before hosting"; `montageAsk.test.ts` qcAvSync "picture frames not counted" → `qc_failed`; T3 `evidence/t3-round3-film.json` (qcRejectThenRetry: 890 → rejected, 891 → hosted) |
| An unreadable audio lane is refused before any encode and refunded once (round 3 P1) | PROVEN T1 + T3 | `assembleQcGate.test.ts` saga test for `music_unreadable`; `evidence/t3-round3-invalid-music-fixed.json` (422, 0 filter_complex runs) |
| A charge that the ledger refuses, or cannot make, never renders for free in Production | PROVEN T1 | `lib/orchestrator/produceBilling.test.ts` › "insufficient → do NOT proceed"; "production + skipped → billing_unavailable"; `lib/orchestrator/ledger.once.test.ts` › "a connection failure is an error, never a fallback charge" |
| A replayed charge (same idempotency ref) is refused, never a second debit or a free render | PROVEN T1 · BUILT_NOT_PROVEN on a live DB | `ledger.once.test.ts` › "charged:false → replay: refuse"; `produceBilling.idem.test.ts` › "same key + DIFFERENT prompt → DIFFERENT ref, charged again" / "same key + IDENTICAL body collapses to the same ref" / "two DIFFERENT users … separated"; the PostgREST variant (`ledgerOnce.pg.test.ts`) is **skipped** here |
| Quote-token lanes (montage, edit, audio) charge nothing before Start; a second Start or a reload finds the same job | PROVEN T1 | `lib/video/contracts.test.ts` › "a quote-token lane never charges before Start; a saga lane refunds once on failure"; `lib/agent/media/montageExec.test.ts` › "quote … nothing rendered, charged or recorded as a job", idempotency at `:158`, `:287`; `app/api/agent/media/montage/route.test.ts` › "a replay of a delivered job starts nothing" |
| Price is one amount per lane and anchored on the SSoT; this branch changes no price | PROVEN T1 | `app/api/video/assemble/billing.test.ts` › "every charge and refund in the route uses that one amount"; `lib/credits/videoPricing.test.ts` (8 s Fast = 25 credits; longer never cheaper); `git diff 30be5a2..HEAD -- lib/credits lib/billing lib/providers` is **empty** |

## 3. Refunds: what the ledger shows, never what a row claims; never twice

| Invariant | Status | Evidence |
| --- | --- | --- |
| A refund pays back the ledger's debit under the ref, capped — a row claiming 1,000,000 gets the debit, not the claim | PROVEN T1 | `lib/orchestrator/ledger.refundByRef.test.ts` › "THE EXPLOIT: a job row claims 1,000,000 under a ref that was never charged …"; "a claim larger than the debit is capped at the debit" |
| Already refunded → net 0, no second refund; a partial settle-back is subtracted; someone else's debit is not mine to refund | PROVEN T1 | `ledger.refundByRef.test.ts` (15 tests) |
| A failed worker job pays back once; the sweep settles a dead attempt's debt once; a held lease is left alone | PROVEN T1 | `lib/agent/media/montageWorker.test.ts` › "a render that fails on its own is final at once (no retry), and pays back what it charged"; `lib/orchestrator/jobLease.test.ts` › "debts … paid once" (3), "billing hold: no worker takes a job before it is paid for" (2) |
| Terminal rows never move again (a late render cannot turn a refunded row complete) | PROVEN T1 | `lib/orchestrator/jobs.test.ts` › "terminal is terminal" (2) |
| A fallback that ran no generative engine refunds through the route's **existing idempotent** refund, not a second ledger call; `refunded: true` only when THIS refund landed | PROVEN T1 | `app/api/video/remix/fallbackRefund.test.ts` (5); `noSilentSwitch.test.ts` (2) |
| Long-form: a failure refunds exactly the charged, undelivered scenes; a cancel keeps the delivered ones | PROVEN T1 | `app/api/video/longform/e2e.test.ts` › tests 2 and 3 |
| Director: a shot failure stops the run and refunds that shot; a refused submit is refunded | PROVEN T1 | `lib/video/director/run.test.ts` › "advanceRun — failures stop the run (V5) and give the money back" (2) |
| Unpolled jobs are settled by a sweep that never guesses a ref, an amount or a kind | PROVEN T1 | `lib/orchestrator/unpolledSettle.test.ts` (26), `unpolledSettleRuntime.test.ts` (2) |

## 4. Approval before billing or dispatch

| Invariant | Status | Evidence |
| --- | --- | --- |
| A storyboard changed after the tap (scene edited / added / removed / reordered, other clip length), or a stale approval, is `400 revision_mismatch` **before** anything is stored, charged or dispatched | PROVEN T1 | film path: `app/api/chat/orchestrate/storyboardApproval.test.ts` (6); director path (round 3 P1): `app/api/video/director/routes.test.ts` › "with the board approval" (3: 201 on the approved revision; 400 with 0 rows / 0 charges / 0 engine calls; stale → `board_changed`, malformed → `invalid_input`); `lib/video/director/fromStudio.test.ts` (3) |
| The director executes only a frozen, user-approved storyboard; the planner's draft is never approved by itself; an edit is a new draft | PROVEN T1 | `lib/video/director/director.test.ts` (4), `storyboard.test.ts` › "freeze refuses a storyboard the user has not approved", `planner.test.ts` |
| `startRun` stores a run and charges or submits nothing; each shot is charged just before its own submit | PROVEN T1 | `lib/video/director/run.test.ts` › "startRun …", "advanceRun — the happy path" |
| Every refusal code is emitted by the file the vocabulary names, before any charge | PROVEN T1 | `lib/video/contracts.test.ts` › "every refusal in the vocabulary is emitted by the file it names" (`revision_mismatch`: `app/api/chat/orchestrate/route.ts`, `app/api/video/director/runs/route.ts`) |

## 5. Ownership, access and the server boundary

| Invariant | Status | Evidence |
| --- | --- | --- |
| No wrong project / asset access: another user's file or job is refused before the first charge | PROVEN T1 | `app/api/video/assemble/callerMedia.test.ts` › "the gate refuses with 403 before the first charge or reservation"; `lib/security/callerMedia.test.ts` (another user; a double slash); `lib/agent/media/montageExec.test.ts` › "another user's file, or a link outside our storage, is refused and named"; `app/api/agent/media/montage/route.test.ts` › "a job read … not yours 404"; `app/api/video/longform/[id]/route.test.ts` › "another user's job … 404" |
| Every paid-provider route is authenticated or explicitly allow-listed; every checkout / card route has its own auth gate | PROVEN T1 | `__tests__/api-security.test.ts` (scanner over all routes), `__tests__/billing-routes-auth.test.ts` |
| Admin-flagged lanes are closed by default: 404 before the session is read when the flag is unset (Preview too); `admin` → signed-out 401, non-admin 404 | PROVEN T1 | `app/api/agent/media/analyze|audio|edit|montage/route.test.ts` ("closed unless the owner opens it"); `app/api/video/director/routes.test.ts` › "the gate"; `app/api/video/longform/[id]/cancel/route.test.ts` › "404 while the flag is off — before auth" |
| Shared-secret checks fail CLOSED when the env var is unset; no secret-looking `NEXT_PUBLIC_*`; no service-role key in a public variable | PROVEN T1 | `__tests__/api-lockdown.test.ts`, `lib/security/secretMatch.test.ts`, `lib/security/serverAuthBoundary.test.ts`, `app/api/agent/media/sweep/route.test.ts` › "no secret, or the wrong one: 403, nothing read" |
| Money RPCs are called only by service-role ledger modules; the drainer refunds through the ledger, not from a row's claim; owner tables get owner-only RLS | PROVEN T1 (code scan) | `lib/security/dbExposure.test.ts` (3), `lib/security/rlsInternalTables.test.ts` (2) |
| Expensive calls are rate-limited per verified user; a limited caller gets the limiter's answer and nothing runs | PROVEN T1 | `app/api/agent/media/analyze/route.test.ts` › "a rate-limited caller is answered by the limiter, nothing runs"; `app/api/video/longform/route.test.ts` › "the per-account rate limit answers for itself" |
| Provider allow-list unchanged (Google + ElevenLabs + FFmpeg policy); no new provider in this branch | PROVEN T1 | `__tests__/provider-boundary.test.ts` green on this tree; allow-list file unchanged vs main |
| Schema drift ratchet: code vs the Production snapshot, no new table assumed | PROVEN T1 | `__tests__/schema-drift.test.ts` (the storyboard-revision table stays a proposal, B3) |

## 6. Not proven here (and why)

| Item | Status | Cause · what would prove it |
| --- | --- | --- |
| `deduct_credits_once` replay refusal on a real PostgREST | **PROVEN (round-3 final, §8)** on a throwaway local Postgres 16 + PostgREST 12.2.3; not on Production (task rule) | `scripts/lease-isolation/run.sh`, before and after migration 20261002d; the 8 tests are skipped only in the default jest run, which has no database |
| Any balance movement on a real account | NOT RUN by design (a throwaway ledger moved instead, §8) | "Never run destructive financial tests against real customer balances"; the ledger is mocked at T1 |
| Live payment webhooks (BOG, Stripe live) | NOT RUN | BOG creds and live Stripe are GG's (memory: production-payments); outside Video Core |
| Rate limiting on Preview (Upstash) and the no-Redis degradation on a deployed build | BUILT_NOT_PROVEN | `lib/orchestrator/idempotency.test.ts` proves the no-Redis path locally; a Preview run needs the isolated environment (B2) |
| HawkScan DAST | NOT RUN | `HAWK_API_KEY` is unset in this sandbox and the repo has no `stackhawk.yml` (B7); a scan needs the key and a reachable deployed URL |
| RLS on Production (52/52) | not re-run in this task | proven 2026-10-08 per memory; unchanged by this branch (no migration applied) |
| Agent G media lanes on Preview as admin | NOT RUN | flags `AGENT_G_MEDIA_EXEC` / `VIDEO_DIRECTOR_RUNS` are owner-set; Preview binds Production Supabase (B2) |

## 7. Per-suite results

| Suite | passed | skipped | failed |
| --- | --- | --- | --- |
| `__tests__/api-lockdown.test.ts` | 20 | 0 | 0 |
| `__tests__/api-security.test.ts` | 12 | 0 | 0 |
| `__tests__/billing-routes-auth.test.ts` | 3 | 0 | 0 |
| `__tests__/provider-boundary.test.ts` | 4 | 0 | 0 |
| `__tests__/schema-drift.test.ts` | 7 | 0 | 0 |
| `app/api/agent/approvals/route.test.ts` | 4 | 0 | 0 |
| `app/api/agent/media/analyze/route.test.ts` | 11 | 0 | 0 |
| `app/api/agent/media/audio/route.test.ts` | 9 | 0 | 0 |
| `app/api/agent/media/edit/route.test.ts` | 9 | 0 | 0 |
| `app/api/agent/media/montage/route.test.ts` | 16 | 0 | 0 |
| `app/api/agent/media/sweep/route.test.ts` | 6 | 0 | 0 |
| `app/api/chat/orchestrate/filmGrid.test.ts` | 21 | 0 | 0 |
| `app/api/chat/orchestrate/guest.test.ts` | 5 | 0 | 0 |
| `app/api/chat/orchestrate/storyboardApproval.test.ts` | 6 | 0 | 0 |
| `app/api/chat/orchestrate/template.test.ts` | 5 | 0 | 0 |
| `app/api/credits/history/route.test.ts` | 5 | 0 | 0 |
| `app/api/orchestrate/route.test.ts` | 3 | 0 | 0 |
| `app/api/orchestrator/geminiOnly.test.ts` | 4 | 0 | 0 |
| `app/api/orchestrator/interior/produce/route.test.ts` | 8 | 0 | 0 |
| `app/api/orchestrator/jobs/route.test.ts` | 13 | 0 | 0 |
| `app/api/orchestrator/produce/route.test.ts` | 2 | 0 | 0 |
| `app/api/video/assemble/billing.test.ts` | 4 | 0 | 0 |
| `app/api/video/assemble/callerMedia.test.ts` | 2 | 0 | 0 |
| `app/api/video/assemble/musicBed.test.ts` | 3 | 0 | 0 |
| `app/api/video/assemble/singleClipRef.test.ts` | 2 | 0 | 0 |
| `app/api/video/director/routes.test.ts` | 15 | 0 | 0 |
| `app/api/video/longform/[id]/cancel/route.test.ts` | 6 | 0 | 0 |
| `app/api/video/longform/[id]/route.test.ts` | 6 | 0 | 0 |
| `app/api/video/longform/e2e.test.ts` | 3 | 0 | 0 |
| `app/api/video/longform/route.test.ts` | 20 | 0 | 0 |
| `app/api/video/remix/fallbackRefund.test.ts` | 6 | 0 | 0 |
| `app/api/video/remix/noSilentSwitch.test.ts` | 2 | 0 | 0 |
| `app/api/video/status/[tokenId]/route.test.ts` | 6 | 0 | 0 |
| `lib/agent/media/montageExec.test.ts` | 54 | 0 | 0 |
| `lib/agent/media/montageWorker.test.ts` | 22 | 0 | 0 |
| `lib/credits/videoPricing.test.ts` | 13 | 0 | 0 |
| `lib/orchestrator/assembleQcGate.test.ts` | 12 | 0 | 0 |
| `lib/orchestrator/idempotency.test.ts` | 5 | 0 | 0 |
| `lib/orchestrator/jobLease.test.ts` | 20 | 0 | 0 |
| `lib/orchestrator/jobs.test.ts` | 14 | 0 | 0 |
| `lib/orchestrator/ledger.once.test.ts` | 9 | 0 | 0 |
| `lib/orchestrator/ledger.refundByRef.test.ts` | 15 | 0 | 0 |
| `lib/orchestrator/ledger.reversal.test.ts` | 5 | 0 | 0 |
| `lib/orchestrator/ledger.test.ts` | 3 | 0 | 0 |
| `lib/orchestrator/ledgerOnce.pg.test.ts` | 0 | 8 | 0 |
| `lib/orchestrator/masterQa.test.ts` | 18 | 0 | 0 |
| `lib/orchestrator/produceBilling.idem.test.ts` | 14 | 0 | 0 |
| `lib/orchestrator/produceBilling.test.ts` | 20 | 0 | 0 |
| `lib/orchestrator/saga.test.ts` | 6 | 0 | 0 |
| `lib/orchestrator/unpolledSettle.test.ts` | 26 | 0 | 0 |
| `lib/orchestrator/unpolledSettleRuntime.test.ts` | 14 | 0 | 0 |
| `lib/security/allowlistedAudioFetch.test.ts` | 34 | 0 | 0 |
| `lib/security/callerMedia.test.ts` | 42 | 0 | 0 |
| `lib/security/csp.test.js` | 9 | 0 | 0 |
| `lib/security/dbExposure.test.ts` | 53 | 0 | 0 |
| `lib/security/publicMediaUrl.test.ts` | 19 | 0 | 0 |
| `lib/security/rlsInternalTables.test.ts` | 5 | 0 | 0 |
| `lib/security/secretMatch.test.ts` | 3 | 0 | 0 |
| `lib/security/serverAuthBoundary.test.ts` | 4 | 0 | 0 |
| `lib/security/storageReadScope.test.ts` | 3 | 0 | 0 |
| `lib/video/contracts.test.ts` | 46 | 0 | 0 |
| `lib/video/director/director.test.ts` | 20 | 0 | 0 |
| `lib/video/director/fromStudio.test.ts` | 6 | 0 | 0 |
| `lib/video/director/googleVeoProvider.test.ts` | 56 | 0 | 0 |
| `lib/video/director/migration.test.ts` | 3 | 0 | 0 |
| `lib/video/director/planner.test.ts` | 7 | 0 | 0 |
| `lib/video/director/run.test.ts` | 21 | 0 | 0 |
| `lib/video/director/server.test.ts` | 8 | 0 | 0 |
| `lib/video/director/storyboard.test.ts` | 33 | 0 | 0 |

**Total: 69 suites · 890 passed · 8 skipped · 0 failed.**

## 8. Round-3 final pass (2026-10-12): the same rules on a real database

Head 954e385 → 357926b (no billing code changed after it). A throwaway Postgres 16 cluster on 127.0.0.1 behind a real
PostgREST v12.2.3 (static binary; Docker Hub answered 429), built by `scripts/lease-isolation/run.sh` from the Production
shape in `scripts/lease-isolation/schema.sql`. Nothing in it can reach Production; it is deleted at the end of the run.

```text
PG_PORT=54339 REST_PORT=54340 POSTGREST_BIN=<scratch>/pgrst/postgrest bash scripts/lease-isolation/run.sh
```

Exit 0. Log: `evidence/round3-final/pg-isolation-run.txt`.

| Suite (real DB) | Result | What it proves |
| --- | --- | --- |
| `leaseIsolation.pg` (run twice: before and after 20261002d) | 7/7 · 7/7 | a dead worker's job is taken over once its lease lapses and is charged once; two deaths → given up, refunded once, a second sweep pays nothing; a refund debt on a failed row is paid by the next sweep, once; an owner stop → nothing delivered, charge back once; a hold whose request died is failed after `HOLD_MS` and paid back; 8 workers racing one job → exactly one gets it |
| `ledgerOnce.pg` before 20261002d | 7 passed · 1 phase-skipped | first call charges, a sequential replay is refused and charges nothing; `refuseReplay` → `duplicate_request`, not a free render; insufficient credits stay insufficient; no profile → no charge; the concurrent-twins window before the migration is shown, not hidden |
| `ledgerOnce.pg` after 20261002d | 7 passed · 1 phase-skipped | the same, and **8 concurrent twins → one debit, exactly one may render** |
| `runIsolation.pg` (real ffmpeg) | 6/6 | a three-step Agent G run gives three real results, one start per plan; a crash mid-render resumes from the database alone; a stop kills ffmpeg and returns the 7 credits once; a priced step waits for its own yes (forged ones refused), 8 racing ticks → one job and one charge per step; a failed priced step is paid back and a resume reuses delivered work; another user can neither steer the run nor use its token, uploads or results |
| `outboxIsolation.pg` | 4/4 | a finished job is told once per outlet; two deliverers → once each; a refund and our record do not undo each other |

Three harness repairs were needed first, none in product code (defect register row 31): PostgREST without Docker, throwaway
twin debits deleted before the migration's preflight, and the crash-recovery case sampling the master from the live database
since per-clip QC.

**What this still does not prove:** the same rules through the browser on a deployed build with a real Supabase Auth and
Storage (blocked: no isolated Supabase yet, `SUPABASE_TEST_ENV.md`), and anything on a real customer balance (never, by rule).
