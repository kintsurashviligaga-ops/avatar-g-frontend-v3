# Image Studio — Phase 5 handoff

Date: 2026-10-13 (Asia/Tbilisi)
Branch: `codex/image-studio-v1`
Base HEAD: `30be5a2d96495f67134cad34796ce724a744bd28`

## Status

Phase 5 local/mocked hardening is verified. The saved Phase 4 implementation and Phase 5 work were retained, not rewritten. See [Recovery Handoff Report](./RECOVERY_HANDOFF_REPORT.md) for the approval-stall diagnosis, backup paths, bounded commands, exact test scope, and remaining gates.

Verified behavior includes strict persisted-plan validation, owner-scoped recovery, no restored result URLs, ordered reference roles, Library orientation metadata, owned result reuse with parent lineage, explicit quote/confirmation, sequential variants, cancellation, and recovery without repeating inference.

The only recovery code change is to five existing assertions in `components/studio/create/omniWiring.test.ts`: the legacy panel/feed must also stay hidden when ImageWorkspace is active. All 18 tests in that suite pass. Image Studio application code was unchanged during recovery.

## Evidence

- 217 focused tests / 23 suites pass.
- Full TypeScript and lint pass; lint warnings remain visible.
- 884 regression suites were run in bounded groups: 13,336 tests passed, 30 skipped, 18 failed. The 18 failures exactly match the prior native FFmpeg baseline; no new failure remains after the wiring-test correction.
- Five mocked browser scenarios pass, including KA/RU 390×844 layouts and Library→owned edit with keyboard confirmation.
- A local production build of the source-equivalent validation snapshot passes.
- Video Core PR #58 source-only dry-run passes at `ebc3444055cb01cd336764f3947f28d0a3c49c06`; combined runtime compatibility is not claimed.
- Compact machine-readable results: `evidence/recovery-20261013/verification-summary.json`.

## Phase 6 truth / release gates

| Area | Current evidence | Remaining gate |
|---|---|---|
| Request, role/order and prompt preservation | BUILT; deterministic tests | Real reference adherence / visual inspection |
| Quote, human confirmation and idempotency | BUILT; fake ledger/lease and API tests | Isolated real DB concurrency and credit deltas |
| Google adapter and output QC | BUILT; fixed transport and real decoder fixtures | Authorized live provider result for supported operations/resolutions |
| Private storage, history and ownership | BUILT; injected ownership/storage tests | Isolated actual auth, RLS, storage and signed-URL evidence |
| Mobile, locales, reload/cancel and Library reuse | BUILT; five mocked browser tests | Authenticated real-backend E2E |
| Video coexistence | Source dry-run passes | Approved combined runtime E2E |
| Unsupported capabilities | Explicitly rejected/disabled | Do not advertise masks, alpha, deterministic upscale, exact identity, or unverified models |

Production readiness remains **NO**. No merge, deploy, production migration or paid provider call occurred. No central ledger/pricing or Video/FFmpeg code was changed.

## Next operator

Use the existing Image Studio worktree explicitly. Stop the two older approval-waiting chats before resuming their requests. Preserve all uncommitted work and the verified backup. Use the bounded runner and unique evidence paths; do not restart the entire implementation or run an unbounded monolithic regression command. Address the shared Jest cleanup timer and baseline FFmpeg failures separately. Real-provider/isolated-database acceptance remains the final certification gate.
