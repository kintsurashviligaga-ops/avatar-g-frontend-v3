# Video Core v1.0 — release readiness checklist (final, release candidate)

> **Merged and deployed 2026-10-13** on GG's word of 13:18:10Z ("PR #58 merge."): merge commit **e46c35c**, Production
> deployment `dpl_HDqsJfbyHEoEB5QM87j4UgVwLjQJ` READY 13:25:44Z, myavatar.ge serves it. Post-deploy checks and the open
> gates: `PRODUCTION_DEPLOY_REPORT_KA.md`. The text below is the pre-merge state it was reviewed in; B8 is closed, every
> other gate (B1, B3, R2, R3, D1–D12) is still open and Video Core stays admin-only.
>
> **Live Production E2E 2026-10-13, 14:49–14:55Z (GG's 14:01Z brief).** The ten admin media operations on myavatar.ge
> passed on the delivered files (`DEFECT_REGISTER_FINAL.md`, "Live Production E2E"): defect 39 is PROVEN in Production,
> and a new defect 43 (louder volume clipped the sound) is fixed in PR #63. B1: L1 ran once on the existing Preview
> through Vertex (veo-3.1-fast, 4 s, 720p, with sound, quoted $0.40) and delivered 96 frames at 24 fps, 4.01 s; the
> billed amount is not confirmed yet. Production has no Vertex transport (`/api/admin/veo-smoke` answers ready:false), so
> Veo in Production stays with GG. R2: the database duplicate guard is in PR #63 and fails open until GG approves
> `proposals/20261013a_request_idempotency.sql` for Production.

Branch `claude/video-core-v1-6gh97e`, draft PR #58, final code head **ec7f742** (code, tests, CI E2E and Preview E2E rest
on it; later commits change only these documents), 2026-10-13. Product code last changed in 717231c (every cron route and
the media sweep read live instead of from Next's Data Cache, defect 40, which Production has too) and 329c50d (heartbeat
hardening); before that c130532 (defect 39) and 38a6167 (defect 38). Every commit after 717231c is the CI workflows or docs.
Nothing here was merged, deployed, migrated on a shared database, or paid for. main is **ba2e0a4** (PR #61, BOG docs, on
883a013's code; Production serves it since 09:31Z): PR #58 shares no file with PR #59 or #61, main is merged into the branch
(179e10e) without a conflict, and every CI run tests PR #58 on top of it. Defects 39 and 40 are still in Production.

**Verdict: CONDITIONALLY READY — EXTERNAL GATES REMAIN**

Tiers: T1 mocked · T2 local browser (Playwright, server routes mocked at the page) · T3 real ffmpeg · DB = throwaway
Postgres + PostgREST · **CI-E2E** = real browser + `next start` + throwaway Supabase in GitHub Actions · T4 Vercel runtime ·
T5 paid provider · T6 Production.

## 1. Test gate on the final head

| Gate | Command | Result | Evidence |
| --- | --- | --- | --- |
| TypeScript | `npx tsc --noEmit -p tsconfig.json` (+ the live specs with a spec-including tsconfig) | **PASS**, 0 errors | sandbox on 717231c (same code and tests as ec7f742); CI "verify" typecheck green on ec7f742 (run 38388562769) and on f1e3358 (run 38394814005); the live specs again in the sandbox on f1e3358 |
| ESLint | `npx next lint` | **PASS**, 0 errors, 34 warnings (none new: OmniStudio's 15 are on main too) | sandbox on 717231c; the one file f1e3358 changes, `tests/video-core-live/billing.spec.ts`, 0 errors |
| Jest (unit + integration) | `npm test` | **PASS**: 894 / 900 suites (6 skipped), 13,814 passed, 60 skipped, 0 failed | CI "verify" run 38388562769 on ec7f742 and 38394814005 on f1e3358; the same numbers in the sandbox on 717231c |
| Build | `npm run build` | **PASS**, 207 / 207 pages | CI "verify" on ec7f742 + the live E2E job builds and serves it (`next start`) + the Vercel Preview build of ec7f742 |
| Playwright, mocked routes (T2) | `playwright.video-core.config.ts`, desktop + iPhone 13 | **PASS**: 92 passed, 6 skipped, 0 failed, 0 flaky | `evidence/t2-round3-final/summary.md` (rerun 19:50–20:07Z on be10500 product code; T2 mocks the server routes at the page, so the later server-side fixes 38a6167 and c130532 do not change what it exercises) |
| **Playwright, real backend (CI-E2E)** | `.github/workflows/video-core-e2e-local.yml` job "live E2E" | **PASS**: 35 passed, 0 failed, 0 flaky (desktop + iPhone 13 + API, 16.5 min on ec7f742, 16.4 min on f1e3358) | `evidence/ci-e2e/live-e2e-38388562682.md` (ec7f742), `evidence/ci-e2e/live-e2e-38394813999.md` (f1e3358) |
| **Playwright, Vercel runtime (T4)** | `.github/workflows/video-core-preview-e2e.yml`, separate Vercel project, isolated Supabase | **PASS**: 35 passed, 0 failed, 0 flaky (desktop + iPhone 13 + API, 24.5 min), run 38394841616 on f1e3358; run 5 on ec7f742 34 / 35 (the test client's cut, defect 42, fixed in the harness) | `PREVIEW_E2E_VERIFICATION.md` |
| Test Schema Baseline | `e2e/video-core-live/baseline` + `900_verify.sql` | **PASS** every CI run (RLS, RPCs, auth triggers, storage policies, billing dependencies asserted before any test) | live E2E job log, step "Apply the Test Schema Baseline" |
| Real FFmpeg (decoded frames) | opt-in ffmpeg suites | **PASS**: 29.7 s = 891, 60 s = 1800, 70 s = 2100 frames; AC-06 one chain; speed edits on the 30 fps grid with sound in sync | `FFMPEG_EVIDENCE.md`, `evidence/round3-final/`; in CI-E2E every master is decoded again on both viewports: montage 150, Stop → Retry 600, trim 90, 2× 75, slow motion 300 frames |
| Billing / security on real Postgres | `scripts/lease-isolation/run.sh` | **PASS**: 40 passed, 2 skipped by design (38 + the defect-39 JSONB regression in both passes) | CI job "billing on real Postgres" (`evidence/ci-e2e/billing-pg-38298797641.md`; green again in run 38353387827) |
| Live stack contracts | `tests/video-core-live/contracts.spec.ts` | **PASS** ×5 (starter grant, RLS, RPC, access, buckets) | `[evidence] rls-contract`, `rpc-contract`, `access-contract`, `buckets` |
| Job recovery | DB tier + live sweep + browser Stop → Retry | DB **PASS** (lease takeover, refund once, stop kills ffmpeg); live **PASS**: a render whose lease lapses is taken by the cron sweep as attempt 2 and delivered (600 frames, 0 charged; defect 40 fixed); browser **PASS** on desktop + iPhone 13 (stopped `cancelled by the user`, 0 charged; retried 600 frames) | billing-pg job; live E2E `recovery.spec` and "Stop and Retry" |
| Anon-key exposure | workflow step "exposure check" | **PASS**: no service-role key in the client bundle | live E2E job log |
| B3 proposal (storyboard revisions) | workflow step on the throwaway DB only | **PASS** | live E2E job log |
| Preview contract workflow | "E2E - Preview Contract" | **PASS** on ec7f742 (run 38388562696) | GitHub Actions |
| AC-01…AC-28 | `FINAL_ACCEPTANCE_MATRIX.md` | **19 PROVEN · 8 PARTIAL · 1 BLOCKED** (of 28) | — |
| DAST (HawkScan) | — | **NOT RUN** (B7) | — |

## 2. Blockers — what only GG can unlock

| # | Blocker | Exact cause | Impact | Solution | Approval needed | Cost | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | Live Veo / Vertex: **L1 PASS on Preview** (2026-10-13, one call); Production has no Vertex transport | L2 / L3 not authorized; Production's Veo path uses the Gemini API key, and `veo-smoke` answers ready:false there; the sandbox and CI have no Google credentials (by design) | V1–V6, real clip durations (Native vs Requested), provider error wording, long-form scenes are proven on a fake engine only | L1 → L2 → L3 in `VERTEX_LIVE_TEST_PLAN.md` §3, one approval each | GG, per test | ≈ $0.40 · $1.92 · $3.84 (+ ≈ $0.27), total ≈ $6.2–6.5 on Fast | GG names the level(s) and confirms the budget |
| B2 | ~~No isolated Supabase for a full-backend browser E2E~~ | — | — | built: a throwaway Supabase stack in GitHub Actions with a Test Schema Baseline from repo files (`SUPABASE_TEST_ENV.md`); no dump, no secret, nothing from GG | — (GG chose this path at 19:01Z / 19:05Z) | $0 (CI minutes) | **CLOSED** |
| B3 | Storyboard revision table | `proposals/20261012a_storyboard_revisions.sql` is a proposal | the approval binding lives in the request, fingerprint and job metadata, not a DB row; Library cannot show "revision N" | verified on the CI throwaway DB (applies, RLS, owner-only reads); next is Production | GG (Production migration) | $0 | GG's word for the Production migration |
| B4 | Long-form (> 96 s) open path | `LONGFORM_ORDER_WIRED=false` + B1 | 240 s is refused by name (`longform_closed`), never cut to 96 s | flip the switch on Preview, then one paid long-form run | GG | ≈ $28.80 for 240 s on Fast 1080p (30 × 8 s) | only after L3 |
| B5 | 29+ assets in one montage | chat 8 / quote 13 files; one 600 s function | refused by count, never dropped silently | segmented ingestion + a longer-running worker host | GG (paid infra) | depends on host | design note when GG asks |
| B6 | Provider policy for remix / avatar legs | `MEDIA_GOOGLE_ONLY` off; Replicate / HeyGen still called there | `video.remix` cannot be certified Google-only | GG's provider decision (memory: provider strip) | GG | — | none until GG decides |
| B7 | DAST (HawkScan) | `HAWK_API_KEY` unset, no `stackhawk.yml` | no dynamic scan of the changed routes | key + `stackhawk.yml`; it could then scan the CI job's `next start` (no deployment needed) | GG | StackHawk plan | GG adds the key |
| B8 | Merge / deploy of PR #58 | DONE 2026-10-13 (e46c35c, `dpl_HDqsJfbyHEoEB5QM87j4UgVwLjQJ`) | — | merged on GG's word (13:18:10Z); smoke after deploy green (`PRODUCTION_DEPLOY_REPORT_KA.md`) | GG, explicitly | $0 | — |

The Vercel runtime check (T4) ran on GG's word (06:34Z) in a separate Vercel project on an isolated Supabase
(`PREVIEW_E2E_VERIFICATION.md`); the shared Preview binds Production Supabase and was not used.

Rollback if PR #58 is ever deployed: Vercel **Instant Rollback** to the deployment serving Production before the merge
(today `dpl_EhS6Jvgm7uKdrMudSsDTChvxuGmy`, ba2e0a4), never "Redeploy" (it rebuilds the current commit), then a revert PR
of the merge commit. Not to 30be5a2: that build predates BOG's admin mode (see the BOG thread).
No migration ships in this PR, so rollback is code-only.

## 3. Owner decisions (product / financial / contract) — current behaviour stays until GG answers

| # | Decision | Current behaviour | Risk today | Recommended | Compatibility impact | Approval |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | One Video entry: path per mode or `/video?mode=` | several tiles, NAVIGATION_ONLY consolidation | users meet the same tools under several names | one path with a mode query | deep links kept; no new routes | GG (product) |
| D2 | Remix tile may leave the `#omni` hash | stays in `#omni` | inconsistent navigation | yes, at stage 1 | URL change for one tile | GG (product) |
| D3 | Remix ops that change length frame-exact like the film | remix not QC-gated on frames | a remix could drift a frame | yes, one contract | remix output may be refused where it passed before | GG (product) |
| D4 | Remix family quotes before it charges | some remix ops charge without a quote | charge without prior consent card | yes | new confirm step for users | GG (financial) |
| D5 | `assemble_failed` (500) vs `assembly_failed` (502) | both spellings exist, both in `VIDEO_REFUSALS` | a client reading one code misses the other | unify at stage 1 | wire change for any client parsing codes | GG (contract) |
| D6 | Legacy 30 s brand pad when no length contract is sent | pad kept; every in-tree caller sends the contract | an unknown client gets a frozen tail | remove; default the contract to the stitched length, said in the response | server default changes for unknown callers | GG (contract) |
| D7 | Conform a single native-length clip to 30 fps | delivered at the provider's 24 fps, length exact, not charged | frames off the 30 fps grid | leave as is until the grid matters more than the free pass | conforming = one more encode = a new charge | GG (financial) |
| D8 | Make the storyboard approval mandatory for every director run | a run with an approval is checked (`400 revision_mismatch`); a run with none is accepted | a hand-written or planner-approved document runs without a fingerprint | mandatory, with an approval shape for the plan route | API callers without an approval would be refused | GG (contract) |
| D9 | Bare "the video must be exactly 29.7 seconds" (no make-verb) | a chat message; no tool, no plan (KA/EN/RU) | a user who states only the length gets a chat answer | read it as a length for the open Video tool / current plan | intent routing change; corpus tests to extend | GG (product) |
| D10 | AC-23 montage contract: music start on the timeline ≠ 0, add clips to a delivered montage, replace music in place, per-clip source audio from the chat | each is **unsupported and said** (quote `unsupported: ['music_delay']`, follow-ups answered before any quote, nothing charged); silent export and own sound are built | users cannot do these four edits yet | add the fields to the signed montage quote / manifest (consolidation stage 3/4) | changes the Media Studio v2 signed contract (PR #57) | GG (contract) |
| D11 | Rate limit for Agent G media (found by the CI E2E) | quote and run of the montage and edit lanes share the `EXPENSIVE` limiter: 5 calls a minute per user (+ 40 montages a day); a user who stops, retries and starts again inside a minute gets "Too many requests at once" on the 6th call | an honest Stop → Retry → Start can be refused for up to a minute (the card says so and offers Retry; nothing is charged) | count one plan's quote + run once, or give media its own bucket (e.g. 10 a minute) | none for clients; looser abuse limit | GG (abuse / cost policy) — unchanged until then, the tests pace under it |
| D12 | Trim / speed / slow-motion words on a freshly **attached** video (found by the CI E2E) | Agent G's own edit lane (free, no model, a plan before Start) takes them on the video it delivered; on an attached file they go to the chat model, which hands them to the remix (Media Studio v2 routing, `lib/agent/chatTurn` `editStep`) | the same words are deterministic on one source and model-dependent on the other; without the model (an outage, or the CI job) the user gets a chat error instead of a plan | read trim / speed / slow motion on one attached video as Agent G's edit too, like frame shape and effects already are | intent routing change in a Media Studio v2 path (PR #57's contract); corpus tests to extend | GG (product) |

## 4. Safety rules kept

| Rule (GG 18:17Z, 18:29Z, 19:05Z, 19:07Z) | Kept how |
| --- | --- |
| Production DB is never a test DB; no test rows, credit debits or generations there | every DB write ran on a throwaway Postgres (sandbox, CI "billing on real Postgres") or the throwaway Supabase stack on the CI runner, destroyed with it; the Supabase connector was used read-only (`list_projects`, `list_organizations`) |
| Synthetic data only; fail-closed guard against Production | the CI E2E creates its own users, credits and media; `tests/video-core-live/guard.ts` refuses any URL that is not the runner's local stack and its host must resolve only to this machine; it runs as a shell step in the workflow and again in Playwright's global setup before any test, and refuses the Production project ref by name |
| No Production schema dump, no Production SQL, secrets or user data in GitHub or CI artifacts | none was asked for or used: the Test Schema Baseline is built from repo files; evidence in the public CI log is redacted |
| Temporary CI-only secrets; no long-lived GitHub Secrets; no Production credentials | the stack's keys come from `supabase status` on the runner and are masked; the other secrets are made by `openssl rand` in the job and die with it; no GitHub Secret was added |
| No shared-DB / Production migration | none applied; B3 was applied only on the CI throwaway DB |
| New Vercel Preview needs owner approval | `vercel.json` `git.deploymentEnabled` false for this branch (f3f8acb), so no push builds a Preview of the main project; the T4 Previews were built on GG's word (06:34Z) only in the separate project `avatar-g-video-core-e2e`, each with target preview; after every run the six per-run values went back to placeholders, Vercel Authentication back on and the label off PR #58, and the stack and tunnel stopped with the runner. The project cannot be paused (Vercel answers `400 Active production deployment does not exist`; its only production deployment is the static placeholder allowed at 07:49Z) and its ignored-build step refuses production builds |
| No paid Veo / provider call | none; B1 |
| No merge, no Production deploy, no force push | held until GG's word of 13:18:10Z; then merged (merge commit, no force push) and deployed by Vercel from main |
| A mock is never reported as a live provider check | the four layers are kept apart in `FINAL_ACCEPTANCE_MATRIX.md` and `FINAL_E2E_REPORT_KA.md` |
| PR #59 / #62 (BOG) and Image Studio untouched | neither branch was written to; no file is shared with PR #59's merge (883a013) or PR #61 (ba2e0a4); Image Studio (PR #60) shares 2 files and merges cleanly (`GO_NO_GO_REPORT_KA.md` §2) |
