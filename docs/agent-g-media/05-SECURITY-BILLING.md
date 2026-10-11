# Agent G Media Studio v2.0 — 05 Security and billing

## What this phase changed

| Area | Change | Effect |
|---|---|---|
| Providers | none | Montage and edit run on FFmpeg only; no model call, no new provider, no fallback |
| Credits | none | Montage and edit stay free (`MONTAGE_PRICE_CREDITS = 0`, `EDIT_PRICE_CREDITS = 0`); the pricing table is unchanged |
| Database | none | no migration; no Production data read or written by this phase |
| Flags | none | `AGENT_G_MEDIA_EXEC` stays `admin` on Preview and Production; nothing switched |
| Secrets | none | |

## Invariants that still hold (re-tested)

- **Owner-only files**: every file reference is resolved through `resolveFile` / `lib/security/callerMedia`
  before probing; another user's file is refused and named (`montageExec.test.ts:38`).
- **Excluded files never reach the worker**: a selection removes the files from the signed request; a request edited
  to put one back fails the signature (`montageExec.test.ts:321`, the tampered enqueue).
- **Signed plan is immutable**: the worker re-verifies the token, the manifest and coverage before rendering.
- **One job per quote, one charge**: unchanged (`montageExec.test.ts:158`, `:287`).
- **Refusals spend nothing**: every new refusal (`footage_too_short`, `target_too_long`, `music_too_short` with a
  target, `selection_invalid`) happens at the quote, before any job row, reservation or render
  (`mediaStudio.ffmpeg.test.ts`: 0 renders, 0 rows).
- **Approval only from the person**: unchanged; a re-plan after delivery is a new quote card with its own Start.

## Gated (owner approval required, not done)

| Item | Why it needs GG |
|---|---|
| Merge to `main`, Preview → Production deploy | Production change |
| `media_revisions` table (01 §4) | migration on the shared Production database |
| 29+ file batches on a longer-running worker | paid worker host / infra |
| Veo reference generation tests (E2E-09) | paid model calls need a per-test budget |
| Temporal caption/logo removal | no approved provider; adding one changes the provider allowlist |
| Turning `MEDIA_GOOGLE_ONLY` on | owner's action 9 (Replicate + HeyGen are still used elsewhere) |
