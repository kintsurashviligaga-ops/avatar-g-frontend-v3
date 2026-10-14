# Video Core v1.0 + Image Studio — final engineering run (2026-10-14, Opus 5.5)

Owner-facing Georgian summary: `GO_NO_GO_FINAL_KA_2026-10-14b.md`. Image Studio details: `docs/handoffs/image-studio/FINAL_RUN_2026-10-14b.md`
on branch `codex/image-studio-v1`.

**Nothing was merged, deployed, migrated on a shared database, or changed in Production env. No paid provider call was made
(provider spend this run: $0.00; MyAvatar credits used: 0).**

## 0. Recovered state (Phase 0)

| Item | Evidence | Status |
| --- | --- | --- |
| Uncommitted work on `claude/video-core-final-20261013-234606` | 5 files: waiver consumed before the duplicate claim, and an expired-claim takeover in the ledger fallback. Verified, tests proven to fail on the old code, committed as `861d0912` | recovered, PROVEN ISOLATED |
| PR #64 (Video Core final) | draft, mergeable, 0 behind main `fef867a6` | OPEN |
| PR #60 (Image Studio) | draft, mergeable; Astra's worktree clean and equal to origin (`5b26a742`) before this run | OPEN |
| PR #62 (BOG post-launch) | draft, mergeable, 81 commits behind main; **no file shared** with #64 or #60 | untouched |
| PR #63 | MERGED (`fef867a6`) | verified |
| PR #43 / #44 (Vertex WIF / migration WIP) | drafts, 282 / 359 commits behind main, #43 conflicting; the Vertex transport they prepared is already in main | untouched; recommend closing as superseded (owner) |
| Production | `https://myavatar.ge/api/health` → `{"ok":true,"commit":"fef867a"}` (2026-10-14 06:51Z), i.e. main | PROVEN PRODUCTION (read-only) |
| Production Redis round-trip | needs an admin session or `CRON_SECRET` bearer; not used | NOT TESTED (owner check) |

## 1. Engineering changelog (this run)

| Commit | Branch | Change |
| --- | --- | --- |
| `861d0912` | video-core | Defects 45, 46: waiver spent only by the duplicate-claim winner; the ledger vouches only inside the claim window. Real-PG concurrency raised 6/12 → 24 |
| `5d9b71f2` | video-core | Defects 47, 48, 49: client-supplied film id can no longer take over another user's `generation_jobs` row or film status; late twin of a running paid stitch → 409, not a second charge |
| `2dee241a` | video-core | Defect 50: ledger fallback accepts only real film tokens |
| `4efb71a0` | image-studio | Image F1 (HIGH) replayed quote refund; F2 heartbeat outage cancelled healthy jobs; F3 unsettleable debt; F4 ka/en/ru error/stage copy |

