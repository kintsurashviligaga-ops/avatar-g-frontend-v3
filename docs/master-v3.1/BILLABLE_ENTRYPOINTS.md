# Billable entrypoints and provider inventory (v1, 22 October 2026)

Spec §2.2 item 1 and §2.3: every reachable generative entry, with provider, transport, cost authority and fallback.

## How this list was built

- Scanned all **500** `app/api/**/route.ts` files at `b1f0778c`.
- For each route, followed its `@/` and relative imports (excluding tests and client components) and marked which provider clients the closure can reach: Gemini API, Vertex, Anthropic, OpenAI, ElevenLabs, Replicate, Higgsfield, Udio, HeyGen, Kling, Runway, RunPod, Cloud TTS.
- **158** routes can reach provider code. 84 show no obvious billing marker *in the route file itself* (billing often lives in a library engine, e.g. `lib/music/studio/engine.ts`, so this column flags routes to read, not confirmed bypasses).
- 24 routes had no obvious auth marker in the route file; spot checks found each gated another way (worker token, signed ticket, `musicUser`, feature flag). No unauthenticated paid route was confirmed.
- A static import closure **over-approximates** reachability (one shared module can pull in several providers) and misses dynamic dispatch by string. Every row needs a code read before Phase 1 changes it.

The scanner is reproducible: `python3 docs/master-v3.1/provider_reach.py . out.json` from the repo root; Phase 1 turns it into a permanent test (`__tests__/policy/providerReachability.test.ts`) that fails when any route closure reaches a non-Vertex client.

## Highest-risk entrypoints (hand-checked)

| Entry | Provider / transport today | Cost authority | Fallback | Gap vs v3.1 |
|---|---|---|---|---|
| `POST /api/chat/gemini` (Agent G chat, SSE) | Gemini via `googleModelFetch`; transport from `GEMINI_TRANSPORT` (default **Gemini API**) | `chatBudgetAllows` (**fails open**), post-turn `bookChatUsage` (errors swallowed) | Anthropic `claude-haiku-4-5` when `AI_GOOGLE_ONLY=0` | F-03, F-04, F-05 |
| `POST /api/tts/gemini` (inline read-aloud, voice autoplay, research speech, command center) | Gemini TTS, same transport default | same fail-open helper; signed-in + rate limit | none | F-05, F-09; no per-utterance approval |
| `POST /api/music/studio/quote` → `jobs` | Lyria; **Gemini API `/interactions`** unless `GEMINI_TRANSPORT=vertex` | signed quote + reservation + tap approval; refund on fail (CI evidence) | none | transport only |
| `POST /api/image/jobs/quote` → `jobs` | Gemini image via image transport (`GEMINI_IMAGE_TRANSPORT` may pin Gemini API) | signed quote + reservation | none | transport; Imagen 3 decision |
| `POST /api/video/director/runs`, `/advance`, `/decision`; `/api/video/longform` | Veo via `veoTransport()` (auto → Gemini API if Vertex unset) | quote + run approval + lease (`runExec.ts`) | Gemini API auto | F-03 |
| `POST /api/video/lipsync`, `/api/heygen/*`, `/api/replicate/*`, `/api/elevenlabs/*`, `/api/voice/clone`, `/api/voice-lab/jobs`, `/api/motion-control`, `/api/genjutsu/*`, `/api/generate`, `/api/nanobanana/image`, `/api/v2/model3d/*`, `/api/pipeline*`, `/api/film/storyboard` | non-Google vendors | `guardGeneration` where present | — | F-04: must become `capability_unavailable`; held today only by `MEDIA_GOOGLE_ONLY` / `VIDEO_GOOGLE_ONLY` env defaults, and ElevenLabs is inside that boundary |
| `GET /api/voice/live`, `lib/voice/geminiLive.ts` (Live native audio) | Gemini API websocket | session envelope (unverified) | — | Vertex Live unverified |
| `POST /api/research/start` etc. | Gemini API `interactions` (`lib/research/interactionsClient.ts`) | unverified | — | Developer API only |
| Memory embeddings `lib/memory/embed.ts` | Gemini `embedContent` / OpenAI | per chat turn, unmetered | OpenAI | F-03, F-04 |
| WhatsApp / Telegram / phone webhooks | Gemini, OpenAI, ElevenLabs, Replicate | webhook auth; cost authority unverified | multi-vendor | F-04; inbound-message spend has no user approval step |
| Admin probes (`/api/admin/provider-probe`, `/api/admin/veo-smoke`, `/api/preview/google-check`, `/api/health/*`) | several | admin-only | — | a probe that bills must not run without owner approval (spec §2.2 "no repeated billed probes") |
| Cron / sweeps (`/api/music/studio/sweep`, image sweep, `unpolledSettleRuntime`) | poll only (should be) | CRON_SECRET | — | verify sweeps never resubmit |

