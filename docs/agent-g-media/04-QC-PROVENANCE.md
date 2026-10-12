# Agent G Media Studio v2.0 — 04 QC and provenance

v2.1 adds a second record for edits with layers or captions, `generation_jobs.result.layerQc`, measured on the
rendered file: thresholds and checks in 07 §4 (`lib/agent/media/layerQc.ts`). A FAIL there fails the job.

Every montage job writes its QC record into `generation_jobs.result.qc` before it may complete
(`lib/agent/media/montageWorker.ts`). A job whose QC fails is FAILED with the record kept; it is never delivered.

## The record

| Field | Meaning | Source |
|---|---|---|
| `outcome` | `PASS` or `FAIL` (`PARTIAL` / `UNVERIFIED` are reserved; montage QC is all machine checks) | `montageWorker.ts:194` |
| `ok`, `problems` | the checks that failed, in words | `qcMaster`, `qcAvSync`, `qcClips` |
| `durationSec`, codecs | the probed master (H.264 / AAC MP4) | `probeMedia` |
| `av` | video and audio stream lengths; they must agree within 0.25 s | `qcAvSync` |
| `clips[]` | per picture: index, name, frame diff, planned moment `srcT`, matched moment `matchT` | `qcClips`; limit 12, half-frame search ±50 ms |
| `files`, `videos`, `stills` | counts of the signed manifest | |
| `sources[]` | **source-contribution manifest**: per picture, every window of it in the master (`outStartSec–outEndSec` ← `srcStartSec–srcEndSec`), shot count and total seconds | `sourceContribution()`, `montageAsk.ts:323`, built from the same shots the lane renders |
| `audio` | the two clocks: `sourceStartSec` (offset into the track), `timelineStartSec` (0), `targetSec`, `endPolicy: stop`, `sourceAudio`, `replacementAudio` | `audioTiming()`, `montageAsk.ts:340` |

Excluded pictures are absent from `sources` because they are absent from the signed request; the worker refuses a
request whose manifest is not the signed one.

## Measured on real ffmpeg (T3)

- `sources` matches the master frame by frame: five kept clips × 2.0 s each = 60 frames each of 300; the two
  excluded clips: 0 frames (`mediaStudio.ffmpeg.test.ts`, E2E-22).
- `audio.sourceStartSec = 58` matches the master's sound: the track's 0:58.0–0:58.4 marker occupies the master's
  0.00–0.40 s (20 ms windows at about −7 dBFS, then −50 / −91 dBFS), the next kick at 0.50 s (E2E-23).
- 70 s asked → 2100 decoded frames at 30 fps; audio stream 70 s ± 0.1.

## Not covered (stated, not claimed)

- No visual review step; nothing is labelled `NEEDS_VISUAL_REVIEW` yet.
- Black-frame, clipping and silence detection inside the master: not measured.
- The edit lane (`editPlan.qcEdit`) checks codec, size and length; it does not write `sources` / `audio` (one source).
