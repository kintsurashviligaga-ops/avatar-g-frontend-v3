# Video Core v1.0 — evidence folder (§13, levels T1–T6)

Every file here was produced by a command that ran, on the SHA it names. "ტესტი დაწერილია" ≠ "ტესტი გაეშვა": a file
that is not here was not measured. Branch `claude/video-core-v1-6gh97e` (draft PR #58 → main, no Vercel Preview).

| Level | Meaning here |
| --- | --- |
| T1 | pure unit test / probe, no media, no provider (mocked) |
| T2 | real ffmpeg on synthetic media, argv pinned, container probe only |
| T3 | real ffmpeg on synthetic media, **decoded frames counted** (`ffmpeg -progress pipe:1 … -f null -`, lib/video/frameCount) |
| T4–T6 | real provider / Preview / Production — **none run** in this task (Veo tests not authorized; no Preview; no Production) |

ffmpeg: `ffmpeg version 7.0.2-static https://johnvansickle.com/ffmpeg/` (node_modules/ffmpeg-static/ffmpeg, no ffprobe).
Node v22.22.0, Jest 30, 2 threads. Durations below are wall-clock on this sandbox.

## Files

| File | Level | SHA measured | Produced by |
| --- | --- | --- | --- |
| `ac01-intent-before.txt` | T1 | f2f3dae | `npx jest lib/agent/intent.videoCore.test.ts` BEFORE the routing fix (19 failed / 11 passed); the same file passes 30/30 from 36115f2 on |
| `phase0-probe.test.ts.txt` | T1 | 30be5a2 (main) | the PHASE 0 probe (ran once as `__tests__/videoCore.repro.test.ts`, removed from the tree; kept as text). Its findings are the defect register's BEFORE column |
| `t3-film-frame-counts.json` | T3 | 71a6ec7 tree (round 2; first measured a1f1ff4 + PHASE 3) | `VIDEO_CORE_FFMPEG_IT=1 VIDEO_CORE_EVIDENCE_OUT=<file> npx jest lib/orchestrator/ffmpeg-assembly.ffmpeg.test.ts` (6 passed, 320 s: cases a_29_7, b_24, c_refusal, d_single_cut, e_withheld, f_single_cut_gate) |
| `t3-ac06-one-chain.json` | T3 | 71a6ec7 tree (round 2) | `VIDEO_CORE_AC06_OUT=<file> npx jest lib/agent/media/videoCoreAc06.ffmpeg.test.ts` (1 passed, 56 s): AC-06 as one chain — montage (5 clips · music from 0:59 · 29.7 s · 9:16) → edit (Georgian end text, last 3 s), measured on the final file |
| `t3-montage-media-studio-e2e.json` | T3 | a1f1ff4 + PHASE 3 tree | `MEDIA_STUDIO_E2E_OUT=<file> npx jest lib/agent/media/mediaStudio.ffmpeg.test.ts` (E2E-22 / E2E-23) |
| `t3-montage-exec-e2e.json` | T3 | a1f1ff4 + PHASE 3 tree | `MONTAGE_E2E_OUT=<file> npx jest lib/agent/media/montageExec.ffmpeg.test.ts` ("three clips + 120 BPM") |
| `t3-montage-photo-e2e.json` | T3 | a1f1ff4 + PHASE 3 tree | `MONTAGE_PHOTO_OUT=<file> npx jest lib/agent/media/montageExec.ffmpeg.test.ts` (photos + clips) |
| `t3-sound-montage-s1-s5.json` | T3 | a1f1ff4 + PHASE 3 tree | `SOUND_MONTAGE_DIR=<dir> npx jest lib/agent/media/soundMontage.ffmpeg.test.ts` (S1–S5; the MP4s stayed outside the repo) |
| `phase3-measurements.md` | T2/T3 | a1f1ff4 + PHASE 3 tree | the BEFORE / AFTER numbers of the montage ±1-frame defect and of the first (wrong) fix |

"PHASE 3 tree" = the working tree committed right after this README (the commit that adds this file); the numbers were
re-measured on that tree before the commit.

## What the numbers say (§4, 30 fps timeline)

| Case | Requested | Native (provider / stitch) | Final | Decoded frames | Expected `framesFor(final)` |
| --- | --- | --- | --- | --- | --- |
| film, 4×8 s cuts | 29.7 s | 32 s | 29.7 s | **891** | 891 |
| film, 4×6 s cuts | 24 s | 24 s | 24 s | **720** | 720 |
| the same 4×6 s with NO contract (legacy) | — | 24 s | 30 s (brand pad, frozen tail) | 720 @ 24 fps | — (the freeze the contract removes) |
| film, 4×8 s with 1 s crossfades | 29.7 s | 29 s stitched | **refused** `longer_than_master` | nothing encoded, nothing hosted | — |
| single-clip cut (lib/video/finalCut) | 5 s of a 6 s clip | 6 s | 5 s | **150** | 150 |
| single-clip cut | 29.7 s of a 32 s clip | 32 s | 29.7 s | **891** | 891 |
| film, 4×8 s, the master's count forced to 890 (QC gate, §7/§8) | 29.7 s | 32 s | — | **withheld**: `MasterQaRejected` (`frame_count_mismatch`, grade F), nothing hosted | 891 |
| single-clip cut, the count forced to 149 (QC gate) | 5 s of a 6 s clip | 6 s | — | **withheld**: `FinalCutRejected`, nothing hosted (the unforced cut hosts 150) | 150 |
| **AC-06 chain**: 5 clips, music from **0:59** of a 130 s track, **29.7 s**, **9:16** (720×1280), Georgian end text in the last 3 s (montage → edit) | 29.7 s | — | 29.7 s | **891** after the montage and **891** after the edit; the 5 sources fill 6.5 / 6 / 6 / 6 / 5.2 s (195 / 180 / 180 / 180 / 156 frames) | 891 (music: the 0:59 marker is the first frame at −6.9 dB, silence at 0.42–0.46 s (−91 dB), the kick at 0.5 s; last second −21.3 dB; the text absent at 26.4 s (diff 1.33) and drawn at 29.4 s (diff 117.42) in the layer QC's box 98,938 524×86) |
| montage E2E-23: 70 s, music from 0:58 of a 130 s track | 70 s | — | 70 s | **2100** | 2100 (music source offset 58 s, timeline start 0) |
| montage E2E-23 on a 120 s track | 70 s | 62 s of music left | **refused** `music_too_short` | — | — |
| montage E2E-22: "მარტო ბოლო ხუთი" of 7 | 10 s | — | 10 s | 300; excluded clips contribute **0** frames | 300 |
| montage "three clips + 120 BPM" (mixed 30/25 fps sources) | 10 s | — | 10 s | **300** (was 301 before PHASE 3) | 300 |

Historical defects from GG's register, as measured: "29.7 → 7" does not reproduce on 30be5a2 (T1 probe);
"ერთწუთიანი / ოთხწუთიანი → undefined" reproduced (probe) and is fixed from f2f3dae (T1, 30/30);
"60 → 64, 29.7 → 32, 70 → 72" reproduced in `snapVideoSeconds` and is now said as Requested · Native · Final by the
contract (T1 + T3 above); "240 → 96" is **not** silently cut any more: 240 s is BLOCKED/long-form (T1), the long-form
order itself is not wired (`LONGFORM_ORDER_WIRED=false`).

## Not measured (honest gaps)

- No Veo / Vertex call was made (paid; not authorized). Every provider path is mocked: T1 only.
- No Preview, no Production: T4–T6 empty. The frame counts above are from the sandbox's ffmpeg-static, not a Vercel runtime.
- The film evidence test is opt-in (`VIDEO_CORE_FFMPEG_IT=1`) because of its ~5 min runtime; CI runs the montage suites
  (ungated, ~6 min) and the AC-06 chain (ungated, ~1 min) but not this one.

## Round 3 (2026-10-12) — real media pipeline verification (T3)

New file: `lib/orchestrator/videoCoreRound3.ffmpeg.test.ts` (opt-in, modelled on `ffmpeg-assembly.ffmpeg.test.ts`: same mocks,
synthetic lavfi clips, local "downloads", temp-dir "uploads", every flag off). Evidence: `t3-round3-film.json` (measured
numbers, the assembler's encode argv with temp paths redacted, the frame-count argv, the SHA). Exact command:

```
VIDEO_CORE_FFMPEG_IT=1 VIDEO_CORE_EVIDENCE_OUT=docs/handoffs/video-core/evidence/t3-round3-film.json \
  npx jest lib/orchestrator/videoCoreRound3.ffmpeg.test.ts --silent=false
```

8 passed, 658.8 s wall-clock (ffmpeg 7.0.2-static, Node v22.22.0, `-threads 2`), SHA measured **2361153** (HEAD when the run
started; `ffmpeg-assembly`, `finalCut`, `masterQa`, `frameCount` as committed there). Frames are DECODED frames
(lib/video/frameCount); duration · fps · W×H · audio are the `ffmpeg -i` banner (the assembler's own probe).

| Case | Input | Contract | Frames (expected) | Duration | fps | W×H | Audio | Hosted | QA |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `film60s` | 8 × 8 s, 24 fps, 640×360, sine, cuts | 60 s (native 64) | **1800** (1800) | 60.00 | 30 | 1920×1080 | yes | yes (12.5 MB, encode 184 s) | A / 100, no issues |
| `mixedFps24s` | 4 × 6 s at 24 · 25 · 30 · 60 fps (144 · 150 · 180 · 360 source frames) | 24 s | **720** (720) | 24.00 | 30 | 1920×1080 | yes | yes (5.7 MB) | A / 100 |
| `vertical9x16` | 4 × 8 s, 360×640 portrait, orientation `vertical` | 29.7 s (native 32) | **891** (891) | 29.70 | 30 | **1080×1920** (height > width) | yes | yes (4.6 MB) | A / 100 |
| `singleClipNative8s` (D7) as delivered | one 8 s clip, 24 fps | 8 s = native | **192** @ 24 fps (not on the 30 fps grid) | 8.00 | 24 | 640×360 | yes | the provider's file, untouched | — (no QC runs: no cut) |
| `singleClipNative8s` if conformed | the same clip through `cutMasterToLength(url, 8)` | 8 s | **240** (240) | 8.00 | 30 | 640×360 | yes | yes (`films/final-…-240f-…`, 0.55 s) | counted 240 = 240 |
| `clipWithoutAudio` | 4 × 8 s, clip 3 has **no audio stream**, no soundtrack | 29.7 s | **891** (891) | 29.70 | 30 | 1920×1080 | **yes** (clip 3's lane is `anullsrc`, index 2 in the graph) | **yes** (6.1 MB) | A / 100 — no `silent_master`, no `empty_master` |
| `invalidMusic` | 4 × 8 s + `musicUrl` → 64 KB of random bytes | 29.7 s | — (no encode) | — | — | — | — | **no** (0 uploads) | **none** — ffmpeg refused input #4 (`music.m4a`: "Invalid data found when processing input", exit 183) in 88 ms; a plain `Error("Command failed: …")`, not `MasterQaRejected` |
| `qcRejectThenRetry` attempt 1 | 4 × 8 s (320×180), the QC's count forced to 890 | 29.7 s | counted 890 (891) | — | — | — | — | **no** | **withheld**: `MasterQaRejected`, `qc_rejected`, `['frame_count_mismatch']`, grade F (88 s encode discarded) |
| `qcRejectThenRetry` attempt 2 | the SAME manifest, real counter | 29.7 s | **891** (891) | 29.70 | 30 | 1920×1080 | yes | **yes** (7.4 MB, 87 s) | A / 100 |
| `audioLevels` (informational) | `-af volumedetect -f null -` | — | film60s master: max **−11.2 dB** · mean −16.3 dB (after the graph's `loudnorm I=-14:TP=-1.5`); plain `sine` clip: max −16.1 · mean −21.1; `aevalsrc` sin at amplitude 1.0 + `volume=20dB`: max **0.0 dB** (clipped) · mean −3.6 | | | | | | |

What the round-3 numbers add to the table above: a 60 s contract is frame-exact (1800), four source frame rates land on one
30 fps timeline without a frame gained or lost (720), the portrait canvas keeps the count (891 at 1080×1920), and the
retry-after-rejection path works on the same input (withheld at 890, hosted at 891).

Findings (the product's behaviour, pinned as observed, nothing changed):

- **A clip with no audio stream does not fail the stitch** — `probeHasAudio` marks it, the filtergraph feeds `anullsrc` for its
  lane, and the master is hosted with sound from the other clips and 8 s of silence; QA grade A. Nothing says so on the
  QA report (there is no "silent clip" warning).
- **A garbage soundtrack is not validated before the encode.** The music file is downloaded unchecked (no probe, no content
  sniff) and handed straight to the one encode command; ffmpeg dies at input open in ~0.1 s, so nothing is wasted and
  nothing is hosted, but the failure is **not named**: `assembleWithFfmpeg` rejects with execFile's raw `Error` whose message
  is the full argv plus ffmpeg's stderr (temp paths included). It is not a `MasterQaRejected` and carries no `VIDEO_REFUSALS`
  code; the route's saga reports it as a generic `assembly_failed` (refunded once), so the user cannot tell "your music file
  is unreadable" from "the stitch crashed". **Fixed in round 3 (P1), after this run:** every audio lane is probed for an
  audio stream after the download and before the encode is built (`lib/orchestrator/soundtrackUnreadable.ts`); the case was
  re-run on the real ffmpeg on top of eb6e914 → `SoundtrackUnreadable` (`music_unreadable`, lane `music`) in 46 ms, 0 encode
  commands, 0 uploads: `t3-round3-invalid-music-fixed.json`. The route answers `422 music_unreadable` (defect register #21).
- **D7 measured**: the untouched 8 s clip is 192 frames at 24 fps; one more encode (`cutMasterToLength`) would make it 240
  frames at 30 fps in ~0.5 s. The decision stands as written (no conform, no new charge).
- **Test-only aside**: `next.config.js` sets `compiler.removeConsole: { exclude: ['error', 'warn'] }`, and next/jest applies it,
  so the assembler's `console.log('[assemble] …')` lines (native clip audio count, final cut, frame-exact QC) are compiled
  out of every Jest run — they cannot be captured or asserted on; only `console.warn` (`[masterQa] master FAILED …`) survives.

Still not measured: no Veo / Vertex call, no Preview, no Production (T4–T6 empty, as above).
