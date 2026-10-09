# Final launch certification — MyAvatar.ge (Master Task §56)

Date 2026-10-08. Author: Claude (Senior Web Developer role), Master Task §60 steps 1–26.
Labels: **PROVEN** (a check that ran proves it) · **BUILT_NOT_PROVEN** (code + unit tests with mocks, no live or E2E proof) ·
**PARTIAL** · **MISSING** · **BLOCKED_OWNER** (only the owner can run or decide it) · **FAILED** · **DEPRECATED**.
"Unit" proof means the code path is tested with providers mocked; it is never a claim about production.
Nothing here was run against a paid provider except the owner-approved GCP Part 0 T2 test (≈ $0.11, see L).

Step 26 is honoured: **nothing was promoted to production, merged to main, or applied to the database.**

---

## A. Exact state

| Item | Value |
|---|---|
| Branch | `claude/launch-certification-wmvitt` (draft PR #42, base `main`) |
| SHA | Full retest on `70a5fe88` (2026-10-08 13:13 UTC). Since then: the OTP fix `0421377a` from PR #43 (tsc 0, 10 auth suites / 127 tests, `tests/auth-sheet.spec.ts` 8 / 8) and documentation only. CI green on `e1dfffc2` |
| `main` | `572d5fac` (2026-10-03) |
| Production | https://myavatar.ge serves an older deployment (`dpl_ANGLbd7AGjDQyYHCGk5UJQsrp2Rr`, read 2026-10-08) built from `main`; none of this branch is live |
| Preview | Vercel builds a Preview per push of PR #42 (Vercel Preview Comments check green). PR #43 (GCP Part 0) carries the Vertex WIF env, Preview only |
| Environment | Preview and Production share one Supabase project (any Preview test writes to the production DB). Production has `GEMINI_API_KEY` and no `GCP_*` / `VEO_TRANSPORT`, so every Google call in Production bills the AI Studio balance ($13.21), not the $300 GCP credit |
| Related branches | PR #43 `claude/gcp-part0-wif-fmtfxp` (GCP Part 0, Vertex WIF, OTP fix owner); PR #44 `claude/vertex-migration-fixes` → `codex/vertex-ai-migration` (the earlier agent's Vertex WIP made green, unmerged); `claude/admin-panel-audit-co2mng` (admin panel, after Part 0) |

## B. Build

All run on `70a5fe88` in the cloud sandbox, 2026-10-08 (logs not committed; numbers copied from the runs).

| Check | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | exit 0, no errors |
| `npx next lint` | exit 0: 0 errors, 35 warnings (pre-existing classes: `jsx-a11y` aria props, hook deps) |
| `npx jest --forceExit` (full) | **643 / 643 suites, 10,294 passed, 3 skipped, 0 failed** (baseline on `main` at the start: 613 suites, 9,784 passed) |
| `npm run build` with CI's dummy env | exit 0, "Compiled successfully"; shared first-load JS 89 kB; `/[locale]` 306 kB first load |
| Playwright, all 27 local specs (251 tests), fresh `next dev`, 3 workers | 239 passed, 10 skipped (8 pre-existing `test.fixme`, screenshot-only, env-gated), 2 failed under load: `landing.spec.ts:116` (dev server reset the connection, ECONNRESET) and `swarm-pipelines.spec.ts:28` (60 s timeout across six cold route compiles). **Both pass when re-run alone on a fresh server (4 / 4).** |
| GitHub CI on PR #42 | green on every pushed head through `70a5fe88` |
| HawkScan DAST | not run: `HAWK_API_KEY` is not set |

Not proven by any of the above: anything against real providers, real Supabase, real Stripe, or a real phone. Those are in Y.

## C. Services architecture

**Before** (`docs/handoffs/service-inventory.md`): no SSoT. Nine registries named the services and disagreed on ids, names,
counts (13 / 17 / 18 / 22 / 24 / 25 / 26) and prices. Two extra shells (`/hub`, `/workspace`) showed hard-coded fake stats
("12 Avatars Created", "98% Success Rate") and an "Image Creator" that returned text from `/api/ai` while charging image credits.

**After** (`lib/catalog/services.ts`, `lib/catalog/nav.ts`, `docs/handoffs/service-taxonomy.md`):
- **9 categories in 3 groups.** Agent G (first, on its own); Create: Video · Image & Photo · Avatar · Music · Voice & Audio;
  Work: Text & Content · Design · Code (Search & Research folds into Agent G).
- **22 canonical services**, each on exactly one studio tool and one quote key (R5). Statuses: live, beta (`design.model3d`),
  coming-soon (`music.remix`, `code.terminal`).
- **Shortcuts open the same service** (music video ← Music, dubbing ← Video, character swap ← Avatar, product ad ← Image,
  soundtrack ← Video); never a second implementation (§24 matrix in the taxonomy doc).
- **Removed duplicates:** `/hub` and `/workspace` shells, their panels and fake-stat dashboards deleted. The "13 Services"
  strings removed; `/services` reads `countServices()`.
- **Redirects:** `/{lang}/hub/*` and `/{lang}/workspace/*` → `/{lang}/dashboard` (`next.config.js`). Legacy
  `/{lang}/services/<slug>` pages stay for SEO; their CTA opens the catalog service (`LEGACY_SLUG_TO_SERVICE`).
- Status: **BUILT_NOT_PROVEN** in production (not deployed). Unit tests: `lib/catalog/*.test.ts`; E2E: the tool sheet and
  the desktop sidebar render the catalog's category lists (`tests/landing.spec.ts`, `tests/ui-newtools.spec.ts`, local run).
- §50 analytics events: **BUILT_NOT_PROVEN** (not deployed). `lib/analytics/serviceEvents.ts` names the funnel by catalog id:
  `catalog_category_viewed` (sidebar category opened), `catalog_service_opened` (sidebar, + sheet, `?tool=`, Agent G route,
  voice), `service_quote_shown` (every priced Generate button and Agent G's card, de-duplicated),
  `service_generation_confirmed` (panel / composer Generate, product / swap / remix run, Agent G card Create, voice
  countdown, storyboard approve), `service_generation_completed` (the studio's one completion hook, free runs included),
  `service_generation_failed` (film, image, image batch, music, lipsync; short codes only) and `service_result_saved`
  (Save to library). Props are ids, counts and short codes, never prompts or URLs. They go through the existing tracker to
  Vercel Web Analytics and `analytics_events` (exists in Production, RLS on, 27 rows in the last 7 days, checked 2026-10-08).
  Tests: `lib/analytics/serviceEvents.test.ts`, `GenerateButton.test.tsx`. Not covered yet: the `/services` page (a server
  component), Deep Research's Start sheet (no catalog id of its own), failures inside the separate lipsync / motion / VFX
  panels, and the + sheet (it shows every category at once, so there is no "category opened").
- §51 search: **BUILT_NOT_PROVEN** (not deployed). The sidebar's „ძებნა" box now finds services as well as chats:
  `searchServices` (lib/catalog/services.ts) matches what is typed, half words included („მუს", „реклам"), against every
  service's aliases, label and modes in ka/en/ru; Agent G's pick for the same text is always first; a coming-soon service
  is listed as „მალე" and opens nothing. A found service opens with its mode and is counted as `catalog_service_opened`
  with surface `search`. Same change fixed a broken shortcut: the catalog link to Music video
  (`?tool=video&mode=musicvideo`, used by /services) opened plain Video; the studio now applies the mode. Tests:
  `services.test.ts` (searchServices, serviceModeQuery), `ServiceSearchResults.test.tsx`, `serviceSearch.wiring.test.ts`.
- Still open: 5 legacy registries are imported by legacy API routes (`/api/pipeline`, `/api/agents/*`) and must be deprecated
  with them.

## D. Agent G

| Area | State | Evidence |
|---|---|---|
| Tool matrix | Chat (Gemini), Google Search grounding, `/api/agent/run` ReAct loop with `web_search` and `scrape_webpage`, prepare-only Instagram post. No render tool by design (renders go through the priced studio) | `lib/agent/react/bindLiveAgent.ts` |
| Routing | Deterministic catalog router (`lib/catalog/agentRoute.ts`) opens a tool, never renders or charges; questions are answered in prose; coming-soon services are named as unavailable, never substituted | `agentRoute.test.ts`, `agentRoute.wiring.test.ts` (forbids fetch / `/api/` in the branch) — BUILT_NOT_PROVEN |
| Orchestration | ReAct loop bounded (max steps, deadline), Gemini-only under `AI_GOOGLE_ONLY`. Observations are wrapped as untrusted data ("never instructions") | `coordinator.ts`, `coordinator.test.ts` |
| Approvals | Paid generation needs the priced button (text) or a spoken "yes" plus a cancellable 3 s countdown (voice). Click guard refuses spend / pay / delete / sign-out / password | `liveActions.test.tsx`, `lib/voice/liveUi.test.ts` — PROVEN (unit) |
| System prompt | One prompt on every Agent G door (`lib/chat/platformPrompt.ts`: catalog services, prices from `lib/credits/pricing`, Google engines only where they are the primary path). Until 2026-10-08 `/api/chat/stream`, `/api/agent-g/chat` (and `/api/agent-g/delegate`), the Telegram channel and `/api/chat`'s non-Google fallback still sent the old prompt, which named HeyGen, Replicate, LTX, Udio and WorldLabs as the engines, offered services that do not exist (Game Creator, Tourism AI, Voice Clone) and gave three different service counts (7, 13, 14). `lib/agent-g-orchestrator.ts` now returns the platform prompt per request, with the request's locale and whether it has Google Search. BUILT_NOT_PROVEN (not deployed) | `lib/agent-g-orchestrator.test.ts`, `platformPrompt.test.ts` |
| Live events (§30) | PARTIAL: search and tool steps (running / done / failed / cancelled), countdown banner, price cards. No plan-summary, progress or output-ready events; no equivalent stream in the text chat | `components/voice/live/liveActivity.ts` |

## E. Live Voice

Transport: the browser opens a WebSocket to Gemini Live (`BidiGenerateContentConstrained`) with a 30-minute single-use
ephemeral token minted by `/api/voice/live` with `GEMINI_API_KEY` — **Gemini Developer API, not Vertex**. The server owns the
whole session setup (model allowlist, system instruction, voice, tools). Mint is auth-gated, IP- and per-user-limited and
budget-guarded (PROVEN, unit: `app/api/voice/live/route.test.ts`).

| Requirement | Label | Evidence |
|---|---|---|
| Mic → model → speech | BUILT_NOT_PROVEN | live-verified once on 2026-09-30 per the route header; E2E `tests/live-voice-e2e.spec.ts` mocks Google WS (passes locally) |
| Same context, text → voice | **BUILT_NOT_PROVEN (fixed this run)** | the mint now carries the chat session id; the route loads the owner's newest turns into a bounded, delimited history block (`lib/voice/liveThread.ts`, 11 + 5 + 1 tests, mutation-checked). Unverified live: depends on `chat_sessions.session_id` existing in Production (migration `20260801_durable_chat_history.sql`) |
| Same context, voice → text | BUILT_NOT_PROVEN | each finished voice turn is appended to the thread and saved |
| Invoke Agent G tools | **BUILT_NOT_PROVEN (fixed this run)** | new Live function `ask_agent_g` hands a research task to Agent G's loop (`POST /api/agent/run`, web_search + scrape_webpage, 4 steps, 45 s budget, 60 s client timeout) and returns the answer, its sources and an untrusted-data note; failures map to a sentence the model repeats (219958d2; 55 suites / 947 tests in voice + agent, mutation-checked). Unverified live: Google accepting the extra function in the token lock, and the call staying open while it waits |
| Search | BUILT_NOT_PROVEN | Google Search grounding locked into the token |
| Web read | PROVEN (unit) | `/api/voice/web-read`, SSRF rules in `lib/web/readPage.test.ts` |
| Browser control | **MISSING** | see H |
| File task | MISSING | no Live function reads a user file |
| Generation by voice | BUILT_NOT_PROVEN | `prepare_generation` → price → spoken yes → `start_generation` countdown |
| Prompt injection from a page (VWEB-06) | BUILT_NOT_PROVEN | the tool answer marks page text as untrusted third-party data; no test feeds a hostile page to the model |

## F. Search

Text chat: Gemini with Google Search grounding, citations rendered (`research.web-search` → chat). Agent G: `web_search`
(grounded Gemini). Voice: grounding in the Live lock. **BUILT_NOT_PROVEN**: no live run in this certification (it bills the
Gemini API). Kill switches: `GEMINI_LIVE_GOOGLE_SEARCH=0`.

## G. Scrape

`lib/web/readPage` + `/api/voice/web-read` + Agent G `scrape_webpage`. All caller-chosen fetches now go through one guarded
fetch (`lib/web/publicFetch.ts`): public hosts only, every redirect hop re-validated, DNS answer checked and the connection
pinned to it (anti-rebinding), media types only where media is expected, byte caps while streaming. ffmpeg never fetches a
URL itself: inputs are downloaded through the guard and read with `-protocol_whitelist file` and a demuxer whitelist
(`lib/video/ffmpegExec.ts`). **PROVEN (unit)** for the SSRF rules (`publicFetch`, `ffmpegExec` with real ffmpeg, redirect to
metadata refused, private DNS refused, HLS playlist refused). Live scrape: BUILT_NOT_PROVEN.

## H. Browser

**MISSING. Launch blocker (§55 "Browser nonfunctional").** There is no remote or headless browser session, navigation,
snapshot or screenshot anywhere in the code. `open_url` shows a link the user taps; `click` / `type_text` drive only the
MyAvatar UI. Building it needs an infrastructure decision the owner must make: a headless browser cannot run inside a
Vercel function as shipped, and a hosted browser service would be a new provider outside PROJECT_MASTER §A (Google +
ElevenLabs only). The approve-then-run gate for high-risk browser actions (§32) therefore also does not exist.

## I. One Window

The studio (`/{lang}` guests, `/{lang}/dashboard` signed in) is the only workspace: `/hub` and `/workspace` redirect to it;
every menu (sidebar, + sheet, tools picker, plugins, `/services`) reads the catalog; Agent G is first; every catalog service
opens inside the studio by `?tool=` (no separate app). Legacy `/services/<slug>` pages remain as SEO landing pages whose
CTA opens the studio. `/{lang}/studio` (Studio V2 behind `STUDIO_V2`, off) is still a second implementation waiting for a
merge-or-retire decision. **BUILT_NOT_PROVEN** (not deployed).

## J. Video V1–V6

New domain layer `lib/video/director/` (commit `fd989146`): `GoogleVeoProvider` (`providerName === "google_veo"`, the director
refuses any other provider and look-alikes), `planStoryboard` → user approval → `freeze` (deep-frozen; unapproved or invalid
storyboards refused), `executeStoryboard` runs shots in order; prompts reach the engine byte-for-byte (Georgian, emoji,
combining marks, CRLF tested); a ConsistencyLock supplies seed / reference / aspect to every shot; `ShotError` with the 8
reasons; the first failed shot halts the run in `waiting_for_shot_decision` and later shots are never submitted; retry /
edit / cancel. Every engine change Veo would make silently (duration snap, aspect, seed coercion, reference on Lite) is
refused before any money is spent. 121 tests (`npx jest lib/video/director`), mutation-checked.

Since then (commits `08671489`, `e09ee27f`, `8aa2a9f7`) the director runs inside the product, behind the flag
`VIDEO_DIRECTOR_RUNS` (unset = off: every director route answers 404 before reading the session; `admin` = admins only;
`1` = every signed-in user). A run is stored in `director_runs` (migration `20261008b`, applied to Production 2026-10-08 16:01Z) and advanced one
bounded step per request: claim the shot (compare-and-set on `version`), charge that shot's share
(`director:<run>:shot:<i>:a<attempt>`), submit once, poll, refund a shot that delivers no clip. In Production a missing
ledger refuses the shot instead of rendering it free. With the flag on, the studio's storyboard Approve opens the director
run instead of the film render: each scene's text goes over untouched, a board the rules refuse is listed with every
problem, and a failed shot waits for retry / edit / cancel. A director run delivers per-shot clips only: no assembly,
music bed, narration or colour pass. 169 tests across the director, its routes and the studio overlay.

| Invariant | Label |
|---|---|
| V1–V6 in the domain layer | BUILT_NOT_PROVEN (unit) |
| Wired into the product's video flow | BUILT_NOT_PROVEN (unit + route + component tests): the studio's Approve runs the director when `VIDEO_DIRECTOR_RUNS` lets the user in; off by default, so Production is unchanged. Migration `20261008b` is applied (2026-10-08); the flag is `admin` on Preview only since 16:42Z (owner action 3b done), so an admin can try it there; no director run has been tried live yet |
| Live Veo run | **INFERENCE VERIFIED 2026-10-08 15:49Z** (Vertex, WIF, Preview of PR #43 at `75eef69`): veo-3.1-fast-generate-001, 4 s, 720p, op `fbe5ed00-…` done with no error and raiMediaFilteredCount 0; the MP4 in `gs://myavatar-veo-outputs` is h264 1280x720 24 fps + AAC, 4.01 s, and its frame matches the prompt. Cloud Monitoring shows PredictLongRunning from SA myavatar-veo only (AI Studio key unused). The earlier presses (14:45, 14:52) failed on `enhancePrompt: false` with no video; fix `75eef69` is cherry-picked here. Production still renders Veo through the API key until A1 (owner) |
| Byte-for-byte on the wire | BUILT_NOT_PROVEN (unit): the director's requests carry `verbatimPrompt: true`, so `lib/veo/payload.ts` sends the prompt and negative prompt exactly as given on both transports (commit `a24bb320`; other callers keep the trim). The preflight still refuses any wire that would alter a prompt. Limit (PROVEN by the T1 failure): Veo 3.x always rewrites the prompt inside Google and refuses `enhancePrompt: false`, so V3 holds on the wire, not inside the model; the studio's no-op "let Google rewrite" switch was removed |

## K. Model Catalog

`lib/ai/google/models.ts` allowlists the Live model; the chat model picker offers Google models. On `main` the studio
catalogue still lists Higgsfield / Udio / NanoBanana / Grok / FLUX rows. PR #44 (the earlier agent's WIP, now green:
tsc 0, jest 9789 passed, lint 0 errors) makes the catalogue Google-only, but it is unmerged and keeps known gaps (listed in
the PR). **NOT PROVEN.**

**ModelCatalog data and runtime check (Part 2 objective D, BUILT_NOT_PROVEN).** `lib/models/catalog.ts` holds the 28
Google models the code calls (chat chains, REST tiers, STT, TTS, Live, the storyboard image model, Imagen 4, the six Veo
ids, Lyria 3, embeddings, the Deep Research agent) and passes the Part 1 contract's validation. `verifiedAt` is set only
from dated calls on record (the new project's key on 2026-10-02, Vertex T2 on 2026-10-08); Veo, Imagen 4 and the extra
Live ids have none; the Gemini 2.5 text models are left out (listed, but refused for new projects). A test fails when
the code's default model ids are not catalogued (D3). `lib/models/verify.ts` checks the catalog against the runtime for
free (the key's model list, or `countTokens` on Vertex), switches off ids the runtime lacks and queues unknown ones for
review without adding them; `GET /api/admin/model-catalog` (admin only) shows the result. **Not done:** the studio's
model pickers still read `lib/providers/catalogue` (its non-Google rows go with owner action 9), and no runtime check has
run on a deployment yet.

## L. Provider boundary

**FAILED on `main` and on this branch.** 10 of the 20 usable catalog services run on a §A violation path today
(`docs/handoffs/service-taxonomy.md` §2): image = NanoBananaAI → Grok → FLUX; avatar = HeyGen / Replicate; music cascade
includes Udio; product ad / motion / swap = Kling (Replicate / Higgsfield); 3D = Replicate TRELLIS; `/api/pipeline` text
services fall back Gemini → Anthropic → OpenAI with no gate (R7 silent fallback).

**Silent fallbacks removed on this branch (R7, commits `8a2d1b0f`, `32abf9ad`; BUILT_NOT_PROVEN, Production unchanged until
a deploy).** Each request now uses one provider and a miss is the route's explicit error, refunded where the route charged:
image has no Grok / FLUX leg behind NanoBanana; `lib/ai/llmText` (14 internal text callers, the director's planner among
them) is Gemini only; `/api/pipeline` text tools and Terminal are Gemini only; music Auto is Lyria alone; the film music
bed and the product-ad music have no MusicGen leg; TTS and film voice-over have no Azure / Google leg behind ElevenLabs.
Every removed leg, put back, fails the new tests. Admin health now reports scene planning as live only on the Gemini key.

**Claude removed from chat (Part 2 step 1, BUILT_NOT_PROVEN).** `lib/chat/providerRouter` no longer sends "specialist"
turns (code, maths, blueprints) to Claude before Gemini and no longer answers from Claude when Gemini fails; a Gemini
miss is the explicit "Chat is temporarily unavailable" reply tagged `gemini`. Agent G's personality reply (web and
Telegram) has no Claude Haiku fallback; a miss is its localized fallback line. Tests `lib/chat/textGeminiOnly.test.ts`
(7) and `lib/agentg/personality.test.ts` (3) fail on the old code. `/api/chat`, `/api/chat/gemini` and `/api/chat/stream`
still keep an Anthropic leg that runs only when `AI_GOOGLE_ONLY=0` (default on, so off); it goes with B1.

**Claude removed from the orchestrator routes (Part 2 B1, BUILT_NOT_PROVEN).** The script, produce, image / music
produce and interior style / produce routes asked Claude for their JSON plan whenever `ANTHROPIC_API_KEY` was set, with no
flag. They now take it from `lib/ai/llmText` (Gemini only, JSON mode, the platform budget gate) and keep their
deterministic plan on a miss. Test `app/api/orchestrator/geminiOnly.test.ts` (4; its source scan fails on the old code).
Claude is still reachable only behind flags: `AI_GOOGLE_ONLY=0` (chat routes, remix intent, prompt translation),
`VIDEO_GOOGLE_ONLY=0` (auto marketing overlay copy) and `FILM_VISION_QA=1` (keyframe vision QA, off unless set).

**Forbidden providers still reachable as the primary (explicit, not silent; Part 2, owner action 9):** NanoBanana itself
(`api.nanobananaapi.ai`, a third-party reseller, not Google); avatar HeyGen / SadTalker; swap / motion / product ad Kling,
roop, Higgsfield; 3D TRELLIS; interior World Labs; music on an explicit pick of Udio or MusicGen, cover (MusicGen-melody),
"your voice" songs (MiniMax, RVC), cover art (Pollinations); `/api/pipeline` voice on OpenAI TTS when Google-only is off;
`lib/chat/ServiceManager` still imports the Grok image client. The owner chose "not now" on removing them (decision card,
2026-10-08 17:16 UTC): action 9 stays open, and PR #44's provider removals are not merged into this branch.

GCP Part 0 is CONFIGURED; Gemini text, Gemini image and Lyria **INFERENCE PROVEN on Vertex** from the owner's Mac
(≈ $0.11, owner-approved 11:47 UTC); Imagen 4 is not available on Vertex for this project (404).

**Google transport (Part 2 A2, BUILT_NOT_PROVEN).** `lib/ai/google/transport.ts` implements the Part 1 contract:
`GEMINI_TRANSPORT` unset (or `gemini_api` / `gemini`) keeps today's Gemini API calls unchanged; `vertex` sends them to
`aiplatform.googleapis.com` (`locations/global`, `GCP_GEMINI_LOCATION` to override) with the Workload Identity token, no
API key and no Veo bucket needed; an unconfigured transport is `NotConfiguredError`, never the other transport; an unknown
value fails closed. On it now: `lib/gemini/client` (19 importers) and `llmText` (11), the studio chat stream and grounded search
(`chatStream`), Agent G's reply and intent parser, the storyboard image model and Lyria 3 (Vertex `:generateContent` with
AUDIO + TEXT, as in T2). `lib/ai/google/provider.ts` points the existing `@ai-sdk/google` at the Vertex endpoint (no new
package). Also on it: speech-to-text (`lib/voice-v2v/geminiStt`), read-aloud TTS (`/api/tts/gemini`; its TTS model is not
yet proven on Vertex for this project, so a miss there is a 502, never the API key), memory embeddings (`gemini-embedding-001`
through Vertex `:predict` in `GCP_PREDICT_LOCATION`, default `us-central1`; that its vectors match the stored Gemini API ones
is Google's model identity, not measured here) and the Gemini legs of the orchestrator script / interior routes (one attempt
on Vertex instead of one per pooled key). Tests `lib/ai/google/transport.test.ts` (25) and `/api/tts/gemini` (2 more).
Still on the API key whatever the setting: Deep Research and Lyria's API-key path use the Interactions API, which exists
on the Gemini API only (pinned and stated in `lib/research/interactionsClient.ts`, so with `vertex` a research run still
bills the API key's account); Live (A3, needs a server relay); Imagen (Imagen 4 is 404 on Vertex here); the health probes,
which check the API key (the transport's own check is the route below). Veo keeps its own `VEO_TRANSPORT`. Nothing in Production changes until `GEMINI_TRANSPORT=vertex` is set
there. The free proof is `countTokens` (nothing generated or billed) through the same transport: `GET
/api/admin/google-transport` (admin, with Google's error text) and `GET /api/preview/google-check` (Vercel Preview only,
404 elsewhere, no sign-in, statuses only, one run per 5 min per instance). **AUTH VERIFIED 2026-10-08T18:13Z** on the
cert-branch Preview (ea665ba5, `GEMINI_TRANSPORT=vertex` on Preview only, set by the owner): transport vertex, location
global, gemini-3.8-flash and gemini-3.1-flash-image 200 through the Preview's Workload Identity; the ModelCatalog check
found 13 catalog ids on Vertex and 2 missing (`gemini-flash-latest`, `gemini-pro-latest`: Google aliases that exist on
the Gemini API only, now marked so in the catalog and skipped by the STT step-downs on Vertex). **INFERENCE VERIFIED
2026-10-08T18:28:55Z** for Gemini text on Vertex with the Preview identity: one owner-approved generateContent (decision
card 18:27:39Z) from the cert-branch Preview build `396cb354` through Workload Identity, `scripts/gcp/preview-inference-check.cjs`:
gemini-3.8-flash, global, HTTP 200, reply "ok", 7 prompt + 60 output tokens (59 of them thinking). The request file was
removed in the next commit, so later builds call nothing. Production still sends every Gemini call through the API key
until `GEMINI_TRANSPORT=vertex` is set there (owner).

## M. Pricing

The studio's button price equals the route's deduction for image, music, avatar, remix, model3d, video, swap, motion,
product ad and the Genjutsu panel (R5, re-checked in step 18; BUILT_NOT_PROVEN, unit-tested pairing). Montage, dubbing and
presentation charge nothing. **Open:** ≥10 pricing sources; the public `/pricing` packs (`lib/billing/pricingConfig.ts`,
25/75/149 GEL) contradict the studio's (`lib/credits/pricing.ts`, 9/29/89 GEL). Choosing the canonical table is an owner
pricing decision (no pricing change without an SSoT update).

## N. Billing

| Requirement | Label |
|---|---|
| Stripe and BOG signature verification | PROVEN (unit) |
| Idempotent credit grants (by payment ref) | PROVEN (unit) |
| Refund on failed generation | PROVEN (unit) |
| Checkout amounts from server catalogues | PROVEN (unit) |
| Refund or dispute takes back the credits it bought | **fixed this run**, BUILT_NOT_PROVEN (unit: proportional, never more than granted, idempotent per charge, shortfall alerted). Needs the Stripe endpoint subscribed to `charge.refunded` and `charge.dispute.created` (owner, owner action 5: the endpoint is in Stripe Live mode, which the Stripe connector here cannot reach; it only sees the test sandbox, whose one endpoint is Grok's). A dispute the merchant wins does not restore credits automatically |
| Stripe webhook writes (event dedupe, subscription sync) | **fixed this run**: service-role client instead of the anon client (unit). `webhook_events` must exist in Production (owner check) |
| A paid render when the ledger cannot charge | **fixed this run**: refused with `billing_unavailable` in production instead of rendering free (unit). Before deploy, confirm `deduct_credits` and the service-role key exist in Production, or every render is refused |
| Credit history | **fixed this run**: reads `credit_ledger`; the client-written `POST /api/credits/record` (forgeable "+N credits" rows) is gone (unit). Admin analytics still reads the now-unwritten `credit_transactions` (PARTIAL) |
| BOG checkout in Production | **FAILED** (checked live 2026-10-08). All 4 Production checkouts (a 10 ₾ top-up on 2026-10-03, three Starter plans on 2026-10-03 and 2026-10-06) ended `init_failed` 0.5 to 1.7 s after their row was written, with no BOG order id: BOG never created an order, so no one was charged. The code kept no reason. The request matches BOG's documented shape (re-checked against api.bog.ge/docs on 2026-10-08) and the callback URL is https, so the cause is on the merchant side: the credentials (a wrong pair, or sandbox credentials without `BOG_ENV=sandbox`), or the merchant not yet enabled for online payments. **Fixed this run**: a refused order now stores BOG's answer in `bog_orders.reject_reason` and the log (unit), so one test checkout names the cause (owner action 5a) |
| Any completed payment in Production | **None, ever** (checked live): BOG as above; Stripe has no subscription row and no `stripe:` or `sub:` ledger ref. Credit purchases in the ledger are only the `starter` grant and manual/admin rows |
| Payment-provider page | **fixed this run** (fake capability claim): `/account/payments` said Stripe was the active provider and Bank of Georgia "coming soon" (the reverse of the product: the studio's only checkout is BOG, `CreditsModal` → `/api/billing/bog/checkout`), let a user pick a provider nothing read, and its API wrote `payment_provider_configs`, a table Production does not have. Unlinked; now redirects to `/account/billing`, and `/api/payments/provider` answers 410 |
| Live payment, webhook delivery, invoices | BLOCKED_OWNER |
| Tax / VAT | MISSING |

## O. Auth

| Requirement | Label |
|---|---|
| **Email OTP sign-in, sign-up, password reset in Production** | **FAILED** since at least 2026-10-03, for two separate reasons. (1) AUTH-1, code check: Vercel log "no email_otp in generateLink response"; `lib/auth/otpEmail.ts` accepted exactly 6 digits. Fix: 6–10 digit codes (PR #43 commit `87122ff`, also on this branch as `0421377a`; 10 suites / 127 auth tests and `tests/auth-sheet.spec.ts` 8 / 8 pass). PROVEN on this branch's Preview (2026-10-08 13:57 UTC): Supabase `/admin/generate_link` answered 200 and the code passed the check. (2) AUTH-2, delivery: the same request then failed at Resend, `[email-otp/send] resend 403 "The myavatar.ge domain is not verified"` (Vercel log 13:57:04, deployment of `e1dfffc2`). `MAIL_FROM` is unset, so every auth code and `/api/mail/send` uses `info@myavatar.ge`, and one `RESEND_API_KEY` serves Production and Preview. Owner action: verify `myavatar.ge` in that Resend account. FAILED in Production until both are done |
| Google OAuth, callback open-redirect guard | BUILT_NOT_PROVEN / PROVEN (unit) |
| Session refresh, paid routes require auth | PROVEN (unit, static scan of 446 routes) |
| Return to the workflow after login | BUILT_NOT_PROVEN: the URL, and since 2026-10-08 the typed request and its tool across Google sign-in (which reloads the page; the email code never did). `lib/studio/pendingPrompt.ts` keeps them in this tab's sessionStorage when the studio stops a guest (composer send, product / swap / remix), puts them back once into an empty composer within 30 min and sends nothing. Attachments are not kept. Tests: `pendingPrompt.test.ts`, `pendingPrompt.wiring.test.ts` |
| RLS | **Applied.** In the repo's migrations 8 tables had no RLS and `tracking_tokens` had a public SELECT policy; migration `20261008a_rls_internal_tables.sql` fixes all 9 and verifies itself. Checked live on 2026-10-08: **none of the 9 tables exists in Production**, so Production never had this leak; the migration was applied there at 16:06Z as a self-verified no-op that guards any environment built from the older migrations. Security advisor after it: 0 errors, 22 warnings (14 functions without a fixed `search_path`, 3 trigger functions callable over RPC by anon and by authenticated, `vector` in `public`, leaked-password protection off), 23 info (RLS on with no policy, i.e. service-role-only tables, `director_runs` among them). `agent_definitions` keeps an authenticated `USING(true)` read policy. No DB-level RLS test (MISSING) |
| Admin routes | **Fixed on this branch** (PR #45 merged in `a02f0bf0`, 2026-10-09), BUILT_NOT_PROVEN until a deploy. Before (Production, `main`): 3 inconsistent admin guards; `run-migration` ran SQL behind a header key only, and 2 other routes were header-key only. After: one rule, `isAdminIdentity` (`lib/auth/adminGuard.ts`): an `app_metadata` admin role, or a confirmed email on the static allowlist or the panel-granted list; anything else, or a failed lookup, is refused. The `/admin` page, the admin APIs and the ops endpoints all use it. `run-migration` answers 404 unless `ADMIN_MIGRATION_ROUTE=enabled`, and then needs an admin session plus its own `MIGRATION_RUN_KEY` (timing-safe, logged); the other header keys compare timing-safe. Proof: unit (`lib/admin/guard.test.ts`, `app/api/admin/run-migration/route.test.ts`); full suite 682 suites green on the merge |
| Production schema matches the code | **FAILED** (checked live 2026-10-08 16:05Z). Production `public` has 52 tables; the code (app, lib, components, workers, services; tests excluded) calls `.from()` on 160 names, and **124 of them do not exist in Production** (`webhook_events`, `stripe_events`, `payment_attempts`, `agent_g_*`, `smm_*`, `orders`, `projects`, `messages`, …). Triage: one live 500 (the Agent G hub's Connectors tab, `GET /api/agent-g/channels`, fixed on this branch); WhatsApp linking, push notifications, affiliate commissions, Stripe webhook dedupe and the monthly-allowance display quietly do nothing; sign-in, studio chat, uploads, BOG and Stripe checkout are clean. Full list: `docs/handoffs/2026-10-08-production-schema-drift.md` |

## P. Security

| Area | State |
|---|---|
| SSRF on every caller-chosen fetch, ffmpeg included | **fixed this run**, PROVEN (unit) — see G |
| Prompt injection | ReAct observations and Live page reads are labelled untrusted data; no adversarial live test (BUILT_NOT_PROVEN) |
| Cross-user file access (`/api/studio/library`) | **fixed this run**, PROVEN (unit): `POST` needs a session and accepts only a currently valid signed link to our own storage (probed) or a public URL; `GET` re-signs only the caller's rows, on our project host, in our media buckets. Accepted gap: whoever holds a valid signed link can file that object |
| **Storage read policy in Production** | **PROVEN fixed** (found 2026-10-08 19:40Z, fixed 21:27:25Z with the owner's yes). Before: `storage.objects` had a permissive SELECT policy "Public read music 1q2q05_0" for role `public` with `USING (true)`: it named no bucket, so anon and authenticated (both hold SELECT) could list and download every object in every bucket, the private ones included (`uploads` 2,589 objects, `studio` 1, `twins` 0, plus the public `renders` 494, `avatars` 16, `music` 10). The anon key ships in every browser bundle. Made in the dashboard, not in the repo. Gateway logs 2026-09-30 19:00Z to 2026-10-08 19:45Z: 0 storage requests as anon or authenticated other than public-bucket reads and signed uploads, so nothing legitimate used it and nobody was seen using it. Fix: `supabase/migrations/20261008d_storage_read_scope.sql` applied to Production (Supabase migration history `20261008212725`); its self-check passed. Proof after the change: `pg_policies` shows the policy as `(bucket_id = 'music'::text)`, and a rolled-back transaction as role `anon` sees only `music=10` objects (before: every bucket) |
| Media a request names, signed by the service role | **fixed this run**, BUILT_NOT_PROVEN (unit; Production runs `main`, so it lands with the deploy). Found 2026-10-08 after the storage policy fix: the editors (`/api/ai/edit`, `edit-photo`, `edit-audio`), lip-sync, remix, assemble, montage, motion control, voice training, dubbing and 3D signed whatever upload path or storage URL the body named, with the service role, and handed the result to a provider or ffmpeg; `reSignIfInternal` also re-signed URLs on any `*.supabase.co` host and public-bucket URLs. One account could have the server fetch another account's upload (a path learnt while the read policy was open, or an old shared link) and get the output back. Now `lib/security/callerMedia.ts` signs one of our objects for a caller only when it sits under the caller's own prefix (`omni-uploads/<uid>/`, `<uid>/`, and the editors' chain outputs, now `photo-studio/<uid>/` and `audio-studio/<uid>/`), or one of the caller's own Library rows holds that exact object, or the link's token is live right now (probed); otherwise 403 `media_not_yours` before any credit is reserved. `reSignIfInternal` re-signs only signed URLs on our own host. The run tracker (`/api/orchestrator/jobs` `complete`) no longer files a dead link to another account's object into the caller's Library (`url_not_verified`), which closed a way to make the Library re-sign it. Not provable: rows the tracker filed before this fix cannot be told apart |
| Script link on public share pages | **fixed this run**, BUILT_NOT_PROVEN (unit; same code on `main`). Found 2026-10-09: `user_creations` lets its owner write every column straight through the anon key (RLS checks only `user_id`), and `POST /api/creations` validated links with `z.string().url()`, which accepts `javascript:`. `/share/<token>` rendered `url` as its Download `href`, and the CSP allows inline script, so a creation made public with a `javascript:` link would most likely have run script on myavatar.ge for whoever pressed Download (inferred from React 18 rendering such hrefs and the CSP; not tried in a browser). Production has 0 `user_creations` rows (read 2026-10-09), so nobody was exposed. Now `lib/security/publicMediaUrl.ts` lets only an absolute https link (no credentials) reach `/share/<token>`, `/api/share/<token>` and a stranger's `/api/creations/<id>`; `POST /api/creations` refuses anything else. Tests: `publicMediaUrl.test.ts`, `app/api/share/[token]/route.test.ts`, `app/api/creations/[id]/route.test.ts` |
| Public `renders` bucket | PARTIAL (checked live 2026-10-08): `renders` (494 objects, server outputs) is a public bucket in Production, so a leaked path stays readable forever whatever the signed link says. Paths are random ids and, since `20261008d` (applied 2026-10-08 21:27Z), cannot be listed. Neither `main` nor this branch builds a public `renders` URL (all signed); only 3 `render_jobs` rows from 2026-01-25 hold one. Making the bucket private is a follow-up after the deploy (owner step) |
| Upload MIME / size | **fixed this run**, PROVEN (unit): images, video and audio only (415) and at most 50 MB (413) on `/api/upload` and `/api/upload/sign`; server renders and RVC zips moved to `renders`. The bucket-level cap is migration `20261008c`, **not applied**: `main` still writes RVC zips and rendered videos to `uploads`, so it is applied right after this branch is live (owner action 3c) |
| Secrets | none found in logs or the repo; SA keys never created (WIF, keyless) |
| HawkScan DAST | **not run**: `HAWK_API_KEY` is not set in this environment |
| High-risk browser actions | n/a: no browser control exists (H) |

## Q. Files / Library

| Requirement | Label |
|---|---|
| Upload MIME and size | **fixed this run**, PROVEN (unit) — see P |
| Malicious filename | PROVEN (by construction: names are server-generated) |
| Duplicate upload | MISSING (no hash or dedupe) |
| Signed URL lifetimes | BUILT_NOT_PROVEN: 15 min to 7 days for media. Voice-clone previews: **fixed this run**, BUILT_NOT_PROVEN (unit, `app/api/voice/clone/route.test.ts`). They were written to a `media` bucket Production does not have, so no clone ever had a preview (0 clones exist in Production), with a 1-year link. They now go to `voices/<user>/<voice>.mp3` in the private upload bucket, the list mints a 6-hour link on every load and signs only that exact path for the caller (`preview_url` is user-writable, the signer is the service role), and deleting the voice deletes the clip |
| Cross-user access through the Library | **fixed this run**, PROVEN (unit) — see P |
| Opening one's own private creation | **fixed this run** (owners got 403 on their own items), PROVEN (unit) |
| Deletion | **fixed this run**, BUILT_NOT_PROVEN (unit + Production data check, no live delete yet): DELETE removes the row through the owner's session and then the stored file, only when it is a signed URL on our host in a Library media bucket, not a manual save, and no other `generation_jobs` row names it; otherwise the file is kept and the response says `storage: kept`. Read-only check on Production: the reference pattern matches exactly the referencing rows for all 308 Library files (9 files sit in 2+ rows, none across users) |
| Saving and reusing generated assets | BUILT_NOT_PROVEN |
| RLS proof | **PROVEN** (Production, read-only, 2026-10-08 22:20Z; every check ran in a transaction that was rolled back). All 52 public tables have RLS on. As a real signed-in user (role `authenticated`, their id in the JWT claims), every table with an owner column showed only that user's rows and 0 of anyone else's: e.g. 229 of 371 Library rows, 887 of 920 chat messages, 166 of 220 ledger rows. `support_messages` (no owner column) shows only messages of the user's own support chat. A second user with no Library rows saw 0 of them and 0 foreign rows anywhere. The anon key sees 0 rows in all 38 tables it may query. Every write policy is owner-scoped (`auth.uid() = user_id`, or the owning chat session); the money tables (`credit_ledger`, `credit_transactions`, `wallet_topups`, `bog_orders`, `subscriptions`, `subscription_allowance_grants`) and `profiles` have no write policy at all. None of the `SECURITY DEFINER` money functions (`add_credits`, `deduct_credits`, `refund_credits`, `credit_wallet_gel`, `grant_subscription_allowance`, `bog_fulfill_order`, …) is executable by `anon` or `authenticated`; the only three that are are trigger functions, which Postgres refuses to run outside a trigger. Not covered: columns a user may write on their OWN rows (e.g. `jobs`, `voice_samples.preview_url`) are trusted only where the server re-checks them |

## R. Connectors

Truthful labels (PROVEN, unit): Local files is ready; Google Drive, OneDrive, Notion and Dropbox are "soon" and `connect()`
refuses; Telegram / WhatsApp are status lines. No OAuth, no token storage, no scopes (MISSING by design until a connector
ships). Vocabulary lacks Beta / Disabled (PARTIAL).

## S. Localization

Key parity PROVEN: 742 / 742 / 742 keys in `messages/{ka,en,ru}.json`, 162 / 162 / 162 in `lib/i18n/translations.ts`, 0
missing, 0 empty. Russian values with no Cyrillic: **fixed this run**, PROVEN (grep + parity script). There were 112: 95 were
the whole `studio` namespace, which no code read (the only `t('studio.…')` caller, `StudioBar`, reads `lib/i18n`, not these
files, and is imported nowhere), so it is removed from all three files; the other 17 are product and plan names (Agent G,
Starter, Pro, Premium, Empire, Enterprise, Stripe ID, Orbit Solar System) and the phone mask, kept as is. Georgian has the
same 17 names plus 4 keys no code reads (`metadata.title`, `seller.growth.cac` / `ltv`, `services.svc_avatar_name`). The
`payments` namespace went with the page that used it (N: `/account/payments`). The 8 English-only
`aria-label`s and the `AI-generated` badge title in `OmniStudio.tsx` now read from ka/en/ru copy (fixed, 8edefd82).
Screen-by-screen audit needs the running app (not done).

## T. Mobile

Viewport `viewportFit: cover`, safe-area insets, 16 px inputs, 44 px composer targets (one 36 px exception): BUILT_NOT_PROVEN.
Phone-viewport E2E specs (375×812) pass locally (78 / 78 phone-titled tests in the full run on `70a5fe88`). Real devices: BLOCKED_OWNER. Pinch-zoom: `maximumScale: 1` and `userScalable: false` were removed from the viewport (WCAG 1.4.4, fixed this run). The
owner's Phase 39 directive (no layout zoom when a text field is focused) still holds through the 16 px input rule in
`globals.css`, which is what prevents that zoom on iOS; Android never zooms on focus.

## U. Accessibility

Dialog focus trap (`useDialogA11y`) on the sheets, auth modal, Live overlays, `CreditsModal` and `PersonaPicker` (PROVEN,
unit; the last two fixed in 8edefd82). Skip link PROVEN (unit). Reduced motion honoured. No axe in the repo (MISSING). Contrast and
screen-reader pass need the running app (not done).

## V. SEO

Metadata, canonical, hreflang (ka, en, ru + x-default), OG and Twitter cards PROVEN (unit, `lib/seo/metadata.test.ts`).
The sitemap's service pages now come from the catalog (`lib/seo/sitemapServices.ts`): game, tourism and voice are gone,
editing, photo, text and software were added (fixed this run, PROVEN by `lib/seo/sitemap.test.ts`). `app/robots.ts`:
BUILT_NOT_PROVEN. The home page's main content is client-rendered (`OmniStudio` via `dynamic(ssr:false)`): PARTIAL.

## W. Performance

Measured on the local production build: first-load JS for `/[locale]` ≈ 459 kB gzip, plus the `OmniStudio` chunk (10,274
lines, ≈ 235 kB gzip) before the chat works (≈ 694 kB gzip). three.js stays out of first load (`heavy-client-boundary.test.ts`).
Core Web Vitals live in Vercel Speed Insights: BLOCKED_OWNER. Not fixed in this run (not a launch blocker by itself).

## X. Observability

Sentry (production, DSN-dependent: BLOCKED_OWNER), `structuredLog` in 24 files, `reliability.ts` emits surface / provider /
fallback depth. PARTIAL: only one route sets `x-request-id`; 348 raw `console.*` calls in API routes; no alert rules in the
repo (GCP budgets alert; they do not cap).

`/api/health` used to answer `ok: true, status: "healthy"` whatever it found: invalid core env, a Redis error and a
database it never checked all came back green. Fixed this run, BUILT_NOT_PROVEN (unit, `app/api/health/route.test.ts`, 7
tests): the operator view (CRON_SECRET or a signed-in admin, on Preview and Production alike) now reads one `profiles` row
with the service role and answers `ok: false, status: "degraded"` on invalid env, a database error (code only, never the
message) or a Redis error. A missing provider key stays a separate list and does not degrade the deployment. The public
answer is unchanged (liveness only, no I/O) and HTTP stays 200 on every path, so an uptime monitor that checks the status
code sees no change. No live call made yet: the operator view needs CRON_SECRET or an admin session, which Claude does not
hold. Proof path: an admin opens `/api/health` on the Preview while signed in and sees `database: "connected"`.

## Y. Remaining owner actions

Only the owner can do these. Nothing below was done by Claude.

| # | Action | Unblocks |
|---|---|---|
| 1 | Deploy the OTP sign-in fix (PR #43; also on this branch) after review: email sign-in, sign-up and password reset are FAILED in Production | O, §55 "auth blocking normal flow" |
| 1a | Verify the `myavatar.ge` domain in the Resend account whose key is `RESEND_API_KEY` (resend.com/domains → Add Domain → add the TXT / MX records at the DNS host → Verify). Until then every email code, sign-up and password reset is refused by Resend (403), on Preview and in Production | O, §55 "auth blocking normal flow" |
| 2 | ~~Press the Veo smoke button on the PR #43 Preview~~ **Done 2026-10-08 15:48Z**: the clip rendered on Vertex (INFERENCE VERIFIED 15:49Z, see J). Left: confirm in Billing > Credits that the $300 credit covered it | L, VIDEO V1-V6 |
| 3 | ~~Apply `supabase/migrations/20261008a_rls_internal_tables.sql`, then run the Supabase security advisor~~ **Done 2026-10-08 16:06Z** (no-op in Production, see O) | O (RLS) |
| 3a | ~~Apply `supabase/migrations/20261008b_director_runs.sql`~~ **Done 2026-10-08 16:01Z** (table exists, RLS on, anon/authenticated hold no privilege, 0 rows) | J, VIDEO V1-V6 |
| 3d | ~~Say yes to applying `supabase/migrations/20261008d_storage_read_scope.sql`~~ **Done:** the owner said yes 21:26Z, applied 21:27:25Z, verified (anon now sees only the `music` bucket) | P, §55 "RLS failure" |
| 3c | Right AFTER this branch is deployed to Production (never before): apply `supabase/migrations/20261008c_uploads_bucket_limits.sql` (50 MB, media only on `uploads`) | P (uploads) |
| 3b | ~~Set `VIDEO_DIRECTOR_RUNS=admin` on Preview only and remove the Production scope~~ **Done 2026-10-08 16:42Z** by the owner (Preview director route answers 401 without a session; Production still runs main's code). An admin can now run a storyboard shot by shot on Preview (paid Veo per shot) | J, VIDEO V1-V6 |
| 4 | Confirm the Supabase global upload limit is ≥ 50 MB; if `UPLOAD_BUCKET` is not `uploads`, apply the migration's bucket section to it | P |
| 5 | Subscribe the Stripe **Live** webhook endpoint to `charge.refunded` and `charge.dispute.created` (dashboard.stripe.com/webhooks). The reversal runs only if that endpoint's URL is `/api/stripe/webhook` or `/api/webhooks/stripe`; `/api/billing/webhook` ignores both events. `webhook_events` does **not** exist in Production (checked live), so the webhook's dedupe is in-memory only; the credit grant (`sub:<invoice>`) and the reversal refs are idempotent on their own | N |
| 5a | BOG: in BOG's business manager, confirm the merchant is enabled for online payments (api.bog.ge) and that `BOG_CLIENT_ID` / `BOG_SECRET_KEY` in Vercel Production are the **live** pair (a sandbox pair needs `BOG_ENV=sandbox`, and then takes no real money). After this branch is deployed, start one 10 ₾ top-up and stop at BOG's page (creating the order charges nothing); if it fails, `bog_orders.reject_reason` names the cause | N, §55 billing |
| 6 | Before deploying this branch: confirm `deduct_credits` and `SUPABASE_SERVICE_ROLE_KEY` exist in Production (otherwise every paid render is now refused, not given away). **Checked by Claude 2026-10-09 00:2xZ (read-only):** `deduct_credits(p_user_id uuid, p_amount integer, p_ref text)` and `refund_credits` exist with the arguments the code sends; the columns the branch's new queries use exist; the service-role key is inferred present (the server writes `credit_ledger`, which has no user write policy; last `commit` row 2026-10-06), not read (Vercel connector 403) | N |
| 7 | Choose the canonical pricing table (`/pricing` 25/75/149 GEL vs studio 9/29/89 GEL) | M |
| 8 | Decide the browser-control infrastructure (none exists) | H, BROWSER CONTROL |
| 9 | Approve the provider migration plan (Part 2): strip Replicate, Udio, Kling/Higgsfield, HeyGen paths and their Production keys | L, PROVIDER BOUNDARY |
| 10 | Imagen 4 quota / availability on Vertex for this project (404 today) | L |
| 11 | Separate Preview and Production Supabase projects, or add the Preview redirect pattern to Supabase Auth | O, E2E on Preview |
| 12 | Set the Sentry DSN; share Vercel Speed Insights | W, X |
| 13 | Real-device pass (iPhone, Android) with Live voice: Google accepting `ask_agent_g`, mic → speech, same-context calls | E, T |
| 14 | Credit coverage check in Cloud Billing → Credits ≈ 24 h after the T2 test | L |
| 15 | Production deploy approval (step 26: nothing was promoted). Asked 2026-10-09 with the ship list, post-deploy checks and rollback: `/mnt/project-files/reports/2026-10-09-production-deploy-request.md` | — |

### §55 launch blockers still open on this branch

Any one of these means NO LAUNCH.

| §55 blocker | Where it stands |
|---|---|
| Auth blocking normal flow | Email OTP sign-in, sign-up and reset FAILED in Production (O): AUTH-1 code-check fix on PR #43 and this branch, not deployed; AUTH-2 Resend refuses mail until `myavatar.ge` is verified (owner action 1a) |
| Wrong provider / silent fallback | Silent fallbacks removed on this branch for image, text, music and voice (not deployed). Forbidden providers are still the primary engine for avatar, swap / motion / product ad, 3D, interior, several music modes, and NanoBanana is a reseller (L) |
| Browser nonfunctional | No browser control exists (H) |
| RLS failure | Storage: **fixed in Production 2026-10-08 21:27Z** (`20261008d`; the open `USING (true)` read is now limited to the `music` bucket, PROVEN by policy read and an anon check, P). Tables: none open, the 9 tables do not exist there; `20261008a` applied (O); row isolation PROVEN on Production as anon and as two signed-in users, and no money function is callable from the browser (Q, 22:20Z) |
| Broken V1–V6 | Director built, wired into the studio behind `VIDEO_DIRECTOR_RUNS` (`admin` on Preview, off in Production), unit-proven; its table is applied (2026-10-08). One live Veo clip is INFERENCE VERIFIED on Vertex (PR #43's smoke button, not the director); no director run has been tried live yet (J) |
| Wrong pricing / billing inconsistency | Two contradictory pack tables (M). No payment has ever completed in Production: every BOG checkout failed at start (N, owner action 5a) |
| Live Voice unable to invoke Agent G tools | Built (`ask_agent_g`), not proven on a live call (E) |
| Unresolved P1 | Admin panel: in Production (`main`) `run-migration` still executes SQL behind a header key only, with 3 inconsistent admin guards (Admin Panel audit). Fix merged into this branch 2026-10-09 (`a02f0bf0`, from PR #45): one admin rule, `run-migration` 404 unless `ADMIN_MIGRATION_ROUTE=enabled`, then admin session plus its own key (O). BUILT_NOT_PROVEN until the deploy; open in Production until then |
| Fake capability claims | Fixed on this branch (`/hub` fake stats deleted, sitemap from the catalog, the `/account/payments` provider page retired), still live in Production until a deploy |

---

PRODUCTION READY: NO
SERVICE ARCHITECTURE: NOT PROVEN
SERVICE CATALOG SSoT: NOT PROVEN
ONE-WINDOW COMPLIANT: NO
AGENT G ORCHESTRATION: NOT PROVEN
AGENT G LIVE VOICE: NOT PROVEN
WEB SEARCH: NOT PROVEN
WEB SCRAPER: NOT PROVEN
BROWSER CONTROL: NOT PROVEN
VIDEO V1-V6: NOT PROVEN
PROVIDER BOUNDARY: NOT PROVEN
MODEL CATALOG: NOT PROVEN
BILLING/CREDITS: NOT PROVEN
SECURITY: NOT PROVEN
MOBILE: NOT PROVEN
LOCALIZATION: NOT PROVEN
READY FOR OWNER LAUNCH APPROVAL: NO
