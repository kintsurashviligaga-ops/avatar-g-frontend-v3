# 00 — State and ownership (Final Integration & Production Release)

Owner task: "MYAVATAR.GE — CORRECTED FINAL INTEGRATION, REAL E2E CERTIFICATION & CONDITIONAL PRODUCTION RELEASE"
(GG, 2026-10-15 17:10Z, project thread "Final Integration"). Only one document was attached; its text says the short
instruction and the corrections are combined in it.

Recorded 2026-10-15 17:18Z by the Final Integration thread. Read-only discovery; nothing merged, deployed, migrated
or paid in Phase 0. Sources: `git` (origin fetched 17:12Z), GitHub API (PRs, Actions), Vercel API (deployments,
env names only, values never read).

## 1. Production and release baseline

| Item | Value | Evidence |
|---|---|---|
| main HEAD | `e1dbf300` (Merge PR #73, Video Core storyboard fix, merged 17:10:11Z) | `git ls-remote` |
| Production (READY) | `f498ee27` = PR #71, `dpl_53tGzqumFicBQPEvpHxJHzwpvNs7` | Vercel list_deployments target=production |
| Production (BUILDING at 17:14Z) | `e1dbf300`, `dpl_4gYXPWEzruPweyCyonr6WXQT9X1o` — the Video Core thread's deploy | same |
| Rollback candidates | `dpl_53tG…` (f498ee2), `dpl_5kNk…` (4fc0377, PR #70 BOG), `dpl_6AaK…` (b46bb44), `dpl_jQrS…` (3516a61) | same |
| CI on e1dbf300 | CI run 38775075090 in progress; E2E Preview Contract 38775075326 success | Actions |
| Integration base | `e1dbf300` | this branch |
| Integration branch | `claude/final-integration-release-wt2y8s` (no Vercel Preview; disabled in vercel.json in this commit) | Vercel: 0 deployments for the branch |

The master task's "observed Production SHA fef867a6" is stale: since then PRs #69, #70, #71, #73 (Video Core, BOG)
were merged and released.

## 2. Pull requests (heads read 17:12Z; all open ones are based on fef867a6 unless noted)

| PR | Stream | Head | State | Merge onto main e1dbf300 | Classification | Next safe action |
|---|---|---|---|---|---|---|
| #64 | Video Core final engineering | bcb724a1 | open draft | CONFLICTS (6 files) | Mostly SUPERSEDED by #69/#71 (lib/chat/filmBilling.ts + migration 20261014a). Defects 47/48 (another user's film id) still MISSING in main | Video Core thread ports the 3 ownership fixes (or this branch if it declines); propose closing #64 as superseded |
| #60 | Image Studio v1 | be9edee3 | open draft | clean | BUILT, PROVEN_ISOLATED (CI local Postgres/Supabase); real Google generate/edit BLOCKED (no isolated env) | Merge into the integration branch behind AGENT_G_MEDIA_EXEC (off in Production) |
| #65 | Music Studio v1 | 9d25c7a4 | open draft | clean | PROVEN_PREVIEW (3 live Lyria calls 2026-10-14) + PROVEN_ISOLATED (replay, 27/0/0); live worker on a real account BLOCKED; vocals OFF | Merge behind MUSIC_STUDIO_ENABLED / NEXT_PUBLIC_MUSIC_STUDIO_V1 (off) |
| #68 | Voice Experience v2 (Astra) | f93f1bc1 | open draft | clean | BUILT, CI green on e6dfab9d; real device / Live budget not proven. Spoken-spend gate is NOT flag-gated | Merge after #65; review the always-on gate |
| #67 | Global final E2E | 731e9612 | open draft | clean | BUILT: provider boundary default ON, Preview isolation guard, dubbing/deck off until price approval, paid build hook removed | Merge last, selectively (code + docs) |
| #66 | Phone onboarding | 217b1598 | open | clean | BUILT, default off. Migration name collides with main's 20261014a; turns phoneCallsReady() env-driven | Keep OUT of this release |
| #72 | BOG docs (BOG thread) | be8c20cd | open draft (docs) | — | BOG thread owns it | Do not touch |
| #62 | BOG post-launch | — | MERGED 3516a61 (2026-10-15) | — | PROVEN_PRODUCTION (admin BOG) | Audit only |
| #60 note | | | | | "Do not merge before #64 is decided" (its own doc) → decided: #64 superseded | |
| #43, #44, #51 | old drafts (#44 Astra) | | open | | not part of this release | Do not touch |
| uid race | branch claude/shared-chat-uid-race-proposal-20261014 | 7fe06fb5 | branch only | clean | PROPOSAL; no failing regression test exists | Write the failing regression first (Phase 2) |

## 3. Active owners (do not edit their branches/files)

- **Video Core thread** — branch `claude/video-core-v1-6gh97e`; deploying e1dbf300 now, then a paid ad film GG asked
  for at 16:49Z. All Production deploys wait until it is finished.
- **BOG Payments thread** — branch `claude/bog-payments-master-task-yjxq59`, PR #72 docs. Done.
- **Image Studio / Music / Global E2E / Voice v2** — authors' sessions are not active; their PR heads are merged into
  the integration branch by merge commits, never rewritten.
- PR #60's branch: never pushed to (standing owner rule).

## 4. Environment facts (names only)

- Vercel Preview uses the same `NEXT_PUBLIC_SUPABASE_ANON_KEY` entry (dev/preview/prod) → **Preview shares the
  Production Supabase**. Phase 1 gate "Preview has distinct disposable DB/Auth/Storage" = **NOT MET (BLOCKED_OWNER)**.
  Isolated acceptance is only possible in CI on a local Supabase/Postgres harness (#60, #65, BOG).
- Production still holds keys for non-Google providers (OpenAI, Replicate, Udio, HeyGen, LTX, NanoBanana, WorldLabs);
  `MEDIA_GOOGLE_ONLY` is not set → outside media engines are reachable in Production today (main
  lib/providers/mediaPolicy.ts:26 is opt-in). #67 makes the boundary default ON.
- Flags in Production: AGENT_G_MEDIA_EXEC (value not read; memory: admin), BOG_CHECKOUT_MODE (admin),
  VEO_DAILY_LIMIT_USD (10), PHONE_AGENT_ENABLED / PHONE_REAL_CALL_PROVEN present. 16 env entries were truncated by the
  connector (names not visible).
- Sandbox proxy denies myavatar.ge / *.vercel.app; live smoke runs on GitHub runners.

## 5. Paid-call hooks (Phase 0 step 6)

- main vercel.json `buildCommand` still runs `scripts/gcp/preview-inference-check.cjs` (PAID Gemini call on Preview,
  armed only by `scripts/gcp/inference-check.request.json`). No `*.request.json` exists on main or any PR ref → disarmed
  today; #65 and #67 remove the hook from buildCommand, #67 pins it with lib/env/paidBuildHooks.test.ts.
- No prebuild/postbuild/postinstall scripts. preflight-check.mjs only checks env presence.

## 6. One Window (main)

- `/[locale]` and `/[locale]/dashboard` → FilmStudioHome → ServiceHub → ChatChrome + OmniStudio.
- `/[locale]/studio` → redirect to `/[locale]`.
- `/[locale]/create`, `/[locale]/app` → 404 (no route, no redirect).
- CommandCenter / CommandCenterChat / MainDashboard are not imported by any route (dead code). The "two competing
  runtimes" P0 is already resolved in routing; remaining work = /create redirect, dead-code retirement, shared contracts.

## 7. P0 found in Phase 0

1. **Video defects 47/48 (cross-user)** in Production code: client-supplied `filmTokenId` without owner check
   (app/api/video/assemble/route.ts:348), payer overwrite (lib/chat/filmStatusStore.ts:193), blind upsert
   (lib/orchestrator/jobs.ts:352/356). Fix exists in #64. Owner of the files: Video Core thread (asked via the
   Coordinator 17:18Z to port it on its branch; if it declines, this branch ports it). OPEN RELEASE BLOCKER.
2. **Preview not isolated** from the Production DB → no deployed paid E2E possible (owner: isolated Supabase project).
3. **Outside providers reachable** in Production (google-only boundary off).
4. Video defect 51 (stitch killed mid-run keeps its debit) open; patch in #67 targets #64, not main.

## 8. Regression baseline

To be recorded in 01_INTEGRATION_LEDGER.md (tsc, lint, Jest on e1dbf300 before any merge).
