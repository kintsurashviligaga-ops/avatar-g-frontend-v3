# Part 1 Report — Audit + Foundation

Branch `claude/launch-certification-wmvitt` (draft PR #42), 2026-10-08. Written to PROJECT_MASTER.md Part 1's report format
(sections 1–17). Labels: **PROVEN** = checked in code or run on this branch; **INFERRED** = deduced, or taken from a cited
document and not re-run here. Nothing here was deployed; Production still runs `main`.

Audit HEAD `f8046744` (16:51 UTC). "Non-test code" = the 1,942 tracked `*.ts|tsx|js|jsx|mjs|cjs` files outside `node_modules`,
`_graveyard`, `docs`, `tests`, `__tests__`, `__mocks__`, `e2e`, `test-results`, minus `*.test.*` / `*.spec.*`.

Reused rather than redone: `docs/handoffs/final-launch-certification.md` ("cert", §A–§Y),
`docs/handoffs/service-inventory.md`, `docs/handoffs/service-taxonomy.md`, `docs/handoffs/2026-10-08-production-schema-drift.md`,
and the GCP Part 0 report on `origin/claude/gcp-part0-wif-fmtfxp:docs/handoffs/2026-10-08-gcp-part0-report.md` ("GCP §n").

Section order below follows the master's REPORT FORMAT; §2–§10 hold the audit (the master's sections 2–10 are numbered
here as: 2 Vertex scope, 3 Model selectors, 4 Vertex transport, 5 One-Window, 6 API providers, 7 Video providers,
8 Env vars, 9 Previous agent work, 10 Video pipeline).

## 1. Current State

App: Next.js `^14.2.35` (`package.json:95`), Node `24.x` (`package.json` engines), npm (`package-lock.json`). 451 `route.ts`
under `app/api`, 32 `page.tsx` under `app/[locale]`. Primary workspace = `/{lang}` and `/{lang}/dashboard` →
`FilmStudioHome` → `OmniStudio.tsx` (10,317 lines) + `ChatChrome.tsx` (1,668). Its import closure is 456 files (PROVEN).

| State | Item | Evidence |
|---|---|---|
| Working (unit only, BUILT_NOT_PROVEN in prod) | Service catalog SSoT (22 services / 9 categories), Agent G catalog routing, SSRF guard, director V1–V6 domain layer, R7 single-provider image/text/music/voice | cert §C, §D, §G, §J, §L |
| Working (live-proven) | Vertex WIF auth from the Preview build identity; Gemini text / Gemini image / Lyria on Vertex from the owner's Mac (T2, ≈ $0.11) | GCP §9.7, §10.5 (INFERRED here: not re-run) |
| Partially implemented | Vertex transport exists for **Veo only** (`lib/veo/*`); Live Voice → Agent G (`ask_agent_g`) built, not proven live; director wired behind `VIDEO_DIRECTOR_RUNS` (off); One-Window (studio is the one workspace, but see §5) | §2, §4, cert §E, §I, §J |
| Partially implemented | Foundation contracts exist in `lib/contracts/` (this Part, §14) with **0 runtime importers** yet: Part 2 wires them | `git show --stat f8046744` |
| Missing | Gemini/Imagen/Lyria/TTS/STT/Live/embeddings on Vertex (`GEMINI_TRANSPORT` has no runtime reader, PROVEN); Focus Modes as a concept (`focusMode` in 0 files, PROVEN; the studio has 17 tools, `lib/studio/tools.ts:26-28`); `ModelCatalog` consumed by any UI; browser control; Sandbox (`SANDBOX_API_KEY` in 0 files, PROVEN) | cert §H, §K |
| Broken | Email OTP sign-in in Production (AUTH-1/AUTH-2); every Production BOG checkout; Production schema drift (124 of 160 table names missing); provider boundary (10 of 20 usable services on §A violations) | cert §N, §O; schema-drift doc; taxonomy §2 |
| Broken | First live Vertex Veo render failed on `enhancePrompt:false` (fixed `75eef69`, retry pending) | cert §J |

Test baseline: re-run for this report, see §15.

---

## 2. Vertex Migration Scope

| Measure (non-test, PROVEN by grep) | Count |
|---|---|
| Files with the host `generativelanguage.googleapis.com` | 21 (17 app/lib + 4 scripts) |
| Files importing `@ai-sdk/google` | 6 |
| Files naming `GEMINI_API_KEY` | 43 |
| Files calling `resolveGeminiKey()` (the canonical key resolver, `lib/orchestrator/gemini-guard.ts:30`) | 25 |
| **Union = files that touch AI Studio directly** | **63** (56 in app/lib, 7 in scripts) |
| … of which make or own the network call (groups A–C below, incl. the CSP allowlist entry) | 29 |
| Files importing any `lib/veo/*` module (outside `lib/veo`) | 40 |
| … importing `lib/veo/engine` | 16 |
| … submitting clips with `createVeoClip()` | 6: `lib/agent/videoQueue.ts`, `lib/ai/veoClipSync.ts`, `lib/chat/ServiceManager.ts`, `lib/genjutsu/veoScene.ts`, `lib/video/director/server.ts`, `lib/video/longform/runtime.ts` |
| Files using a Vertex transport for anything other than Veo | **0** (`@ai-sdk/google-vertex`, `@google/genai` not installed) |

Wrapper fan-out (PROVEN, importer counts): `lib/gemini/client.ts` 19 · `lib/ai/llmText.ts` 11 · `lib/ai/google/chatStream.ts` 5 ·
`lib/memory/embed.ts` 4 · `lib/ai/geminiImagen.ts` 3 · `lib/research/interactionsClient.ts` 3 · `lib/ai/lyriaMusic.ts` 2. Switching these
seven wrappers covers most callers.

