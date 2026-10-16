# 01 — Service inventory (from source, 2026-10-14)

Source: integration candidate = `main` fef867a6 + #64 bcb724a1 + #60 be9edee3 + #65 54532ff8 (merged in a throwaway worktree,
no conflicts). Registry: `lib/studio/tools.ts` (18 studio tools) and `lib/services/catalog.ts` + `lib/services/workspaceForms.ts`
(`/services/[slug]` pages). Baseline: `docs/handoffs/service-inventory.md` (2026-10-08).

Status vocabulary: PROVEN_PRODUCTION · PROVEN_PREVIEW · PROVEN_ISOLATED · BUILT (code + unit tests, no live run) · PARTIAL ·
BLOCKED · NOT_TESTED · OFF. **Nothing here is PROVEN because of source review or a green build.**

## Flags that decide what is live (defaults)

| Flag | Default | Effect |
|---|---|---|
| `AI_GOOGLE_ONLY` | ON | text/chat Google-only, no Anthropic/OpenAI fallback (`lib/ai/google/policy.ts:9-22`) |
| `VIDEO_GOOGLE_ONLY` | ON | video = Veo only (`lib/veo/policy.ts:30-38`) |
| `MEDIA_GOOGLE_ONLY` | **OFF** | when OFF, HeyGen / Kling / NanoBanana / Replicate / Higgsfield / ElevenLabs paths run (`lib/providers/mediaPolicy.ts:44-65`) |
| `STUDIO_V2` | OFF | Higgsfield `/api/generate`, swap (`lib/studio/flags.ts:9`) |
| `MUSIC_STUDIO_ENABLED` + `NEXT_PUBLIC_MUSIC_STUDIO_V1` | OFF | Music Studio v1 (#65) — 503 `not_enabled` |
| `AGENT_G_MEDIA_EXEC` | OFF (Preview: admin only) | Image Studio v1 API (#60) (`lib/image/studio/http.ts:22-27`) |
| `LYRIA_ENABLED` | ON | legacy music lane uses Lyria |

## A. Studio tools (the product surface: `/{lang}/dashboard`)

| Tool | Route(s) | Debit / refund | Confirm | Provider | Live evidence | Status |
|---|---|---|---|---|---|---|
| video (Video Core #64) | `/api/chat/orchestrate`, `/api/film/storyboard`, `/api/video/director*`, `/api/video/assemble` | `deductCredits(filmChargeRef)`, `refundDebitByRef` (`lib/chat/filmComposite.ts:937,961-1139`) | storyboard approval | Veo 3.1 (Vertex / Gemini API) | 1 Veo clip via `/api/admin/veo-smoke` 2026-10-08; **2 Veo clips + FFmpeg assembly this run (03)** | engine PROVEN_PREVIEW (provider leg); full director→Library = BUILT (CI-isolated E2E) |
| image (Image Studio #60) | `/api/image/jobs/quote`, `/api/image/jobs`, `/api/image/commands` | `deductCreditsOnce` / `refundCredits` (`lib/image/studio/live.ts`) | hard `confirmed:true` | `gemini-3.1-flash-image` on Vertex | **generate + edit live this run (04)** | provider PROVEN_PREVIEW; app path BUILT, OFF by flag |
| music (Music Studio #65) | `/api/music/studio/{quote,jobs,edit,commands}` | signed quote, reserve / refund once | hard `confirmed:true` | Lyria 3 on Vertex | 3×HTTP 200 2026-10-14 + real-bytes replay in isolated E2E | provider PROVEN_PREVIEW; pipeline PROVEN_ISOLATED (real bytes); OFF by flag |
| avatar | `/api/heygen/presenter`, `/api/video/lipsync` | reserve + `refundDebitByRef` | price on button | HeyGen + ElevenLabs (third party) | none this run | BUILT — provider boundary open (third party while `MEDIA_GOOGLE_ONLY` off) |
| remix | `/api/video/remix` | `deductCreditsOnce` / `refundCredits` | chat asks before charged op | ffmpeg (free ops) + NanoBanana/Kling/roop/sync | none | BUILT (third party) |
| chat / Agent G | `/api/chat/gemini` | none (rate limit + daily budget) | n/a | Gemini | production traffic | PROVEN_PRODUCTION (text) |
| product ad | remix/film path | video price 25 cr | — | Veo / Kling | none | BUILT (price pending owner) |
| swap | `/api/genjutsu/generate` op=swap | reserve, refund on failure | `/api/genjutsu/quote` | Higgsfield | none | OFF unless `STUDIO_V2` + HF creds |
| vfx | `/api/genjutsu/*` op=scene | `deductCredits` + refund | quote first | Veo 3.1 | none | BUILT |
| motion | `/api/motion-control` | `deductCredits`, refund, signed token | — | Kling | none | BUILT (third party) |
| montage | `/api/v2/montage/render` | **no credits** (gap M4, by design for ffmpeg) | n/a | ffmpeg only | FFmpeg suites (baseline macOS fails, see 11) | BUILT |
| dubbing | `/api/v2/dubbing/start` | **no credits** (gap C3) | none | ElevenLabs Scribe + TTS | none | **PARTIAL — paid provider output, zero credit charge** |
| model3d | `/api/v2/model3d/*` | `reserveProduce` + refund | price on button | Replicate TRELLIS + Imagen | none | BUILT (third party) |
| presentation | `/api/v2/presentation/build` | **no credits** (gap C3) | none | Gemini + Imagen | none | **PARTIAL — paid provider output, zero credit charge** |
| photo (culling) | none — on-device worker | free by design | n/a | none | — | BUILT |
| interior | `/api/orchestrator/interior/produce`, `/api/nanobanana/image` | `reserveProduce` / `refundProduce` | — | Gemini vision + NanoBanana/Google image | none | BUILT |
| photoshoot | `/api/nanobanana/image` | `deductCredits` + refund | — | NanoBanana (Google image when `MEDIA_GOOGLE_ONLY`) | none | BUILT (third party by default) |

## B. `/services/[slug]` catalogue (marketing → handoff)

| Slugs | What actually runs | Status |
|---|---|---|
| video, image, music, avatar, interior, photo(→photoshoot), editing(→montage) | handoff `/dashboard?tool=` → table A | as table A |
| agent-g | redirect `/dashboard#agent` | BUILT |
| **workflow, shop, text, media, visual-intel** | handoff to **chat** only (`workspaceForms.ts:73-79`) | **TEXT_ONLY — catalogue copy is MISLEADING** (`catalog.ts:71,104,126,137,170` promise a visual pipeline builder, storefronts, image/video analysis, a content hub) |
| prompt-builder, content-writer, podcast, terminal, game, event, character, tourism, business | `/api/pipeline` / `/api/chat` Gemini text form; no credit, no Library | BUILT (text, free) |
| software | `/api/orbit/code-generation` → `/api/ai` copy (3 cr, debited) — page shows no price | BUILT |
| voice | `/api/pipeline` voice → ElevenLabs, **no credit**, base64 data URL, no Library | PARTIAL |

Mapping of the 13 product-scope names in the brief: Avatar Builder = avatar; Agent G / Director = chat + video director;
Workflow Builder = **no backend (chat handoff)**; Video Studio = video; Media Production = montage/remix/dubbing (+ `media` slug = chat);
Music Studio = music; Photo Studio = photoshoot/photo; Social Media Manager = **no service in source** (Omnichannel delivery outbox
exists for Agent G channels; no publishing to public networks); Visual Intelligence = **chat handoff only**; Image Creator = image;
Text Intelligence = text forms / chat; Prompt Builder = Gemini text form; Online Shop = **chat handoff only, no storefront**.
