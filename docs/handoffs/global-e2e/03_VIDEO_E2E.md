# 03 — Video Core E2E (PR #64, head bcb724a1)

## Live (real Google) — this run

| Test | Result | Evidence |
|---|---|---|
| Veo 3.1 Fast t2v, 9:16, 4 s, 720p, native audio | **PASS** — 720×1280 H.264 24 fps, 4.000 s; AAC 48 kHz stereo 4.01 s; decodes with 0 errors; RAI filtered 0 | `evidence/result.json` case VEO-1, sha256 `67d34b95…` |
| Veo 3.1 Fast i2v, 16:9, 4 s, reference = live image IMG-1 | **PASS** — 1280×720, 4.000 s; same robot, desk, window and props as the reference; prompt action (head turn toward camera) visible | VEO-2 `a2f0daf4…`; `evidence/veo-frames-sheet.jpg` |
| Same-character without a reference (t2v, same subject text) | **drift** — a different robot design. Character lock needs the reference path (i2v / referenceImages), as the director already does | sheet, right column |
| No silent fallback | the request named `veo-3.1-fast-generate-001` on Vertex; no other model or provider was contacted (script has no fallback) | script |
| Real Veo bytes → **real montage lane** (quote → lease → conform mixed aspects → stitch → per-clip QC → master) | **PASS** — master 7.000 s, 1280×720 H.264/AAC; QC `PASS`: clip 0 seen at 1.75 s (diff 0.44), clip 1 at 5.25 s (diff 0.20); A/V 7.00/7.00 s, 210/210 frames; audits `quote:ok, run:ok:queued, started, delivered` | `lib/agent/media/montageVeoReplay.ffmpeg.test.ts` (runs with `VEO_REPLAY_DIR`), `evidence/montage-replay-result.json` |
| Quote honesty | 2 × 4 s clips asked for 8 s → refused `footage_too_short` (usable 7.92 s); 7 s accepted | same test, first attempt |
| Audio peaks | raw Veo VEO-1 true peak **+0.7 dBTP** (VEO-2 −0.3); montage master −0.3 dBTP, −27.5 LUFS | ebur128 |

## Findings

- **V-F1 (quality, P2):** mixed-aspect montage cover-crops a 9:16 clip into 16:9 — the subject's head is cut off
  (`evidence/montage-master-sheet.jpg`). Suggest: follow the majority/first aspect, or pad/blur-fill instead of crop for portrait-in-landscape.
- **V-F2 (audio, P2):** Veo native audio can exceed 0 dBTP; any path that delivers a raw Veo clip without re-mixing (single-clip film)
  should pass a −1 dBTP limiter. The montage master stays under 0 dBTP but above −1.

## Not live (blocked / CI-isolated only)

| Item | Status | Why / evidence |
|---|---|---|
| Director run (frozen storyboard → exact shot list → Veo → assemble → private Library → signed download) on a deployed app | **BLOCKED** | Preview uses the Production Supabase (10); enabling studio flags there would mutate Production. Proven with a stand-in provider in CI: "live E2E (local Supabase, desktop + phone)" ✅ run 38527010610 on bcb724a1; "billing on real Postgres" ✅ same run |
| Credit reservation / cancel / failure refund / worker recovery | PROVEN_ISOLATED (CI pg + lease suites) | `scripts/lease-isolation/run.sh` in CI |
| Captions, transitions, trim, volume on real Veo output | BUILT (ffmpeg suites; 4 of them fail on macOS baseline, pass in Linux CI) | 11 |
| 1080p / 8 s / standard tier | NOT_TESTED live (cost) | — |

Verdict: **Veo provider leg + real-media assembly: PROVEN_PREVIEW/PROVEN_ISOLATED. End-to-end Video Studio on a deployed app: BLOCKED (isolation).**
