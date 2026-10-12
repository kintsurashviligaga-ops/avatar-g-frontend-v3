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

## v2.1 (captions, typography, overlays)

- No provider, price, flag, secret or migration change: text is drawn with the bundled FiraGO (resvg), laid over with
  ffmpeg-static; edits stay free (`EDIT_PRICE_CREDITS = 0`).
- A logo is the caller's own file: checked at the quote and again by the worker before ffmpeg reads it
  (`media_not_yours` / `layer_picture`). By voice the model names an attached file by number; a link is refused
  (strict shapes in `bindLiveAgent.ts`).
- Tool calls and run steps are rebuilt from plain data only (`editAskOf`: bounded arrays and objects, no prototype
  keys); a caption track from a caller is only ever the user's own lines (`typed` / `file`), never a „transcript".
- A revision reads the parent job only when it is the caller's own completed edit; another user's job id is ignored.
- What cannot be done is refused before anything runs: speech captions and translation (paid, owner's decision),
  removal of what is printed in the source, characters the fonts cannot draw.

## Gated (owner approval required, not done)

| Item | Why it needs GG |
|---|---|
| Merge to `main`, Preview → Production deploy | Production change |
| `media_revisions` table (01 §4) | migration on the shared Production database |
| 29+ file batches on a longer-running worker | paid worker host / infra |
| Veo reference generation tests (E2E-09) | paid model calls need a per-test budget |
| Temporal caption/logo removal | no approved provider; adding one changes the provider allowlist |
| Turning `MEDIA_GOOGLE_ONLY` on | owner's action 9 (Replicate + HeyGen are still used elsewhere) |
| Captions of speech (ElevenLabs Scribe) and caption translation (Gemini) | paid calls; a per-use budget and GG's word |
