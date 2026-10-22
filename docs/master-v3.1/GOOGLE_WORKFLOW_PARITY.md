# Google workflow parity matrix (v1, 22 October 2026)

Spec §2.1.1 requires, per exposed service: official source and date, Studio reference behaviour, model/API/version, input schema, supported controls, transport/auth, safety outcome, lifecycle, output format, cancellation, MyAvatar extensions and acceptance tests. Anything not in Google's public contract is marked **unverified**, not invented.

"Studio reference behaviour" means the observable prompt → configure → generate → preview → use/download flow. It does not mean Google's private implementation.

## Common lifecycle and where the code already is

| Step (§2.1.1) | Music | Photo / Image | Video | Avatar |
|---|---|---|---|---|
| Existing canonical module | `lib/music/studio/*` (Music Studio v1) | `lib/image/studio/*` (Image Studio v1) | `lib/veo/*`, Director runs (`app/api/video/director/runs`), longform | none Google-native; legacy HeyGen/Replicate/ElevenLabs |
| 1. Intake (original + effective prompt kept) | `prompt.ts`; original and effective revisions not both persisted (unverified) | `prompt.ts`, `contracts.ts` | Director plan | — |
| 2. Native config (only model-supported controls) | `capabilities.ts` gates mode/length; instrumental only | `capabilities.ts` (count = 1) | partial; `-preview` and `3.2` ids exposed without doc evidence | — |
| 3. Approval boundary (signed quote) | `/api/music/studio/quote` → `jobs` with tap approval (CI evidence: `_approval.channel: tap`) | `/api/image/jobs/quote` → `jobs` | Director runs + `quoteToken.ts` | — |
| 4. Native submission | Vertex `:generateContent` **only if** `GEMINI_TRANSPORT=vertex`, else Gemini API `/interactions` | `gemini-3.1-flash-image` via image transport (can be pinned to Gemini API) | `:predictLongRunning` on Vertex, or Gemini API in auto mode | — |
| 5. Operation handling (no resubmit while polling) | job lease + `_exec.attempt`/`maxAttempts:2`; `dispatch: submitted` recorded | jobs + cancel | Director attempt journal, unknown-submit evidence (PR #113) | — |
| 6. Result delivery (MIME, QA, private store) | QC (silent-track check), private Storage, Library, digest preserved (CI) | `quality.ts`, assets/versions | contracted assembly QA | — |
| 7. Reuse vs new spend | replay of same quote returns same job (200), new quote for Try again | versions | redo/extend routes exist | — |
| Cancellation | `/jobs/[id]/cancel`; **mobile CI fails to reach `cancelled`** | `/jobs/[id]/cancel` | longform cancel | — |

Music Studio v1 and Image Studio v1 already have the shape the spec asks for (quote → approve → job → poll → QC → library). Phase 1 should **converge on them** rather than build a new lifecycle: swap their provider adapters to strict Vertex, extend the quote contract (AUDIT F-06), and route every legacy entry point for that service into them.

## Music: Lyria

| Field | Value |
|---|---|
| Official source | Lyria 3 model page (updated 2026-10-21); Agent Platform pricing |
| Studio reference behaviour | Prompt (text, optional image) → choose clip vs full song, instrumental vs vocals, optional lyrics → generate → play → download |
| Model / version | `lyria-3-clip-preview` (30 s), `lyria-3-pro-preview` (≤184 s); both Preview, `global` |
| Input schema | text, image; user lyrics supported (documented); exact request field names for Vertex `generateContent` **unverified** until a captured fixture exists |
| Supported controls | clip vs pro (length), vocals on/off, lyrics generation, user lyrics, language (8 documented, **not** ka/ru) |
| Transport / auth | Vertex `aiplatform.googleapis.com`, WIF token (`lib/veo/vertexAuth`) |
| Safety outcome | blocked/filtered response handling **unverified** (no fixture) |
| Lifecycle | synchronous generateContent (per code comment); no long-running operation |
| Output | `audio/mp3`, 44.1 kHz |
| Cancellation | none on Google's side for a sync call; app cancel stops further spend only |
| MyAvatar extensions | wallet quote, silent-track QC, Library, chat card |
| Gap vs parity | vocals/lyrics refused today; Pro not exposed; Gemini-API default transport |
| Acceptance | fixture-based contract test for clip and pro; browser test prompt → configure → approve → progress → play → download; zero Gemini-API calls with env unset |

## Photo / Image: Imagen 3 (lifecycle-blocked)

| Field | Value |
|---|---|
| Official source | Vertex AI release notes, 24 Mar 2026 (`imagen-3.0-generate-002` discontinued, migrate to `gemini-2.5-flash-image`) |
| Studio reference behaviour | Prompt → aspect / count / reference images → generate → pick → edit / download |
| Model | **BLOCKED_MODEL_LIFECYCLE**. Adapter boundary to be built with fixtures only; no live activation |
| Decision required | owner picks the replacement live model (AUDIT §4.1) |
| Current live path | `gemini-3.1-flash-image` (Image Studio v1); not an authorised substitute until decided |
| Controls | per chosen model; generation vs reference customisation vs mask edit are separate schemas |
| Acceptance | Imagen 3 adapter contract test against a synthetic fixture; quote endpoint refuses Imagen 3 with `lifecycle_blocked` and spends nothing; drafts and existing images remain accessible |

## Video: Veo

| Field | Value |
|---|---|
| Official source | Veo 3.1 model page (updated 2026-10-21); reference-images and first/last-frame guides |
| Studio reference behaviour | Prompt (+ image / reference assets / first-last frame) → duration, aspect, resolution, sound → generate → preview → extend / download |
| Models | `veo-3.1-generate-001` (GA), `veo-3.1-fast-generate-001` (GA), `veo-3.1-lite-generate-001` (Preview) |
| Input schema | text; image (not Lite); reference asset images (not Lite; 8 s only on standard); first/last frame; video extension |
| Controls | duration 4/6/8 s; aspect 16:9 or 9:16; resolution 720p/1080p (+4K standard); native sound |
| Transport | Vertex `:predictLongRunning`, poll `:fetchPredictOperation`, `us-central1` |
| Lifecycle | long-running operation; persist operation name; never resubmit while polling |
| Output | video in GCS (`storageUri`) or inline; MIME per response |
| Unsupported | audio input (so no lip-sync to uploaded audio) |
| Gap vs parity | `-preview` ids and `veo-3.2-*` / `veo-9-*` ids in code lack doc evidence; Gemini API auto-fallback |
| Acceptance | fixture tests per variant; control set rendered from the variant's capability row; browser test of full flow; zero Gemini-API submissions |

## Avatar

| Field | Value |
|---|---|
| Requested behaviour | owned identity photo + speech/text/audio → talking video |
| Documented Google-native options | Gemini 3.8 Live with Live Avatar (real-time; curated avatars; custom avatar allowlist-only; lip-sync to model speech). Veo 3.1 native sound (generated speech, not user audio) |
| Status | `CAPABILITY_UNAVAILABLE` for file rendering synced to uploaded audio; real-time curated avatar **unverified** |
| Decision required | AUDIT §4.2 |
| Legacy to retire | HeyGen, Replicate lip-sync, ElevenLabs voice for avatars |
| Acceptance | Avatar entry points answer `capability_unavailable` with the precise gap and preserve drafts; no legacy provider reachable |

## Chat / Agent G (Gemini)

Not a "Studio media" service, but it carries the same rules: Vertex only, fail-closed prequoted per-turn ceiling, no Anthropic fallback, honest model labels. Covered in BILLABLE_ENTRYPOINTS and Phase 1.
