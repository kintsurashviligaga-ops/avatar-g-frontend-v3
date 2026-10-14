# Video Core v1.0 — FFmpeg pipeline evidence (round 3, PHASE 4)

Everything here ran on the **real ffmpeg** in this sandbox (ffmpeg 7.0.2-static, Node v22.22.0, `-threads 2`) with synthetic
lavfi clips, local "downloads" and temp-dir "uploads"; every provider and flag mocked or off. Level **T3**. Frames are
**decoded** frames (`lib/video/frameCount`), never a header estimate; duration · fps · W×H · audio are the assembler's own
`ffmpeg -i` banner probe. Raw numbers, the encode argv (temp paths redacted) and the SHA each run measured are in
`evidence/*.json`; the narrative with the BEFORE numbers is `evidence/README.md`.

## 1. Exact commands (each re-runnable; all opt-in or ungated as marked)

| Run | Command | Suite result · wall-clock | SHA measured | Output |
| --- | --- | --- | --- | --- |
| Round-3 film pipeline (60 s, mixed fps, 9:16, no-audio clip, invalid music, QC reject → retry, audio levels) | `VIDEO_CORE_FFMPEG_IT=1 VIDEO_CORE_EVIDENCE_OUT=docs/handoffs/video-core/evidence/t3-round3-film.json npx jest lib/orchestrator/videoCoreRound3.ffmpeg.test.ts --silent=false` | 8 passed · 658.8 s | 2361153 | `evidence/t3-round3-film.json` |
| Invalid music, **after the fix** (P1) | `VIDEO_CORE_FFMPEG_IT=1 VIDEO_CORE_EVIDENCE_OUT=docs/handoffs/video-core/evidence/t3-round3-invalid-music-fixed.json npx jest lib/orchestrator/videoCoreRound3.ffmpeg.test.ts -t 'invalid' --silent=false` | 1 passed (7 skipped by `-t`) · 46 ms for the refusal | eb6e914 | `evidence/t3-round3-invalid-music-fixed.json` |
| Film frame counts (29.7 s, 24 s, crossfade refusal, single cut, QC gate) | `VIDEO_CORE_FFMPEG_IT=1 VIDEO_CORE_EVIDENCE_OUT=<file> npx jest lib/orchestrator/ffmpeg-assembly.ffmpeg.test.ts` | 6 passed · 320 s | 71a6ec7 tree (round 2) | `evidence/t3-film-frame-counts.json` |
| AC-06 as one chain (montage → edit) | `VIDEO_CORE_AC06_OUT=<file> npx jest lib/agent/media/videoCoreAc06.ffmpeg.test.ts` | 1 passed · 56 s | 71a6ec7 tree | `evidence/t3-ac06-one-chain.json` |
| Montage E2E (three clips + 120 BPM; photos + clips) | `MONTAGE_E2E_OUT=<file> npx jest lib/agent/media/montageExec.ffmpeg.test.ts` · `MONTAGE_PHOTO_OUT=<file> …` | green (ungated in CI) | PHASE 3 tree | `evidence/t3-montage-exec-e2e.json`, `t3-montage-photo-e2e.json` |
| Media Studio E2E-22 / E2E-23 | `MEDIA_STUDIO_E2E_OUT=<file> npx jest lib/agent/media/mediaStudio.ffmpeg.test.ts` | green | PHASE 3 tree | `evidence/t3-montage-media-studio-e2e.json` |
| Sound of a montage S1–S5 | `SOUND_MONTAGE_DIR=<dir> npx jest lib/agent/media/soundMontage.ffmpeg.test.ts` | green | PHASE 3 tree | `evidence/t3-sound-montage-s1-s5.json` |
| The seven PR #57 real-ffmpeg suites (composition, transitions, effects, erase, editLive, audioLive, ownerMontage) | `npx jest lib/agent/media --testPathPattern ffmpeg` | 46/46 on this tree (round 2) | 71a6ec7 tree | CI logs |
| Speed edits, A/V sync, output integrity (round-3 final) | `VIDEO_CORE_SPEED_OUT=docs/handoffs/video-core/evidence/round3-final/t3-speed-sync-integrity.json npx jest lib/agent/media/videoCoreSpeedSync.ffmpeg.test.ts` | green | 357926b | `evidence/round3-final/t3-speed-sync-integrity.json` |

CI (`ci.yml` "verify") runs the ungated montage suites and the AC-06 chain on every push; the two `VIDEO_CORE_FFMPEG_IT` film
suites are opt-in because of their 5–11 min runtime and were run by hand as above.

## 2. What was measured (round 3 additions, then rounds 1–2)

