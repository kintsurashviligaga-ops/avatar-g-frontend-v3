# FINAL — integration and E2E matrix (2026-10-14, final P0/P1 repair run)

## Trees tested

| Tree | Content |
|---|---|
| **#67** | `claude/global-final-e2e-20261014`, final SHA in FINAL_RELEASE_GATES.md |
| **Integration** (disposable `/tmp/int-wt`, never pushed) | #67 + #64 `bcb724a1` + #60 `be9edee3` + #65 `9d25c7a4` + #68 Astra `e6dfab9d` + uid-race proposal `7fe06fb5` + defect-51 patch. **All merges clean, no conflicts.** No other agent's branch or uncommitted files were modified. |
| **Clean main** (disposable `/tmp/main-wt`) | `origin/main` `fef867a6`, ffmpeg baseline only |

PR heads are unchanged since the second run (handoff 15).

## Local results (macOS, Node 24)

| Check | #67 | Integration | Clean main |
|---|---|---|---|
| TypeScript `tsc --noEmit` | 0 errors | 0 errors | – |
| ESLint (changed files) | 0 errors (2 old warnings in ServiceParamsPanel) | – | – |
| Full Jest | 896 suites pass / 6 fail / 8 skipped; 13 876 tests pass / 22 fail. After the statusAgent fixture fix: 897 / 5 suites, 20 failures — **all in the 5 ffmpeg suites** | 924 suites pass / 5 fail / 11 skipped; 14 143 tests pass / 20 fail — **the same 5 ffmpeg suites** | the same 5 suites fail with the **same 20 failures** ⇒ macOS ffmpeg 6.0 baseline, not a regression |
| ffmpeg baseline suites | composition.ffmpeg (16), ffmpegExec (1), videoCoreAc06.ffmpeg (1), effects.ffmpeg (1), montageExec.ffmpeg (1) | same | same |
| Production build | via CI (see below) | local `next build` with CI's dummy env: **exit 0** (the first attempt, before 62a9940f, reproduced CI's `node:crypto` failure; the import trace ran through `components/voice/live/useGeminiLiveSession.ts` → `lib/chat/platformPrompt.ts`) | – |

Skipped tests are skipped, not counted as passing.

## Financial and security suites (all pass)

previewIsolation 16 · dubbing route 38 · presentation route 20 · paidServiceGate 6 · produceBilling 21 ·
providerBoundary 8 · paidBuildHooks 2 · mediaPolicy · platformPrompt 55 · workspaceForms (+2 price tests) ·
capabilities 7 · defect-51 settlement 10 (on #64 + integration).

## Cross-studio shared surfaces (integration tree)

| Surface | Evidence | Verdict |
|---|---|---|
| Credit ledger | Video `filmComposite.deductCredits`, Image `deductCreditsOnce`, Music `reserveProduce`, and Dubbing/Deck `confirmedJob` all go through `lib/orchestrator/ledger`, so the Preview guard and exactly-once refs cover every studio | PASS (unit + Jest) |
| Quotes | Agent G media quotes and service quotes share `quoteToken`. Service quotes fold the service into the fingerprint (no cross-use) | PASS |
| Jobs / drainer | Dubbing/Deck and the defect-51 settlement rows use `_reserve` + `processing`, the same contract `drain-renders` reaps | PASS (unit). The drainer is still opt-in (`RENDER_DRAINER_ENABLED`) |
| Auth | every paid route checks auth first; signed-out ⇒ 401 before anything runs | PASS |
| One Window / Library / Download | deck pages and dub video filed via `completeJob`. An unpersisted result is flagged in the UI (`t.unpersisted`) | PASS (unit) |
| Agent G tool routing | capabilities registry: dubbing and deck are `BLOCKED_OWNER`. The prompt says "dubbing and decks: not yet available" until they are approved | PASS |
| Voice (Astra #68) | merged clean. No Voice file edited by this run. The new Confirm button carries `data-live-guard="spend"`, so the live agent cannot press it | PASS (merge + Jest) |
| data-uid race (`7fe06fb5`) | applies clean on the integration tree and the full Jest run passes. Still a proposal for #65's owner | VALID PROPOSAL |
| Redis / Storage / FFmpeg real-media QC | not touched by this run. Real-media QC is proven on Linux CI only (macOS baseline above) | per CI |
| PostgreSQL / RLS | CI `billing on real Postgres` (leaseIsolation, ledgerOnce, runIsolation) | per CI run |

## CI on PR #67

| SHA | Run | Result |
|---|---|---|
| dddf52f3 | CI 38609235945 / Preview Contract 38609236074 / Video Core 38609235950 | **FAILED**: `next build` UnhandledSchemeError `node:crypto`. The client-reachable Agent G prompt imported the quote module. Fixed in 62a9940f |
| 5e8d02ca | same failure (Video Core run cancelled by the next push) | superseded |
| **62a9940f** (last code commit) | CI https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38611259872 (verify: tsc+lint+jest+next build) · Preview Contract https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38611259948 · Video Core E2E https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38611259583 (billing on real Postgres, live E2E desktop + phone on local Supabase) | **ALL SUCCESS** |

## Not proven (honest)

- **No deployed Preview or Production E2E.** Deployed E2E needs an isolated Preview database, which needs owner approval
  (see EXACT_CONTINUATION.md). Nothing here is labelled PROVEN for a deployment.
- No live microphone (Astra), no paid provider generation.
- Playwright desktop + phone ran only in CI (local Supabase), not against a deployment.