## Speech entry points (spec §5.1, Phase 0 requirement)

| Entry | File | Endpoint | Notes |
|---|---|---|---|
| Inline speaker under a chat message | `components/studio/OmniStudio.tsx` `speakMsg` L8157, `synthTtsUrl` L269 | `/api/tts/gemini` | `if (!url) continue` silent skip; 25 s client timeout; lead-sentence prefetch |
| Streaming first-sentence prefetch | OmniStudio `streamChat` + `chunkForTts(..., {leadSentence})` | `/api/tts/gemini` | speculative spend before user taps |
| Read-aloud helper | `lib/voice/experience/readAloud.ts`, `speech.ts` | `/api/tts/gemini` | full vs concise distinction lives here |
| Premium TTS helper | `lib/audio/premium-tts.ts` | `/api/tts/gemini` | slices to 800 chars |
| Voice conversation node | `components/voice/VoiceConversation.tsx` | `/api/voice/chat`, `/api/voice/transcribe`, `/api/tts/gemini` | |
| Live native audio | `components/voice/live/useGeminiLiveSession.ts` | `/api/voice/live` (Gemini API) | own real-time transport; must not double with TTS |
| Live web read action | `components/voice/live/liveActions.ts` | `/api/voice/web-read` | |
| Research speech | `components/studio/research/speech.ts` | `/api/tts/gemini` | |
| Command center | `components/dashboard/command-center/CommandCenter.tsx`, `components/dashboard/omni/store.ts` | `/api/tts/gemini` | legacy surface; check reachability |
| Onboarding voice | `components/onboarding/OnboardingWizard.tsx` | `/api/elevenlabs/tts` | **ElevenLabs** |
| Browser speechSynthesis | `components/chat/grok/ChatResponseToolbar.tsx` | none (local) | not billable; likely legacy |
| Film voiceover | `lib/chat/filmVoiceover.ts` | ElevenLabs | **ElevenLabs** |
| Video narration | `lib/chat/filmStudioClient.ts` | `/api/video/voice-narration` (Replicate) | **Replicate** |
| Phone / WhatsApp call TTS | `/api/agent-g/calls/tts` | ElevenLabs / OpenAI (worker token) | `isAiGoogleOnly` refuses STT; TTS path to check |
| Ads TTS | `/api/ads/tts` | to check | |
| Cloud TTS | `lib/audio/google-tts.ts` | `texttospeech.googleapis.com` | Google but not Vertex |
| Dictation (STT) | `components/chat/composer/useDictation.ts` | `/api/voice/transcribe` | STT, billable |

## Library surfaces (spec Phase 0 requirement)

1. `app/[locale]/library/page.tsx` → `components/library/LibraryGallery.tsx` (full page, tabs video / image / music / favorites).
2. `components/studio/StudioLibraryGrid.tsx` (embedded in the studio).

Both read `GET /api/studio/library`; details in AUDIT F-07.

## Full static route list

Bold providers are outside Vertex/Google. "none found" means the marker was not in the route file; it may be enforced deeper.

