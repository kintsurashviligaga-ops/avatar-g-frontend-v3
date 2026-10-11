# Agent G Media Studio v2.0 — 03 E2E evidence

Tiers: T1 unit/mocked · T2 local browser · T3 real FFmpeg / isolated DB · T4 authenticated Preview · T5 real paid
provider · T6 Production after an authorised deploy. "Best tier" is the highest tier at which the scenario has been
seen passing; a lower tier is never reported as a higher one.

Re-run the T3 evidence of this phase:

```sh
MEDIA_STUDIO_E2E_OUT=/tmp/media-studio-e2e.json \
  node node_modules/.bin/jest lib/agent/media/mediaStudio.ffmpeg.test.ts lib/agent/media/editLive.ffmpeg.test.ts --ci --forceExit
```

## The 15 original scenarios (2026-10-11 Media Studio specification)

| # | Scenario | Best tier | State | Evidence |
|---|---|---|---|---|
| E2E-01 | Multi-source montage | T6 (admin) | PROVEN | Prod job 6efe92f3 (3 videos + MP3, QC 3/3, 12:07Z); `montageExec.ffmpeg.test.ts` |
| E2E-02 | Adding new sources („ეს ორიც დაუმატე") | — | MISSING | no add-to-existing; needs the revision store (01 §4) |
| E2E-03 | Last-seven-only selection | T3 | BUILT | `sourceSelect.test.ts` (9 pictures → 3–9), `montageExec.test.ts:321`, `mediaStudio.ffmpeg.test.ts` (0 frames from the excluded) |
| E2E-04 | Original music offset at 00:58 | T3 | BUILT (offset exact) | `mediaStudio.ffmpeg.test.ts`: marker at 0.00–0.40 s of the master; earlier T4 runs (music from 0:59) used the old beat-snapped start |
| E2E-05 | Music replacement at 00:32 | T3 (as a new montage) | PARTIAL | a new montage with the new track and `0:32-დან` works (`montageExec.test.ts:387` pattern); swap on a delivered montage MISSING |
| E2E-06 | Silent timeline followed by a track | — | MISSING | the montage requires a track; `audioTimelineStartMs` is always 0 |
| E2E-07 | Exact five-second extraction | T3 | BUILT | `editLive.ffmpeg.test.ts`: „პირველი 5 წამი დატოვე" → 150 frames at 30 fps; RU → 125 at 25 fps |
| E2E-08 | Protected packaging text | — | MISSING | no targeted image/video editing in the approved stack |
| E2E-09 | Refrigerator reference generation (Veo, 3 references) | T1 | BLOCKED_OWNER | reference upload path tested (`lib/veo/engine.test.ts:247`); a live Veo call needs a per-test budget |
| E2E-10 | iPhone playback | T4 | PROVEN for the montage master | GG's iPhone, Preview 11:04Z (job 196a64b1) |
| E2E-11 | Detecting omitted clips | T3, T4 | PROVEN | `montageExec.ffmpeg.test.ts` (dropped clip diff 52.65 → FAILED); Preview jobs with QC 3/3, 4/4 |
| E2E-12 | Temporal overlay cleanup | — | MISSING (UNSUPPORTED) | no approved temporal inpainting |
| E2E-13 | Cancellation | T3 | PROVEN | `montageExec.ffmpeg.test.ts` (conform ffmpeg killed < 1.5 s); red Stop PROVEN on iPhone T4 |
| E2E-14 | Veo not configured | T1 | BUILT | `lib/veo/engine.test.ts:312`, `:323` → `not_configured`, nothing sent |
| E2E-15 | Georgian Live Voice execution | T1 | BUILT_NOT_PROVEN | voice hand-off with files (`lib/voice/liveAttached.ts`), spoken yes (`lib/voice/spokenYes.test.ts`); never run by GG's voice on a deployed build |

## The added scenarios

| # | Scenario | Best tier | State | Evidence |
|---|---|---|---|---|
| E2E-16 | 29+ file batch | — | MISSING | chat 8 / montage 13 / 12 shots (00 §3); needs segmented ingestion + asset table + a longer worker |
| E2E-17 | Reload midway | T4 (same device) | PARTIAL | cards + files in `chat_messages.metadata` (`cardPersist.ts`); no server project/plan record |
| E2E-18 | Expired signed source link | T1 | PARTIAL | storage paths re-signed on read (`reSignIfInternal`); no asset ids |
| E2E-19 | Two concurrent revisions | — | MISSING | needs the revision store with CAS (01 §4) |
| E2E-20 | Two Start taps / retry | T1 | PROVEN T1 | `montageExec.test.ts:158`, `:287` (one job, one charge) |
| E2E-21 | Worker dies mid-render | T1, T3 (isolated Postgres) | PROVEN | `montageWorker.test.ts:264`, `:327`; cert §Z lease run |
| E2E-22 | Excluded source contributes zero frames | T3 | BUILT | `mediaStudio.ffmpeg.test.ts`: red 0, lime 0 of 300 frames; each kept 60 = 2.0 s × 30 as `qc.sources` says |
| E2E-23 | Offset beyond the track | T3 | BUILT | `mediaStudio.ffmpeg.test.ts`: 2:00 track, 0:58 + 70 s → `music_too_short` {fromSec 58, musicSec 62, targetSec 70}, 0 renders, 0 rows |
| E2E-24 | Model proposes an unauthorised provider | T1 | PROVEN T1 | `lib/agent/tools/registry.test.ts`, `lib/agent/run/runSpec.test.ts:33`, `__tests__/provider-boundary.test.ts` |
| E2E-25 | Voice and typed command on the same revision | T1 | PARTIAL | same server quote for both (01 §3); no revision ids |
| E2E-26 | Cross-account access | T1; T6 anonymous | PROVEN T1 | `montageExec.test.ts:38`, `:224`; `app/api/upload/verify/route.test.ts:45`; unauthenticated probe of 458 routes (cert §Z) |
| E2E-27 | Stop then Resume | T1 | PARTIAL | runs resume reusing delivered steps (`lib/agent/run/runEngine.test.ts`); a single montage restarts as a new quote |
| E2E-28 | Long render, tab closed | T1 | PROVEN T1 | `montageWorker.test.ts:350` (the sweep renders the waiting job) |
| E2E-29 | Malformed / disguised upload | T1 | PROVEN T1 | `app/api/upload/verify/route.test.ts:74`, `:82`, `:89` (422 / 413, object removed) |
| E2E-30 | Text/logo cleanup fails visual QC | — | MISSING for source pixels | cleaning what is printed in the source does not exist and is refused (`remove_from_source`), so nothing can report false success; removing a layer of ours is QC'd against the source (TX-04, below) |

## Numbers measured in this phase (T3, real bundled ffmpeg, this container)

- E2E-22: master 300 frames; per colour: red 0, lime 0, blue 60, yellow 60, magenta 60, cyan 60, white 60;
  `qc.sources` = 2.0 s each; QC `PASS`.
- E2E-23 (130 s track): 2100 frames, `durationSec` 70; audio 20 ms windows: 0.00–0.38 s at −6.9/−7.0 dBFS,
  0.40 s −50.3, 0.42–0.46 s −91, 0.50 s the kick; last second still sounding; QC `PASS`,
  `audio` = {sourceStartSec 58, timelineStartSec 0, targetSec 70, endPolicy stop, sourceAudio remove}.
- E2E-23 (120 s track): refused at the quote, no render, no job row.
- 5 s trims: 150 / 150 / 125 frames; output length within 0.05 s of 5.

## v2.1: captions, typography, overlays (E2E-TX-01…10)

All ten pass at T3 on real bundled ffmpeg with synthetic fixtures, plus reload, missing glyphs, long Georgian text,
masks, cancel and the phone container. The measured numbers, the re-run command and what each check means are in
`07-V21-COMPOSITION.md` §5; the machine-readable record and a contact sheet per scenario are in `evidence-v21/`
(`evidence.json`, `tx02.srt`, `tx02.vtt`, `tx01…tx10*.jpg`). T4 (GG on the Preview) and iPhone/Safari playback: not run.
