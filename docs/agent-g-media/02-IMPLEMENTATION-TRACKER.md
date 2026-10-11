# Agent G Media Studio v2.0 — 02 Implementation tracker

Branch `claude/agent-g-media-studio-v2-ekxxzp` from `main` 5481987. Phases follow spec §8; P0 correctness first.

| Phase | Item | State | Commit | Tier |
|---|---|---|---|---|
| 0 | Repository audit, limits reconciled, defects listed | DONE | docs (this set) | FACT |
| 1 | Asset records, batch ingestion, durable project | MISSING / BLOCKED_OWNER | — | needs a migration (01 §4) and a worker host |
| 2 | An asked length is binding (refused by name, never shortened) | DONE | 7c08947 | T3 |
| 2 | Music offset kept exactly; lead-in to the first beat | DONE | 7c08947 | T3 |
| 2 | „58-ე წამიდან" read as a start | DONE | 7c08947 | T1 |
| 2 | Source selection in words (KA/EN/RU), on a waiting plan | DONE | 7c08947 | T3 |
| 2 | Source selection on a delivered montage (re-plan) | DONE | deed8ed | T1 |
| 2 | Refusal numbers name files as sent | DONE | 7c08947 | T1 |
| 2 | 5 s trim = 150 frames at 30 fps | VERIFIED (no code change needed) | deed8ed (test) | T3 |
| 2 | Revisions with CAS, compare / restore | MISSING | — | BLOCKED_OWNER (migration) |
| 3 | QC outcome word + source-contribution manifest + audio clocks | DONE | 6acc865 | T3 |
| 3 | Keep the clips' own sound on chosen clips | MISSING | — | lane supports it; chat wiring + QC for mixed audio needed |
| 3 | Silent export / track starting later on the timeline | MISSING | — | |
| 3 | Motion-aware matching, colour balance, selective speed | MISSING | — | |
| 4 | Targeted caption/logo removal, branded image editing | MISSING (UNSUPPORTED) | — | no approved provider |
| 5 | Veo reference flow | BLOCKED_OWNER | — | paid tests need a budget |
| 6 | Live Voice parity | PARTIAL | — | same server quote; not run by voice |
| 7 | Release certification | NOT STARTED | — | needs GG's Preview run (06 §3) |

## Files changed in this phase

- `lib/services/montage/beatPlan.ts` (+ test): binding length, exact offset, `leadInSec`, new refusal kinds.
- `lib/agent/media/sourceSelect.ts` (+ test): new; words → selection.
- `lib/agent/media/montageExec.ts` (+ test): selection at the quote, refusal mapping, numbers as sent.
- `lib/agent/media/montageChat.ts`: refusal and quote texts (KA/EN/RU) for the new cases and the left-out line.
- `lib/agent/media/montageAsk.ts`, `montageWorker.ts` (+ tests): QC `outcome`, `sources`, `audio`.
- `lib/agent/params.ts`, `lib/agent/intent.ts`, `lib/agent/chatTurn.ts` (+ tests): ordinal start, selection routing.
- `lib/agent/media/mediaStudio.ffmpeg.test.ts` (new), `editLive.ffmpeg.test.ts`: real-ffmpeg evidence.
- `docs/agent-g-media/00–06`, `PROJECT_MASTER.md` State Tracker.

## Continuation point

1. GG's Preview run of the three commands in 06 §3 (T4). 2. GG's decision on the revision table (01 §4).
3. Then: add-files-to-a-delivered-montage and per-clip source sound on top of the revision store.
