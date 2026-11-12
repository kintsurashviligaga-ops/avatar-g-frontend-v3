# Session Handoff — 2026-11-12

## Current phase
Phase 0 — read-only baseline audit: complete. Stopped for founder approval.

## Objective
Establish, with evidence, what works, what is partial, missing, unsafe or unknown in MyAvatar.ge + Agent G, and verify
Google model facts against live official documentation.

## Completed
- Read v5.1 spec (uploaded PDF, 12 Nov 2026).
- Inspected repo at `main` @ `4c502c7`: inventory, routes, model ids, ledger RPCs, BOG routes and SQL, Agent G modules,
  security controls, CI config.
- Fetched official Google sources S1–S16 (`docs/audit/04` §2), 2026-11-12 09:03–09:12Z.
- Wrote `docs/audit/00`–`11` and `docs/execution/*`.

## Files inspected
- `lib/ai/google/{models,transport,provider,readiness}.ts`, `lib/models/catalog.ts`, `lib/video/omniClip.ts`,
  `lib/voice/{liveAvatar,geminiLive}.ts`, `services/live-relay/README.md`, `lib/providers/mediaPolicy.ts`
- `lib/billing/enforce.ts`, `lib/orchestrator/ledger.ts`, `supabase/migrations/20261002a_bog_billing.sql`,
  `20261002d_ledger_ref_race_hardening.sql`, `app/api/billing/bog/webhook/route.ts`, `docs/ledger-unification/README.md`
- `lib/agent/{browser,sandbox,workspace,mcp,taskGraph}*`, git stats of #277–#286
- `docs/production-truth/PRODUCT_TRUTH_MATRIX.md`, `docs/master-v3.1/*`, `package.json`, `vercel.json`, `.github/workflows/`

## Files created or modified
- Created: `docs/audit/00-executive-summary.md` … `11-truth-matrix.md` (12 files) — Phase 0 deliverables.
- Created: `docs/execution/{PROGRESS,DECISIONS,BLOCKERS,SESSION_HANDOFF,ANTIGRAVITY_SESSIONS}.md`.
- Not modified: any source, test, migration, config, env. Existing `docs/audit/route-provider-map-2026-09.txt` untouched.

## Tests executed
- `gh run list --branch main`: `970ca60` all green; `4c502c7` ADK pilot green, CI + E2E in progress (09:09Z).
- Local tsc/lint/Jest/Playwright: NOT RUN (no `node_modules`; install forbidden).

## Evidence
- Vercel deployments API: production READY `dpl_2vFRByjE` (`970ca60`); `dpl_6ckUgSoT` (`4c502c7`) BUILDING 09:10Z.
- Google URLs and UTC times: `docs/audit/04` §2.

## Truth status changes
- Read-aloud TTS: "BUILT, degraded" (2026-11-06 matrix) → **BLOCKED** (failed contract + dated shutdown).
- Browser agent, site agent, workspace: new rows → IMPLEMENTED_UNVERIFIED.
- Gemini 4 Carbon / Argon / Decision, Computer Use: new rows → MISSING.
- Legacy ledger callers: new row → UNKNOWN.
No status was upgraded.

## Blockers
B-01 read-aloud (HIGH) · B-02 legacy ledger (HIGH) · B-03 BOG sandbox (MEDIUM) · B-04 browser snapshot ~2026-11-13
(MEDIUM) · B-05 Vertex lifecycle page partly unreadable (LOW). See `BLOCKERS.md`.

## Financial/security impact
None caused by this session: no spend, no charge, no balance or env change, no data read from production DB.

## Optional Antigravity tooling
- installed: no
- version: not verified
- bridge: not used
- session ID: none

## Next session
- Exact next task: on founder approval, Phase 1 — target architecture and migration plan (documents only).
- Files to inspect: `lib/billing/pricingConfig*.ts`, `lib/credits/unitEconomics.ts`, `lib/services/billing/costModel.ts`,
  `lib/agent/taskGraph.ts`, `lib/agent/tools/registry.ts`, `lib/env/previewIsolation*`.
- Commands: retry fetch of `docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions` (full table)
  and `ai.google.dev/gemini-api/docs/rate-limits`; Cloud Speech Chirp 3 docs; Vertex Interactions retention docs.

## Approval required
- D-01 Phase 1 approval (required before any further work).
- Time-sensitive, outside Phase 0: D-02 (read-aloud before 2026-11-17), D-10 (browser snapshot before ~2026-11-13).