| File | API | Host | Auth | Switch? |
|---|---|---|---|---|
| **A. Direct REST** | | | | |
| `lib/gemini/client.ts:12,136,211` | generateContent (19 importers) | generativelanguage v1beta | x-goog-api-key | YES |
| `lib/ai/geminiImage.ts:18,71` | generateContent image | generativelanguage | key | YES (→ `gemini-3.1-flash-image`, GCP §10.3) |
| `lib/ai/geminiImagen.ts:22,73` | Imagen predict | generativelanguage | key | YES (Imagen 4 is 404 on Vertex for this project, GCP §10.3) |
| `lib/ai/lyriaMusic.ts:26,117` | Interactions (Lyria) | generativelanguage | key | YES (`lyria-3-clip-preview` proven on Vertex, T2) |
| `lib/memory/embed.ts:53,57` | embedContent | generativelanguage | key | YES |
| `lib/research/interactionsClient.ts:26,129` | Deep Research Interactions | generativelanguage | key | YES |
| `lib/voice-v2v/geminiStt.ts:24,255` | generateContent STT | generativelanguage | key | YES |
| `app/api/tts/gemini/route.ts:147,171` | generateContent TTS | generativelanguage | key | YES |
| `app/api/voice/live/route.ts:82,164` | `v1alpha/auth_tokens` (ephemeral token mint) | generativelanguage | key → token | YES (needs a relay, §4) |
| `lib/voice/geminiLive.ts:110` | Live `BidiGenerateContentConstrained` from the **browser** | wss://generativelanguage | ephemeral token | YES (relay) |
| `lib/veo/geminiTransport.ts:29,58` | Veo predictLongRunning | generativelanguage | key | NO (keep only as a pinned option; drop the auto fallback) |
| `lib/ai/geminiVeo.ts:29` | Veo (legacy) | generativelanguage | key | NO — **dead, 0 importers** (PROVEN) → delete |
| `app/api/admin/provider-probe/route.ts:67-92` | models.list + generateContent probe | generativelanguage | key | YES (probe both) |
| `app/api/health/public/route.ts:59`, `app/api/health/services/route.ts:105`, `lib/system/provider-health.ts:191,206` | models.list / generateContent ping | generativelanguage | key | YES (health must probe Vertex) |
| `lib/security/csp.js:90-91` | CSP connect-src | — | — | NO (config; stays while the browser opens Live) |
| **B. `@ai-sdk/google`** | | | | |
| `lib/ai/google/chatStream.ts:4` | streamText (studio chat, Agent G search) | generativelanguage (SDK) | key | YES |
| `lib/agentg/personality.ts:3`, `lib/agentg/intent-parser.ts:8` | generateText / object | SDK | key | YES |
| `app/api/orchestrator/script/route.ts:28`, `…/interior/analyze/route.ts:15`, `…/interior/produce/route.ts:17` | generateText (key pool `GEMINI_API_KEYS`) | SDK | key | YES |
| **C. Pass the key into A/B** | | | | |
| `app/api/chat/gemini/route.ts:750`, `app/api/chat/stream/route.ts:167`, `lib/ai/google/reply.ts:43`, `lib/agent/tools/googleSearch.ts:69` | via chatStream | SDK | key | YES (fixed at chatStream) |
| `lib/audio/google-tts.ts:30,148` | Cloud TTS `texttospeech.googleapis.com` with `GEMINI_API_KEY` fallback | texttospeech | key | YES (OAuth, separate API) |
| `lib/veo/engine.ts:44,56-57` | `veoTransport()` auto → Gemini when Vertex config is incomplete | — | key | YES (R7: remove auto fallback) |
| **D. Key-presence gates before calling A** (12): `app/api/gemini/{analyze,chat}`, `app/api/pipeline`, `app/api/chat/title`, `app/api/video/remix-intent`, `lib/chat/{providerRouter,musicVideoComposite}`, `lib/ai/{llmText,promptToEnglish,visionQualityGate}`, `lib/rag/retrieve`, `lib/router/agentGRouter` | via `lib/gemini/client` | — | — | YES (gate on "transport configured", not on the key) |
| **E. Readiness / config only** (15): `app/api/admin/reliability`, `app/api/app/status`, `app/api/elevenlabs/tts` (comment), `app/api/health/{embed,providers,route}`, `app/api/system/film-selftest`, `lib/chat/{filmComposite,mediaKeys,videoProvider}`, `lib/env/schema`, `lib/orchestrator/{config-audit,gemini-guard,providers}`, `lib/research/capabilities` | presence check | — | — | NO call; update readiness copy |
| **Scripts** (7): `scripts/{apply-rag-migration,gemini-health-check,preflight-check,probe-live-actions,rag-ingest}.mjs`, `scripts/{art-providers,hf-art-pack}.ts` | ops / health | generativelanguage | key | NO (ops) |

---

## 3. Model Selector Scope

| Location | Component | Hardcoded? | Config-fed? | Focus | Reachable from studio (PROVEN, import closure) |
|---|---|---|---|---|---|
| `components/chat/ModelSwitcher.tsx` | chat mode menu | ids in `lib/chat/chatModes.ts:44-83,122-134`; client sends a mode, server resolves `lib/ai/google/models.ts` chain | lib constant, not ModelCatalog | text | yes |
| `components/studio/ui/ModelPicker.tsx` | image/video/motion/music picker | `lib/providers/catalogue.ts` (32 entries: **25 Higgsfield, 4 Google, 3 NanoBanana**) | via `lib/studio/modelPick` | image, video, motion, music | yes |
| `components/studio/create/ImageModelsTable.tsx` | image tiers | `IMAGE_TIERS` (`lib/studio/imageCreate`) | catalogue | image | yes |
| `components/studio/create/VideoPickers.tsx` (+`videoCreateParts.tsx`) | Veo tier lite/fast/standard | `lib/veo/types` VeoTier | yes | video | yes |
| `components/studio/create/EngineList.tsx` | music engine radio | `MUSIC_ENGINE_CHAIN = ['lyria','udio','elevenlabs-music','musicgen']` (`lib/studio/musicEngines.ts:20`) | status from `/api/ai/music/engines` | music | yes — **Udio + MusicGen selectable** |
| `components/studio/create/HiggsfieldGenerate.tsx` (+`useStudioModels.ts`, `PromptModelCard.tsx`) | Higgsfield opt-in rows | `/api/studio/models` → `lib/providers/registry.ts` (61 lines with model ids) | `HF_ENABLED_MODELS`; route 404s unless `STUDIO_V2` (`app/api/studio/models/route.ts:13`) | image, video | yes (rows empty while `STUDIO_V2` off — INFERRED) |
| `components/studio/v2/StudioV2.tsx` | Studio β | catalogue | yes | all | no (`/studio` redirects home when `STUDIO_V2` off) |
| `components/dashboard/command-center/CommandCenter.tsx:8,67,265,374` | dead model select | `'gemini-3.8-flash' \| 'gemini-3.1-pro-preview'` | no | text | **dead: 0 importers** (PROVEN) |

- **Selector components found: 8** (6 reachable from the studio, 1 flag-gated, 1 dead). None reads a `ModelCatalog`; the new
  `lib/contracts/modelCatalog.ts` has no importer (PROVEN).
