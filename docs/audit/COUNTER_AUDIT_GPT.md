# Phase 8.16 — Counter-Audit & Evidence Matrix

**Date:** 2026-11-22  
**Repository:** `kintsurashviligaga-ops/avatar-g-frontend-v3`  
**Main SHA checked:** `54e0df05b304ab3b1ea27bade70f02531d1369fa`  
**Purpose:** Correct the interpretation that unfinished or gated work is necessarily a missing feature, while preserving the distinction between code present in main, code present only in a Draft PR, tested foundations, integrated workflows, and Production-proven behavior.

> **Decision language:** The repository evidence supports **STANDBY / NOT FEATURE-MISSING** for several capabilities, not a blanket claim that all five areas are fully integrated or Production-proven. STANDBY is conditional on the operator's reported Supabase billing issue; this repository audit cannot inspect or prove an unpaid invoice. No billing, BOG, flags, deployments, merges, or database changes were performed for this document.

## 1. Executive correction

The earlier NO-GO assessment conflated three different states:

1. **Not implemented** — no meaningful code exists.
2. **Built but gated / not wired** — code and tests exist, but a Draft PR, feature flag, route, worker, migration, or rollout step is still pending.
3. **Production-proven** — the complete behavior has been run and verified in the live environment.

For Browser Agent v2, the new general execution engine, and the specialist studios, the evidence is predominantly state 2, not state 1. That corrects a “missing feature” diagnosis. It does **not** justify calling all of them integrated or ready for public users today.

Main was checked at `54e0df05`. The PR descriptions below are evidence of their proposed branch contents and reported tests; where a PR is Draft or its own description says “not wired”, that limitation is retained explicitly.

## 2. Browser Automation — foundation exists; Browser Agent v2 is gated, not wired

### 2.1 Existing Chromium worker on main

The current main branch contains the first-generation public-site browser worker:

- `app/api/agent/browser/run/route.ts`
  - Implements GET availability and POST `quote` / `run`.
  - Requires the authenticated user, an allowed sandbox audience, and rate limits.
  - Supports NDJSON live updates and screenshots.
  - Explicitly remains closed unless `AGENT_G_SANDBOX` opens it, and requires `BROWSER_ENABLED=1` plus `BROWSER_SNAPSHOT_ID`.
- `lib/agent/browser/runner.ts`
  - Starts a throwaway Chromium sandbox for each task.
  - Reserves sandbox spend before creating the sandbox and settles it afterward.
  - Runs with an empty browser profile and destroys the sandbox after the task.
  - Defines live progress and screenshot callbacks.
- `lib/agent/browser/policy.ts`
  - Allows only public HTTP(S) hosts.
  - Rejects IP literals, localhost/internal names, credential-bearing URLs and disallowed ports.
  - Limits a task to 20 steps, 5 screenshots and 120 seconds.
- `lib/agent/browser/quote.ts` and `lib/agent/browser/index.ts`
  - Provide the quote/runner boundary and live dependencies.

This is real browser automation code in main, not a roadmap-only concept. Its route is deliberately gated. The route comment is authoritative about the required switches and snapshot configuration.

### 2.2 Browser Agent v2 — PR #387

