# Music Studio v1 — 01 Existing architecture audit (Phase 0)

Date: 2026-10-14 · Base: `origin/main` fef867a (Production serves the same commit) · Branch: `claude/music-studio-v1-20261014`

Labels: **PROVEN** (seen working with evidence) · **BUILT** (code + tests, not seen live) · **PARTIAL** · **BLOCKED** · **NOT TESTED**.

## What existed on main before this branch

| Area | Where | State before | Notes |
|---|---|---|---|
| Studio music generation | `app/api/ai/music/route.ts` (752 lines) | BUILT, live in Prod | Synchronous Lyria render in the request. Reserve-before-render (`deductCredits`), refund on failure, duration settlement (`lib/credits/musicSettlement`). |
| Lyria provider | `lib/ai/lyriaMusic.ts` | **PROVEN** (instrumental, Vertex, 2026-10-08, 30.8 s MP3, ≈ $0.04 — `docs/handoffs/2026-10-08-gcp-part0-report.md` T2.3) | Gemini Interactions API or Vertex `generateContent`. **Budget guard failed open** (a throwing or degraded `BillingGuard` authorized spend). |
| Outside engines in the same route | Udio, ElevenLabs Music, Replicate MusicGen (+ melody cover), Replicate MiniMax (sampled voice), Replicate RVC (trained voice), Pollinations (cover art) | Reachable whenever `MEDIA_GOOGLE_ONLY` was off — **the default** | Violated the approved boundary (Google for music; ElevenLabs for permitted voice only). |
| Engine picker status | `lib/ai/musicEnginesStatus.ts`, `GET /api/ai/music/engines` | BUILT | Offered Udio / EL / MusicGen when keys existed. |
| Lyrics assistant | `app/api/ai/lyrics/route.ts` | BUILT | Gemini, ka/en/ru, auth + chat budget. Compliant; unchanged. |
| Legacy swarm | `app/api/orchestrator/music/produce` | BUILT | Dispatched to **Udio**. |
| Raw Udio route | `app/api/udio/generate` | BUILT | Refused only under `MEDIA_GOOGLE_ONLY`. |
| Chat music | `lib/chat/providerRouter.ts` `handleMusicIntent` | BUILT | Udio / MusicGen; refused only under `MEDIA_GOOGLE_ONLY`. |
| Legacy `music/generate` + `music/list` | `app/api/music/*` | PARTIAL | Enqueues `jobs` rows that no worker consumes (no charge). Left unchanged; documented as dead. |
| Audio edits | `app/api/ai/edit-audio` (`process` = ffmpeg pitch/speed/trim/fades, free; `vocal_isolation`/`splitter` = **Replicate Demucs**, paid) | BUILT | Demucs outside the boundary. |
| Vocal isolator | `app/api/audio/isolate` (ElevenLabs Voice Isolator) | BUILT | ElevenLabs voice tooling — **owner decision** whether it is "permitted voice functionality". Not used by Music Studio. |
| Photo → music video | `app/api/music/video` | BUILT | ffmpeg mux; unchanged. |
| Client | `components/studio/OmniStudio.tsx` `runMusicJob`, `components/studio/create/Music*` | BUILT | One press = charge + synchronous render; no separate confirm step; the job lived only as long as the request. |
| Credit pricing | `lib/credits/pricing.ts` (`music_30s` 5 / `60s` 8 / `90s` 12), `lib/credits/quote.ts` | BUILT | Canonical quote function reused unchanged. |
| Durable job queue | `lib/orchestrator/jobLease.ts` (generation_jobs + `params._exec`), `lib/agent/media/quoteToken.ts` | **PROVEN** for Agent G montage / edit / audio (Video Core runs) | Reused for Music Studio — no new table, no migration. |
| Ledger | `deduct_credits` / `refund_credits` RPCs, `netDebitedForRef` | PROVEN | Reused. |
| Image Studio (PR #60, Draft) | `lib/image/studio/*` | BUILT on its branch | Same quote → lease → settle design; Music Studio mirrors its state machine but **does not depend on the unmerged branch**. |
| Video Core (PR #64, Draft) | `lib/agent/media/*`, `filmWaiverStore` | BUILT on its branch | No shared code changed. |

## Gaps found (what Music Studio v1 had to add)

1. No Plan → Quote → explicit Confirm: the button press itself was the charge.
2. Generation died with the HTTP request (phone lock / proxy timeout / lambda kill → no retry, settlement depended on the request surviving).
3. Forbidden engines reachable by default (Udio, EL Music, MusicGen, MiniMax, RVC, Pollinations, Demucs).
4. Budget guard failed open.
5. Capabilities not tied to evidence: vocals offered without a verified run on this project; durations 30/60/90/full offered although Lyria takes no duration parameter.
6. No volume / mute / join / format conversion edits, no measured QC of edit results, no non-destructive versioning.
7. Agent G had no music edit/regenerate vocabulary.

## Provider boundary after this branch

| Engine | Use | Status |
|---|---|---|
| Google Lyria 3 Clip (`lyria-3-clip-preview`) | Music generation | Instrumental **PROVEN**; vocals **gated** (`MUSIC_LYRIA_VOCALS_VERIFIED=1` only after the Phase 8 paid test) |
| Google Lyria 3 Pro | Music generation | **Hidden** (unverified; `MUSIC_LYRIA_PRO_VERIFIED=1` + `MUSIC_LYRIA_PRO_SECONDS`) |
| Gemini (text) | Lyrics assistant | Unchanged |
| ffmpeg-static | Edits + QC | BUILT, real-ffmpeg tests |
| Udio, ElevenLabs Music, Replicate (MusicGen, Demucs, MiniMax, RVC), Pollinations | — | **Removed / refused before any charge** |
