# PHASE 3 notes (scratch) — measured on ffmpeg-static 7.0.2, branch claude/video-core-v1-6gh97e

## Film assembler (lib/orchestrator/ffmpeg-assembly) — first run of the new opt-in evidence test (215 s)
- 4×8 s cuts, contract 29.7 → 891 decoded frames @30, Duration 29.70, QA A/100, no frame_count_mismatch.
- 4×6 s cuts, contract 24 → 720 @30, 24.00. Same clips, NO contract → 30.00 s @24 fps, 720 frames (legacy pad, frozen tail).
- 4×8 s crossfade (3×1 s) → stitched 29 s; 29.7 refused `longer_than_master (master 29s, requested 29.7s)`, nothing hosted.
- finalCutArgs: 6 s → 5 s = 150 frames; 32 s → 29.7 s = 891 frames.

## Montage lane (lib/video/surgicalOps runSequence) — the new frame-exact QC (qcAvSync) found a real defect
- BEFORE the lane fix (first montage run with the strict QC): montageExec.ffmpeg "three clips + 120 BPM" → `qc_failed: picture 301 frames, planned 300 (10.000s at 30 fps)`;
  "drops clip 2" render → `picture 299 frames, planned 300`. Sources mixed 30/25 fps. mediaStudio E2E-22 (300) and E2E-23 (2100) exact (30 fps sources).
- Isolated repro: 25 fps window [1.234,4.567] through `trim,setpts,scale,fps=30` → 101 frames for 100.
- First fix attempt (`tpad=stop=1:stop_mode=clone,trim=end_frame=N,setpts`) BROKE outputs to 25 fps: trim/tpad drop the frame-rate tag,
  untagged stream muxed CFR at ffmpeg's default 25 → 172/206, 226/270, 1750/2100 frames. 16 failures across 5 suites.
- Measured fix (V2): `...fps=30,tpad=stop=1:stop_mode=clone,trim=end_frame=N,setpts=PTS-STARTPTS,fps=30` → exactly N @30 fps on 24/25/30 fps
  sources for windows [0,6.866] (206), [1.234,4.567] (100), [0,3] (90). Applied per segment and once on the whole master.