| Route | Methods | Provider code reachable (static import closure) | Auth marker | Billing marker | Route-level Google-only check |
|---|---|---|---|---|---|
| `/api/admin/avatar-providers` | GET | **elevenlabs**, **heygen** | **none found** | **none found** | no |
| `/api/admin/provider-probe` | GET | **anthropic**, **elevenlabs**, gemini_api, **heygen**, **replicate**, vertex | yes | billing, billingVerification | no |
| `/api/admin/reliability` | GET | gemini_api, **runway** | yes | billing | no |
| `/api/ads/tts` | POST | **elevenlabs** | yes | **none found** | no |
| `/api/agent-g/calls/transcribe` | POST | **elevenlabs**, **openai** | **none found** | **none found** | yes |
| `/api/agent-g/calls/tts` | POST | **elevenlabs**, **openai** | **none found** | **none found** | no |
| `/api/agent-g/telegram` | POST | **elevenlabs**, gemini_api, **openai**, vertex | **none found** | **none found** | no |
| `/api/agent-g/telegram/webhook` | POST | **elevenlabs**, gemini_api, **openai**, vertex | **none found** | **none found** | no |
| `/api/agent-g/webhook/telegram` | POST | **elevenlabs**, gemini_api, **openai**, vertex | **none found** | **none found** | no |
| `/api/agent-g/webhook/whatsapp` | GET POST | gemini_api, **openai**, **replicate**, vertex | **none found** | **none found** | no |
| `/api/agent/approvals` | POST | **replicate** | yes | **none found** | no |
| `/api/agent/media/analyze` | GET POST | gemini_api, **replicate**, vertex | yes | **none found** | no |
| `/api/agent/media/audio` | GET POST | **replicate** | yes | **none found** | no |
| `/api/agent/media/edit` | GET POST | **replicate** | yes | **none found** | no |
| `/api/agent/media/montage` | GET POST | **replicate** | yes | billing_unavailable | no |
| `/api/agent/media/sweep` | GET | gemini_api, **replicate**, vertex | yes | debited, ledger, runExec | no |
| `/api/agent/run` | POST | gemini_api, **replicate**, vertex | yes | **none found** | yes |
| `/api/agent/video-queue/drain` | POST | **anthropic**, gemini_api, **replicate**, vertex | yes | **none found** | no |
| `/api/agent/video-queue` | POST GET | **anthropic**, gemini_api, **replicate**, vertex | yes | billing | no |
| `/api/ai/edit-audio` | POST | **replicate** | yes | billingCopy, billing_unavailable, debit, guardGeneration, ledger | yes |
| `/api/ai/edit-photo` | POST | **anthropic**, gemini_api, **replicate**, vertex | yes | billing, billingCopy, billing_unavailable, debit, guardGeneration | yes |
| `/api/ai/edit` | POST | **anthropic**, gemini_api, **replicate**, vertex | yes | billingCopy, billing_unavailable, debit, guardGeneration, ledger | yes |
| `/api/ai/music/engines` | GET | gemini_api, **udio**, vertex | **none found** | **none found** | no |
| `/api/ai/music` | POST | **anthropic**, gemini_api, **udio**, vertex | yes | billing, billingCopy, billingLocale, billing_unavailable, debit | yes |
| `/api/app/health` | GET | **anthropic**, gemini_api, **heygen**, **openai**, **udio** | yes | **none found** | no |
| `/api/app/jobs/[id]` | GET PATCH | **openai** | yes | **none found** | yes |
| `/api/app/worker/tick` | GET POST | **elevenlabs**, gemini_api, **openai**, vertex | yes | billingEvents, billingProcessed, billing_event_processed, billing_events, billing_processed | no |
| `/api/audio/georgian-song` | POST | **anthropic**, **elevenlabs**, gemini_api, google_tts, vertex | yes | **none found** | no |
| `/api/audio/isolate` | POST | **elevenlabs** | yes | **none found** | no |
| `/api/avatar/veo` | GET POST | **elevenlabs**, gemini_api, google_tts, **higgsfield**, **replicate**, **udio**, vertex | yes | billingCopy, billingLocale, billing_unavailable, debit, ledger | no |
| `/api/calls/bridge/[op]` | POST | gemini_api, **replicate**, vertex | **none found** | **none found** | no |
| `/api/chat/gemini` | POST | gemini_api, **openai**, vertex | yes | billing, bookChatUsage | yes |
| `/api/chat/orchestrate` | POST | **anthropic**, **elevenlabs**, gemini_api, google_tts, **heygen**, **kling**, **openai**, **replicate**, **runway**, **udio**, vertex | yes | billing, debited, reserve, reservePrompt | no |
| `/api/chat` | POST GET | gemini_api, **openai**, vertex | yes | billing, bookChatUsage, chatBudgetAllows, checkDailyBudget | yes |
| `/api/chat/stream` | POST | **anthropic**, **elevenlabs**, gemini_api, google_tts, **heygen**, **kling**, **openai**, **replicate**, **runway**, **udio**, vertex | yes | billing, bookChatUsage, chatBudgetAllows, checkDailyBudget, reservePrompt | yes |
| `/api/cron/drain-renders` | GET POST | **heygen**, **kling**, **replicate** | yes | debited, ledger, reserve | no |
| `/api/cron/studio-sweep` | GET POST | **anthropic**, gemini_api, **higgsfield**, **udio**, vertex | yes | ledger | no |
| `/api/editing/jobs/[id]` | GET | **openai**, **replicate** | **none found** | **none found** | no |
| `/api/elevenlabs/sound` | POST | **elevenlabs** | yes | **none found** | no |
| `/api/elevenlabs/tts` | POST | **elevenlabs** | yes | reserves | no |
| `/api/estimate` | POST | **anthropic**, gemini_api, **higgsfield**, **udio**, vertex | yes | **none found** | no |
| `/api/film/scene/redo` | POST GET | **anthropic**, **elevenlabs**, gemini_api, google_tts, **heygen**, **kling**, **replicate**, **runpod**, **runway**, **udio**, vertex | yes | **none found** | no |
| `/api/film/scene/redo/stitch` | POST | **anthropic**, **elevenlabs**, gemini_api, google_tts, **heygen**, **kling**, **replicate**, **runpod**, **runway**, **udio**, vertex | yes | **none found** | no |
| `/api/film/storyboard` | POST | **anthropic**, gemini_api, **heygen**, **kling**, **replicate**, **runway**, vertex | yes | billing, reserved | yes |
| `/api/film/sweep` | GET | **anthropic**, **elevenlabs**, gemini_api, google_tts, **heygen**, **kling**, **replicate**, **runpod**, **runway**, **udio**, vertex | yes | **none found** | no |
| `/api/generate/[id]` | GET DELETE | **anthropic**, gemini_api, **higgsfield**, **udio**, vertex | yes | **none found** | no |
| `/api/generate` | POST GET | **anthropic**, gemini_api, **higgsfield**, **udio**, vertex | yes | ledger | yes |
| `/api/genjutsu/capabilities` | GET | gemini_api, **higgsfield**, **udio**, vertex | **none found** | **none found** | no |
| `/api/genjutsu/generate` | POST | **anthropic**, gemini_api, **higgsfield**, **replicate**, **udio**, vertex | yes | billingCopy, billingLocale, billing_unavailable, debit, ledger | yes |
| `/api/genjutsu/quote` | POST | **anthropic**, gemini_api, **higgsfield**, **udio**, vertex | yes | billingCopy, billingLocale | no |
| `/api/genjutsu/status` | GET | **anthropic**, gemini_api, **higgsfield**, **replicate**, **udio**, vertex | yes | ledger | no |
| `/api/health/config` | GET | **runpod** | yes | **none found** | no |
| `/api/health/embed` | GET | gemini_api, **openai**, vertex | yes | **none found** | no |
| `/api/health/providers` | GET | gemini_api, **runway**, vertex | yes | **none found** | yes |
| `/api/health/public` | GET | **elevenlabs**, gemini_api, vertex | **none found** | **none found** | no |
| `/api/health/services` | GET | **anthropic**, **elevenlabs**, gemini_api, **heygen**, **openai**, **replicate**, **udio** | yes | billing | no |
| `/api/heygen/avatar` | POST GET | **heygen** | yes | billingCopy, debit, guardGeneration, ledger, ledgerUnavailableBody | yes |
| `/api/heygen/presenter` | POST GET | **elevenlabs**, gemini_api, google_tts, **heygen**, vertex | yes | billing, debit, ledger, ledger_unavailable, reserve | yes |
| `/api/memory` | GET POST PATCH DELETE | gemini_api, **openai**, vertex | yes | **none found** | no |
| `/api/motion-control` | POST | **anthropic**, gemini_api, **kling**, **replicate**, vertex | yes | billingCopy, billingLocale, debit, ledger, ledgerUnavailableBody | yes |
| `/api/motion-control/status` | GET | **kling**, **replicate** | yes | ledger | yes |
| `/api/music/studio/capabilities` | GET | gemini_api, **udio**, vertex | **none found** | **none found** | no |
| `/api/music/studio/commands` | POST | gemini_api, **udio**, vertex | yes | **none found** | no |
| `/api/music/studio/edit` | POST | gemini_api, **replicate**, **udio**, vertex | yes | **none found** | no |
| `/api/music/studio/jobs/[id]/cancel` | POST | gemini_api, **replicate**, **udio**, vertex | yes | reserved | no |
| `/api/music/studio/jobs/[id]` | GET | gemini_api, **replicate**, **udio**, vertex | yes | **none found** | no |
| `/api/music/studio/jobs` | POST | gemini_api, **replicate**, **udio**, vertex | yes | **none found** | no |
| `/api/music/studio/quote` | POST | gemini_api, **replicate**, **udio**, vertex | yes | **none found** | no |
| `/api/music/studio/sweep` | GET | gemini_api, **replicate**, **udio**, vertex | yes | debited | no |
| `/api/nanobanana/image` | POST | **anthropic**, gemini_api, **higgsfield**, **udio**, vertex | yes | billing, billingCopy, billingLocale, billing_unavailable, debit | yes |
| `/api/orbit/[service]` | GET POST | **elevenlabs** | yes | billing | no |
| `/api/orbit/agent` | POST | **openai** | yes | **none found** | yes |
| `/api/orchestrate` | POST | **openai** | yes | debit, ledger | yes |
| `/api/orchestrator/jobs` | POST GET | **replicate** | yes | reserve | no |
| `/api/orchestrator/produce` | POST | gemini_api, **heygen**, **replicate**, vertex | yes | billing, debit, debited, ledger, reserve | no |
| `/api/pipeline/remix` | POST | **anthropic**, gemini_api, **heygen**, **kling**, **replicate**, **runway**, vertex | yes | debit, ledger, ledger_unavailable | no |
| `/api/pipeline` | POST GET | **anthropic**, **elevenlabs**, gemini_api, google_tts, **heygen**, **openai**, **replicate**, **udio**, vertex | yes | **none found** | yes |
| `/api/replicate/avatar` | POST | **replicate** | yes | guardGeneration | yes |
| `/api/replicate/generate` | POST | **replicate** | yes | billingCopy, debit, guardGeneration, ledger, ledgerUnavailableBody | yes |
| `/api/replicate/image` | POST | **anthropic**, gemini_api, **replicate**, vertex | yes | billing, billingCopy, debit, guardGeneration, ledger | yes |
| `/api/studio/catalogue` | GET | gemini_api, **higgsfield**, **udio**, vertex | **none found** | **none found** | no |
| `/api/studio/models` | GET | **higgsfield**, **udio** | **none found** | **none found** | no |
| `/api/system/film-readiness` | GET | **runpod** | **none found** | reserved | no |
| `/api/system/film-selftest` | GET | **runpod**, **udio** | yes | **none found** | no |
| `/api/tasks` | GET POST | gemini_api, **replicate**, vertex | yes | runExec | no |
| `/api/v2/dubbing/start` | POST | **elevenlabs**, gemini_api, **replicate**, vertex | yes | billing, billing_unavailable, debit, ledger, quoteToken | no |
| `/api/v2/model3d/create` | POST | **anthropic**, gemini_api, **replicate**, vertex | yes | billing, billing_unavailable, debit, ledger, reserve | yes |
| `/api/v2/model3d/status` | GET | **replicate** | yes | debit, ledger, reserved | no |
| `/api/v2/montage/render` | POST | **replicate** | yes | billing, billingCopy, billingLocale, ledger | no |
| `/api/v2/presentation/build` | POST | **anthropic**, gemini_api, vertex | yes | billing, billing_unavailable, quoteToken | no |
| `/api/video/assemble/callback` | POST | **runpod** | **none found** | **none found** | no |
| `/api/video/assemble` | POST | **anthropic**, **elevenlabs**, gemini_api, google_tts, **heygen**, **kling**, **replicate**, **runpod**, **runway**, **udio**, vertex | yes | billing, billingToken, billing_state_unknown, debit, debited | no |
| `/api/video/generate-hero` | POST | **replicate** | yes | billing | yes |
| `/api/video/generate-promo` | POST | **replicate** | yes | billing | yes |
| `/api/video/lipsync` | GET POST | **elevenlabs**, gemini_api, google_tts, **heygen**, **replicate**, vertex | yes | billing, debit, ledger, ledger_unavailable, reserve | yes |
| `/api/video/remix-intent` | POST | **anthropic**, gemini_api, vertex | yes | billing, bookChatUsage, chatBudgetAllows | yes |
| `/api/video/remix` | POST | **anthropic**, **elevenlabs**, gemini_api, google_tts, **heygen**, **kling**, **replicate**, **runway**, **udio**, vertex | yes | billing, billingCopy, billingToken, debit, debited | yes |
| `/api/video/voice-narration` | POST | **replicate** | yes | **none found** | no |
| `/api/voice-lab/jobs` | GET POST | **elevenlabs** | **none found** | billing | no |
| `/api/voice/clone` | GET POST DELETE PATCH | **elevenlabs** | yes | **none found** | no |
| `/api/voice/realtime/session` | POST | **elevenlabs**, **openai** | **none found** | **none found** | no |
| `/api/voice/train` | POST GET | **replicate** | yes | **none found** | yes |
| `/api/voice/transcribe` | POST | **elevenlabs**, gemini_api, **openai**, **replicate**, vertex | yes | billing, bookChatUsage | yes |
| `/api/webhooks/higgsfield` | POST | **anthropic**, gemini_api, **higgsfield**, **udio**, vertex | yes | **none found** | no |
| `/api/webhooks/phone` | POST GET | gemini_api, **openai**, vertex | yes | reserved | no |
| `/api/webhooks/whatsapp` | GET POST | gemini_api, **openai**, **replicate**, vertex | yes | **none found** | no |
| `/api/admin/google-transport` | GET | gemini_api, vertex | yes | **none found** | n/a |
| `/api/admin/model-catalog` | GET | gemini_api, vertex | yes | **none found** | n/a |
| `/api/admin/veo-smoke` | POST GET | gemini_api, vertex | yes | **none found** | n/a |
| `/api/agent-g/chat` | POST | gemini_api, vertex | yes | **none found** | n/a |
| `/api/agent-g/orchestrate` | POST | gemini_api, vertex | **none found** | **none found** | n/a |
| `/api/ai/lyrics` | POST | gemini_api, vertex | yes | billing, bookChatUsage, chatBudgetAllows | n/a |
| `/api/ai/magic-wand` | POST | gemini_api, vertex | yes | billing, bookChatUsage, chatBudgetAllows, reserve | n/a |
| `/api/ai` | POST GET | gemini_api, vertex | yes | debit, ledger, reserved | n/a |
| `/api/chat/title` | POST | gemini_api, vertex | yes | billing, bookChatUsage, chatBudgetAllows | n/a |
| `/api/connectors/files` | GET POST DELETE | gemini_api | yes | **none found** | n/a |
| `/api/connectors` | GET | gemini_api | **none found** | **none found** | n/a |
| `/api/cron/longform-tick` | GET POST | gemini_api, vertex | yes | reserve | n/a |
| `/api/cron/research-sweep` | GET POST | gemini_api | yes | billing, ledger | n/a |
| `/api/gemini/analyze` | POST | gemini_api, vertex | yes | **none found** | n/a |
| `/api/gemini/chat` | POST | gemini_api, vertex | yes | billing, bookChatUsage, chatBudgetAllows | n/a |
| `/api/image/assets/[id]` | GET | gemini_api, vertex | yes | **none found** | n/a |
| `/api/image/assets/[id]/versions` | GET | gemini_api, vertex | yes | **none found** | n/a |
| `/api/image/capabilities` | GET | gemini_api, vertex | yes | **none found** | n/a |
| `/api/image/commands` | POST | gemini_api, vertex | yes | **none found** | n/a |
| `/api/image/jobs/[id]/cancel` | POST | gemini_api, vertex | yes | **none found** | n/a |
| `/api/image/jobs/[id]` | GET | gemini_api, vertex | yes | **none found** | n/a |
| `/api/image/jobs/quote` | POST | gemini_api, vertex | yes | **none found** | n/a |
| `/api/image/jobs` | POST | gemini_api, vertex | yes | **none found** | n/a |
| `/api/image/models` | GET | gemini_api, vertex | yes | **none found** | n/a |
| `/api/image/operations/validate` | POST | gemini_api, vertex | yes | **none found** | n/a |
| `/api/orchestrator/image/produce` | POST | gemini_api, vertex | yes | reserve, reserveProduce | n/a |
| `/api/orchestrator/interior/analyze` | POST | gemini_api, vertex | yes | **none found** | n/a |
| `/api/orchestrator/interior/produce` | POST | gemini_api, vertex | yes | reserve, reserveProduce | n/a |
| `/api/orchestrator/interior/style` | POST | gemini_api, vertex | yes | **none found** | n/a |
| `/api/orchestrator/script-context` | POST | gemini_api, vertex | yes | reserve | n/a |
| `/api/orchestrator/script` | POST | gemini_api, vertex | yes | billing | n/a |
| `/api/pipeline/health` | GET | gemini_api, vertex | yes | **none found** | n/a |
| `/api/preview/google-check` | GET | gemini_api, vertex | **none found** | **none found** | n/a |
| `/api/research/[id]/ask` | POST | gemini_api, vertex | yes | billing, bookChatUsage, chatBudgetAllows | n/a |
| `/api/research/[id]/cancel` | POST | gemini_api | yes | ledger | n/a |
| `/api/research/[id]` | GET | gemini_api | yes | **none found** | n/a |
| `/api/research/capabilities` | GET | gemini_api | **none found** | **none found** | n/a |
| `/api/research` | GET | gemini_api | yes | **none found** | n/a |
| `/api/research/start` | POST | gemini_api | yes | billing_unavailable, ledger, reserve, reserved | n/a |
| `/api/tts/gemini` | POST | gemini_api, vertex | yes | billing, bookChatUsage, chatBudgetAllows | n/a |
| `/api/video/director/plan` | POST | gemini_api, vertex | yes | **none found** | n/a |
| `/api/video/director` | GET | gemini_api, vertex | yes | **none found** | n/a |
| `/api/video/director/runs/[id]/advance` | POST | gemini_api, vertex | yes | **none found** | n/a |
| `/api/video/director/runs/[id]/decision` | POST | gemini_api, vertex | yes | **none found** | n/a |
| `/api/video/director/runs/[id]` | GET | gemini_api, vertex | yes | **none found** | n/a |
| `/api/video/director/runs` | POST | gemini_api, vertex | yes | **none found** | n/a |
| `/api/video/engine` | GET | gemini_api, vertex | **none found** | **none found** | n/a |
| `/api/video/longform/[id]/cancel` | POST | gemini_api, vertex | yes | debit, reserved | n/a |
| `/api/video/longform/[id]` | GET | gemini_api, vertex | yes | **none found** | n/a |
| `/api/video/longform` | POST | gemini_api, vertex | yes | billing, billing_unavailable, debited, reserves | n/a |
| `/api/voice/chat` | POST | gemini_api, vertex | yes | billing | n/a |
| `/api/voice/live` | POST | gemini_api, vertex | yes | billing, chatBudgetAllows | n/a |
