# PROMPTS.verified.md — v180 plan, corrected against the real repo

_Verified from `GROUND_TRUTH.md` + `SCHEMA_MAP.md` (read, not assumed). Branch `feat/prod-upgrade-v180`.
This supersedes assumptions in `PROMPTS.md`. Where they conflict, **this file wins** (STEP 0 rule 7)._

## 0. Global corrections (4 wrong assumptions + 2 structural)

| PROMPTS.md said | REAL | Every step that used it now uses |
|---|---|---|
| pnpm | **npm** (`package-lock.json`) | GREEN GATE = `npm run build` + `npx tsc --noEmit`; `pnpm dlx X` → `npx X`; `pnpm why ai` → `npm ls ai` |
| BullMQ/Upstash queue | **Upstash Redis only** (`lib/platform/queues.ts`; QueueNames `webhooks_ingest\|processing_jobs\|billing_events`) + durable `generation_jobs` | STEP 2/3/5 "enqueue via BullMQ" → Upstash queue helpers + `generation_jobs` rows (Agent G stays sole job creator) |
| AI SDK `ai` v4/v5 | **v6.0.172** (`@ai-sdk/react@^3`) | STEP 3 — **read `node_modules/ai` exports + the v6 migration guide; do NOT assume the API** |
| 6-service registry (Chat/Image/Music/Video/Avatar/Remix) | **3 registry files**, 14–22 services; `lib/registry.ts` most-imported | "the Video service" = the film pipeline (below); registry key stays stable, only labels change |
| Kling v2.1 (STEP 3) | **`kling-v1.6-standard`** (repo default; `REPLICATE_VIDEO_MODEL` override) | STEP 3 `orchestrate_media` uses the v1.6-standard model name, not v2.1 |
| `src/` tree | **No `src/`** — app dir at repo root | all paths resolve at root (`app/`, `lib/`, `components/`) |
| ATLAS_CLOUD_API_KEY | code uses **`ATLAS_API_KEY`** (+ `ATLAS_KLING_API_KEY`) | STEP 2/3 scripting env name |

## 0b. NOT FOUND in the repo (referenced by PROMPTS.md, absent)
`pnpm-lock.yaml` · `bullmq` · `@upstash/qstash` · `src/` · `ATLAS_CLOUD_API_KEY` (name) ·
the "Chat/Image/Music/Video/Avatar/Remix" 6-tuple registry · `remotion` (not a dep) ·
any `with-timestamps` TTS usage (new in STEP 2) · BOG/TBC env vars (STEP 6 = Stripe only) ·
`gh` CLI (not installed on this machine).

## 0c. Decisions locked in (owner-approved)
- **STEP 1.2 (new repo `myavatar-core-production`) + 1.3 (new-repo Vercel preview): DECOUPLED / SKIPPED.** A repo move cleans nothing, adds prod-repoint/archive/env-rebuild risk, and STEP 2–6 don't need it. **All work continues on `feat/prod-upgrade-v180` in the existing repo.** (History migration, if ever wanted, is a manual human step; prod stays on the old repo until a preview is green.)
- **STEP 1.1 quarantine: DEFERRED to a separate human-reviewed effort** — not `--auto`. Signal is noisy (ts-prune 2,351 export-level, mostly Next framework false positives; knip needs a tuned config). Even depcheck's 15+11 unused deps need eye-review (types-only / CLI-invoked packages false-positive). See `UNUSED_REPORT.md`.
- **Env audit done:** `ENV_CHECKLIST.md` — all 10 required-minimum vars present on Vercel, no `NEXT_PUBLIC_` secret leaks.

