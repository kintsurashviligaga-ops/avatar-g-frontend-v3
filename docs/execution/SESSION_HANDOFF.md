# Session Handoff — 2026-11-12 (Phase 1)

## Current phase
Phase 1 — target architecture and migration plan (documents only, D-01): complete. Stopped for founder review (D-11).

## Completed this session
- P0 D-10: browser snapshot remade → `snap_8jPItZEBa720U8KfCFbie43FG5J5` (iad1, expires 2026-12-12); prod env
  `BROWSER_SNAPSHOT_ID` updated (effective on next prod deploy); verified Chromium + Georgian + screenshot exit 0.
- P0 D-02: PR #288 — read-aloud default `gemini-3.8-flash-tts`; legacy 2.5 kept for `GEMINI_TTS_MODEL` rollback;
  probe plan `scripts/certify/vertex-contract-plan-3.json` (cap $0.05; free D-03 probes inside).
- P0 card 09:44Z: PR #289 — `gemini-3.6-flash` removed from chat/STT/Live/premium chains (retires 2026-11-19).
- Phase 1 docs: `docs/architecture/v5.1/00`–`13`. B-05 resolved (Vertex lifecycle tables read). New: B-06, B-07, C4.

## Not done / waiting
- Owner runs plan-3 probe in Terminal (container has no GCP credentials).
- Owner's `docs/ledger-unification/01_introspect.sql` result (B-02) — legacy ledger code untouched.
- Merge of #288/#289 when CI green (approved), then prod health check.

## Tests executed
- #288: 1,910 Jest tests pass, tsc + eslint clean (local). #289: 4,492 pass; only ffmpeg ENOENT env failures.
- Phase 1 docs: no tests (docs only).

## Financial/security impact
No spend. Env change: `BROWSER_SNAPSHOT_ID` only. No DB, wallet or price change.

## Next session
- On D-11 approval: Phase 2 per `docs/architecture/v5.1/09` §3 — start with M-2 (Live → 3.8-live, deadline 2026-12-06).
- Remake snapshot by 2026-12-05.
