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
| `t3-film-frame-counts.json` | T3 | a1f1ff4 + PHASE 3 tree | `VIDEO_CORE_FFMPEG_IT=1 VIDEO_CORE_EVIDENCE_OUT=<file> npx jest lib/orchestrator/ffmpeg-assembly.ffmpeg.test.ts` (4 passed, ~215 s) |
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
- The film evidence test is opt-in (`VIDEO_CORE_FFMPEG_IT=1`) because of its ~4 min runtime; CI runs the montage suites
  (ungated, ~6 min) but not this one.
