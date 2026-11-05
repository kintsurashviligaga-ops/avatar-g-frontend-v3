# Phase 6 verification (MASTER TASK v3.1)

This file records the integrated verification of the release candidate: what ran, where, on which commit, with what
result, and what was **not** verified. It follows the rule in v3.1 Phase 6: a gate that did not run, or could not run
without the owner's authorisation, is listed as **unverified**, never as passed.

## The release candidate

| | |
|---|---|
| Application commit | `d8420a5d1ee42d7b216932b901eb227984a59299` (`main` after #265, 2026-11-05) |
| Production | the same commit: Vercel deployment `dpl_DtJovLX46bzABHqMBB29rZv4QxPe`, target `production`, aliases `myavatar.ge` and `www.myavatar.ge`, state `READY`. `/api/health` on that deployment answered `200 {"ok":true,"status":"healthy","commit":"d8420a5"}` at 2026-11-05 19:20Z |
| Phase 6 branch | `claude/p6-verification`: this documentation, the browser matrix spec `tests/phase6-matrix.spec.ts`, its entry in `npm run test:e2e:preview`, and the route scan `scripts/audit/route_reach.py`. No application code changes, so the Preview of this branch runs the same application as Production |

## Environment

| | Local integration gate | GitHub Actions |
|---|---|---|
| Machine | Linux container, 4 CPU cores | `ubuntu-24.04` runners |
| Node / npm | 22.22.0 / 10.9.4 | Node 24 (per workflow) |
| Backend | dummy Supabase URL and keys (`https://example.supabase.co`), so every request is a guest and nothing can reach a paid provider | same dummy values for `verify` and the Preview-contract E2E; local Postgres + PostgREST for the real-database jobs |
| Browser | Chromium from Playwright (`/opt/pw-browsers/chromium-1194`) | Chromium installed by `npx playwright install` |
| Network | outbound HTTPS through a proxy; `myavatar.ge` is blocked by that proxy, so Production was read through the Vercel deployment URL | GitHub-hosted |

Local Node 22 differs from CI's Node 24. Nothing in the gate below depended on the difference, and CI repeats the same
gates on Node 24 for the PR head.

## 1. Integration gate on the exact commit (local)

Script: `gates.sh` (each step logs to its own file with its exit code and duration). Environment as above with
`NODE_OPTIONS=--max-old-space-size=8192`, `CI=true`, `NEXT_TELEMETRY_DISABLED=1`.

| Step | Command | Result | Counts | Time |
|---|---|---|---|---|
| Typecheck | `npx tsc --noEmit` | pass (exit 0) | 0 errors | 93 s |
| Lint | `npx next lint` | pass (exit 0) | 0 errors, 36 warnings: 22 `react-hooks/exhaustive-deps`, 10 `@next/next/no-img-element`, 3 `jsx-a11y/role-supports-aria-props`, 1 `jsx-a11y/aria-unsupported-elements` | 73 s |
| Unit and integration | `npx jest --passWithNoTests --ci` (the whole repository) | pass (exit 0) | 1131 suites: 1118 passed, 13 skipped, **0 failed**. 17185 tests: 17066 passed, 119 skipped, **0 failed**. 1 snapshot passed | 509 s |
| ADK pilot typecheck | `npm run --prefix pilots/adk typecheck` | pass | 0 errors | 7 s |
| ADK pilot tests | `npm test --prefix pilots/adk` | pass | 1 suite, 26 tests | 6 s |
| Production build | `npx next build` | pass | compiled; shared first-load JS 88.8 kB | 264 s |

Jest printed one warning: a worker process did not exit gracefully and was force-exited (an open handle in some test).
It did not fail any test. It is listed under risks, not as a pass condition.

### The 119 skipped tests are skipped by environment, not by edits

No test was skipped, disabled, quarantined or weakened for this gate. Every skip below is the suite's own guard that
turns it on only where its dependency exists. Each was checked by reading the guard and by running the suite on its own.

| Suites | Skipped tests | Guard (needs) | Where it runs |
|---|---|---|---|
| 10 real-Postgres suites: `filmBilling`, `filmSceneRefund`, `libraryFavorites`, `musicIsolation`, `imageIsolation`, `leaseIsolation`, `runIsolation`, `outboxIsolation`, `idempotencyStore`, `ledgerOnce` (`*.pg.test.ts`) | 70 | `LEASE_PG_REST_URL` + `LEASE_PG_JWT_SECRET` (a local Postgres with PostgREST) | CI `Image Studio Acceptance / isolated-db` (`scripts/image-studio/ci-db-suite.sh`) and `Video Core E2E / billing-pg`, on every PR to `main` |
| `__tests__/integration/bog-payments.e2e.test.ts` | 22 | `BOG_E2E_POSTGREST` + `BOG_E2E_JWT_SECRET` | CI `BOG payments E2E / isolated` (path-filtered; dispatched for this PR, see §3) |
| `__tests__/integration/bog-sandbox.e2e.test.ts` | 7 | the above plus BOG sandbox credentials | CI `BOG payments E2E / sandbox`, only when the `BOG_SANDBOX_*` secrets exist (owner) |
| `lib/agent/media/audioLive.e2e.test.ts` | 2 | `AGENT_G_AUDIO_E2E=1` (real internet download) | manual; **unverified** here |
| `lib/agent/media/montageVeoReplay.ffmpeg.test.ts` | 1 | `VEO_REPLAY_DIR` (real Veo clips on disk) | manual; **unverified** here |
| `ffmpeg-assembly`, `videoCoreRound3` (`*.ffmpeg.test.ts`) | 6 + 8 | `VIDEO_CORE_FFMPEG_IT=1` and an ffmpeg binary | CI `Video Core E2E (isolated local Supabase)` |
| `lib/video/longform/stitch.ffmpeg.test.ts` | 3 | `LONGFORM_FFMPEG_IT=1` and ffmpeg | manual; **unverified** here |

### The broad-CI failures recorded in Phase 0

Phase 0 (`AUDIT.md`, 22 October) recorded 9 failing `verify` suites on the then candidate (#113 head) and named 7 of
them. All 7 pass on `d8420a5d`, and the whole repository now has 0 failing suites, so the 2 that Phase 0 could not name
pass too (they are no longer identifiable, which is stated here rather than guessed).

| Suite (Phase 0) | Now | How it came to pass |
|---|---|---|
| `lib/studio/tools.test.ts` | pass | #113 brought the menu tests in line with the owner's menu removals; #235 removed the Product ad service with its test |
| `lib/video/contracts.test.ts` | pass | #113 |
| `components/onboarding/tourWiring.test.ts` | pass | #113 |
| `components/studio/create/createPanels.test.tsx` | pass | #113, then #147 (Interior and Photoshoot offer no size) |
| `lib/studio/templates.shoot.test.ts` | pass | #113 |
| `lib/gemini/image-analysis.test.ts` | pass | owner decision 3 (2026-10-22): the test is right, the character-ID prompt must **not** describe the background; the code was changed, not the assertion |
| `app/api/film/storyboard/selfie.test.ts` | pass | the same decision; #124 later kept it on Veo and Gemini only |

The Phase 0 Music E2E failure (mobile cancel mid-render never reached `cancelled`) is covered by `Music Studio E2E
(isolated local Supabase)`, which runs on every PR to `main`; its result on this PR head is in §3.

## 2. Cross-surface browser matrix

Spec: `tests/phase6-matrix.spec.ts` (new). It runs in two screen sizes, desktop 1280 × 800 and phone 390 × 844 with
touch and the mobile flag, in all three UI languages.

| What each test holds | Desktop | Phone |
|---|---|---|
| ka: home and studio open in Georgian (`<html lang="ka">`), no sideways scroll, no uncaught page error | pass | pass |
| en: the same in English | pass | pass |
| ru: the same in Russian | pass | pass |
| The composer is reachable without a mouse (desktop: Tab from the top of the page, then typing; phone: one tap focuses it) | pass | pass |
| Reduced motion: the page sees `prefers-reduced-motion: reduce`, and no endlessly repeating animation runs on the studio | pass (0 endless animations) | pass (0) |
| Guest: `/library` is the labelled demo library (`demo: true`) and offers nothing to delete | pass | pass |
| Fast navigation: home → studio → library → pricing → studio, each before the last finished loading, then back, back, forward, forward; ends on a rendered page, no page error, and the studio still opens | pass | pass |
| Guest, once per run: paid routes refuse before any provider call (`/api/image/jobs/quote`, `/api/tts/gemini`, `/api/nanobanana/image`, `/api/avatar/veo` → 401; `/api/music/studio/quote` → 503 `not_enabled`; `/api/ai/music` → 503 `platform_budget`) | pass | (runs once) |

**Run 1 (production build):** `next start` of the gate's build of `d8420a5d`, local, 2026-11-05 19:16Z: **15 of 15
passed** in 14.9 s.

**Run 2 (as CI runs it):** `next dev` started by Playwright with the e2e workflow's dummy env and `CI=1`, local,
2026-11-05 19:21Z: **15 of 15 passed** in 3.4 min (cold compiles included). §3 has the CI run of the same spec on the
PR head, where it is part of `npm run test:e2e:preview`.

Two test-design facts found while building the matrix, both fixed in the spec rather than by weakening an assertion:

- The paid routes share one per-address `EXPENSIVE` rate-limit bucket (5 calls a minute). Probing them once per screen
  size tripped it (429) and stopped proving the sign-in gate, so the probe runs once per run.
- On a phone, history keeps an extra step for an open sheet, so back/forward lands on a different visited page than on
  desktop. The test accepts any visited page but requires it to be fully rendered with no page error.

### Guest boundary of `/api/ai/music` (read, not just probed)

Locally the route answers a guest 503 `platform_budget` because the budget guard cannot reach its store; in Production
the guard can, so the request goes further. Reading the route on `d8420a5d`: after the budget check it resolves the
session **failing closed** (a lookup that throws answers 503 `auth_unavailable`), then calls
`requireAuthForGeneration`, which answers a guest **401 `auth_required`** before the idempotency claim, before
`deductCredits`, and before any Lyria call. The `DEMO_VOICE_USER_ID` fallback on the Library-filing line sits after a
successful render, which a guest cannot reach. So a guest cannot start a paid music render.

### Screenshots

`docs/master-v3.1/phase6/` holds the studio in each language and size from Run 1 (`studio-<locale>-<size>.png`). They
are the "after" state; the "before" state of the same screens is in `unified-composer/BEFORE_UI_INVENTORY.md`.

## 3. CI and Preview on the exact final commit

The PR head `4c5cd2d1` is `d8420a5d` plus documentation and tests only. Every result below is the first and only run
on that head (run attempt 1 everywhere; nothing was re-run). The final head of this PR adds only the document edits
that wrote this table (CI results, the telephony risk now pointing at #268); its own `pull_request` checks are on the
PR, and the path-filtered workflows (BOG, speech, voice) do not trigger on a documentation-only change.

| Workflow / job | Runs on this PR because | Result on `4c5cd2d1` (2026-11-05, UTC) |
|---|---|---|
| CI / verify | every PR | **pass** (19:28–19:41) |
| E2E - Preview Contract / preview-e2e (now includes the Phase 6 matrix) | every PR | **pass** (19:28–19:38) |
| E2E - Preview Contract / agent-g-gate | every PR | **pass** |
| Image Studio Acceptance / image-browser | every PR | **pass** |
| Image Studio Acceptance / isolated-db (real Postgres) | every PR | **pass** |
| Music Studio E2E / live E2E (local Supabase, desktop + phone) | every PR | **pass** (19:28–19:37) |
| Video Core E2E / billing on real Postgres | every PR | **pass** |
| Video Core E2E / live E2E (local Supabase, desktop + phone) | every PR | **pass** (19:28–19:51) |
| ADK pilot / adk-pilot | path filter (`package.json`) | **pass** |
| BOG payments E2E / isolated (local Postgres, fake BOG) | dispatched on this branch (path-filtered) | **pass** |
| BOG payments E2E / BOG sandbox (real api-sandbox.bog.ge) | dispatched on this branch | **skipped by its own guard**: the sandbox credential pair is not in this repository, so every step after the check was skipped. Not a pass |
| Speech acceptance / read-aloud (chromium, firefox, webkit) | dispatched on this branch (path-filtered) | **pass** (all three) |
| Voice Experience acceptance / simulated-browser | dispatched on this branch (path-filtered) | **pass** |
| Vercel Preview | every push | **Ready**; `/api/health` on the Preview answered `healthy` with `commit: 4c5cd2d` (19:43) |

Already green on `d8420a5d` itself (push to `main`): `verify`, `adk-pilot`, `preview-e2e`, `agent-g-gate`, and the
Vercel Production deployment.

The follow-up fix found by this phase, #268 (`/api/agent-g/calls/tts`), carries its own CI and Preview; its result is
on that PR.

## 4. What was not verified, and why

| Gate | Status | Why |
|---|---|---|
| Live paid provider certification (one contract call per model on the Production Vertex project) | **unverified** | needs the owner's billing authorisation; v3.1 forbids discovering access with repeated billed probes. Owner-run paid tests that did happen are listed in `CAPABILITY_MATRIX.md` with their date and budget |
| Live chat first-token benchmark (p50 ≤ 1.5 s, p95 ≤ 4 s) | **unverified** | Phase 3 decision 3 (budget for about 60 Flash turns) is still open |
| Preview, warm, with a seeded test account | **unverified** | Phase 3 decision 4 (a Preview test account in the shared database) is still open |
| Real hardware (iPhone Safari, Android Chrome), real microphone and speaker | **unverified** by this phase | only emulated sizes and touch here; the owner verified Live calls on an iPhone (2026-10-31) and Georgian/Russian/English dictation (2026-11-01) by hand |
| Signed-in browser flows | **partly**: CI's isolated local Supabase jobs sign in a test user; this phase's own matrix covers the guest boundary only | the shared Production database must not get test users without the owner's OK |
| Interrupted and reloaded tasks | covered by existing suites (Music cancel mid-render, Video Core lease takeover, chat result persistence after reopen, #223), **not** re-tested by hand here | |
| Production error logs | **unverified** | the Vercel runtime-error tool is not available to this session |
| BOG payments against BOG's real sandbox (S1–S7) | **unverified** on this PR | the job's credential pair is not in this repository, so it skips itself; the isolated fake-BOG suite on real Postgres passes |
| Speech samples | none new | no paid speech call was authorised for Phase 6; `PHASE4_EVIDENCE.md` holds the Phase 4 evidence |

## 5. How to reproduce

```bash
git checkout d8420a5d   # or the Phase 6 branch head
npm ci && npm ci --prefix pilots/adk
export NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy CI=true
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
npx next lint
npx jest --ci
npm run --prefix pilots/adk typecheck && npm test --prefix pilots/adk
npx next build
# browser matrix against the build:
npx next start -p 3300 &
PLAYWRIGHT_BASE_URL=http://localhost:3300 npx playwright test tests/phase6-matrix.spec.ts
# route → provider / billing scan:
python3 scripts/audit/route_reach.py . route-reach.json
```