- **Files with hard-coded model ids** (quoted literal of a Gemini/Veo/Imagen/Lyria/GPT/Claude/Kling/Seedance/FLUX/Grok/DeepSeek/
  `hf/`/`nb/` id): **104** non-test files; 75 of them hold a non-Google id. Top: `lib/providers/registry.ts` 61,
  `lib/providers/catalogue.ts` 30, `lib/ai/google/models.ts` 20, `lib/agents/contracts.ts` 17, `lib/services/billing/budgetPolicy.ts` 13,
  `lib/providers/higgsfield/models.ts` 12, `lib/agents/agentRegistry.ts` 12, `lib/chat/chatModes.ts` 11, `lib/audio/tts-model.ts` 9.
  In UI files only 3: `CommandCenter.tsx` (dead), `OmniStudio.tsx:986,2433` (`videoModel` `'runway'|'kling'|'hailuo'`, default
  `'runway'`, inert while `VIDEO_GOOGLE_ONLY` is on per `lib/chat/filmComposite.ts:728` — INFERRED), `UnifiedServiceLayout.tsx` ('Flux').
- **Forbidden patterns (D7, case-insensitive, non-test)**: **179 files / 1,072 lines** match at least one; 1 of them is the new
  denylist itself (`lib/contracts/modelCatalog.ts:62-63`). Per pattern (files/lines): openai 61/249 · claude 63/159 ·
  anthropic 56/219 · flux 47/186 · grok 27/130 · gpt- 24/74 · deepseek 23/88 · sdxl 12/28 · xai 10/36 (6 `vertexaisearch` hits
  excluded) · midjourney 9/12 · dall-e 7/8 · stable diffusion 4/4 · llama 2/3 (`lib/monetization/plans.ts:68,95` `groq:llama-3.3-70b`) ·
  mistral 1/1 · cohere 1 (all other "cohere" hits are "coherent/coherence"). `grok` includes a dead CSS skin
  (`components/chat/grok/*`, `ServiceChatLayout.tsx`, 0 importers). Top files: `lib/chat/providerRouter.ts` 40,
  `app/api/film/storyboard/route.ts` 37, `components/services/workspace/ServiceChatLayout.tsx` 33 (dead), `lib/chat/ServiceManager.ts` 32,
  `lib/openai.ts` 28, `lib/ai/chatEngine.ts` 26, `app/api/pipeline/route.ts` 24, `lib/ai/xaiImage.ts` 22, `app/api/ai/route.ts` 22,
  `lib/ai/deepseekClient.ts` 21. Forbidden ids **offered in a reachable selector**: catalogue rows `hf/grok-image-2` (xAI),
  Kling ×10, Seedance ×3, Recraft, Ideogram, Qwen, Z-Image (`lib/providers/catalogue.ts:174-397`, gated as above); music Udio/MusicGen.
- **Retired models**: `gemini-1.5`/`gemini-1.0` appear only in the retired-model denylist and comments
  (`lib/ai/google/models.ts:38,41,152,247`); `gemini-2.0-*` only in comments. **None in use** (PROVEN).

---

## 4. Vertex Transport Audit (`lib/veo/`, 3,509 non-test lines, 11 test files)

