# 05 — Music Studio E2E (PR #65)

Heads: 54532ff8 (start of this task) → 97f64337 (paid build hook removed) → **9d25c7a4** (limiter fix).

## Reused evidence (not repeated — no new Lyria spend)

- 3 × `lyria-3-clip-preview` HTTP 200 on Vertex (Preview build c4c8792e, approval GG-20261014-MUSIC-LYRIA-E2E-USD5, ≈ $0.12).
- Real bytes replayed through the isolated pipeline (quote → Create → debit → QC → Storage → Library → play → download), desktop + phone:
  CI "Music Studio live E2E (local Supabase, desktop + phone)" ✅ run 38572860496 on 54532ff8; billing on real Postgres ✅ run 38572860799.
- Vocals: B (EN) / C (KA experimental) = **LISTENING REVIEW REQUIRED**; vocals stay OFF.

## New this run: true-peak / clipping investigation on the real exports

| File | Integrated | True peak |
|---|---|---|
| A-instrumental.mp3 (30.77 s) | −12.0 LUFS | −0.2 dBTP |
| B-vocal-en.mp3 | −11.2 LUFS | **+0.1 dBTP** |
| C-vocal-ka-experimental.mp3 | −11.6 LUFS | −0.1 dBTP |

Defect **M-F1 (P1, fixed on #65 in 9d25c7a4):** the volume edit allowed +12 dB with no limiter. On the real instrumental, +6 dB exported
at **+5.6 dBTP** (hard clipping). Fix: every re-encoded edit ends in `alimiter=limit=0.891:level=disabled`; the same +6 dB edit now
measures **−1.1 dBTP**. New real-ffmpeg test (stacked +12 dB stays ≤ −0.5 dBFS, not attenuated away); `lib/music/studio` 61 passed / 6 skipped; tsc 0.
Remaining note: Lyria originals are delivered as Google returned them (−0.2 … +0.1 dBTP); a lossy re-encode by a player may clip by
≤ 0.1 dB — acceptable for v1, or apply the limiter on ingest (owner choice: it changes "provider bytes as delivered").

## Still blocked

| Item | Status | Why |
|---|---|---|
| The **Studio worker** calling real Lyria in a deployed app | **BLOCKED** | needs a Preview with Vertex identity AND an isolated database; Preview = Production Supabase (10). Not mutated. |
| Concurrency / reload / signed URL ownership on real provider | PROVEN_ISOLATED only | CI suites above |
