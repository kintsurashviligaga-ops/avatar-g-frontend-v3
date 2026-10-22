# Capability matrix (v1, 22 October 2026)

Status vocabulary (spec §2.2 item 6): **verified** (documented and proven on our Vertex project), **unverified** (documented, project access or contract not yet proven), **unsupported** (not offered by the documented model), **lifecycle-blocked** (endpoint retired or retiring).

No model is **verified** yet: this audit made no project calls, so every "available" row is at most *unverified*. Sources are public Google Cloud documentation read on 22 October 2026; "last updated" is the page's own date where shown.

## Music: Lyria (mandated)

| Model id | Stage | Location | Method in our code | Inputs | Output | Max length | Vocals / lyrics | Status |
|---|---|---|---|---|---|---|---|---|
| `lyria-3-clip-preview` | Preview | `global` | Vertex `:generateContent` only when `GEMINI_TRANSPORT=vertex`; otherwise Gemini API `/v1beta/interactions` (**violates policy**) | text, image | `audio/mp3`, 44.1 kHz | 30 s | vocals, lyrics generation, user lyrics supported | unverified |
| `lyria-3-pro-preview` | Preview | `global` | same | text, image | `audio/mp3`, 44.1 kHz | 184 s | same | unverified |
| `lyria-002` | (older) | `us-central1` | `:predict` (instances: prompt, negative_prompt, seed) | text | instrumental clip | — | instrumental only | not used; do not assume Lyria 3 controls |

Languages documented for Lyria 3: English, German, Spanish, French, Hindi, Japanese, Korean, Portuguese. **Georgian and Russian lyrics are not in the documented list**, so ka/ru sung lyrics are *unsupported* until Google documents them. Instrumental from a ka/ru prompt needs the prompt translated, and that translation must be explicit in the plan (spec §2.1.1 step 1).

Current app behaviour: Music Studio quotes 30 s instrumental on `lyria-3-clip-preview` and refuses sung songs before pricing ("vocals not verified"). That refusal is honest and should stay until vocals are verified.

Sources: Lyria 3 model page (last updated 2026-10-21); Agent Platform pricing (Lyria 3 Pro $0.08 per song, Lyria 3 clip $0.04 per clip); Lyria API reference (`lyria-002:predict`).

## Video: Veo (mandated)

| Model id | Stage | Location | Inputs | Reference images | First/last frame | Extension | Audio input | Native sound | Resolutions | Durations | Aspect | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `veo-3.1-generate-001` | GA | `us-central1` | text, image | asset images (8 s only) | yes | yes | **no** | yes | 720p, 1080p, 4K | 4, 6, 8 s | 16:9, 9:16 | unverified |
| `veo-3.1-fast-generate-001` | GA | `us-central1` | text, image | asset images | yes | yes | **no** | yes | 720p, 1080p | 4, 6, 8 s | 16:9, 9:16 | unverified |
| `veo-3.1-lite-generate-001` | Preview | `us-central1` | text only | **no** | yes | yes | **no** | yes | 720p, 1080p | 4, 6, 8 s | 16:9, 9:16 | unverified |

Method: `:predictLongRunning` to submit, `:fetchPredictOperation` to poll (Vertex docs for reference-image and first/last-frame flows).

Code also references `veo-3.1-*-preview` ids (Gemini API naming), `veo-3.2-generate-001`, `veo-3.2-fast-generate-001`, `veo-3.2-lite-generate-001` and one `veo-9-generate-preview`. I could not confirm `veo-3.2-*` or `veo-9-*` in the Vertex docs read for this audit, so they are **unverified** and must not be quoted until confirmed; `-preview` ids belong to the Gemini API surface and are **disallowed** for new work.

Source: Veo 3.1 model page (last updated 2026-10-21).

## Photo / Image: Imagen 3 (mandated, lifecycle-blocked)

