# 10 — Rollback plan

Rollback rows live in `docs/master-v3.1/MIGRATION_ROLLBACK.md` (rows 113, 114 added by #288/#289). This file defines
the rule per step type and the rollback for every step in `09`.

## 1. Rules

1. Every behaviour change ships with a switch that restores the old path without a deploy where possible (env var or
   flag), or with a one-commit revert otherwise.
2. Schema changes are additive first (new table/column, dual-read), destructive only in a later PR after a soak.
3. Money changes never roll back by editing balances. A wrong charge is corrected by a refund row with its own `ref`.
4. Vercel instant rollback (promote previous production deployment) is the first move for any prod incident; it does
   **not** roll back env vars or DB.
5. A rollback is "done" when prod health is 6/6 and the failing scenario passes again.

## 2. Per step

| Step | Rollback | Time | Data risk |
|---|---|---|---|
| M-0a read-aloud 3.8 TTS | set `GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts` (works only until 2026-11-17 on Developer API; on Vertex unknown) or revert #288 | minutes | none |
| M-0b 3.6 Flash removal | revert #289 (only until 2026-11-19; after that 3.6 is gone, rollback = previous chain without 3.6) | minutes | none |
| M-0c snapshot | previous snapshot id, if not expired | minutes | none |
| M-1 registry | flag `CAPABILITY_REGISTRY=off` → engine ignores registry; CI guard can be skipped by env only with GG OK | minutes | none (read-only tables) |
| M-2 Live 3.8 | relay `LIVE_RELAY_MODELS` env back to previous list (until 2026-12-13) / previous Cloud Run revision | minutes | none |
| M-3 Omni 1.2 | env model id back to `gemini-omni-1.1-flash-preview` while it is served | minutes | clips made on 1.2 cannot be continued on 1.1 |
| M-4 VALIDATE | flag off → old path (no pre-check) | minutes | none |
| M-5 price book | flag off → current `pricingConfig`; `price_versions` stays (additive) | minutes | quotes in flight honoured at their version |
| M-6 staging | point Previews back to prod DB (current state) | minutes | none |
| M-7 approvals | flag off → per-feature approvals (current) | minutes | approval rows kept for audit |
| M-8 parallel | `RUN_WORKERS=1` → sequential | minutes | none |
| M-9 reconcile | stop the cron | minutes | none (read-only) |
| M-10 legacy ledger | keep `credits` table read-only until soak ends; re-point callers by revert | hour | refunds by `ref` if any double charge |
| M-11 BOG | `BOG_CHECKOUT_MODE=admin` (current) | minutes | orders reconciled by cron |
| M-12 Gemini 4 | registry `audience=none` for Carbon/Argon bindings | minutes | none |
| M-13 Computer Use | flag off | minutes | none |
| M-14 prune | revert | minutes | none |

## 3. Incident order

1. Vercel instant rollback of production. 2. Flip the step's switch. 3. Health check + failing scenario.
4. Note in `docs/execution/BLOCKERS.md` with time, cause, evidence. 5. Tell GG.
