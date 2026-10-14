# Music Studio v1 — 03 Provider / model verification, Phase 8 plan, actual spend

## Verification matrix
| Model / capability | Evidence | Offered in v1 |
|---|---|---|
| `lyria-3-clip-preview` instrumental, Vertex | **PROVEN** 2026-10-08 11:49–11:52 UTC, owner account: HTTP 200, MP3 30.8 s, stereo 44.1 kHz 192 kbps, ≈ $0.04 (`docs/handoffs/2026-10-08-gcp-part0-report.md` T2.3). Requires `responseModalities: ["AUDIO","TEXT"]` | Yes (30 s nominal, "≈") |
| `lyria-3-clip-preview` instrumental, Gemini API Interactions | Verified live 2026-07-25 per `lib/ai/lyriaMusic.ts` header (pre-dates this run) | Yes, when `GEMINI_TRANSPORT` ≠ vertex (Vertex is preferred and reported as `preferredTransport`) |
| `lyria-3-clip-preview` sung vocals / custom lyrics | **NOT VERIFIED** on this project | No — `unsupported` until `MUSIC_LYRIA_VOCALS_VERIFIED=1` |
| Georgian / Russian lyrics singing quality | NOT VERIFIED | Language is passed as an instruction; quality claims are not made |
| `lyria-3-pro-preview` | NOT VERIFIED (500 "high demand" when integrated) | Hidden |
| Precise duration | Not supported by the API (no duration field) | Not claimed |
| Lyria RealTime | Not integrated | No |
| Udio, ElevenLabs Music, Replicate MusicGen/Demucs/MiniMax/RVC, Pollinations | Outside the approved boundary | Refused before any charge |

No model capability in this branch was "verified" by this run: **no external provider call was made** (all generation tests use a faked provider and say so).

## Phase 8 — paid Google Lyria E2E (PREPARED, NOT RUN → BLOCKED on owner approval)
Script: `scripts/music-studio/paid-e2e.ts` — refuses unless `MUSIC_PAID_E2E_APPROVED` holds the owner's approval reference, and refuses if the planned spend exceeds `MUSIC_PAID_E2E_CAP_USD` (default **$5**).

Cases: (1) instrumental (cello/piano, slow); (2) vocal, Georgian lyrics, female lead. Each: HTTP outcome, MIME, bytes, SHA-256, ffmpeg QC (length, codec, rate, channels, peak/mean level), deliverable yes/no, files + JSON written to `docs/handoffs/music-studio/evidence/`.

Price basis: ≈ $0.04 per Lyria Clip track (2026-10-08 evidence). Planned: 2 tracks × $0.04 × 2 (retry allowance) = **≈ $0.16**, against the proposed **$5 ceiling**. The owner should re-check the live Vertex price before approving.

Library + ledger half (Preview, owner's test account, never Production user credits):
1. Preview env only: `MUSIC_STUDIO_ENABLED=1`, `NEXT_PUBLIC_MUSIC_STUDIO_V1=1`, `GEMINI_TRANSPORT=vertex`.
2. As the owner's test account: Music tool → instrumental → Confirm (5 credits) → wait → play → download → check the Library row → record the balance before/after and the ledger rows (`music-studio-v1:<jobId>` −5).
3. If vocals pass the script's QC and a listening check: set `MUSIC_LYRIA_VOCALS_VERIFIED=1` on Preview and repeat with a song.
4. Force one failure (e.g. `LYRIA_ENABLED=0` mid-test on Preview) and confirm `:refund` +5 exactly once.

## Actual provider spending in this run
| Provider | Calls | Cost |
|---|---|---|
| Google Lyria / Gemini / Vertex | 0 | **$0.00** |
| Any other external provider | 0 | **$0.00** |

(Claude Code's own execution budget is separate and not counted here.)