| File | What it does (PROVEN) |
|---|---|
| `vertexAuth.ts` | `readVertexEnv` (139-189): needs `GCP_PROJECT_ID`, `GCP_VEO_BUCKET` (**mandatory**, 149-152, 188), location `GCP_VEO_LOCATION` default us-central1, and WIF (4 vars, wins when complete) or `GCP_SERVICE_ACCOUNT_KEY`. WIF = `@vercel/oidc` subject token → STS `sts.googleapis.com/v1/token` → impersonation `iamcredentials…:generateAccessToken` (242-245), scope cloud-platform. One memoised client per env fingerprint. `vertexConfigProblems()` returns variable NAMES only. `getVertexAccessToken()` (322) throws `VertexAuthError` (`not_configured`/`client_init_failed`/`oidc_unavailable`/`token_failed`/`no_token`). |
| `vertexClient.ts` | URL `https://{loc}-aiplatform.googleapis.com/v1/projects/{p}/locations/{loc}/publishers/google/models/{m}:predictLongRunning` (poll `:fetchPredictOperation`) (74-75); `submitVertexVeo` (273) single POST, `redirect:'manual'`; timeout/5xx = `ambiguous`, never re-POSTed; auth errors mapped to outcomes (`tokenFailure`, 256-262: `not_configured`/`client_init_failed` → `not_configured`). Shared failure classifier (also used by geminiTransport). |
| `engine.ts` | `veoTransport()` (52-58): `VEO_TRANSPORT` = `vertex` or `gemini` pins (pinned-but-unready → `null`); unset = **auto: Vertex if `vertexConfig()` complete, else Gemini if key + `GEMINI_VEO_ENABLED`** (silent fallback, GCP §10.4 #1). `createVeoClip` (333) never throws, submits once, logs one line; `pollVeoClip` (373) picks the transport from the operation name (`projects/…` vs `models/…`), so a switch never strands a job. |
| `geminiTransport.ts` | AI Studio Veo: key only in header, host-pinned, manual redirects; Files-API download needs the key. |
| `gcs.ts` | inputs uploaded to `inputs/{session}/` (`uploadVeoInput`, 296), output prefix per attempt (`veoOutputPrefix`, 101), V4 signed URLs 60 s–7 d (`signedReadUrl`, 356; WIF signs via IAM signBlob). |
| `deliver.ts` | `hostGcsVideo` copies a finished GCS clip into Supabase `renders` once (7-day GCS link as fallback). |
| `policy.ts` | `isGoogleOnly()` = `VIDEO_GOOGLE_ONLY`, default ON. |

**not_configured propagation (PROVEN):** `veoTransport()` null → `createVeoClip` returns `{reason:'not_configured', retryable:false,
detail}` where `detail` names missing variables (`notConfiguredDetail`, 70-77); a token-time `VertexAuthError` maps the same way
(`vertexClient.ts:259`). Callers: `ServiceManager.ts:253` shows "Video rendering is not available right now" (detail dropped);
director `googleVeoProvider.ts:194-195` → `ShotError{reason:'unknown', retryable:false}` ("No Veo transport is configured");
`/api/video/engine` returns `transport: null`. No refund-before-submit issue: nothing reaches Google.

**Generalising to Gemini REST + Live (INFERRED unless marked):**
1. Split auth from Veo storage: `vertexConfig()` returns null without `GCP_VEO_BUCKET`, so Gemini text cannot reuse it as-is
   (PROVEN). Needs a bucket-free `vertexAiConfig()` + its own location (codex defaults Gemini to `global`; Veo is `us-central1`). The codex
   branch already does exactly this (`readVertexEnv(env, requireVeo)`, `vertexAiConfig`, two memo slots) — reuse it.
2. One selector for all Google calls (`GEMINI_TRANSPORT`, fixed mode, `NotConfiguredError` per `lib/contracts/geminiTransport.ts`),
   applied at the 7 wrappers in §2; SDK callers need `@ai-sdk/google-vertex` with the WIF auth client (codex `lib/ai/google/provider.ts`).
3. Remove the auto fallback in `veoTransport()` (R7/R8): with Vertex selected, a missing var must be `not_configured`, never Gemini.
4. Live API: the browser must not hold a Vertex OAuth token, and the codex doc found no browser ephemeral-token equivalent on
   Vertex; a server-side WebSocket relay is required (codex mints `503 vertex_live_relay_required`, `docs/VERTEX_MIGRATION.md`). A Vercel function is not a
   long-lived WS host, so the relay needs separate infra (owner decision). `services/voice-v2v-node/server.mjs` is an existing WS
   service but runs OpenAI `gpt-4o-mini` (PROVEN, lines 6-7) — not reusable as-is.
5. Imagen 4 is unavailable on Vertex for this project (GCP §10.3) → image must target `gemini-3.1-flash-image` (quota 2 req/min).

---

## 5. One-Window Compliance (Section E)

Cert §I verdict: **ONE-WINDOW COMPLIANT: NO**. Fresh evidence inside the studio's import closure (PROVEN):

| Violation type | Where |
|---|---|
| Full document load for a mode switch | `components/studio/ChatChrome.tsx:796` — picking a tool from the sidebar while on the dashboard's `#lipsync`/`#agent` surfaces does `window.location.assign('/{lang}/dashboard?tool=…')` (in-place event only on the bare studio, 791) |
| Navigation away from the central interface | `ChatChrome.tsx:1144,1351` → `/{lang}/library`; `:1268` → `/{lang}/studio`; separate pages still exist: `/voice-lab`, `/library`, `/settings`, `/memory`, `/calendar-lab`, `/services/agent-g/dashboard`, `/services/workflow` |
| New tabs | `window.open(...,'_blank')` in `OmniStudio.tsx:7149,7178`, `StudioLibraryGrid.tsx:206`, `ui/ResultActions.tsx:65,100`, `voice/live/liveActions.ts:769` (13 calls in 10 files app-wide) |
| Modal overlays (`aria-modal`) | 19 reachable files incl. `chat/AuthModal.tsx`, `studio/CreditsModal.tsx`, ChatChrome settings and profile dialogs (`:1469,1555`), `PersonaPicker`, `video/DirectorRunOverlay.tsx`, `voice/live/LiveCallChrome.tsx`, image lightbox (`OmniStudio.tsx:10054`) |
| Unprompted reload | `components/AppShell.tsx:103` reloads the page when a new service worker takes control (could land mid-task; INFERRED) |
| Payment redirects | `components/chat/WalletRefill.tsx:108,118` (`location.href` = Stripe/BOG checkout) — leaves the window by necessity |

Not violations: tool switching on the studio itself is in place (`omni:set-tool`, `ChatChrome.tsx:792`); `/hub`, `/workspace`,
`/agent-terminal` redirect into the studio. **Focus Modes (E2) do not exist** as such — the studio's 17 tools and `?tool=` play that role.

---

## 6. API Provider Inventory (PROJECT_MASTER table, verified)

| Provider | Location (PROVEN) | Capability | Status |
|---|---|---|---|
| Udio | `lib/udio/client.ts` (7 importers), `app/api/udio/generate`, music cascade explicit pick, `EngineList` | music | TO REMOVE (exists) |
| HeyGen | `app/api/heygen/{avatar,presenter}`, `app/api/pipeline`, `lib/ai/lipsync.ts`; `HEYGEN_API_KEY` in 22 files | avatar/video | TO REMOVE (exists) |
| Replicate | `replicate` npm; `lib/replicate/*` (client: 11 importers); 7 routes `app/api/replicate/*`; 168 files mention it | image/video/audio/3D | TO REMOVE (exists) |
| Runway / Pika / Luma / Kling / Sora | Runway `lib/ai/runway.ts`; Luma + Kling native in `lib/video/videoProviderCascade.ts`; Kling also `lib/ai/klingClient.ts` and via Higgsfield; Pika only an env map entry (`lib/orchestrator/providers.ts:34`), Sora only a prompt-template label (`app/api/pipeline/route.ts:722`) | video | TO REMOVE (Runway, Luma, Kling exist; Pika, Sora no client) |
| OpenAI | `openai` npm; `lib/openai.ts`, `lib/providers/openai.ts`, `lib/ai/openai.ts`, `services/voice-v2v-node/server.mjs`; `/api/chat/openai` is 410 Gone | chat/TTS/STT | TO REMOVE |
| Anthropic | `@anthropic-ai/sdk`, `@ai-sdk/anthropic`; `lib/chat/providerRouter.ts:1469-1483,1535,1604`, `lib/agentg/personality.ts:247-251`, `lib/pipeline/agents/claude-director.ts`; `/api/chat/claude` 410 | chat | TO REMOVE — **still reachable, no `AI_GOOGLE_ONLY` gate in either file** |
| Gemini (AI Studio) | §2: 56 app/lib files | text, image, TTS, STT, Live, embed, research | MIGRATE → Vertex |
| Gemini (Vertex) | `lib/veo/*` only | video | KEEP + extend |
| Imagen | `lib/ai/geminiImagen.ts` (AI Studio, `GEMINI_IMAGEN_ENABLED`) | image | MIGRATE to `gemini-3.1-flash-image` (Imagen 4 404 on Vertex) |
| Veo | `lib/veo/*`; dead duplicate `lib/ai/geminiVeo.ts` | video | KEEP (only); delete `geminiVeo.ts` |
| Lyria | `lib/ai/lyriaMusic.ts` (AI Studio Interactions) | music | KEEP / migrate to Vertex |
| ElevenLabs | `ELEVENLABS_API_KEY` in 33 files; endpoints `/v1/text-to-speech` ×8, `/voices`, `/sound-generation`, `/speech-to-text` (Scribe, dubbing), `/music`, `/audio-isolation` | voice (+ music, STT, SFX) | KEEP for TTS; music/STT/SFX are outside §A's "voice + lipsync" scope (decision) |
| *Not in the table, found* | NanoBanana reseller `lib/nanobanana/client.ts` (`api.nanobananaapi.ai`, 7 importers); Higgsfield `lib/providers/higgsfield/*` (16 files); xAI `lib/ai/xaiImage.ts`; DeepSeek, Atlas, OpenRouter (`lib/ai/chatEngine.ts`); Stability; World Labs; LTX/Lightricks (`app/api/ltx-video`, 14 files); LiveAvatar (+`livekit-client`); Vapi (`@vapi-ai/*`, `lib/vapi.ts`); Deepgram, Cartesia (`lib/voice-v2v/providers.ts`); Azure TTS; Tavily (`lib/ai/webSearch.ts`); Pollinations (`app/api/ai/music/route.ts`) | various | TO REMOVE (all outside §A) |

Note (PROVEN): `/api/replicate/photo` **does exist** (`app/api/replicate/photo/route.ts`, 27 lines, proxies `/api/replicate/generate`),
contrary to the hand-off note in PROJECT_MASTER.

---

## 7. Video Provider Inventory (exhaustive, PROVEN)

| Provider | File path | SDK / package | Env var(s) | Call sites | Tools (focus) |
|---|---|---|---|---|---|
| Google Veo (Vertex + AI Studio) | `lib/veo/{engine,vertexClient,geminiTransport,vertexAuth,gcs,deliver}.ts` | REST + `google-auth-library`, `@google-cloud/storage`, `@vercel/oidc` | `VEO_TRANSPORT`, `GCP_*` (8), `GEMINI_API_KEY`, `GEMINI_VEO_ENABLED`, `VEO_VERTEX_PERSON_GENERATION`, `VIDEO_GOOGLE_ONLY` | 6 submitters (§2) | video, film, vfx (Genjutsu), longform, director, agent queue |
| Veo legacy | `lib/ai/geminiVeo.ts` | REST | `GEMINI_VEO_*` | none (dead) | — |
| Runway | `lib/ai/runway.ts` | REST `api.runwayml.com` | `RUNWAY_API_KEY`, `RUNWAYML_API_SECRET`, `RUNWAY_VIDEO_MODEL` | `ServiceManager.ts:25`, `app/api/jobs/[id]` | video (non-Google mode) |
| Kling native / Luma / LTX / Replicate-Kling cascade | `lib/video/videoProviderCascade.ts` | REST | `KLING_ACCESS_KEY`, `KLING_SECRET_KEY`, `LUMA_API_KEY`, `LTX2_API_KEY`/`LTX_API_KEY`/`LTX_VIDEO_API_KEY`, `REPLICATE_VIDEO_MODEL` | `ServiceManager.ts:21` | video i2v (non-Google mode) |
| LTX direct | `ServiceManager.ts:48`, `app/api/ltx-video/route.ts`, `app/api/orchestrator/produce`, `app/api/agent-g/delegate` | REST `api.ltx.video` | LTX keys | 4 routes | video |
| Kling via Replicate | `lib/ai/klingClient.ts` | `replicate` | `REPLICATE_API_TOKEN`, `KLING_MODEL` | `app/api/motion-control{,/status}`, `lib/orchestrator/unpolledSettleRuntime.ts` | motion |
| Replicate video (Seedance/Hailuo/roop/SadTalker/Wav2Lip/TRELLIS) | `lib/replicate/*`, `lib/ai/lipsync.ts`, `lib/services/model3d/replicate3dClient.ts` | `replicate` | `REPLICATE_API_TOKEN` | `/api/replicate/{video,avatar,generate}`, `/api/video/{lipsync,remix}`, `/api/v2/model3d/*`, `/api/film/storyboard` | swap, product ad, avatar, model3d |
| Higgsfield (Kling 3, Seedance 2.5, Genjutsu) | `lib/providers/higgsfield/{client,adapter,models}.ts` | REST (`@higgsfield/client` devDep for scripts) | `HF_API_KEY_ID`, `HF_API_KEY_SECRET`, `HF_ENABLED_MODELS`, `HF_WEBHOOK_SECRET` | `/api/generate`, `/api/estimate`, `/api/genjutsu/*`, `/api/webhooks/higgsfield`, cron `studio-sweep` | motion, swap (Genjutsu), Studio β image/video |
| HeyGen | `app/api/heygen/{avatar,presenter}`, `app/api/pipeline`, `lib/ai/lipsync.ts` | REST | `HEYGEN_API_KEY`, `HEYGEN_AGENT_ID` | 4 routes | avatar |
| LiveAvatar | `app/api/avatar/live/session`, `components/voice/LiveAvatarRealtime.tsx` | `livekit-client` | `LIVEAVATAR_*`, `NEXT_PUBLIC_LIVEAVATAR_ENABLED` | Live call (opt-in) | avatar (live) |

V1 holds only inside `lib/video/director` (refuses any provider but `google_veo`). Elsewhere non-Google video legs are reachable when
`VIDEO_GOOGLE_ONLY=0` or through tools that never use Veo (motion, swap, product ad, avatar, 3D) — matches cert §L.

---

## 8. Env Variable Inventory (names only)

334 distinct names are read via `process.env` in non-test code; 36 are `NEXT_PUBLIC_*`. `.env.example` (198 lines) lists **no**
`GCP_*`, `VEO_TRANSPORT` or `GEMINI_TRANSPORT` (PROVEN). Production presence is from GCP §10.4 / cert §A (INFERRED).

| Env var | Where (files, PROVEN) | Status |
|---|---|---|
| `GEMINI_API_KEY` (+ aliases `GEMINI_API_KEYS` 10, `GOOGLE_GENERATIVE_AI_API_KEY` 21) | 42 | KEEP as fallback; aliases REMOVE |
| `GEMINI_VEO_ENABLED` | 4 | KEEP (only while the Gemini Veo transport exists) |
| `GCP_PROJECT_ID`, `GCP_VEO_BUCKET`, `GCP_VEO_LOCATION`, `GCP_PROJECT_NUMBER`, `GCP_SERVICE_ACCOUNT_EMAIL`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`, `GCP_SERVICE_ACCOUNT_KEY` | `lib/veo/vertexAuth.ts` (+ `filmComposite` lists 2; contracts) | ADD to Production (Preview has WIF set, key unset by design) |
| `VEO_TRANSPORT` | `lib/veo/engine.ts`, `lib/chat/filmComposite.ts` | ADD to Production (`vertex`) |
| `GEMINI_TRANSPORT` | no runtime reader (named in `lib/contracts/geminiTransport.ts:29`) | ADD (Part 2 code + env) |
| `VEO_VERTEX_PERSON_GENERATION` | 2 | ADD (optional) |
| `VIDEO_GOOGLE_ONLY` 6, `AI_GOOGLE_ONLY` 16, `VIDEO_DIRECTOR_RUNS` 9 | — | KEEP (kill switches; remove the `=0` escape in Part 2) |
| `NEXT_PUBLIC_SUPABASE_URL` 61, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 29, `SUPABASE_SERVICE_ROLE_KEY` 47, `SUPABASE_ACCESS_TOKEN` 7 | — | KEEP |
| `ELEVENLABS_API_KEY` | 33 | KEEP |
| `SANDBOX_API_KEY` | 0 | ADD (Part 2) |
| `GOOGLE_TTS_API_KEY` 3, `GOOGLE_API_KEY` 3 | Cloud TTS | REMOVE after TTS moves to Vertex/OAuth |
| `ANTHROPIC_API_KEY` 30, `OPENAI_API_KEY` 28, `REPLICATE_API_TOKEN` 57, `UDIO_API_KEY` 14, `HEYGEN_API_KEY` 22, `RUNWAY_API_KEY` 11 / `RUNWAYML_API_SECRET` 4, `KLING_ACCESS_KEY`/`KLING_SECRET_KEY` 1, `LUMA_API_KEY` 3, `LTX2_API_KEY`/`LTX_API_KEY` 6, `XAI_API_KEY` 4, `DEEPSEEK_API_KEY` 6, `NANOBANANA_API_KEY` 11, `HF_API_KEY_ID`/`HF_API_KEY_SECRET` 3, `STABILITY_API_KEY` 9, `OPENROUTER_API_KEY` 6, `WORLDLABS_API_KEY` 4, `AZURE_SPEECH_KEY`/`AZURE_TTS_KEY`, `DEEPGRAM_API_KEY` 3, `CARTESIA_API_KEY` 2, `LIVEAVATAR_API_KEY` 3, `PIKA_API_KEY` 2, `GROQ_API_KEY` 2, `TAVILY_API_KEY` 2, `VAPI_API_KEY` 3, `ATLAS_API_KEY`/`ATLAS_KLING_API_KEY` | counts = files | REMOVE (after code cutover; cert §Y #9) |

Client exposure (PROVEN): of 428 `'use client'` files, **none** reads a non-`NEXT_PUBLIC_` env var directly. Secret-looking
`NEXT_PUBLIC_*`: **`NEXT_PUBLIC_ADMIN_EMAILS`** (`lib/auth/adminGuard.ts:115`, `lib/e2e/pipeline-sim.ts:25`; read server-side today,
but the prefix makes it bundle-able — rename to `ADMIN_EMAILS`). `NEXT_PUBLIC_VAPI_PUBLIC_KEY`, `…STRIPE_PUBLISHABLE_KEY`,
`…POSTHOG_KEY`, `…SUPABASE_ANON_KEY` are public by design. `NEXT_PUBLIC_GEMINI_API_KEY` is gone (comment at
`lib/agentg/intent-parser.ts:178`). Misleading readiness: `lib/chat/mediaKeys.ts:67` counts `GEMINI_API_KEY` as a NanoBanana key
(used only by `film-readiness`/`film-selftest`, never sent to nanobananaapi.ai — PROVEN).

---

## 9. Previous agent work (Codex branch; no agent named "Astra" appears in the repo or git log)

| Item | Finding |
|---|---|
| Branch / commits | `origin/codex/vertex-ai-migration`, merge-base `3e349f15` (2026-10-03). 2 commits: `8ee92f76` (preview fix from `claude/fix-image-google-redis-voice`, 22 files) and **`503829dc` "wip: migrate Google AI to Vertex and enforce v32 provider policy"** (author giorgi, 2026-10-06 14:14 +0400, 174 files +2,869/−4,007) |
| Diff vs `main` | 192 files, +3,286/−3,922; 19 added, 173 modified, 0 deleted; `package.json` adds `@ai-sdk/google-vertex` |
| What it built | `lib/ai/google/transport.ts` (`GEMINI_TRANSPORT` = `gemini` or `vertex`, invalid → throw, `googleModelRequest` builds Vertex or AI Studio URL), `lib/ai/google/provider.ts` (SDK factory on `createVertex` + WIF client), `vertexAiConfig()` without bucket, Veo pinned to Vertex when `GEMINI_TRANSPORT=vertex`, `lib/providers/policy.ts` (v32 allowlist, deprecated-credential and route denylists), Lyria/Research Vertex adapters, Gemini dubbing transcription (`geminiTranscribe.ts`), retired-client no-network tests; the Google-only studio catalogue was finished in PR #44 |
| Where it stopped (its `docs/VERTEX_MIGRATION.md`) | Live WS relay not built (mint answers `503 vertex_live_relay_required`); Deep Research and Lyria Vertex unproven live; image = Imagen text-to-image only (no reference editing) — and Imagen 4 is 404 on Vertex for this project (GCP §10.3), so that image path would fail; legacy readiness panels still key-based; "not repository-wide enforcement" |
| Test state (self-reported) | Full run **624 suites: 599 passed, 25 failed (137 assertions)**, Jest open handle, tsc "being rerun". PR #44 (`claude/vertex-migration-fixes`, 9 commits to `5131348b`) reportedly makes it green: tsc 0, jest 9,789 passed, lint 0 errors (cert §K; not re-run) |
| Merge risk vs this branch (PROVEN, `git merge-tree`, no checkout) | 39 files changed on both sides; **15 conflict**, 6 of them code: `app/api/ai/music/route.ts`, `app/api/nanobanana/image/route.ts`, `lib/ai/geminiImage.ts`, `lib/ai/llmText.ts`, `lib/studio/musicEngines.ts`, `components/studio/research/testing.ts`; 9 tests (music controls/engine-reference/engines, nanobanana studio/style/template, `llmText`, `imageCreate`, `musicEngines`) |

---

## 10. Video Pipeline Current State

| Aspect | Path A — default (`VIDEO_DIRECTOR_RUNS` unset) | Path B — director (flag `admin`/`1`) |
|---|---|---|
| Flow | studio video tool → `POST /api/film/storyboard` (`planFilmScenes`, `runPromptAgent`, `promptToEnglish`, `llmText` Gemini; 6 scenes + preview frames: Gemini image when Google-only) → user Approve → `/api/chat/orchestrate` → `providerRouter.orchestrate` → `lib/chat/filmComposite.ts` → `ServiceManager.runVeoOnly` → `createVeoClip` → assemble (ffmpeg, music bed, voice-over) | Approve → `DirectorRunOverlay` (`OmniStudio.tsx:10220`) → `/api/video/director/runs` (+`/advance`, `/decision`) → `lib/video/director` (`fromStudio.ts` → `freeze` → `run.ts`, one shot per request, `director_runs` table) → `GoogleVeoProvider` (`providerName 'google_veo'`, `googleVeoProvider.ts:244`) → `createVeoClip` |
| Prompt | **rewritten**: `promptToEnglish` (`filmComposite.ts:831-833`, `ServiceManager.ts:540`) and `expandCinematicPrompt` (`ServiceManager.ts:962`) before Veo — violates V3 on this path (PROVEN in code) | byte-for-byte (`verbatimPrompt: true`, `googleVeoProvider.ts:328`); Veo still rewrites inside Google (cert §J) |
| Shot list | the film's scene plan (`FILM_SCENE_COUNT`, `lib/chat/filmPipeline.ts:66`; the route header says six scenes) — no freeze, no V2 lock (INFERRED) | `Shot`/`Storyboard`/`FrozenStoryboard`/`ConsistencyLock`/`ShotError` (`lib/video/director/types.ts:17-159`) |
| Reference image / seed | per-scene approved frames as identity anchors; first selfie as `characterReference` (`filmComposite.ts:251,338`); FLUX anchor frame skipped when Google-only (`:1053`); seed supported by payload (`lib/veo/payload.ts:150,277`) | first photo = `characterReference`, one seed for every shot when "one seed" is on (`fromStudio.ts:9,62-65`) |
| Consistency / errors | per-leg refund; Veo miss surfaced, no non-Google fallback while `VIDEO_GOOGLE_ONLY` on | halts at first failed shot → `waiting_for_shot_decision`, retry/edit/cancel; no assembly, music or narration |
| Other Veo callers outside both | `lib/video/longform/*` (own planner/director/runtime), `lib/agent/videoQueue.ts`, `lib/genjutsu/veoScene.ts`, `lib/ai/veoClipSync.ts` — none goes through the V1–V6 director (PROVEN by import list) | |

---

## Surprising findings (carried into §16–17)

- Claude is still a **primary** engine for "specialist" chat turns, not just a fallback: `lib/chat/providerRouter.ts:1535` calls
  Claude **before** Gemini when `prefersClaudeSpecialist()` and `ANTHROPIC_API_KEY` is set, and `lib/agentg/personality.ts:247` falls
  back to Claude Haiku; neither file checks `AI_GOOGLE_ONLY` (PROVEN). The R7 commits did not cover this path.
- The default studio video path rewrites the user's prompt (`promptToEnglish` + `expandCinematicPrompt`, `ServiceManager.ts:540,962`) before
  Veo, so V3 holds only on the flagged director path; four other Veo callers (longform, agent queue, Genjutsu, veoClipSync) bypass it.
- `vertexConfig()` refuses to exist without a Veo bucket, so today's Vertex auth cannot serve Gemini text unchanged; the codex
  branch already solved this, but merging it into this branch hits 15 conflicts.
- Dead weight with forbidden ids: `lib/ai/geminiVeo.ts`, `components/dashboard/command-center/CommandCenter.tsx` (2,803 lines),
  `components/services/workspace/ServiceChatLayout.tsx` and the `components/chat/grok/*` skin have 0 importers; `/api/replicate/photo`
  exists although the hand-off said it did not.
- `NEXT_PUBLIC_ADMIN_EMAILS` drives the admin allowlist (`lib/auth/adminGuard.ts:115`), and the music picker still offers Udio and
  MusicGen as selectable engines (`lib/studio/musicEngines.ts:20`) in the reachable studio UI.

---

## 11. Completed in Part 1

Part 1 was restarted on 2026-10-08 and run together with the Master Task §60 order (steps 1–25; step 26, production
promotion, held). On this branch, 52 commits over `main` before this report (PROVEN, `git rev-list --count origin/main..HEAD`):

| Area | Done (commits) | Label |
|---|---|---|
| Audit | Service inventory (`35e8456e`), taxonomy + migration matrix (`0371b9e6`), launch certification §A–§Y (`c9be723b` …), schema drift (`4ad23ea7`), this report's §1–§10 | PROVEN (docs) |
| Catalog | One ServiceCatalog, 22 services / 9 categories, read by sidebar, rail, "+" sheet, Plugins, `/services`, Agent G routing (`e9c3c4b8`, `c7de338b`, `d563e82c`) | BUILT_NOT_PROVEN (unit + e2e) |
| Video V1–V6 | Domain layer (`fd989146`), verbatim prompts (`a24bb320`), serverless director run (`08671489`), routes + studio wiring behind `VIDEO_DIRECTOR_RUNS` (`e09ee27f`, `8aa2a9f7`), Veo `enhancePrompt` fix (`bc5bb9fd`) | BUILT_NOT_PROVEN (no live clip yet) |
| Provider boundary | R7 silent fallbacks removed for image, text (`lib/ai/llmText`), music, voice (`8a2d1b0f`, `32abf9ad`) | PARTIAL: see §16 (Claude still reachable in chat) |
| Security / billing / auth | SSRF guard, upload limits, RLS migration (applied), library re-sign, Stripe webhook + reversal, ledger-only history, paid-render refusal, OTP 6–10 digits, BOG failure reasons | BUILT_NOT_PROVEN (unit); RLS applied live |
| Foundation contracts | `lib/contracts/*` (§14) | BUILT (13 unit tests); not yet wired |

## 12. Files Added (exact paths, this Part's contracts)

- `lib/contracts/agent.ts` · `lib/contracts/geminiTransport.ts` · `lib/contracts/providers.ts` · `lib/contracts/pricing.ts`
- `lib/contracts/modelCatalog.ts` · `lib/contracts/toolRegistry.ts` · `lib/contracts/video.ts` · `lib/contracts/index.ts`
- `lib/contracts/contracts.test.ts`
- `docs/handoffs/part-1-report.md` (this file)

Earlier in Part 1 (full list: `git diff --name-status origin/main...HEAD | grep ^A`, 83 added files): `lib/video/director/*`
(14), `app/api/video/director/*` (6), `lib/catalog/{services,nav,agentRoute}.ts`, `lib/billing/{stripeReversal,creditHistory}.ts`,
`lib/web/publicFetch.ts`, `lib/uploads/policy.ts`, `lib/voice/liveThread{,Store}.ts`, `lib/video/ffmpegExec.ts`,
`lib/seo/sitemapServices.ts`, `components/studio/video/DirectorRunOverlay.tsx`, 3 migrations, 4 handoff docs, `PROJECT_MASTER.md`.

## 13. Files Modified (exact paths, this Part's contracts)

None outside `lib/contracts/`: the contracts are additive and nothing imports them yet (PROVEN). `PROJECT_MASTER.md`
(State Tracker) is updated with this report. Earlier Part 1 work modified 155 files (`git diff --name-status origin/main...HEAD`).

## 14. Foundation Contracts

| Master § | Contract | File | Notes |
|---|---|---|---|
| 6.1 | `AgentEvent` | `lib/contracts/agent.ts` | as written |
| 6.2 | `AgentCapability` (+ `AGENT_CAPABILITIES`, `isAgentCapability`) | `lib/contracts/agent.ts` | as written |
| 6.3 | `AgentToolDefinition` | `lib/contracts/agent.ts` | as written |
| 6.4 | `ApprovalRequest`, `ApprovalDecision` | `lib/contracts/agent.ts` | the master says only "generic"; shaped from Section E8 |
| 6.5 | `TaskState` | `lib/video/director/types.ts` (re-exported) | one definition |
| 7 / D4–D8 | `ModelCatalog`, `ModelCatalogEntry`, `ModelCapability`, `validateModelCatalog`, `uiModelEntries`, `resolveModelPreference`, `isForbiddenModelName` | `lib/contracts/modelCatalog.ts` | D5 build-time rules + runtime filter; the catalog DATA is Part 2 objective D |
| 8 | `GeminiTransport`, `GeminiTransportSelector`, `NotConfiguredError`, `VertexTransportConfig`, `VERTEX_TRANSPORT_ENV` | `lib/contracts/geminiTransport.ts` | method I/O are type parameters; `serviceAccountKey` kept but never used (owner forbids SA keys) |
| 9 | `Shot`, `Storyboard`, `FrozenStoryboard`, `ConsistencyLock`, `ShotError`, `ShotProgressEvent`, `VideoDirector`, `VideoGenProvider`, `ShotGenerationResult`, `VideoPipelineInput/Output` | `lib/video/director/types.ts` (re-exported by `lib/contracts/video.ts`) | already implemented by the director |
| 10 | `CodingModelProvider`, `MediaProvider`, `VoiceProvider`, `SpeechToTextProvider`, `BrowserProvider`, `PERMITTED_MODEL_PROVIDERS` | `lib/contracts/providers.ts` | I/O type parameters; Browser has no implementation (cert §H) |
| 11 | `PricingUnit`, `PricingEntry`, `PricingConfig`, `validatePricingConfig` | `lib/contracts/pricing.ts` | provider-cost table; distinct from `lib/providers/pricing.ts` (rate × margin) |
| 12 | `ToolRegistry`, `createToolRegistry`, `validateToolDefinitions`, `CapabilityRoute` | `lib/contracts/toolRegistry.ts` | skeleton, no executor; `capability_unavailable` instead of borrowing; high risk ⇒ approval |

## 15. Build / Typecheck / Lint / Jest Status

Run on this branch on 2026-10-08 (PROVEN):

| Check | Result | Where |
|---|---|---|
| `tsc --noEmit` | 0 errors | local, tree = `f8046744` |
| `next lint` | 0 errors, 35 warnings (pre-existing a11y/role warnings) | local, `f8046744` |
| `jest --forceExit` | 657 / 657 suites, 10,430 passed, 3 skipped (pre-existing), 0 failed | local, tree = `f8046744` |
| `next build` | READY | Vercel Preview build of `f8046744` (16:54 UTC) |
| CI `verify` + `preview-e2e` | green | GitHub checks on `8f257187` and `f8046744` |

## 16. Handoff to Part 2

**Phase 0 verification (Part 2 STOP-1).** $300 credit attached (owner-confirmed), APIs enabled, bucket
`gs://myavatar-veo-outputs`, keyless SA `myavatar-veo` with custom roles, WIF pool/provider: CONFIGURED and AUTH VERIFIED
(GCP report). Veo is **not** INFERENCE VERIFIED: the T1 retry (op `fbe5ed00-…`) result is pending with the GCP thread.
So Part 2 starts, with **A1 (Veo Production env) held** until T1 passes and the owner approves a Production env change.

**Start from the earlier agent's work, do not redo it.** `origin/codex/vertex-ai-migration` (`503829dc`) + PR #44
(`claude/vertex-migration-fixes`, green per its PR) already hold A2 groundwork (`lib/ai/google/transport.ts`,
`provider.ts`, bucket-free `vertexAiConfig()`), the v32 provider policy and the Google-only studio catalogue. Bringing it
into this branch is 15 conflicts (6 in code, §9). Neither branch is modified: the merge happens on this branch.

**Contract alignment.** The codex selector uses `GEMINI_TRANSPORT=gemini|vertex`; the contract's kind is
`gemini_api|vertex`. Part 2 maps `gemini` ↔ `gemini_api` in one place and makes the selector implement
`GeminiTransportSelector` (no fallback; `NotConfiguredError`).

**Part 2 order (proposed):**
1. B1 first slice, no owner decision needed (R7, same rule as the earlier R7 commits): remove the Claude paths still
   reachable in chat (`lib/chat/providerRouter.ts:1535` specialist-first, the Gemini → Claude fallback below it,
   `lib/agentg/personality.ts:247` Anthropic fallback) and the Udio / MusicGen rows of the music picker.
2. Merge PR #44's branch into this branch; resolve the 15 conflicts in favour of this branch's R7 and director work; get
   tsc / lint / jest green.
3. A2: route the 7 wrappers (§2) through the selector; Imagen → `gemini-3.1-flash-image` (Imagen 4 is 404 on Vertex here).
4. D: the ModelCatalog data (D1 allowlist, `verifiedAt` from a runtime probe), selectors read `uiModelEntries()`.
5. B1 rest: retire Replicate / HeyGen / Higgsfield / Runway / Luma / Kling / LTX / NanoBanana / xAI / DeepSeek … paths.
   This switches off live features (avatar, swap, motion, product ad, 3D, interior) until Google/ElevenLabs replacements
   exist, so it waits for the owner's answer on certification owner action 9.
6. A3 Live: needs a server-side WebSocket relay (no Vertex ephemeral token for browsers) — an infrastructure decision.

**Owner-only items unchanged:** certification §Y (Resend domain, BOG credentials / activation, Stripe Live events,
`20261008c` after deploy, pricing table, browser infrastructure, provider migration approval, Production deploy).

## 17. Known Limitations

- Contracts are not wired: no runtime code imports `lib/contracts` yet (PROVEN). Their value starts in Part 2.
- The audit's counts are grep-based (§2, §3, §8); a pattern can miss an indirect call or count a comment. Each table names
  its pattern so it can be re-run.
- V3 holds only on the director path; the default studio video path still rewrites the prompt before Veo (§10).
- One-Window is NOT compliant (§5); Focus Modes (E2) do not exist as a concept in the code.
- Live Vertex use is proven only for Gemini text / image and Lyria from the owner's machine (T2) and for auth from the Preview
  build; no Production Vertex call exists.
- Production is unchanged and still has the failures listed in the certification (auth email, BOG checkout, schema drift).
