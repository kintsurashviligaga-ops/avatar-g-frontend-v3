# 06 — Google provider allowlist

Rule (PROJECT_MASTER Section A, master task): users reach Google (Gemini, Imagen / Gemini image, Veo via Vertex WIF,
Lyria), ElevenLabs and FFmpeg only. No fallback to another engine, ever.

## Switches

| Switch | On main (Production 5517047) | On this branch | Re-open |
|---|---|---|---|
| `VIDEO_GOOGLE_ONLY` (lib/veo/policy) | default ON | default ON | owner only |
| `AI_GOOGLE_ONLY` (lib/ai/google/policy) | default ON | default ON | owner only |
| `MEDIA_GOOGLE_ONLY` (lib/providers/mediaPolicy) | opt-in, unset in Production → outside engines reachable (FR-3) | default ON (#67) | only `MEDIA_GOOGLE_ONLY=0` together with an owner approval reference in `OUTSIDE_ENGINES_APPROVED` (lib/env/providerBoundary); neither is set in Production |

Production env names were read in Phase 0 (values never read): neither `MEDIA_GOOGLE_ONLY` nor `OUTSIDE_ENGINES_APPROVED`
is set, so the release turns the media boundary ON.

## What users see after the release

A gated tool answers 503 `google_only` before any charge or provider call, in the user's language: "ეს ხელსაწყო
დროებით შეჩერებულია, სანამ Google-ის ძრავაზე გადავა. თანხა არ ჩამოგეჭრა." Status and poll routes stay open, so a job
started before the release still finishes and settles. The full list is `GATED_ENTRIES` in `lib/providers/mediaPolicy.ts`,
pinned by `lib/providers/mediaPolicy.test.ts`. In short:

| Area | After the release |
|---|---|
| Image tool, chat images | Google image model (was NanoBanana); price unchanged |
| Avatars and talking photos (HeyGen presenter/avatar, LiveAvatar, lip-sync, SadTalker) | paused |
| Photo editor, upscale, object removal, interior redesign (Replicate, FLUX) | paused; FFmpeg edits still run |
| Voice training and film narration in a trained voice (RVC on Replicate) | paused; the film keeps its original narration |
| Motion transfer (Kling), studio models and swap (Higgsfield), 3D (TRELLIS, WorldLabs) | paused |
| Chat music via Udio / MusicGen | paused; ElevenLabs Music and Lyria paths unchanged |
| Video remix restyle / character / background / redub | paused; FFmpeg ops, voiceover and the Veo product ad run |
| Raw vendor routes (`/api/replicate/*`, `/api/udio/generate`, `/api/ltx-video`) | refused |
| Dubbing and presentation decks | 503 until GG approves a price (`OWNER_APPROVED_PRICING`); on main they ran with no user charge |

## Not covered (open)

- FR-13: `/api/avatar/generate`, `/api/music/generate`, `/api/video/generate` insert `jobs` rows that external workers
  consume; whether those workers respect the boundary was not traced (INFERRED risk).
- The CSP still lists outside hosts (replicate, heygen, liveavatar, ltx); with the routes refused they are unused.
  Narrowing the CSP is a follow-up, not a release blocker.
