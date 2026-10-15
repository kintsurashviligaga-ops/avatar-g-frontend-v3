# 05 — Security, billing and failure audit (Phase 5)

Scope: the merged tree on PR #74. Method: code reading plus the tests and CI runs named in 02 and 04. Findings and their
state are in `02_P0_DEFECT_REGISTER.md`; this file is the summary against the master task's checks.

| Check | Result | Evidence |
|---|---|---|
| Only Google + ElevenLabs + FFmpeg reach users | PASS on the branch: #67 makes the boundary default ON; two uncharged outside-engine routes closed (FR-4, FR-5) | `lib/providers/mediaPolicy.test.ts` "every entry calls the guard" |
| Price shown = price debited | PASS: FR-7 closed (display only, no price change) | `lib/studio/musicQuote.ts`, route unchanged |
| Exactly-once debit, refund on failure | PASS in isolation | "billing on real Postgres" ✓ (Video Core), Image isolated-db ✓, Music live E2E ✓ |
| Trusted confirmation (no spoken/tool/transcript debit) | PASS: every voice start answers `ui_confirmation_required` | liveVoiceGate / liveActions / liveTools tests |
| Cross-user billing (film tokens) | FAIL on main and on this branch until Video Core PR #76 lands (FR-1) | Video Core thread verified on b21506b |
| Free-text paid chat path | OPEN, P2: no mounted UI, own-account direct API call only (FR-8) | 02 FR-8 |
| Ledger missing → uncharged degrade | OPEN, P2: only on a misconfigured deployment (FR-12) | Production has the ledger RPCs |
| External workers' provider boundary | OPEN, inferred (FR-13) | not traced |
| Preview isolation | FAIL, owner-gated: Preview uses the Production database (FR-2) | env listing, Phase 0 |
| Secrets in repo / CI artifacts | none added by this branch (diff contains no keys; docs quote no secret) | `git diff main...HEAD` |
| Failure modes: provider down, kill mid-job | Refund paths tested in isolation for Image, Music, Video saga; defect 51 (kill mid-stitch keeps the stitch debit, FR-10) is Video Core's | 02 FR-10 |
| HawkScan DAST | NOT RUN: no HAWK_API_KEY in this environment and no running app | — |