| Model id | Status | Evidence | Migration named by Google |
|---|---|---|---|
| `imagen-3.0-generate-002` (and other Imagen 3 generation/capability endpoints) | **lifecycle-blocked** (`BLOCKED_MODEL_LIFECYCLE`) | Vertex AI release notes, 24 Mar 2026: listed as discontinued endpoint; spec v3.1 records discontinuation 30 Jun 2026 | `gemini-2.5-flash-image` |

GG's decision (2026-10-22): Photo uses `gemini-3.1-flash-image` as the Imagen 3 replacement, as the codebase structures it. What the code uses today for Photo:

| Model id | Where | Status |
|---|---|---|
| `gemini-3.1-flash-image` | 10 references in `lib/` (main image path, `lib/ai/geminiImage`) | unverified on Vertex; Gemini image family, `:generateContent` |
| `gemini-2.5-flash-image` | 1 reference | Google's named Imagen 3 migration target; unverified |
| `gemini-3-pro-image` | 1 reference | unverified |
| `imagen-4.0-generate-001` | `lib/ai/geminiImagen.ts` (hits `generativelanguage.googleapis.com`) | unverified; disallowed transport today |

Operation split required by spec: generation, reference customisation and mask editing are different contracts and must each have their own adapter and status row once a target is chosen.

## Avatar / lip-sync (mandated, capability gap)

GG's decision (2026-10-22): built-in (curated) avatars only for now. Custom avatars stay off.


| Capability | Documented Google-native route | Status |
|---|---|---|
| Render a file of *my photo* speaking *my uploaded audio* (exact sync) | None found. Veo 3.1 documents audio input as not supported. | **CAPABILITY_UNAVAILABLE** |
| Generated character speech with native sound (no uploaded audio) | Veo 3.1 native sound | unverified; this is *not* lip-sync to user audio |
| Real-time talking avatar, curated avatar library | Gemini 3.8 Live with Live Avatar (GA, US and EU endpoints, 24 Sep 2026) | unverified |
| Real-time custom avatar from one reference photo + audio sample | Same, **allowlist only** | blocked pending allowlist |
| Voice cloning | Not established as a Vertex capability in this audit | unverified |

Existing Avatar code paths go to HeyGen, Replicate (SadTalker-class models) and ElevenLabs (`lib/ai/lipsync.ts`, `lib/pipeline/lipsync/lipsyncNode.ts`, `/api/heygen/*`, `/api/video/lipsync`). v3.1 forbids reviving these.

## Text, planning, speech: Gemini

| Use | Model ids referenced in code | Status |
|---|---|---|
| Agent G chat / planning | `gemini-3.8-flash` (most refs), `gemini-3.1-pro-preview`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash(-lite)`, `gemini-2.5-flash/pro`, `gemini-3.1-flash-lite` | unverified on Vertex; many generations pinned at once, consolidation needed |
| TTS | `gemini-2.5-flash-preview-tts` (15 refs), `gemini-3.8-flash-tts` (8), `gemini-3.1-flash-tts-preview` (3), `gemini-2.5-pro-preview-tts`, `gemini-2.0-flash-preview-tts` | unverified; response container (WAV vs raw PCM) must be checked per pinned model before Phase 4 |
| Live native audio | Gemini Live via `generativelanguage.googleapis.com` (`lib/voice/geminiLive.ts`, `app/api/voice/live`) | **disallowed transport** today; Vertex Live endpoint unverified |
| Embeddings | `lib/memory/embed.ts` (also references OpenAI) | `embedContent` exists on Gemini API only; Vertex needs `:predict` (already noted in transport.ts) |
| Cloud TTS (non-Gemini) | `lib/audio/google-tts.ts` → `texttospeech.googleapis.com` | Google, but not a Vertex endpoint; owner to confirm whether allowed |

## How a row becomes "verified"

1. One authorised, budgeted, owner-approved contract call per model on the production Vertex project (never repeated billed probes; spec §2.2).
2. Captured request/response fixture committed under `__tests__/fixtures/vertex/<model>/`.
3. Adapter contract test green against the fixture.
4. Row updated here with the date, project, location and fixture path.