| Case | Input | Contract | Decoded frames (expected) | Duration · fps · W×H | Audio | Hosted | QA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `film60s` | 8 × 8 s, 24 fps, 640×360, sine, cuts | 60 s (native 64) | **1800** (1800) | 60.00 · 30 · 1920×1080 | yes | yes (12.5 MB, encode 184 s) | A / 100 |
| `mixedFps24s` | 4 × 6 s at 24 · 25 · 30 · 60 fps (144 · 150 · 180 · 360 source frames) | 24 s | **720** (720) | 24.00 · 30 · 1920×1080 | yes | yes (5.7 MB) | A / 100 |
| `vertical9x16` | 4 × 8 s, 360×640 portrait, `vertical` | 29.7 s (native 32) | **891** (891) | 29.70 · 30 · **1080×1920** | yes | yes (4.6 MB) | A / 100 |
| `singleClipNative8s` (D7) as delivered | one 8 s clip, 24 fps | 8 s = native | **192 @ 24 fps** (not on the 30 fps grid) | 8.00 · 24 · 640×360 | yes | the provider's file untouched | no QC (no cut) |
| the same if conformed | `cutMasterToLength(url, 8)` | 8 s | **240** (240) | 8.00 · 30 · 640×360 | yes | yes (0.55 s) | counted 240 = 240 |
| `clipWithoutAudio` | 4 × 8 s, clip 3 has no audio stream, no soundtrack | 29.7 s | **891** (891) | 29.70 · 30 · 1920×1080 | yes (clip 3's lane = `anullsrc`) | yes (6.1 MB) | A / 100 — no "silent clip" warning (observed, by design) |
| `invalidMusic` BEFORE | 4 × 8 s + 64 KB of random bytes as `musicUrl` | 29.7 s | — | — | — | **no** (0 uploads) | ffmpeg refused input #4 in 88 ms; a raw `Error`, reported as generic `assembly_failed` |
| `invalidMusic` AFTER (eb6e914 + P1 fix) | same | 29.7 s | — (0 encode commands) | — | — | **no** | `SoundtrackUnreadable` (`music_unreadable`, lane `music`) in 46 ms → route `422 music_unreadable`, refunded once |
| `qcRejectThenRetry` attempt 1 | 4 × 8 s (320×180), the QC's count forced to 890 | 29.7 s | counted 890 (891) | — | — | **no** | **withheld**: `MasterQaRejected`, `qc_rejected`, `frame_count_mismatch`, grade F (88 s encode discarded) |
| `qcRejectThenRetry` attempt 2 | the same manifest, real counter | 29.7 s | **891** (891) | 29.70 · 30 · 1920×1080 | yes | yes (7.4 MB, 87 s) | A / 100 |
| `audioLevels` | `-af volumedetect -f null -` | — | film60s master: max **−11.2 dB** · mean −16.3 dB after `loudnorm I=-14:TP=-1.5`; a raw clipped source reads 0.0 dB | | | | informational |
| film 4 × 8 s cuts (round 2) | | 29.7 s | **891** (891) | 29.7 · 30 | yes | yes (encode 90 s) | A / 100 |
| film 4 × 6 s (round 2) | | 24 s | **720** (720) | 24 · 30 | yes | yes | A |
| the same 4 × 6 s with NO contract (legacy pad, D6) | | — | 720 @ 24 fps, 30 s with a frozen tail | 30 · 24 | | yes | the behaviour the contract removes; reached only by an unknown client |
| film 4 × 8 s with 1 s crossfades | | 29.7 s | **refused** `longer_than_master` (29 s stitched) | — | — | **no** | — |
| single-clip cut 5 s of 6 s · 29.7 s of 32 s | `lib/video/finalCut` | | **150** (150) · **891** (891) | | | yes | counted = expected |
| single-clip cut, count forced to 149 | | 5 s | **withheld** `FinalCutRejected`, nothing hosted | | | **no** | |
| **AC-06 chain** (round 2): 5 clips, music from **0:59** of a 130 s track, 29.7 s, **9:16** 720×1280, Georgian end text last 3 s | montage → edit | 29.7 s | **891** after the montage, **891** after the edit; sources 6.5 / 6 / 6 / 6 / 5.2 s = 195 / 180 / 180 / 180 / 156 frames | 29.7 · 30 · 720×1280 | source audio removed, track from 59 s, timeline start 0, stops with the picture (`avAudioSec` 29.698) | yes | the 0:59 marker is the first frame at −6.9 dB; last second −21.3 dB; the CTA box 98,938 524×86 absent at 26.4 s, drawn at 29.4 s |
| montage E2E-23: 70 s, music from 0:58 of 130 s | | 70 s | **2100** (2100) | | | yes | |
| montage E2E-23 on a 120 s track | | 70 s | **refused** `music_too_short` (62 s left) | | | **no** | |
| montage E2E-22: „მარტო ბოლო ხუთი“ of 7 | | 10 s | 300; the excluded clips contribute **0** frames (`qc.sources`) | | | yes | |
| montage "three clips + 120 BPM" (30/25 fps sources) | | 10 s | **300** (was 301 before PHASE 3) | 10 · 30 · 1280×720 | yes | yes | maxDiff 12 |
| sound S1–S5 | no music / photos / own + music / narration / photos + narration | | masters 6.87 · 9 · 6.87 · 6.87 · 12 s | | own sound kept at level, track −10 dB beneath, narration on top | yes | |

### Round-3 final additions (2026-10-12, 357926b): speed, A/V sync, integrity

A marker clip (white frame + 1 kHz beep at exactly 2.000 s) makes A/V sync measurable: the flash is found on decoded frames,
the beep onset on a 5 ms RMS envelope, and the offset is judged by ITU-R BT.1359 (sound may lead by < 45 ms or lag by < 125 ms).
Integrity = `ffmpeg -v error -xerror -i <file> -f null -` exit code plus a decoded-frame count against the 30 fps grid.

| Case | Planned | Container · decoded frames | Flash · beep | A/V offset | Integrity |
| --- | --- | --- | --- | --- | --- |
| source, 30 fps | 6 s | 6.00 s · **180** | 2.000 · 2.000 | 0 ms | exit 0 |
| speed 2× **BEFORE** the fix | 3 s | 3.04 s · **76** (25 fps) | 1.040 · — | −51.6 ms (sound early, outside BT.1359) | exit 0 |
| speed 2× AFTER (`setpts=0.5000*PTS,fps=30`) | 3 s | 3.01 s · **90** | 1.000 · 0.990 | −10 ms | exit 0 |
| speed 0.5× BEFORE | 8 s | 7.97 s · **199** (25 fps) | — | — | exit 0 |
| speed 0.5× AFTER | 8 s | 8.00 s · **240** | 4.000 · 3.965 | −35 ms | exit 0 |
| 24 fps source → 9:16 | 5 s | 5.01 s · **120**, 1080×1920 | 2.000 · 2.000 | 0 ms | exit 0 |
| a whole 29.7 s master | 29.7 s | **891** | — | — | exit 0 |
| the same master cut to 60 % of its bytes | 29.7 s | **531** → `count_mismatch` (−360) | — | — | **exit 183** (`Invalid NAL unit size`) |

What this adds: slow motion and speed-up now land on the product's 30 fps grid with sound in sync (defect row 30); a damaged
file is caught twice, by the decoder's exit code and by the frame count, so metadata duration alone is never the evidence.

## 3. What the numbers establish (task PHASE 4)

- **60 s encode**: frame-exact (1800), hosted, QA A; encode time 184 s on 2 threads — the Vercel function's `maxDuration`
  budget for a 60 s film is a deployment question (BUILT_NOT_PROVEN at T4; see `blockers-and-deferred.md`).
- **24 / 25 / 30 / 60 fps normalization**: four source rates land on one 30 fps timeline with no frame gained or lost (720).
- **9:16**: the portrait canvas keeps the count (891 at 1080×1920 and at 720×1280).
- **Legacy duration (D6)**: the 30 s brand pad is reached only with no contract; every in-tree caller sends one.
- **Missing audio**: a clip with no audio stream does not fail the stitch (silence lane). **Invalid audio** is now a named
  refusal before any encode (`422 music_unreadable`), measured BEFORE and AFTER.
- **QC gate**: a wrong count withholds the master and refunds; the retry on the same input hosts at 891. A count that
  could not be taken is a refusal too (`frame_count_unverified`, P0, T1 — `masterQa.test`, `assembleQcGate.test`; not
  separately re-encoded here because the counter is forced, not broken, in the real-ffmpeg harness).
- **Audio levels**: the master after `loudnorm` peaks at −11.2 dB (no clipping); the QC does not yet assert a level
  (informational only).

## 4. Not measured

No Veo / Vertex clip was rendered (paid; not authorized): every source here is synthetic. No Preview or Production
runtime ran ffmpeg (T4–T6 empty): the numbers come from the sandbox's ffmpeg-static, not a Vercel function. The 60 s encode
budget on Vercel, real provider clip rates (Veo delivers 24 fps, 8 s), and real audio from ElevenLabs are untested.
