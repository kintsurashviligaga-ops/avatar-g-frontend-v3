# 01 — Repository inventory (v5.1 Phase 0)

Repo `kintsurashviligaga-ops/avatar-g-frontend-v3`, audit base `main` @ **`4c502c7`** (2026-11-12 09:02Z, #286).
Production: last READY deployment `dpl_2vFRByjE…` = `970ca60` (#285, 2026-11-07); `dpl_6ckUgSoT…` for `4c502c7` was
BUILDING at 09:10Z (Vercel deployments API, read-only). Read-only inspection; nothing was installed or run that changes
state.

| Area | Finding | Evidence |
|---|---|---|
| Framework | Next.js `^14.2.35` (App Router), React `^18.3.1`, TypeScript `^5.3.3` `strict: true`, Tailwind `^3.4.1` | `package.json`, `tsconfig.json:11` |
| Node | `engines.node = 24.x`; Vercel region `iad1`; build `npm ci` + `next build` (4 GB heap) | `package.json`, `vercel.json` |
| Size | 513 API `route.ts`, 33 `page.tsx`, 118 top-level `app/api/*` groups, 120 `supabase/migrations` (+ 9 legacy `migrations/`), 1,168 Jest test files, 80 Playwright specs | `find` counts |
| Structure | `app/[locale]/…` pages (account, admin, agent-terminal, library, services, studio, voice-lab, …); `app/api/*`; `lib/*` (~150 domains); `components/*`; `services/` (live-relay on Cloud Run, voice-v2v-node, wa-call-bridge); `workers/` (cpu, gpu); `pilots/adk` (ADK pilot, own lockfile); `apps/myavatar-mcp-server`; `ios/` + `capacitor.config.json` | `ls` |
| Auth & sessions | Supabase Auth (`@supabase/ssr`), `middleware.ts`, service-role client server-side only | `lib/supabase/server`, `middleware.ts` |
| Database | Supabase Postgres, production project `zwksnayknzggdcenqqxy` (ap-southeast-1); `supabase-beige-river` is NOT production | `docs/production-truth/PRODUCT_TRUTH_MATRIX.md` §2, `tests/video-core-live/guard.ts:21` |
| Storage / library | Supabase Storage (private buckets incl. `renders`, `uploads`, `workspaces`), GCS for Veo output, `library_favorites`, generation_jobs → Library | migrations `20261009b_renders_private`, `20261024a`, `lib/agent/workspace/store.ts` |
| Credits / ledger | `public.credit_ledger` + RPCs `deduct_credits`, `deduct_credits_once`, `refund_credits` (canonical, `lib/orchestrator/ledger.ts`); GEL wallet `credit_wallet_gel` / `debit_wallet_gel`; legacy `public.credits` + `deduct_credits_transaction` still called from 8 routes (`lib/billing/enforce.ts`) | see `06-financial-and-bog-audit.md` |
| BOG | checkout, webhook, order status, subscription, admin, cron `bog-billing`; SQL RPC `bog_fulfill_order` | `app/api/billing/bog/*`, `supabase/migrations/20261002a_bog_billing.sql` |
| AI integrations | Google via Vertex only (`lib/ai/google/transport.ts`); legacy vendor clients still in tree (Replicate 139 files, ElevenLabs 134, Udio 689 matches, HeyGen 60, Kling 69, Runway 31, OpenRouter 8, Anthropic in `lib/orchestrator/providers.ts`), refused at runtime by `lib/providers/mediaPolicy.ts` | `04-google-ai-integration-audit.md` |
| Media pipelines | Veo (`lib/veo`), Omni (`lib/video/omniClip.ts`, `omniEdit.ts`), montage/assembly (`lib/video/*`, `/api/video/assemble`), Lyria (`lib/ai/lyriaMusic.ts`), image (`lib/ai/geminiImage.ts`), TTS (`lib/audio/google-tts.ts`, `/api/tts/gemini`), STT (Chirp 3, Gemini), Live (`lib/voice/*`, `services/live-relay`) | paths |
| Jobs / queues / cron | 10 Vercel crons: optimize-agents, drain-renders, app/worker/tick, studio-sweep, bog-billing, research-sweep, agent/media/sweep, film/sweep, music/studio/sweep, deliveries; durable runs with leases (`runIsolation.pg.test.ts`); Agent G task graph in workspace storage | `vercel.json` |
| Observability | Sentry (client/server/edge configs, `instrumentation.ts`), `lib/observability/*` (report-error, agentTrace), `/api/health` | files |
| CI/CD | GitHub Actions: `ci.yml` (tsc, lint, Jest, agent-g-gate), `e2e.yml` (Preview contract), `adk-pilot.yml`, `bog-e2e.yml`, `bog-production-smoke.yml`, speech/voice/video/music/image acceptance workflows; Vercel git auto-deploy from `main` to production | `.github/workflows/` |
| Tests | Jest (unit + real-Postgres isolation tests), Playwright (preview, smoke, perf, speech, video-core, music), SQL scenario tests for BOG (`tests/sql/bog`) | `09-testing-and-quality-audit.md` |
| Feature flags (names) | `AGENT_G_SANDBOX`, `SANDBOX_ENABLED`, `BROWSER_ENABLED`, `BROWSER_SNAPSHOT_ID`, `CONNECTORS_DRIVE`, `BOG_CHECKOUT_MODE`, `LIVE_AUDIENCE`, `LIVE_AVATAR_AUDIENCE`, `NEXT_PUBLIC_LIVE_AVATAR`, `MUSIC_LYRIA_VOCALS_VERIFIED`, `MUSIC_LYRIA_PRO_VERIFIED`, `AGENT_G_MEDIA_EXEC` (73 files), `GEMINI_TRANSPORT`, `VEO_DAILY_LIMIT_USD` (11 files), `STT_ENGINE` | production-truth §3, grep |
| Localization | next-intl; `messages/ka.json`, `en.json`, `ru.json`; Georgian default (`googleOnlyMessage` falls back to ka) | `messages/`, `lib/providers/mediaPolicy.ts:26` |
| CLAUDE.md | **none** in the repo root or `.claude/` (only `launch.json`, `settings.json`). Nothing to overwrite. | `ls` |
| Known tech debt | two ledgers still referenced; ~60 routes import a refused vendor client; dead model ids (Imagen 4, 2.0 Flash, Veo previews); `_graveyard/`; many historical root docs (GROUND_TRUTH.md, PROJECT_MASTER.md, …) that are not evidence | below + `08` |

## Section 18 specification search (repo only)

| Term | Files | What exists |
|---|---|---|
| `v2.1` | 47 | mostly third-party model ids (e.g. Kling `v2.1`) and docs |
| `v2.2` | 1 | not a spec |
| `v3.0` | 7 | docs |
| `v3.1` | 393 | MASTER TASK v3.1 comments/docs (`docs/master-v3.1/*`) |
| `v4.0` | 1 | `lib/providers/higgsfield/models.ts:36` (`ideogram/v4.0`), not a spec |
| `v5.0` | 0 | — |
| `Carbon` | 0 | Gemini 4 Carbon not referenced |
| `Argon` | 0 (2 hits are the word "jargon") | Gemini 4 Argon not referenced |
| `omniClip` | 15 | `lib/video/omniClip.ts` and callers |
| `gemini-omni` | 7 | `gemini-omni-1.1-flash-preview`, `gemini-omni-flash` engine label |
| `AGENT_G_MEDIA_EXEC` | 73 | Agent G media execution flag |
| `google_only` | 201 | refusal code + tests |
| `VEO_DAILY_LIMIT_USD` | 11 | Veo daily spend cap |
| `antigravity` | 2 | a test string `antigravity-preview-05-2026` (`lib/research/limits.test.ts:41`), `PROJECT_MASTER.md:958` |
| `agy-bridge` | 0 | not present |
| `gemini-decision` / `decisions-api` | 0 | not present |

The v4.0 and v5.1 specifications are **not** repository files; they exist only as conversation attachments.
