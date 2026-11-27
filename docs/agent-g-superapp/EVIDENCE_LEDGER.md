# EVIDENCE_LEDGER — major PRs, their tests, and how they were verified

**As of:** 2026-11-27. Docs only.

**How to read this.**

- **Local** test counts are what the PR's author ran and wrote in the PR description. They were run in a cloud container, usually on the files the PR touches.
- **CI** means GitHub Actions on that PR's own head. Stacked PRs (base ≠ `main`) have no GitHub CI of their own. Their CI proof is the combined run #409.
- Counts are copied from each PR's description as of 2026-11-27. Re-read the PR before relying on a number. A later commit may have changed it.
- "ffmpeg suites" means the 14–20 `*.ffmpeg.test.ts` suites that need the `ffmpeg-static` binary. They fail with `spawn ENOENT` in a container without it, and pass in CI.

## 0. The combined proof (covers every row below)

| Run | Command | Result |
|---|---|---|
| #409, branch `claude/throwaway-820-combined` = `main` `0ea1566` + 96 launch PRs in runbook order + 8.20 fixes | `npx tsc --noEmit`; `npx next lint`; `npx jest` | tsc 0, lint clean, **18,784 pass / 1 fail** (fixed by #408). After the fix, 218 suites / 2,112 tests pass |
| #409 GitHub CI, head `314e824f` | 18 jobs (see `E2E_ACCEPTANCE_MATRIX.md` §1.2) | **18/18 success**, including BOG sandbox and billing on real Postgres |
| #374 (2026-11-19, 70 launch PRs, closed unmerged) | same | 18/18 green after 4 real fixes on the source branches |
| `main` CI `verify` (seen on #396, 2026-11-27) | `npm run typecheck && npm test && npm run build` | 17,231 pass, 1 fail: the lifecycle date guard, fixed by #292 |

Check any CI result yourself:

```sh
gh api repos/kintsurashviligaga-ops/avatar-g-frontend-v3/commits/<head-sha>/check-runs \
  --jq '.check_runs[] | [.name, .conclusion] | @tsv'
```

## 1. Audit-critical PRs

| PR | What | Local tests (from the PR) | Verify command |
|---|---|---|---|
| #292 | Live default → gemini-3.8-live (2.5 retires 2026-12-13) | 2,125 voice/models/calls/relay/services tests. Relay probe: eu PASS 469 ms | `npx jest lib/voice lib/models lib/capabilities` |
| #399 | Browser network guard: IPv6 + DNS, in-sandbox proxy | 8 suites, 137 tests (`lib/agent/browser` + `app/api/agent/browser`); tsc 0, eslint 0 | `npx jest lib/agent/browser app/api/agent/browser` |
| #400 | Same guard for Browser Agent v2 (on #387) | 6 suites, 98 tests | `npx jest lib/agent/browserAgent lib/agent/browser/netGuard` |
| #408 | Login browser behind the guard (after #346 + #399) | 12 suites, 158 tests, including both real-Chromium login tests | `npx jest lib/agent/browser` |
| #396 | Launch flag registry, `/api/admin/launch-flags`, `[feature-error]` log | launchFlags 14, featureLog 8, LibraryLoading 2; 535 library/admin/security/lockdown tests; CI: only the lifecycle guard fails | `npx jest lib/env lib/observability components/library`; `WRITE_ENV_REGISTRY=1 npx jest lib/env/launchFlags.test.ts` regenerates `docs/launch/ENV_REGISTRY.md` |
| #407 | `LEDGER_FAIL_CLOSED` (production only, off) | 3 new tests; `lib/orchestrator` 48 suites | `npx jest lib/orchestrator` |
| #406 | Agent G Georgian "temporarily unavailable" | 5 new; `lib/agent/task` + `components/agent` 44 | `npx jest lib/agent/task components/agent` |

## 2. Agent G engine and agent work

| PR | What | Local tests (from the PR) |
|---|---|---|
| #308 | Engine foundation: planner, VALIDATE, parallel DAG | 45 mocked tests (per the 8.16 counter-audit) |
| #309 | VALIDATE before every media quote | 18 new pure + 6 runExec cases; 2,150 across agent/tasks/api (ffmpeg suites excepted) |
| #310 | Media runs on the engine | `runExec.v2` 88/88; `engineBridge` 21 |
| #311 | Work-mode lease jobs (prep, not wired) | `workJob` 6 |
| #383 | Engine refunds counted | all 63 engine tests |
| #393 | Reel Task | engine suite 89/89 (30 new) |
| #381 / #382 | Router v2 / commands | 43 / 31 mocked (74 with the router) |
| #384 | Injection shield | 216 (`lib/agent/react`, `app/api/agent`) |
| #385 | Goal pin + memory wait | 7 |
| #312 | Browser Agent loop, App Builder (prep) | 115/115 (browserAgent, appBuilder, sandbox, browser) |
| #387 | Browser Agent v2 (not wired) | 29, real headless Chromium against a local page |
| #346 | Browser login | `lib/agent/browser` 73/73 |
| #314 / #316 | Live Workspace UI / Phase 9 mocked E2E | 113 / 22 Jest + 9 Playwright |
| #390 / #392 | Connectors states / 10-plugin catalog | 224 / full Jest 17,144 (ffmpeg suites excepted) |

## 3. Studios (Phases 8.2 to 8.8)

| Stack | Local tests (from the PRs) |
|---|---|
| Director's Workflow #349 → #350 → #352 → #355 | 19; 6 + 3 + studio 1,201; scene route 7 + 2,576 across studio/video; finalCut 9, cut.server 6, cut route 8 |
| Art Director #356 → #357 → #358 | 40; 57 + 140 `__tests__`; 212 + 297 chat/image |
| Music Producer #359 → #360 → #361 | 43 mocked; tsc/eslint on new files |
| Virtual Studio #362 → #363 → #364 | 29; 43 + 10; 77 + TTS 21 |
| Smart Editor #365 → #368 → #370 | 45; 222 + 12; 3,322 |
| 3D Studio #366 → #367 → #369 → #397 | 39; 1,266; 1,759; 77 |

## 4. Pricing and billing (billing cards only)

| PR | Local tests (from the PR) |
|---|---|
| #343 | `lib/billing/margin` 27 |
| #344 | `lib/billing/margin` 34 |
| #351 | priceBookV8 15; full Jest 17,166 (ffmpeg suites excepted) |
| #353 | 54 suites / 978 (margin, voice, v5 billing, schema-drift) |
| #354 | full Jest 1,136 suites pass (ffmpeg suites excepted) |

## 5. UX, speed, compliance, polish

| PR | Local tests (from the PR) |
|---|---|
| #321 image | 150 suites / 2,977 |
| #322 read-aloud | 19 suites / 429 |
| #327 / #328 / #329 / #330 | 586 / 274 + 72 / 973 / 764 |
| #331 media renew | 3,632 |
| #333 / #335 / #337 | 909 / 181 / 122 |
| #339 / #340 / #342 | auth suites green / 69 / 87 |
| #375 / #376 | 196 / 1,199 |
| #388 / #391 / #395 | 220 + 385 + 24 / 1,487 / 1,022 (63 suites) |
| #398 final polish | **full Jest 1,157 suites, 17,211 pass, 0 fail**; `next lint` 0 errors |
| #403 / #404 / #405 | 943 / 310 + 130 / 536 |

## 6. What is not yet evidence

These are claims nobody can verify until GREEN. They are listed so that nobody counts them as proven:

- The #399 guard in a **real** Vercel Sandbox. This container has no IPv6, so the tests use `127.0.0.2` as the "private" server.
- Any paid generation path after the restore, all of runbook Step 7.
- BOG redelivery against a real payment (L11).
- Live reconnect on a real phone network (L12).
- Read-aloud 3.8 TTS re-certification.
- HawkScan: not run on these PRs (no `HAWK_API_KEY` in the container).
- **Phase 8.21 (spend caps and chaos testing)** is still running in another thread. Its evidence is added here when it lands.