Every fix has a regression test that was run against the previous code and failed, then passed with the fix. No existing
assertion was weakened (the only fixture change: the waiver unit test's token `'fabc'` → a valid film-token shape, required
by defect 50's guard).

## 2. Verification matrix

| Layer | Result | Tier |
| --- | --- | --- |
| TypeScript (`tsc --noEmit`) | 0 errors — video-core head, image-studio head, and the **combined main + #64 + #60** tree | PROVEN ISOLATED |
| ESLint (changed files) | 0 errors | PROVEN ISOLATED |
| Jest, combined tree (local macOS) | 904 / 910 suites, 13,922 tests passed; 6 failed: 5 real-ffmpeg suites (macOS `ffmpeg-static` 6.0: 890 vs 891 frames, demuxer wording) + `lib/research/parse.test.ts` (load flake: 3/3 green alone; neither PR touches it) | PROVEN ISOLATED, platform caveat |
| Jest, affected areas after fixes | video-core 3,273 passed (1 known macOS ffmpeg case); image-studio 105 passed | PROVEN ISOLATED |
| `next build`, combined tree | exit 0 (Google Fonts timed out and fell back — transient network, as Astra recorded; first attempt failed only for a missing local `.env`) | PROVEN ISOLATED |
| Real Postgres 16 + PostgREST (local, throwaway) | lease 9/9 ×2, ledger 7+1 skip ×2, outbox 4/4, idempotency 1+7, **waiver before 5/5 (24 concurrent → exactly 1 waived; backdated charge never waived), after 11/11 (24 concurrent)**; `runIsolation` 4 fail = macOS ffmpeg 6.0 (no code path to the changed files; green on Linux CI) | PROVEN ISOLATED |
| GitHub Actions Linux CI | see §8 for the run IDs on the final heads | PROVEN ISOLATED (CI) |
| Vercel Preview build | pass on each head | build only |
| Playwright desktop + iPhone (real backend, CI live E2E) | see §8 | PROVEN ISOLATED (CI) |
| Vercel Preview E2E on isolated Supabase (T4) | not re-run this session (last: run 38394841616, 35/35) | NOT TESTED this run |
| Production E2E | not re-run (no authorized test-account session in this run; last 2026-10-13 14:49Z, 10/10 admin ops) | NOT TESTED this run |
| DAST | `HAWK_API_KEY` absent (B7) | NOT TESTED |
| Paid provider (Veo / Google image) | not run — see §6 | BLOCKED |

## 3. Billing, idempotency and refund certification

| # | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | one paid action → one quote | PROVEN ISOLATED | HMAC quote token bound to user + fingerprint + price; one job per quote (insert); image: 8 concurrent confirms → 1 reserve |
| 2 | confirmation before spending | PROVEN ISOLATED | `confirmation_required` before any reserve (image engine test; Agent G lanes plan → tap) |
| 3 | no double charge of a paid job | PROVEN ISOLATED after defects 45, 49 | waiver after claim; late twin 409; `deduct_credits_once` per ref |
| 4 | concurrency idempotent | PROVEN ISOLATED | 24 concurrent assembles on real PostgREST → exactly 1 waiver, both phases |
| 5 | retry cannot double-settle | PROVEN ISOLATED | refunds keyed `${ref}:refund`, net-debit-bounded; double cancel/settle never double-refunds |
| 6 | refunds exactly once | PROVEN ISOLATED | ledger-derived (`netDebitedForRef`), billing-pg suite |
| 7 | failed jobs don't silently consume credits | PARTIAL | in-process failures refunded; **a function killed mid-stitch keeps the stitch debit (defect 51, OPEN)** |
| 8 | Redis failure can't compromise billing | PROVEN ISOLATED for the waiver (durable DB/ledger path); status-record guards (#48 route guard, #49) fall back to billing when Redis is down |
| 9 | PostgreSQL fallback consistent | PROVEN ISOLATED | before/after phases on real PostgREST |
| 10 | payment state survives restarts | PARTIAL | ledger + `request_idempotency` durable; in-flight stitch not (defect 51) |
| 11 | free operations free | PROVEN ISOLATED | Agent G edit/montage lanes cost 0; free-film waiver owner-bound |
| 12 | ledger traceable | PROVEN ISOLATED | every debit/refund carries `metadata.ref`; film ref `${tokenId}:charge` |
| 13 | balances correct after errors | PROVEN ISOLATED | balance asserted after each PG scenario |
| 14 | film waivers durable | PROVEN ISOLATED | ledger + claim today; table `20261014a` (proposal) makes it a single atomic UPDATE |
| 15 | 1 h single-use waiver | REVIEWED | sound after defect 46: a charge older than 55 min is not vouched for (fails toward billing); the table removes the window |

**Migration `20261014a_film_payment_waivers.sql` review:** PK on `token_id`; shape CHECK (paid ⇒ credits > 0 and ref; free ⇒
0 credits); RLS on, all privileges revoked from `public/anon/authenticated`, `service_role` only; functions `SECURITY DEFINER`
with `search_path = public`; `consume` takes `SELECT … FOR UPDATE` then one UPDATE (exactly one of N wins — proven 24-way);
`record` refuses a paid row without that user's net ledger debit; `void` once fully refunded; rollback = drop 3 functions +
table, plus `film_net_debit`, which the proposal's rollback list omitted — added in this run (code falls back to ledger + claim).
**Recommendation: approve** — it is additive and removes the 1 h limit.

**R3 refund policy — recommendation (owner decides; code unchanged):** **B with N = 2, which also covers C.** Keep clip
charges while the free stitch retry is available (today's A); after the second failed final assembly, or immediately when final
QC rejects and no deliverable exists, refund the whole film quote once (`${ref}:refund`). Reason: the customer bought a film,
not clips; failures here are server-side so abuse risk is low; provider cost of the clips (≈ $0.10/s on Veo Fast) is the
platform's to absorb only after two honest retries. Implement together with defect 51's durable settlement row.

**BOG compatibility:** PR #62 shares no file with #64 or #60; credits are debited through the same ledger RPCs BOG top-ups
credit, so no interaction beyond balance.

## 4. Security and RLS review

| Area | Verdict |
| --- | --- |
| Cross-user isolation | **two defects fixed (47, 48)**; owner-scoped status/cancel routes, private buckets, signed URLs verified (reviewer + CI RLS contracts) |
| SSRF / media URLs | clip and audio URLs ownership + protocol checked before any charge; image references accept only upload paths / result UUIDs, own-host signed URLs, `maxHops: 0` |
| AuthN/Z, cron | sweep requires `CRON_SECRET`; `/api/health` deep check admin/cron only |
| Replay | quotes HMAC-signed with expiry; image replay-after-delete fixed (F1) |
| Webhooks / payments | BOG not changed in this run (PR #62 owns it) |
| Secrets | env checked by **name only**; no value read or written; `.env` only symlinked into a local scratch tree for the build |
| Dependency scan | not re-run this session (`npm audit` gate in CI unchanged) — NOT TESTED this run |
| DAST | NOT TESTED (B7) |
| Storyboard B3 migration | schema sound (owner-read RLS, no anon/auth writes, FKs, CHECKs, idempotent re-apply, rollback documented); **no code reads or writes these tables yet**, so applying it changes nothing today. Defence-in-depth suggestion: FK `(board_id, revision, user_id)` so an approval cannot point at another user's revision |

## 5. Vertex AI / Veo production readiness

| Item | State |
| --- | --- |
| Production env (names only, `vercel env ls production`) | `GEMINI_API_KEY`, `GEMINI_VEO_ENABLED`, KV/Upstash pairs; **no `VEO_TRANSPORT`, no `GCP_*`** → Veo would run on the Gemini API transport |
| Preview env | `VEO_TRANSPORT`, `GEMINI_TRANSPORT`, `GCP_PROJECT_ID/NUMBER`, `GCP_SERVICE_ACCOUNT_EMAIL`, `GCP_VEO_BUCKET`, `GCP_VEO_LOCATION`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `..._PROVIDER_ID` |
| Model ids | Vertex map uses GA `veo-3.1-generate-001` / `veo-3.1-fast-generate-001` (prior run, Google docs); live availability **not** re-checked — no `gcloud` on this machine |
| No silent fallback | pinned transport not ready → `not_configured`; image: `googleTransports.selectFixed`, catalog-checked, Google only |
| Prepared Production change (needs approval) | add to Production the same `VEO_TRANSPORT=vertex`, `GEMINI_TRANSPORT`, and the seven `GCP_*` names Preview has (values from the existing WIF setup); then `/api/admin/veo-smoke` must answer `ready:true` |

## 6. Controlled paid test (Phase 7) — NOT RUN, BLOCKED

Conditions in the brief that could not be met independently: (a) Production has no Vertex transport; the only Vertex-ready
deployment is the shared Preview, which binds **Production Supabase**; (b) no `gcloud`/billing access here, so cumulative GCP
spend cannot be confirmed — the earlier L1 call (quoted $0.40) still has no confirmed billed amount; (c) no authorized test
account session was provided. **Provider spend: $0.00. Credits: 0 of 50.** Ready-to-run plan once unblocked:
`VERTEX_LIVE_TEST_PLAN.md` L1 (≈ $0.40) → L2 (≈ $1.92), and Image Studio `scripts/image-studio/live-e2e.mjs` (2 jobs) — fits $5.

## 7. D1–D12 and One Window

Unchanged since `RELEASE_READINESS_CHECKLIST.md` §3 — each remains an owner product/contract decision with the current
behaviour documented; none was changed in this run. One Window: Agent G tool registry change in #60 is additive
(`quote_image` only when an image draft exists); OmniStudio gate hides the workspace without unmounting the thread;
combined-tree build and Jest green. Live voice: not part of this run — unproven end to end, documented separately.

## 8. Final heads and CI

Filled in from GitHub after the last push (see the Georgian report for the final table).

## 9. Release sequence (only after the consolidated approval)

1. Approve + merge **PR #64** (merge commit, no squash of history, no force push). Vercel deploys main.
2. Smoke: `/api/health` (commit = merge SHA), admin `/api/health` deep → `redis: connected`, `/api/admin/veo-smoke`, one free
   admin montage on myavatar.ge.
3. Optional DB: apply `20261014a_film_payment_waivers.sql` in the Supabase SQL editor (backup point = Supabase PITR timestamp
   noted before running); verify read-only: RLS on, 4 functions `SECURITY DEFINER`, service_role only.
4. Approve + merge **PR #60** separately (it was verified merged on top of #64 + main). Image Studio stays behind the shared
   media flag / admin access until its paid gate passes.
5. Env (only if Vertex approved): add the Vertex names to Production, redeploy, `veo-smoke` ready.
6. Paid gate within $5 / 50 credits; then the public-opening decision (still NO-GO until defect 51 and R3 land).

Rollback: Vercel **Instant Rollback** to the deployment serving `fef867a` today (never "Redeploy"), then a revert PR of the
merge commit. Migration rollback: the `drop` statements in the proposal's header. Monitoring after deploy:
Vercel 5xx on `/api/video/assemble`, `/api/image/*`; ledger: debits without a matching delivery or refund per ref (daily query
on `credit_ledger` by `metadata->>ref` prefix `assemble:` and `image-studio-v1:`).
