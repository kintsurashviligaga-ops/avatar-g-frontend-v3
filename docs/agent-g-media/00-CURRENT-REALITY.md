# Agent G Media Studio v2.0 — 00 Current reality

Branch `claude/agent-g-media-studio-v2-ekxxzp`, from `main` = 5481987 (PR #56, the code Production serves since
2026-10-11 13:01Z). Draft PR against `main`; nothing merged, deployed, migrated or switched.

Labels: **FACT** (read from code or data), **BUILT** (code + tests, not run by a person on a deployed build),
**PROVEN [tier]** (seen working at that tier), **PARTIAL**, **MISSING**, **BLOCKED_OWNER**.
Tiers (spec §7): T1 unit/mocked · T2 local browser · T3 real FFmpeg / isolated DB · T4 authenticated Preview ·
T5 real paid provider · T6 Production after an authorised deploy.

## 1. What existed before this phase (reused, not rebuilt)

| Area | State | Evidence |
|---|---|---|
| Upload on select, stored-bytes check, per-file state + Retry | PROVEN T4 (GG's iPhone, Preview 11:04Z) | `components/studio/OmniStudio.tsx:2807`, `app/api/upload/verify/route.ts`, `lib/uploads/sniff.ts` |
| Upload size cap 50 MB per file | FACT | `OmniStudio.tsx:11471`; bucket cap migration 20261008c |
| Montage: quote → signed token → lease queue → worker → QC → deliver | PROVEN T6 (admin, Prod job 6efe92f3, 12:07Z) | `lib/agent/media/montageExec.ts`, `montageWorker.ts`, `lib/orchestrator/jobLease.ts` |
| Signed manifest: every picture has ≥ 1 shot or the quote is refused | PROVEN T3 | `lib/agent/media/montageManifest.ts:151` (`checkCoverage`) |
| Per-clip QC: each clip seen at its place in the master (diff ≤ 12) | PROVEN T3, T4 | `lib/agent/media/montageAsk.ts:204`; a dropped clip reads 52.65 (`montageExec.ffmpeg.test.ts`) |
| Photos among clips (one still shot each) | PROVEN T4 (job 252fe0ee) | report §17 of `docs/handoffs/agent-g-repair/final-report-ka.md` |
| Cancel kills the running ffmpeg; refund once | PROVEN T3 | `montageExec.ffmpeg.test.ts` (cancel test), `montageWorker.test.ts` |
| Double Start / retry → one job, one charge | PROVEN T1 | `montageExec.test.ts:158`, `:287` |
| Worker dies → lease recovery, fenced writes | PROVEN T1, T3 (isolated Postgres, cert §Z) | `montageWorker.test.ts:264`, `:327` |
| Tab closed → the sweep renders the waiting job | PROVEN T1 | `montageWorker.test.ts:350`, `app/api/agent/media/sweep/route.ts` |
| Owner-only jobs and files | PROVEN T1; T6 anonymous probe | `montageExec.test.ts:224`, `lib/security/callerMedia` |
| Edit of one video (trim, speed, aspect, grade, fades, volume/mute, caption, still) | PROVEN T3 | `lib/agent/media/editPlan.ts`, `editLive.ffmpeg.test.ts` |
| Re-plan a delivered montage („მუსიკა 5 წამიდან") | BUILT | `lib/agent/chatTurn.ts:231` |
| Cards survive reload / other device (chat_messages.metadata) | PARTIAL: same device PROVEN T4; other device BUILT | `lib/agent/media/cardPersist.ts` |
| Live Voice sees attached files, hands them to Agent G | BUILT | repair report rows 3, 16–19 |
| Veo through Vertex (WIF), V1–V6 director layer | INFERENCE VERIFIED on Preview; director behind `VIDEO_DIRECTOR_RUNS` (Preview admin) | `lib/veo/*`, memory `gcp-part0-state` |
| Montage is free | FACT | `lib/agent/media/montageExec.ts:64` (`MONTAGE_PRICE_CREDITS = 0`) |
| Flag | FACT | `AGENT_G_MEDIA_EXEC=admin` on Preview and Production (`lib/agent/media/access.ts:15`) |

## 2. Defects found in this phase (real, fixed here)

| # | Defect | Effect on the user | Fix |
|---|---|---|---|
| D1 | An asked length was silently shortened to the music, the footage or 300 s | „70 წამი" could deliver less with no word | `lib/services/montage/beatPlan.ts:365`: an asked length is binding; refusals `music_too_short` (with `targetSec`), `footage_too_short`, `target_too_long` |
| D2 | The user's music offset was moved to the next beat | „0:58-დან" started at 0:58.x | `beatPlan.ts:315`: offset kept exactly; the first shot carries the lead-in to the beat (`leadInSec`, `:319`) |
| D3 | „58-ე წამიდან" (ordinal) was not read as a start | GG's own sentence lost the offset | `lib/agent/params.ts:36` |
| D4 | No source selection at all | „მარტო ბოლო შვიდი" used every clip | `lib/agent/media/sourceSelect.ts:218` + quote `montageExec.ts:315` |
| D5 | A refusal after a selection would name files by their position in the subset | wrong file numbers in the error | `montageExec.ts:339` (`asSent`) |

## 3. Limits, reconciled (spec §A)

| Layer | Limit | Where | Note |
|---|---|---|---|
| Chat attachments per message | 8 | `components/studio/OmniStudio.tsx:1171` | 7 clips + 1 track per message |
| Montage files per quote | 13 (12 clips + 1 track) | `lib/agent/media/montageAsk.ts:14-15` | a clip is used at least once |
| Shots per edit | 12 | `lib/services/montage/montagePlan.ts:75` | |
| Edit length | 300 s; shot 0.4–60 s | `montagePlan.ts:84-88` | now refused by name, never cut (D1) |
| Upload | 50 MB per file | `OmniStudio.tsx:11471`, bucket cap 20261008c | |
| Route / worker budget | 600 s | `app/api/agent/media/montage/route.ts:46`, `sweep/route.ts:41` | one montage per invocation |

The chat cap (8) is lower than the montage cap (13): a 9–12-clip montage cannot be sent in one message today.
**29+ file batches (E2E-16): MISSING.** It needs segmented ingestion and a durable asset table (§4), plus a worker that
is not bounded by one 600 s function; both are owner decisions (migration, paid worker host).

## 4. Not built (honest list)

| Spec area | State | Why / what it needs |
|---|---|---|
| B. Durable media project, revisions, CAS between concurrent revisions, compare/restore | MISSING | No table exists; a migration on the shared Production database is GG's decision. Contract proposed in `01-CANONICAL-CONTRACTS.md` §4 |
| A. Asset record (assetId, content hash, verification status) | PARTIAL | Files are storage paths verified on upload; no asset table (same migration) |
| „ეს ორიც დაამატე" (add files to a delivered montage) | MISSING | The re-plan reuses the same files; new files mean a new montage |
| Music replacement on a delivered montage (E2E-05) | PARTIAL | A new montage with the new track works; swap-in-place does not exist |
| Silent export, „ჯერ ვიდეო უხმოდ" (E2E-06) | MISSING | Agent G's montage always needs one track (`montageExec.ts`, `no_track`); QC requires sound |
| Keep source audio on chosen clips | MISSING in the chat; the lane supports it | `montageAsk.ts:98` always `musicOnly: true`; `montagePipeline` has per-shot `muted` + `under` |
| Audio timeline start ≠ 0 | MISSING | the track always starts on the master's first frame (`audioTiming().timelineStartSec = 0`) |
| E. Caption / logo removal over time | MISSING (UNSUPPORTED) | No approved temporal inpainting provider; Replicate inpaint is refused under Google-only (`lib/providers/mediaPolicy.ts:68`) |
| F. Branded image editing (SiRniKi) | MISSING | Imagen 4 is 404 on Vertex; image engine choice is GG's action 6 |
| G. Veo reference flow (refrigerator, 3 roles) | BLOCKED_OWNER | Paid Veo calls need a per-test budget; durations snap to the model's supported values (`lib/veo/engine.test.ts:274`) |
| I. Live Voice parity for selection / offset | BUILT, not run by voice | the quote reads the words server-side for both (`lib/agent/react/bindLiveAgent.ts:252`); voice depends on the Live model passing the user's words on |
| Visual review (`NEEDS_VISUAL_REVIEW`) | MISSING as an outcome; QC is all machine checks | |