## STEP 2 — Video → Hollywood-grade ad generator  (verified pre-flight)
- **Video pipeline files (READ FIRST):** `lib/chat/filmPipeline.ts` (planFilmScenes — scene prompts), `lib/chat/filmComposite.ts` (server fan-out), entry `app/api/chat/orchestrate/route.ts` (dispatch→poll) + `app/api/video/assemble/route.ts` (FFmpeg stitch). Reuse the existing Director/Storyboard/Narrator/Editor agents — do NOT create parallel ones. (Recent fixes live here: script-faithful scenes, size-bound master, timed downloads.)
- **Storage bucket:** **`renders`** (video masters) + **`uploads`** (reference images / audio). service_role stays server-side (`SUPABASE_SERVICE_ROLE_KEY`, not `NEXT_PUBLIC_`). Signed URLs via `uploadAndSign`/`uploadBufferAndSign` (`lib/orchestrator/storage-adapter.ts`).
- **Script agent:** Atlas Cloud / DeepSeek env is **`ATLAS_API_KEY`** / `ATLAS_KLING_API_KEY` (+ `ATLAS_MODEL`). Strict-JSON + zod + retry-once already the pattern in `promptAgent.ts`.
- **Captions:** **Remotion is NOT installed.** CORRECTION: the pipeline does NOT use `.ass`/drawtext — prod `ffmpeg-static` lacks libfreetype → tofu. It renders each caption as **SVG → PNG via `@resvg/resvg-js` with embedded FiraGO**, then overlays the PNG (`renderSubtitleCardPng` / `buildSubtitleCardSvg` in `lib/pipeline/compositing/ffmpeg-overlay.ts`; fonts in `font-data-firago.ts`). **Georgian glyph gate VERIFIED 2026-07-02:** a real rendered frame of „ახალი დღე, ახალი ფასდაკლება" shows correct Mkhedruli glyphs (not tofu). Missing/mis-wired font → ⛔ STOP.
- **Word-synced captions:** the `POST /v1/text-to-speech/{voice_id}/with-timestamps` endpoint is **NEW** (no current usage). Use its `alignment` char times → group by whitespace → word timings. Do NOT estimate.
- **Queue:** heavy render enqueues via the **Upstash** queue + `generation_jobs` (not BullMQ); Agent G is the sole job creator; never block the request thread.
- **Cost:** enforce `profiles.credits_balance` + `free_films_remaining` (the 3-free rule) + the **$5 session budget cap** → over-budget returns "top-up needed" / ⛔ STOP.

## STEP 3 — Autonomous Agent (Chat)  (verified pre-flight)
- **AI SDK v6 GATE (must read, not assume):** `npm ls ai` = `6.0.172`. There is no generic `ai/agents`. **Read `node_modules/ai`'s real exports + the v6 migration guide** and build from that. Likely-but-UNCONFIRMED: `generateText`/`streamText` + `tools` + `stopWhen: stepCountIs(n)`, client `useChat` from `@ai-sdk/react`. If any API is ambiguous → report & stop, don't guess.
- **⚠️ Version question for the owner:** `^6.0.172` appears set directly (a fresh major). If the bump was unintentional, weigh pinning v5 to avoid production churn before building the ReAct loop on it.
- `web_search`: **`TAVILY_API_KEY` is present on Vercel** ✅ (Serper absent) — use Tavily.
- `orchestrate_media`: chains Image/Music/Video/Avatar/Remix + STEP 2; enqueues (Upstash) and returns — never hold a serverless fn through a Kling render.
- New table `agent_execution_feedback`: **no collision** (safe to create). Existing analogues: `ai_usage_log`, `gemini_message_feedback` (don't duplicate their intent).
- `prepare_instagram_post`: PREPARE only → ⛔ STOP. Never auto-publish.

## STEP 5 — new tables `prompt_optimization_proposals`, `agent_configs`: **no collision** (safe). Background job = **Upstash repeatable / Vercel Cron** (`CRON_SECRET` present), not BullMQ.

## STEP 6 — Payments = **Stripe** (6 routes under `app/api/stripe`; `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` present). **No BOG/TBC configured.** Reuse the credit/webhook landscape in `SCHEMA_MAP.md` (`profiles.credits_balance`, `credit_ledger`, `wallet_topups`, `stripe_events`/`webhook_events`/`billing_webhook_events`/`payment_attempts`) — **read their columns before creating `payment_events`; prefer extending existing over a parallel table.**

## GREEN GATE (every sub-step) = `npm run build` exit 0 AND `npx tsc --noEmit` exit 0 AND no new lint. Never push forward on red.