PR: [#387 — Browser Agent v2: persistent browser, cursor, forms, Computer Use mapping](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/pull/387)

The PR description identifies these implementation files on its PR branch:

- `lib/agent/browserAgent/actions.ts` — checked actions: scroll, select, check, hover, click-at-coordinate, move-to-coordinate, focused typing, form fill, visible-element listing and back.
- `lib/agent/browserAgent/driver.ts` — persistent Chromium page for a run; mouse glides to its target and typing is paced.
- `lib/agent/browserAgent/sandboxSession.ts` — deadline/Stop-aware sandbox session and per-step result handoff.
- `lib/agent/browserAgent/computerUse.ts` — maps Gemini Computer Use's 0–999 coordinate grid to viewport pixels; drag/drop and key combinations are refused.
- `lib/agent/browserAgent/loop.ts` — stricter user-intervention rules for sensitive or ambiguous actions.
- `docs/v5.1-phase4/01-browser-agent-v2-and-extension.md` — design, boundaries and extension evaluation.

Reported tests in #387:
- `npx jest lib/agent/browserAgent`: 29 passing; driver tests use real headless Chromium against a local page, without network.
- Existing `lib/agent/browser` suite passes.
- `tsc --noEmit` clean.
- HawkScan was not run.

**Critical qualification:** #387's own description says it is stacked on #312 and **not wired**: no route, tool or UI calls it. It remains behind `AGENT_BROWSER_AGENT`, described as admins-only and off. Therefore the correct classification is **BUILT IN DRAFT PR / MOCKED-AND-LOCAL-CHROMIUM TESTED / NOT INTEGRATED / NOT PROVEN IN PRODUCTION**. Do not describe Browser Agent v2 as already active for users.

### 2.3 SSRF and network isolation

The existing main-branch worker has concrete network restrictions in `lib/agent/browser/policy.ts` and `lib/agent/browser/runner.ts`:

- URL policy rejects IP literals and private/internal hostnames.
- `BROWSER_DENY_SUBNETS` blocks loopback, RFC1918, link-local, carrier-grade NAT, multicast/reserved and metadata ranges.
- The runner passes the deny list into sandbox creation.
- Its code comments record a snapshot probe blocking `169.254.169.254`, `10.0.0.1`, `192.168.1.1` and `127.0.0.1`, while public sites were open (dated 2026-11-06).

This is strong implementation evidence for the existing browser worker's SSRF/network boundary. The PR #387 adds action-level restrictions and user-intervention checks, but #387 explicitly says HawkScan was not run. Do not conflate the existing worker's network deny policy with a completed independent security assessment of Browser Agent v2.

**Browser conclusion:** Not missing. Existing browser automation is in main and gated; Browser Agent v2 is implemented in its Draft PR with local Chromium tests, but explicitly not wired to the app.

## 3. Execution Engine — substantive foundation and media bridge; Work Mode adapter is prepared, not integrated

### 3.1 DAG engine — PR #308

PR: [#308 — Agent G execution engine foundation](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/pull/308)

The PR defines the pure engine under `lib/agent/engine/`:

- `plan.ts` — planner output parsing, tool/id/limit/dependency validation, cycle detection, topological levels and bounded repair/fallback.
- `validate.ts` — pre-quote capability, lifecycle, entitlement, audience, allow-list and run-ceiling checks.
- `scheduler.ts` — parallel scheduling, sandbox-per-user cap, retry, VERIFY, pause/resume/cancel, bounded replanning, deadline and checkpoints.
- `simulate.ts` — deterministic fake-clock/scripted-executor simulation.
- `index.ts` — PLAN → VALIDATE front door.
- Tests reported: 45 mocked tests, including planner, validation, scheduler and lifecycle flow.

**Critical qualification:** #308 labels itself “DRAFT: foundation only” and explicitly states that nothing is wired to a route, table, sandbox or Google. Its tests are mocked. Thus the DAG engine is **built and extensively unit-tested as a pure foundation**, not yet a live integrated scheduler.

### 3.2 VALIDATE before media quote — PR #309

PR: [#309 — VALIDATE before every media run quote](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/pull/309)

Files described by the PR:

- `lib/agent/engine/context.ts` — builds validation context from lifecycle registry, service switches, D-08 entitlements and price ceiling.
- `lib/agent/run/runValidate.ts` — converts RunSpec to engine Plan and checks it.
- `lib/agent/run/engineFlags.ts` — defines `AGENT_VALIDATE` and `AGENT_ENGINE_MEDIA`, both off by default.
- `lib/agent/run/runExec.ts` — optional validation dependency at plan, start and resume.

Reported tests: 18 new pure tests; 6 runExec integration cases; 2,150 tests across named agent/task/API areas, with 14 ffmpeg suites (90 tests) unable to run because ffmpeg was absent in that container; TypeScript and ESLint clean.

#309 explicitly says **Draft, flag off**, stacked on #308, and “Do not merge until Supabase is back and GG gives the green light.” The VALIDATE path is coded and tested in the PR branch, but rollout remains gated.

### 3.3 Media runs on the engine — PR #310

PR: [#310 — media runs on the Phase 3 engine](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/pull/310)

Files described:
- `lib/agent/run/engineBridge.ts` — maps current run/job state and user commands into engine ticks, then projects decisions back to v1 step records.
- `lib/agent/run/runExec.ts` — engine dispatch, approval, pause and resume integration.
- `/api/tasks` — pause/unpause actions.
- Run card localized status text.

Flag: `AGENT_ENGINE_MEDIA` = `off` (default) | `admins` | `everyone`; `AGENT_VALIDATE` is separately controlled.

Reported tests:
- `runExec.v2.test.ts`: 88/88.
- `engineBridge.test.ts`: 21 tests covering mapping, parallel cap, quote hold/release, expiry, retry, pause/unpause, deadline, resume reuse and v1 compatibility.
- TypeScript and ESLint clean; ffmpeg-related suites could not run in the container without ffmpeg.

**Qualification:** #310 says Draft and must not merge until Production Supabase is back, #308/#309 are in, and owner approval is given. Its own rollout plan is sequential: merge #308 → #309 → #310 with flags off, then enable admins, test a montage chain, and only then consider everyone. The Run Card has no pause button yet; the PR says that is later work.

### 3.4 Work Mode lease-job adapter — PR #311

PR: [#311 — work-mode steps as lease jobs](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/pull/311)

File described:
- `lib/agent/work/workJob.ts` — converts browser/code/PDF/export work steps into ordinary `agent-work` lease jobs, with signed quote, worker claim, heartbeat and stop handling.

Reported tests: `workJob.test.ts` has 6 passing tests; TypeScript and ESLint clean.

**Critical qualification:** #311 explicitly says “Prepared, not finalized, not wired.” “Nothing calls it yet”; no route changes; no flag yet (the proposed `AGENT_ENGINE_WORKMODE` comes when 3.5c is finalized). It also lists remaining work: RunSpec work steps, adapters, file outputs on the card, worker route, VALIDATE, flag and tests. Its stated prerequisite is that #310 work in Production first.

**Execution Engine conclusion:** It is inaccurate to call the engine “missing”. #308–#310 contain a substantial, tested engine foundation and media integration bridge; #311 prepares the Work Mode lease adapter. It is equally inaccurate to say the complete DAG + VALIDATE + media + Work Mode stack is already fully wired and ready to expose. The PRs themselves specify the outstanding wiring, database and rollout steps.

## 4. Production SHA and database outage — separate code state from infrastructure cause

### 4.1 SHA facts

- `54e0df05b304ab3b1ea27bade70f02531d1369fa` is the latest main SHA checked for this audit.
- The prior handoff references `96c1df0` as a Production SHA at the time of that handoff.
- The current main SHA being newer does not, by itself, prove it is deployed to the Production alias.
- A successful Vercel commit status is not equivalent to proof that the Production alias serves that SHA.

The runbook/operator context supplied for this counter-audit identifies `96c1df0` as the old Production SHA, before the database outage. This is recorded here as **operator-provided deployment context**, not as an independently verified current Vercel deployment fact. Current Production deployment SHA should be confirmed from Vercel before a release decision.

### 4.2 Supabase invoice assertion

The reported explanation is that Production Supabase is paused because its invoice is unpaid. That may explain why health/database checks fail without implying a code regression.

However, **the invoice/payment cause is not provable from repository files, GitHub PRs, or CI**. This audit did not access Supabase billing, Vercel secrets, or payment records, and did not touch billing. Therefore:

- “Supabase is unavailable/paused” is a reported operational condition requiring a current project-status check.
- “It is paused specifically because of an unpaid invoice” is an operator-provided explanation, not a repository-verified fact in this document.
- “There is no code bug” is too absolute: a database outage can explain DB-dependent health failures, but it does not prove every application path is bug-free.

**Correct status:** Production is **STANDBY pending database service restoration/verification**, if the operator's invoice diagnosis is correct. This is not evidence that Browser Agent or the execution engine features are missing. No billing or BOG action is authorized or performed by this audit.

## 5. Merge strategy — sequential rollout, not a bulk merge

### 5.1 #374 is explicitly throwaway

PR: [#374 — THROWAWAY: all launch PRs combined (CI only, do not merge)](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/pull/374)

The PR body explicitly states:

- “THROWAWAY. DO NOT MERGE.”
- One temporary branch combines launch PRs solely to run CI on the combined result.
- It is closed without merging after CI.
- No feature flag is turned on.
- Run 2 reports, on temporary commit `d3a8b51e`: `tsc --noEmit` clean, lint 0 errors, Jest 1,266 suites / 18,398 tests passing.
- It documents conflicts that were resolved only in the throwaway branch and warns they recur when the real PRs merge one by one.

This is evidence of a combined compatibility/test exercise, **not** a plan to merge every PR at once. The 18,398 test result belongs to the throwaway combined commit, not to main or Production.

### 5.2 One-by-one rollout evidence

PR #310's rollout section specifies:
1. Merge #308 → #309 → #310, with both flags off.
2. Set `AGENT_ENGINE_MEDIA=admins` and run a montage chain on myavatar.ge.
3. Only after that, consider `everyone`; rollback by setting the flag to `off`.

PR #309 also says not to merge before Supabase is back and owner approval is given. PR #311 says it must wait until #310 works in Production.

This supports a **sequenced, gated rollout**, not a bulk merge.

### 5.3 Runbook path caveat

The requested runbook name `LAUNCH_COMMANDS.md` was not found at the candidate main-branch paths checked during this audit (`docs/launch/LAUNCH_COMMANDS.md`, `docs/LAUNCH_COMMANDS.md`, repository root, and `docs/v5.1-phase3/LAUNCH_COMMANDS.md`). Therefore this document does not falsely cite that file as verified. The sequential strategy is supported here by the explicit rollout instructions in #309–#311 and the explicit throwaway/no-merge contract in #374. If the authoritative runbook exists under another path or only in the operator's local checkout, add its exact path and commit in a follow-up.

## 6. Agent G specialist capabilities — coded foundations, not all deployable products

### 6.1 3D Studio — PR #366

[PR #366 — Phase 8.8 3D Studio A: foundation](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/pull/366)

Files in the PR branch under `lib/studio3d/` include:
- `flag.ts` — `STUDIO_3D_V2` off/admin/everyone.
- `spec.ts`, `price.ts`, `prompts.ts`, `pipeline.ts`, `engine.ts`.
- `export/glb.ts`, `export/stl.ts`, `export/obj.ts`.
- `intent.ts`, `labels.ts`.

Reported tests: 39 mocked tests, including validation, price/margin, pipeline, admission, mocked Cloud Run client and GLB→STL/OBJ export round trips; ESLint clean.

The PR says pure library only: no route, UI, deployment or paid call. PR B (routes/UI/worker/viewer) and PR C (downloads, Use in Video, Agent G, Library) are subsequent work. Thus **foundation BUILT and mocked-tested; not a complete 3D Studio product and not ready to un-gate merely by flipping its flag**.

### 6.2 Smart Editor — PR #365

[PR #365 — Smart Editor montage foundation](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/pull/365)

Files under `lib/services/montage/smart/`:
- `flag.ts` — `MONTAGE_SMART_EDITOR` and client flag.
- `timeline.ts` — text/effects tracks, move/trim/split/remove, ripple, snapping and validation.
- `captions.ts`, `captionSvg.ts` — Chirp word timing, Georgian line breaks, karaoke/SRT rendering.
- `silence.ts`, `beat.ts`, `effects.ts`, `templates.ts`, `price.ts`, `ops.ts`.

Reported tests: 45 mocked tests; manual ffmpeg effects-chain smoke test on a test source; TypeScript clean.

The PR explicitly says nothing is wired and the flag is off. Chirp 3 Georgian word timestamps are Preview with documented quality limitations; shake applies a global crop limitation. This is a substantive coded foundation, not an integrated public editor.

### 6.3 Art Director — PR #356

[PR #356 — Art Director image pipeline foundation](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/pull/356)

Files in `lib/image/artDirector/` include:
- `spec.ts`, `price.ts`, `prompt.ts`, `body.ts`, `grid.ts`, `mask.ts`, `intent.ts`, `request.ts`, `library.ts`, `labels.ts`.
- `IMAGE_ART_DIRECTOR` flag: off unless admin/everyone is explicitly selected.

Reported tests: 40 tests for the mocked grid, references/body/prompt and real-pixel inpainting logic using sharp; 73 provider-boundary/heavy-client-boundary/API-lockdown tests reported passing together; TypeScript and ESLint clean.

The PR explicitly says no route, UI, billing call or DB change. PR B (routes + UI) and PR C (Library/download/chat intent) are subsequent. Therefore this is a coded, tested image-pipeline foundation, not a complete Art Director service ready for flag-only activation.

### 6.4 Agent G Plugins — PR #392

[PR #392 — Agent G plugins: 10-plugin catalog](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/pull/392)

The catalog covers Drive, web research, code/data sandbox, documents/PDF, image, voice/music, video/avatar, Notion, GitHub and Calendar.

The PR describes:
- Ka/en/ru catalog/status copy.
- Inspect/prepare-only safety model for new integrations.
- Sealed per-user tokens and provider state.
- Notion/GitHub OAuth and read/prepare flows.
- Calendar link and .ics path.

But it also explicitly says:
- Every new flag is off.
- Notion and GitHub require app registration and DB migration.
- `connector_accounts` only permits `google_drive` until migration `20261120a_connector_accounts_providers.sql` is applied.
- Migration `20261120b_agent_reminders.sql` is also not applied.
- PR is stacked on #390.
- 17,144 tests passed; 20 suites failed only because ffmpeg-static was absent in that cloud container (spawn ENOENT), per the PR report.

Therefore the catalog and guarded integration code are built in the Draft PR; Notion/GitHub are **not ready to un-gate** until their external app setup and database migration are completed. Existing Drive/web/code/media entries should not be confused with the new integrations.

## 7. Evidence matrix

| Claim | Evidence | Accurate status | What is not proven |
|---|---|---|---|
| Browser automation is missing | Main: browser route, policy, runner; #387 v2 files and 29 local Chromium tests | Existing browser BUILT; v2 BUILT in Draft PR | v2 route/tool/UI wiring and Production |
| Cursor movement is missing | #387 `driver.ts`, `actions.ts`, live cursor screenshots | Implemented in PR branch | Integrated user-facing execution |
| SSRF protection is missing | Main `policy.ts`, `runner.ts`, deny subnet list and snapshot probe notes | Existing worker network controls BUILT | Independent HawkScan of v2 (not run) |
| DAG engine is missing | #308 `plan.ts`, `validate.ts`, `scheduler.ts`, 45 mocked tests | Engine foundation BUILT/tested | Live route/DB/sandbox/Google wiring |
| VALIDATE is missing | #309 context, runValidate, engineFlags, runExec hooks and tests | Media validation integration coded in Draft | Merged/deployed flag-on behavior |
| Media engine is missing | #310 engineBridge, runExec v2, 88+21 tests | Media bridge coded/tested in Draft | Production Supabase rollout and real paid acceptance |
| Work Mode is integrated | #311 workJob and 6 tests | Adapter foundation BUILT | PR itself says not wired; no route/flag yet |
| Production SHA is 54e0df05 | Main commit check | Latest main SHA | Production alias deployment |
| Production SHA 96c1df0 is old | Operator handoff context | Operator-provided historical context | Fresh Vercel deployment history not inspected |
| DB outage is unpaid invoice | Operator explanation | Reported operational cause | Invoice status cannot be verified from repo |
| Bulk merge is planned | #374 says THROWAWAY / DO NOT MERGE; #310 has sequential rollout | Sequential gated rollout | Exact local runbook path not located on main |
| 3D Studio ready | #366 39 mocked tests; no route/UI/deploy | Foundation built/tested | Worker, routes, UI, Library integration |
| Smart Editor ready | #365 45 mocked tests; flag off, nothing wired | Foundation built/tested | Product UI/route and end-to-end pipeline |
| Art Director ready | #356 40 tests; no route/UI/billing/DB | Foundation built/tested | Route/UI/Library integration |
| Plugins ready | #392 catalog; flags off; DB migration not applied | Catalog and guarded integration code built | Notion/GitHub registration and migration |

## 8. Release posture and guardrails

### Corrected status

**STANDBY — infrastructure/rollout pending, not feature-missing.**

This label is appropriate for the operator's stated situation only with the following qualification: the repository confirms the feature foundations and gated PR strategy, but does not independently confirm the Supabase invoice status or current Production deployment SHA.

### Conditions before calling these capabilities Production-ready

1. Confirm Production Supabase service availability through the authorized operator/runbook. This audit does not pay invoices or change billing.
2. Confirm current Production SHA and health through Vercel.
3. Follow the one-by-one PR sequence; do not merge #374.
4. Keep all feature flags off during merges.
5. After each merge, run the prescribed health/CI checks and stop on failure.
6. For #308–#311, complete the explicit dependencies in order: #308 → #309 → #310; validate the media admin canary; only then finish/wire #311 Work Mode.
7. For #387, complete the #312 dependency and route/tool/UI wiring; keep `AGENT_BROWSER_AGENT` off until the approved pilot and security checks pass.
8. For #366/#365/#356/#392, complete their stated route/UI/worker/Library and migration dependencies before considering any flag enablement.
9. Do not change BOG, billing, pricing balances, payment configuration, or secrets as part of this counter-audit.

## 9. Actions performed

- Read repository main at `54e0df05b304ab3b1ea27bade70f02531d1369fa`.
- Inspected the relevant PR descriptions and their reported test/wiring status: #308, #309, #310, #311, #356, #365, #366, #374, #387 and #392.
- Inspected main-branch browser route, runner, policy and run execution source.
- Attempted to locate `LAUNCH_COMMANDS.md` at likely main paths; those paths returned not found.
- Did **not** merge PRs.
- Did **not** change or enable any feature flag.
- Did **not** access or modify billing, BOG, Supabase billing, database state, secrets or deployments.

---

**Bottom line:** GPT's blanket “NO-GO because features are missing” diagnosis is not supported for Browser Automation, the engine foundation, or the specialist feature foundations. The accurate counter-audit is **STANDBY with substantial code built behind deliberate gates**. But the PR descriptions themselves also prohibit overstating readiness: Browser Agent v2 is not wired; #308 is a pure mocked foundation; #311 is explicitly not wired; and #366/#365/#356/#392 are foundations/catalogs with outstanding integration or migration work. Production standby may be due to the reported database payment issue, but that cause requires operator-side verification and is not established by GitHub evidence.
