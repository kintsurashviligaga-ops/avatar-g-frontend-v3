# Billable entrypoints and provider / cost-authority inventory (v2, Phase 6, 5 November 2026)

v1 (Phase 0, 22 October, draft PR #114) listed every reachable generative entry and found the Developer API as the
default transport, a chat budget that failed open, and other vendors inside the "Google-only" boundary. This v2 is the
state on the release candidate `d8420a5d`, which is also what Production runs.

## How this list was built

- `python3 scripts/audit/route_reach.py . out.json` on `d8420a5d`: **509** `app/api/**/route.ts` files. For each, the
  value-import closure (tests and components excluded) is grepped for a paid transport and for billing markers.
- **122** routes can reach a paid transport: Vertex AI (Gemini, Veo, Lyria, image, embeddings) 120, Cloud
  Speech-to-Text 23, Cloud Text-to-Speech 22, Pexels (stock footage, not generative, free API) 17, the Live relay 4,
  Vercel Sandbox 2. **121 of 122** carry a billing marker in their closure (quote token, reserve, settle/refund, chat
  budget or the BillingGuard). The one without is `POST /api/agent-g/calls/tts`, below.
- A static closure over-approximates (a shared module makes a route look like it reaches more than it does) and
  misses dispatch by string. A row points at code to read; it is not proof by itself. The appendix is the full list.
- Forbidden vendors are not in this scan. `__tests__/provider-boundary.test.ts` owns them as a ratchet: the 60 routes in
  `__tests__/provider-reachability.baseline.json` still have a forbidden vendor client somewhere in their import
  closure (frozen 2026-10-22; the test fails on any new reach and on a stale entry). At run time those legs are refused
  before any charge by the Google-only policy (`lib/ai/google/policy.ts`, `isAiGoogleOnly()` is always true) and by
  each service's own refusal; the catalog notes in `lib/catalog/services.ts` name them.

## What changed since v1

| v1 finding | State on `d8420a5d` | Where |
|---|---|---|
| Developer API was the default transport (`GEMINI_TRANSPORT` unset → `gemini_api`) | Vertex AI or a refusal. `gemini_api` / `gemini` throw `NotConfiguredError` before any I/O; an unset variable never selects the Developer API | `lib/ai/google/transport.ts`, Phase 1 #117 |
| Chat and read-aloud budget failed open | Fails closed: a guard that throws answers `guard_unavailable`, and every surface turns a refusal into a notice before provider I/O | `lib/services/billing/chatBudget.ts` |
| Anthropic answered when Gemini failed | No other vendor: a Gemini failure is a notice | `app/api/chat/gemini/route.ts` (header item 9) |
| Memory embeddings fell back to OpenAI | `gemini-embedding-001` on Vertex `:predict` only; a miss is a miss | `lib/memory/embed.ts` |
| Live native audio on the Developer API websocket | Vertex Live through our Cloud Run relay (`services/live-relay`), signed tickets; the app never holds a Google token for Live. Without the relay the route answers "unavailable" before I/O | `lib/voice/liveMint.ts` |
| Deep Research on the Developer API Interactions agent | Refused: the client gets no credential, so every call refuses before I/O. The protocol stays for an owner-approved transport | `lib/research/interactionsClient.ts`, `lib/research/provider.ts` |
| Music on `/interactions` (Developer API) | Lyria on Vertex `:generateContent`; guest 401 before any charge (see `VERIFICATION.md` §2) | `app/api/ai/music/route.ts`, `lib/music/studio/*` |
| ElevenLabs voice, Scribe, HeyGen, Replicate lip-sync | Refused before any charge; read-aloud is Gemini TTS on Vertex, telephony and video voices are Cloud TTS (owner decision 5), dictation is Chirp 3 STT (owner card 2026-11-01) | catalog notes, `SPEECH_CONTRACT.md` |

## Highest-risk entrypoints (hand-checked on `d8420a5d`)

| Entry | Transport | Cost authority | Fallback | Open item |
|---|---|---|---|---|
| `POST /api/chat/gemini` (chat, SSE) | Vertex Gemini | `chatBudgetRefusal` before the turn (fails closed), booking after | none | live first-token benchmark unverified (Phase 3 decision 3) |
| `POST /api/tts/gemini` (read-aloud) | Gemini TTS on Vertex | sign-in (guest 401, `VERIFICATION.md` §2), rate limit, chat budget (fails closed) | none | |
| `POST /api/ai/music`, `/api/music/studio/*` | Lyria on Vertex | platform budget → session (fails closed) → `requireAuthForGeneration` → reserve via `deductCredits` (fails closed) → settle/refund once | none (Udio/MusicGen picks refused) | |
| `POST /api/image/jobs/quote` → `jobs`, `/api/nanobanana/image` | `gemini-3.1-flash-image` on Vertex | signed quote + reservation; guest 401 | none; Imagen 3 ids refused `lifecycle_blocked` | Imagen 4 opt-in leg (`GEMINI_IMAGEN_ENABLED`, not set in Production) |
| `POST /api/video/director/*`, `/api/video/longform`, chat video | Veo 3.1 on Vertex; Gemini Omni Flash (Vertex `interactions`, `global`) for a Georgian line | quote + approval + lease, attempt journal, no resubmit while polling | none | |
| `POST /api/avatar/veo` | Veo on Vertex, built-in avatars | sign-in (guest 401) + reserve | none | custom avatar `BLOCKED_EXTERNAL` (Google allowlist) |
| `POST /api/voice/live` + relay | Vertex Live via relay | signed ticket; non-admins 1 avatar session of 5 min a day | REST voice loop on Vertex | |
| `POST /api/agent/run` code-run | Vercel Sandbox microVM | per-run quote, $20 sandbox cap | none | |
| `POST /api/agent-g/calls/tts` (telephony worker) | Cloud TTS | **worker token only; no platform budget check** on `d8420a5d`; fixed in #268 | none | see risk below |
| Montage (`/api/agent/media/montage`, #265) | Vertex Gemini for spotting; Pexels search for cutaways | quote + reserve for the Google part; Pexels is a free API | none | a non-Google, non-generative external source the owner asked for; listed so it is a conscious choice |

## Risks this inventory leaves open

1. **`POST /api/agent-g/calls/tts` bills Cloud TTS with no platform budget check** (on `d8420a5d`). It is gated by
   `WORKER_INTERNAL_TOKEN` (fails closed when unset) and called only by the telephony worker
   (`services/voice-v2v-node`), so it is not reachable by a user. But a leaked token or a looping worker would spend
   outside the daily AI budget. It also outlived its pipeline: no phone call can be placed (`lib/calls/availability.ts`)
   and its STT sibling is retired. **Fix: draft PR #268** refuses it with the named `phone_calls_unavailable` 503 while
   phone calls are off (before the body is read), and asks `chatBudgetAllows` (fails closed) before Cloud TTS once they
   open. It needs the owner's merge.
2. **Third-party credentials are still in the Production environment.** The Vercel project's environment listing
   (names only, values never read) shows `OPENAI_API_KEY`, `REPLICATE_API_TOKEN`, `HEYGEN_API_KEY` and `UDIO_API_KEY`
   in Production (the listing returned 100 variables). The code refuses those vendors, but the keys are the last line:
   with them removed, a path the ratchet missed would fail at the vendor instead of spending. Removing them is a
   Production change, so it is the owner's decision.
3. **60 routes still import a forbidden vendor client somewhere in their closure.** Refused at run time, frozen by the
   ratchet, never growing. Deleting the dead vendor modules shrinks the list; that is cleanup, not a live exposure.

## Appendix: every route that reaches a paid transport (`d8420a5d`)

| Route | Methods | Reaches | Billing markers in closure |
|---|---|---|---|
| `/api/admin/flags` | GET, POST | vertex_gemini | guard |
| `/api/admin/google-transport` | GET | vertex_gemini | guard |
| `/api/admin/model-catalog` | GET | vertex_gemini | guard |
| `/api/admin/provider-probe` | GET | cloud_stt, cloud_tts, vertex_gemini | guard, reserve |
| `/api/admin/reliability` | GET | vertex_gemini | guard |
| `/api/admin/veo-smoke` | POST, GET | vertex_gemini | guard, reserve |
| `/api/agent-g/calls/tts` | POST | cloud_stt, cloud_tts, vertex_gemini | **none** |
| `/api/agent-g/chat` | POST | vertex_gemini | chat_budget, guard, settle_refund |
| `/api/agent-g/orchestrate` | POST | vertex_gemini | guard |
| `/api/agent-g/telegram` | POST | cloud_stt, cloud_tts, vertex_gemini | chat_budget, guard, settle_refund |
| `/api/agent-g/telegram/webhook` | POST | cloud_stt, cloud_tts, vertex_gemini | chat_budget, guard, settle_refund |
| `/api/agent-g/webhook/telegram` | POST | cloud_stt, cloud_tts, vertex_gemini | chat_budget, guard, settle_refund |
| `/api/agent-g/webhook/whatsapp` | GET, POST | live_relay, pexels, vertex_gemini | chat_budget, guard, quote_token, reserve, settle_refund |
| `/api/agent/approvals` | POST | pexels, vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/agent/media/analyze` | GET, POST | pexels, vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/agent/media/audio` | GET, POST | pexels, vertex_gemini | chat_budget, guard, quote_token, reserve, settle_refund |
| `/api/agent/media/edit` | GET, POST | pexels, vertex_gemini | chat_budget, guard, quote_token, reserve, settle_refund |
| `/api/agent/media/montage` | GET, POST | pexels, vertex_gemini | chat_budget, guard, quote_token, reserve, settle_refund |
| `/api/agent/media/sweep` | GET | pexels, vertex_gemini | chat_budget, guard, quote_token, reserve, settle_refund |
| `/api/agent/run` | POST | pexels, vercel_sandbox, vertex_gemini | chat_budget, guard, quote_token, reserve, settle_refund |
| `/api/agent/sandbox/run` | GET, POST | vercel_sandbox | quote_token, reserve, settle_refund |
| `/api/agent/video-queue/drain` | POST | vertex_gemini | guard, reserve, settle_refund |
| `/api/agent/video-queue` | POST, GET | vertex_gemini | guard, reserve, settle_refund |
| `/api/ai/lyrics` | POST | vertex_gemini | chat_budget, guard, settle_refund |
| `/api/ai/magic-wand` | POST | vertex_gemini | chat_budget, guard, settle_refund |
| `/api/ai/music/engines` | GET | vertex_gemini | guard, settle_refund |
| `/api/ai/music` | POST | vertex_gemini | guard, reserve, settle_refund |
| `/api/ai` | POST, GET | vertex_gemini | chat_budget, guard, settle_refund |
| `/api/app/health` | GET | vertex_gemini | guard |
| `/api/app/status` | GET | vertex_gemini | guard |
| `/api/app/worker/tick` | GET, POST | cloud_stt, cloud_tts, vertex_gemini | chat_budget, guard, settle_refund |
| `/api/audio/georgian-song` | POST | cloud_stt, cloud_tts, vertex_gemini | chat_budget, guard, settle_refund |
| `/api/avatar/veo` | GET, POST | cloud_stt, cloud_tts, vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/calls/bridge/[op]` | POST | live_relay, pexels, vertex_gemini | chat_budget, guard, quote_token, reserve, settle_refund |
| `/api/chat/gemini` | POST | vertex_gemini | chat_budget, guard, settle_refund |
| `/api/chat/orchestrate` | POST | cloud_stt, cloud_tts, vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/chat` | POST, GET | vertex_gemini | chat_budget, guard, settle_refund |
| `/api/chat/stream` | POST | cloud_stt, cloud_tts, vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/chat/title` | POST | vertex_gemini | chat_budget, guard, settle_refund |
| `/api/cron/longform-tick` | GET, POST | vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/cron/studio-sweep` | GET, POST | vertex_gemini | guard, settle_refund |
| `/api/documents/create` | POST | vertex_gemini | chat_budget, guard, settle_refund |
| `/api/elevenlabs/tts` | POST | cloud_stt, cloud_tts, vertex_gemini | settle_refund |
| `/api/estimate` | POST | vertex_gemini | guard, settle_refund |
| `/api/film/scene/redo` | POST, GET | cloud_stt, cloud_tts, vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/film/scene/redo/stitch` | POST | cloud_stt, cloud_tts, vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/film/storyboard` | POST | vertex_gemini | chat_budget, guard, settle_refund |
| `/api/film/sweep` | GET | cloud_stt, cloud_tts, vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/gemini/analyze` | POST | vertex_gemini | guard, settle_refund |
| `/api/gemini/chat` | POST | vertex_gemini | chat_budget, guard, settle_refund |
| `/api/generate/[id]` | GET, DELETE | vertex_gemini | guard, settle_refund |
| `/api/generate` | POST, GET | vertex_gemini | guard, settle_refund |
| `/api/genjutsu/capabilities` | GET | vertex_gemini | guard, reserve |
| `/api/genjutsu/generate` | POST | vertex_gemini | guard, reserve, settle_refund |
| `/api/genjutsu/quote` | POST | vertex_gemini | guard, reserve, settle_refund |
| `/api/genjutsu/status` | GET | vertex_gemini | guard, reserve, settle_refund |
| `/api/health/embed` | GET | vertex_gemini | guard |
| `/api/health/providers` | GET | vertex_gemini | guard, reserve |
| `/api/health/public` | GET | cloud_stt, cloud_tts, vertex_gemini | guard |
| `/api/health` | GET, POST | vertex_gemini | guard |
| `/api/health/services` | GET | cloud_stt, cloud_tts, vertex_gemini | guard |
| `/api/image/assets/[id]` | GET | vertex_gemini | guard, quote_token, reserve, settle_refund |
| `/api/image/assets/[id]/versions` | GET | vertex_gemini | guard, quote_token, reserve, settle_refund |
| `/api/image/capabilities` | GET | vertex_gemini | guard, quote_token, reserve, settle_refund |
| `/api/image/commands` | POST | vertex_gemini | guard, quote_token, reserve, settle_refund |
| `/api/image/jobs/[id]/cancel` | POST | vertex_gemini | guard, quote_token, reserve, settle_refund |
| `/api/image/jobs/[id]` | GET | vertex_gemini | guard, quote_token, reserve, settle_refund |
| `/api/image/jobs/quote` | POST | vertex_gemini | guard, quote_token, reserve, settle_refund |
| `/api/image/jobs` | POST | vertex_gemini | guard, quote_token, reserve, settle_refund |
| `/api/image/models` | GET | vertex_gemini | guard, quote_token, reserve, settle_refund |
| `/api/image/operations/validate` | POST | vertex_gemini | guard, quote_token, reserve, settle_refund |
| `/api/memory` | GET, POST, PATCH, DELETE | vertex_gemini | guard |
| `/api/music/studio/capabilities` | GET | vertex_gemini | guard, settle_refund |
| `/api/music/studio/commands` | POST | vertex_gemini | guard, settle_refund |
| `/api/music/studio/edit` | POST | pexels, vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/music/studio/jobs/[id]/cancel` | POST | pexels, vertex_gemini | chat_budget, guard, quote_token, reserve, settle_refund |
| `/api/music/studio/jobs/[id]` | GET | pexels, vertex_gemini | chat_budget, guard, quote_token, reserve, settle_refund |
| `/api/music/studio/jobs` | POST | pexels, vertex_gemini | chat_budget, guard, quote_token, reserve, settle_refund |
| `/api/music/studio/quote` | POST | pexels, vertex_gemini | chat_budget, guard, quote_token, reserve, settle_refund |
| `/api/music/studio/sweep` | GET | pexels, vertex_gemini | chat_budget, guard, quote_token, reserve, settle_refund |
| `/api/nanobanana/image` | POST | vertex_gemini | guard, reserve, settle_refund |
| `/api/orbit/[service]` | GET, POST | cloud_stt, cloud_tts, vertex_gemini | settle_refund |
| `/api/orchestrator/image/produce` | POST | vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/orchestrator/interior/analyze` | POST | vertex_gemini | guard, settle_refund |
| `/api/orchestrator/interior/produce` | POST | vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/orchestrator/interior/style` | POST | vertex_gemini | chat_budget, guard, settle_refund |
| `/api/orchestrator/produce` | POST | vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/orchestrator/script-context` | POST | vertex_gemini | guard, settle_refund |
| `/api/orchestrator/script` | POST | vertex_gemini | chat_budget, guard, settle_refund |
| `/api/pipeline/health` | GET | cloud_stt, cloud_tts, vertex_gemini | guard, reserve |
| `/api/pipeline/remix` | POST | vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/pipeline` | POST, GET | vertex_gemini | guard, settle_refund |
| `/api/preview/google-check` | GET | vertex_gemini | guard |
| `/api/research/[id]/ask` | POST | vertex_gemini | chat_budget, guard, settle_refund |
| `/api/router` | POST | vertex_gemini | guard |
| `/api/studio/catalogue` | GET | vertex_gemini | guard, reserve, settle_refund |
| `/api/system/film-readiness` | GET | vertex_gemini | guard |
| `/api/system/film-selftest` | GET | vertex_gemini | guard |
| `/api/tasks` | GET, POST | pexels, vertex_gemini | chat_budget, guard, quote_token, reserve, settle_refund |
| `/api/tts/gemini` | POST | vertex_gemini | chat_budget, guard, settle_refund |
| `/api/v2/presentation/build` | POST | vertex_gemini | chat_budget, guard, quote_token, reserve, settle_refund |
| `/api/video/assemble` | POST | cloud_stt, cloud_tts, vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/video/clip` | POST | vertex_gemini | guard, reserve, settle_refund |
| `/api/video/director/plan` | POST | vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/video/director` | GET | vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/video/director/runs/[id]/advance` | POST | vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/video/director/runs/[id]/decision` | POST | vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/video/director/runs/[id]` | GET | vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/video/director/runs` | POST | vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/video/engine` | GET | vertex_gemini | guard, reserve |
| `/api/video/longform` | POST | vertex_gemini | chat_budget, guard, settle_refund |
| `/api/video/omni-edit` | POST | vertex_gemini | guard, reserve, settle_refund |
| `/api/video/remix-intent` | POST | vertex_gemini | chat_budget, guard, settle_refund |
| `/api/video/remix` | POST | cloud_stt, cloud_tts, vertex_gemini | chat_budget, guard, reserve, settle_refund |
| `/api/voice-lab/jobs` | GET, POST | cloud_stt, cloud_tts, vertex_gemini | settle_refund |
| `/api/voice/chat` | POST | vertex_gemini | chat_budget, guard, settle_refund |
| `/api/voice/live` | POST | live_relay | chat_budget, guard, settle_refund |
| `/api/voice/realtime/session` | POST | cloud_stt, cloud_tts, vertex_gemini | settle_refund |
| `/api/voice/transcribe` | POST | cloud_stt, vertex_gemini | chat_budget, guard, settle_refund |
| `/api/webhooks/higgsfield` | POST | vertex_gemini | guard, settle_refund |
| `/api/webhooks/phone` | POST, GET | vertex_gemini | chat_budget, guard |
| `/api/webhooks/whatsapp` | GET, POST | live_relay, pexels, vertex_gemini | chat_budget, guard, quote_token, reserve, settle_refund |
