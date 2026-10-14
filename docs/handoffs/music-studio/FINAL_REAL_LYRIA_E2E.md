# Music Studio v1 — FINAL real Google Lyria E2E (2026-10-14)

Approval: **GG-20261014-MUSIC-LYRIA-E2E-USD5** (owner, cap USD 5 cumulative). PR #65 (Draft), branch `claude/music-studio-v1-20261014`.

## How the live call was made (and why this way)
- Vertex AI is reachable only with the **Preview identity**: Vercel OIDC → GCP STS → keyless SA impersonation; the WIF provider
  condition admits `environment:preview` only (docs/handoffs/2026-10-08-gcp-part0-report.md §4). This Mac has no GCP credentials, CI has
  none, and the Development OIDC token is refused by the condition. So `scripts/music-studio/paid-e2e.ts` cannot run locally.
- Same owner-approved pattern as `scripts/gcp/preview-inference-check.cjs`: a build step,
  `scripts/music-studio/preview-lyria-check.cjs`, runs before `next build` **only** when `VERCEL_ENV=preview`, `GEMINI_TRANSPORT=vertex`
  and the request file `scripts/music-studio/lyria-check.request.json` (approval ref + cap) is in the commit. Fixed prompts; one call per
  case; **never a retry** (an uncertain outcome counts as spent); stops before a call that could cross the cap. Unit tests:
  `scripts/music-studio/preview-lyria-check.test.ts` (5/5).
- Request file committed in `c4c8792e` (one build), deleted in `abe8b234`. Builds `abe8b234` and `5b6e6c07` logged
  `[lyria-check] skipped: no request file` → **no further calls**.
- No database, no user, no credits involved: the build step talks to Vertex only. Production untouched.

## Live result — Preview build of `c4c8792e` (deployment `avatar-g-frontend-v3-p6hshpgfb…`), 2026-10-14 12:39 UTC
Auth line of the same build: `[gcp-auth-check] env=preview … ok=true mode:wif token:ok bucket:ok sign:ok`.

| Case | HTTP | finish | Latency | MIME | Bytes | SHA-256 (build = download) |
|---|---|---|---|---|---|---|
| A instrumental (cello + piano, rain) | 200 | STOP | 9.99 s | audio/mpeg | 746 248 | `09eaddb7…fe08887` |
| B vocal, English lyrics | 200 | STOP | 8.43 s | audio/mpeg | 746 248 | `eba9504f…5b2da9` |
| C vocal, Georgian lyrics (EXPERIMENTAL) | 200 | STOP | 10.14 s | audio/mpeg | 746 248 | `26d6b293…5d78d7` |

Model `lyria-3-clip-preview` (response `modelVersion` = same), Vertex `global` endpoint, `generateContent`,
`responseModalities: ["AUDIO","TEXT"]`, `trafficType: ON_DEMAND`, 533 audio tokens each. No provider substitution: the build step has no
other provider code path. Full JSON: `evidence/lyria-live/result.json`; audio: `evidence/lyria-live/*.mp3`.

## Real ffmpeg QC (this Mac, ffmpeg/ffprobe Homebrew; `scripts/music-studio/qc-lyria-evidence.sh` → `evidence/lyria-live/qc.jsonl`)
| Case | Container/codec | Duration | Rate / ch | Bitrate | Decode errors | Integrated | True peak | Silence ≥1 s | Studio gate (`assertDeliverable`) |
|---|---|---|---|---|---|---|---|---|---|
| A | mp3 / mp3 | 30.772 s | 44.1 kHz / 2 | 194 kb/s | 0 | −12.07 LUFS | −0.20 dBTP | 0 | **PASS** |
| B | mp3 / mp3 | 30.772 s | 44.1 kHz / 2 | 194 kb/s | 0 | −11.25 LUFS | **+0.07 dBTP** | 0 | **PASS** |
| C | mp3 / mp3 | 30.772 s | 44.1 kHz / 2 | 194 kb/s | 0 | −11.67 LUFS | −0.12 dBTP | 0 | **PASS** |

Observation: B's true peak is slightly above 0 dBTP (inter-sample overs; the sample peak is 0.0 dBFS). The studio stores provider bytes
unchanged, so a user download can clip on some DACs. Follow-up (not done, not a blocker): optional −1 dBTP limiter on delivery.

## Vocal evidence — what is and is NOT proven
- B and C returned a TEXT part with **time-aligned lyric lines** that match the requested lyrics word for word (B: 4 lines at
  0–7.5–15–22.5 s; C: 4 Georgian lines at 0–5, 7.5–12.5, 15–20, 22.5–27.5 s). A returned `<instrumental>`. This is the model's own
  statement, **not acoustic proof of singing**.
- Heuristic only: mid/side energy. Mid − side = 5.3 dB (A), **13.4 dB (B)**, 10.0 dB (C) — B/C have a much stronger centred
  component than the instrumental, consistent with a centred lead voice. Not proof.
- No speech recogniser or source separator is installed here, and the Lyria budget authorises no other model. **LISTENING REVIEW
  REQUIRED** for: actual singing (vs speech/humming), lyric intelligibility, Georgian pronunciation. The files are committed for that.
- Georgian is **not** in Google's documented Lyria 3 language list → EXPERIMENTAL regardless of the outcome. C's caption also mentions
  "wordless Georgian polyphony" in the background.
- Consequence: `MUSIC_LYRIA_VOCALS_VERIFIED` stays unset; songs stay `unsupported` in the studio. Nothing enabled anywhere.

## Real Lyria bytes through the delivery chain (isolated)
`[e2e:replay]` in the stand-in provider returns the captured A file byte for byte (refused unless its SHA-256 matches). Spec
`tests/music-studio-live/real-lyria-replay.spec.ts`, desktop + iPhone-13 viewport, throwaway local Supabase in GitHub Actions:
quote (5 cr) → explicit Create → one debit → worker → **real ffmpeg QC** → private Storage (stored digest = Lyria digest) → Library row →
signed expiring link (JWT `exp`, scoped to the object; the public URL is refused) → inline player (30.77 s) → download (digest = Lyria
digest) → row survives reload. This is a **replay of real output**, not a live dispatch; the live dispatch is the table above.
Result: see PHASE2_E2E_MATRIX.md (final run).

## Classification
| Item | Class |
|---|---|
| Lyria 3 Clip instrumental on Vertex (HTTP 200, valid 30.8 s MP3, QC pass) | **PROVEN_PREVIEW** (Preview build identity; no app/DB) |
| Lyria 3 Clip with English lyrics: request accepted, audio returned, lyrics echoed time-aligned | **PROVEN_PREVIEW**; *sung vocals* = LISTENING REVIEW REQUIRED |
| Georgian lyrics | **PARTIAL / EXPERIMENTAL** — accepted + echoed; language not officially supported; listening required |
| Real Lyria bytes → QC → Storage → Library → play → download | **PROVEN_ISOLATED** (replay; see matrix for the run) |
| Live Lyria dispatch from the studio worker itself (quote → debit → Vertex → Library) | **BLOCKED** — Vertex works only on Preview, and Preview = Production Supabase |
| Production | NOT_TESTED (not authorised) |
