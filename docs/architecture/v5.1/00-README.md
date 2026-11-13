# v5.1 Phase 1 — target architecture and migration plan

Phase 1 = spec §22. Founder approval D-01 (GG, 2026-11-12 09:24Z): **documents only, no implementation code**.
Base: Phase 0 audit (`docs/audit/00`–`11`, PR #287) on `main` @ `4c502c7`, plus the P0 fixes approved on the same day
(read-aloud → `gemini-3.8-flash-tts` #288, `gemini-3.6-flash` retirement #289, browser snapshot remade, D-10).

| # | Deliverable (spec §22) | File |
|---|---|---|
| 1 | Current architecture diagram | [`01-current-architecture.md`](01-current-architecture.md) |
| 2 | Target architecture diagram | [`02-target-architecture.md`](02-target-architecture.md) |
| 3 | Component responsibility map | [`03-component-responsibility-map.md`](03-component-responsibility-map.md) |
| 4 | Capability registry design | [`04-capability-registry-design.md`](04-capability-registry-design.md) |
| 5 | API contracts | [`05-api-contracts.md`](05-api-contracts.md) |
| 6 | Execution lifecycle | [`06-execution-lifecycle.md`](06-execution-lifecycle.md) |
| 7 | Security boundaries | [`07-security-boundaries.md`](07-security-boundaries.md) |
| 8 | Billing design | [`08-billing-design.md`](08-billing-design.md) |
| 9 | Migration plan | [`09-migration-plan.md`](09-migration-plan.md) |
| 10 | Rollback plan | [`10-rollback-plan.md`](10-rollback-plan.md) |
| 11 | Prioritized backlog | [`11-prioritized-backlog.md`](11-prioritized-backlog.md) |
| — | Computer Use vs Playwright evaluation (D-09) | [`12-computer-use-evaluation.md`](12-computer-use-evaluation.md) |
| — | Google lifecycle facts used here (live fetch 2026-11-12) | [`13-google-lifecycle-2026-11-12.md`](13-google-lifecycle-2026-11-12.md) |

## Founder decisions this design follows (2026-11-12 09:24Z)

D-01 Phase 1 docs only · D-02 read-aloud → 3.8 Flash TTS now · D-03 free entitlement probes allowed · **D-04 keep
Interactions `store=true` for now** (on Vertex the stored window is 7 days, not 55: see `13` §2, C4) · **D-05 Vertex-only, no Developer API (no Gemini Decision)** · **D-06
no Carbon/Argon for deep tasks until versioned pricing + timeout-cost rules ship (Phase 5)** · D-07 Omni 1.1 → 1.2 in
Phase 2 (paid test ~$2 approved) · **D-08 code run and browser stay admin-only until E2E proof** · D-09 evaluate
Computer Use vs Playwright, no build · D-10 browser snapshot remade. B-02: legacy ledger code is **not touched** until
GG's `01_introspect.sql` result arrives. Card 2026-11-12 09:44Z: retire `gemini-3.6-flash` now.

## Rules kept

Nothing in this folder changes code, schema, env, prices or routing. Every "target" item is a proposal for a later,
separately approved phase. Facts about Google come from official pages fetched live (`13-…`); anything not verified
is marked UNKNOWN. Status words follow the v5.1 truth vocabulary (MISSING · PARTIAL · IMPLEMENTED_UNVERIFIED ·
VERIFIED_STAGING · PROVEN_PRODUCTION · BLOCKED · NOT_APPLICABLE · UNKNOWN).

The lifecycle line in spec §22 is clipped in the PDF after `EXECUTE → V…`. `06-execution-lifecycle.md` completes it
as `VERIFY → DELIVER → SETTLE → RECONCILE`; that tail is **our proposal** for the founder to confirm.
