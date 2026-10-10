# Final launch certification — MyAvatar.ge (Master Task §56)

Date 2026-10-08, updated 2026-10-09 after the Production deploy. Author: Claude (Senior Web Developer role), Master Task §60 steps 1–26.
Labels: **PROVEN** (a check that ran proves it) · **BUILT_NOT_PROVEN** (code + unit tests with mocks, no live or E2E proof) ·
**PARTIAL** · **MISSING** · **BLOCKED_OWNER** (only the owner can run or decide it) · **FAILED** · **DEPRECATED**.
"Unit" proof means the code path is tested with providers mocked; it is never a claim about production.
Nothing here was run against a paid provider except the owner-approved GCP Part 0 T2 test (≈ $0.11, see L).

Step 26 held until the owner's word. On 2026-10-09 at 03:19:58Z the owner chose "Deploy + ლიმიტი" on the deploy card: PR #42 was merged into `main` as `9f1bff68` (03:28Z), Production serves `9f1bff6` since about 03:36Z, and `20261008c` was applied at 03:38Z. Migrations `20261008a`, `20261008b` and `20261008d` were applied earlier with the owner's yes (O, J, P). At 05:08:54Z the owner chose "Deploy" for PR #46 (voice id check, avatars list by session): merged as `185b84d9` (05:09Z), Production serves `185b84d` since about 05:15Z. At 05:38Z the owner chose "Deploy" for PR #47 (avatars routes on `user_id`, editing jobs scoped to the caller, `/api/jobs/<id>` read only) and "გაუშვი" for `20261009a`: merged as `66d7163f` (05:39Z), `20261009a` applied about 05:39Z, Production serves `66d7163` since about 05:44Z. At 07:08:11Z the owner chose "Deploy + renders" for PR #48 (`/api/ai` on Gemini with charge-before/refund, voice token for signed-in users only, Upstash fast-fail, PR #43's Part 0 tooling and veo-smoke, the admin engine reports) and `20261009b`: merged as `7126682e` (07:08Z), Production serves `7126682` since about 07:13Z, `20261009b` applied at 07:14Z. **A deploy is not a launch: the verdict below stays NO.**

---

## A. Exact state

| Item | Value |
|---|---|
| Branch | `claude/launch-certification-wmvitt` (PR #42 merged 2026-10-09; since then draft PR #48, base `main`: certification records, PR #43's remaining code, migration file `20261009b`, the 2026-10-09 engineering report) |
| SHA | Full retest on `0d239f26` (2026-10-09 ~06:10Z): tsc 0; lint 0 errors, 35 warnings; jest 696 / 696 suites, 10,776 passed, 3 skipped. Before that, full retest on `70a5fe88` (2026-10-08 13:13 UTC). Since then: the OTP fix `0421377a` from PR #43 (tsc 0, 10 auth suites / 127 tests, `tests/auth-sheet.spec.ts` 8 / 8) and documentation only. CI green on `e1dfffc2` |
| `main` | `6c7dff46` (2026-10-09 15:56:50Z, merge of PR #52 at head `ef694b02`: the auth hotfix, owner's "ჰოტფიქსი ახლა" 15:47:19Z, CI verify and preview-e2e green on `ef694b0`); before it `29e7d67b` (08:02Z, merge of PR #49 at head `c62af950`, owner's "Deploy" 08:02:01Z), `7126682e` (07:08Z, merge of PR #48 at head `07b12b61`), `66d7163f` (05:39Z, merge of PR #47 at head `9c2b46c4`), `185b84d9` (05:09Z, merge of PR #46 at head `0e8e7480`), `9f1bff68` (03:28Z, merge of PR #42 at head `5013d87c`) and `572d5fac` (2026-10-03) |
| Production | https://myavatar.ge serves `6c7dff4` (PR #52 auth hotfix; deployment `dpl_Ghoo53ZCY76BVF2iZsM984SmhQ6p` Ready 2026-10-09 16:01Z; `/api/health` 6c7dff4, `/ka` and `/ru` 200, checked by the Supabase Auth thread (the proxy here cannot reach myavatar.ge); no migration, no env change; rollback: Vercel Instant Rollback to the `29e7d67` deployment or a revert of `6c7dff4`). Before: `29e7d67` from 08:07Z (`/api/health` 2026-10-09 08:07:48Z; main CI 411 and E2E 1083 green; public checks: `/ka` 200, `run-migration` 404, `/ru/login` → `/ru/dashboard` 200; `/api/orbit/agent` 404 and no Pollinations cover are BUILT_NOT_PROVEN live: a POST cannot be sent from here, unit tests cover both; rollback target the `7126682` deployment). Before: `7126682` (07:13:30Z), `66d7163` from 05:44Z, `185b84d` from 05:15Z, `9f1bff6` from 03:36Z). Rollback target: the `66d7163` deployment via Vercel Instant Rollback (owner) or a revert of the PR #48 merge on `main` (and `UPDATE storage.buckets SET public = true WHERE id = 'renders'` for `20261009b`); before that, `185b84d`, `9f1bff6`, then `dpl_ANGLbd7AGjDQyYHCGk5UJQsrp2Rr` (`572d5fa`) |
| Post-deploy checks (PROVEN, public URLs, 2026-10-09 ~03:37Z) | `/api/health` commit `9f1bff6`; `GET /api/admin/run-migration` 404 `{"error":"Not found"}` (401 before the deploy); `/ka/hub` lands on `/ka/dashboard` (200); `/ka` 200; `/ka/login` 200 with the email sign-in; `/share/<unknown>` shows "კონტენტი ვერ მოიძებნა" and `/api/share/<unknown>` answers 404. GitHub CI on `main` green (run 37879463924). After the PR #46 deploy (PROVEN, 2026-10-09 ~05:15Z): `/api/health` commit `185b84d`; `GET /api/avatars?owner_id=<uuid>` with no session answers 200 with an empty list (500 "Failed to fetch avatars" before); run-migration still 404; `/ka` 200; `/ka/login` lands on the studio sign-in (200). After the PR #47 deploy (PROVEN, 2026-10-09 ~05:44Z): `/api/health` commit `66d7163`; `/api/avatars?owner_id=<uuid>` with no session 200 with an empty list; `/api/avatars/latest?owner_id=<uuid>` with no session 200 `{"avatar":null}`; `/api/jobs/<id>?autoProcess=1` and `/api/editing/jobs/<id>` with no session 401; run-migration still 404; `/ka` 200; `/ka/login` lands on the studio sign-in (200). After the PR #48 deploy (PROVEN, 2026-10-09 07:13–07:15Z): `/api/health` commit `7126682`; GitHub CI on `main` green (CI run 407, E2E 1079, both on `7126682e`); `GET /api/admin/veo-smoke` with no session 404 `{"error":"Not found"}`; `GET /api/health/providers` with no session 401 "Admin access required"; run-migration still 404; `/ka` 200; `/ka/login` lands on the studio (200). `20261009b` read back at 07:14:22Z: `renders` `public = false`, 494 objects, migration history `20261009071401`; a public URL for its newest object (`/object/public/renders/models3d/…glb`) now answers 400 "Bucket not found" |
| Preview | Vercel builds a Preview per push of PR #42 (Vercel Preview Comments check green). PR #43 (GCP Part 0) carries the Vertex WIF env, Preview only |
| Environment | Preview and Production share one Supabase project (any Preview test writes to the production DB). Production has `GEMINI_API_KEY` and no `GCP_*` / `VEO_TRANSPORT`, so every Google call in Production bills the AI Studio balance ($13.21), not the $300 GCP credit |
| Related branches | PR #43 `claude/gcp-part0-wif-fmtfxp` (GCP Part 0, Vertex WIF, OTP fix owner; everything `main` still lacked from it was ported here in `0d239f26`, PR #43 left as is); PR #44 `claude/vertex-migration-fixes` → `codex/vertex-ai-migration` (the earlier agent's Vertex WIP made green, unmerged; audited 2026-10-09 in `docs/handoffs/2026-10-09-pr44-audit.md`, its Redis fast-fail, `/api/ai` → Gemini and voice hardening ported in `76e8c525`, the rest listed in the engineering report §3.2); `claude/admin-panel-audit-co2mng` (admin panel, after Part 0) |

## B. Build

All run on `70a5fe88` in the cloud sandbox, 2026-10-08 (logs not committed; numbers copied from the runs).

| Check | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | exit 0, no errors |
| `npx next lint` | exit 0: 0 errors, 35 warnings (pre-existing classes: `jsx-a11y` aria props, hook deps) |
| `npx jest --forceExit` (full) | **643 / 643 suites, 10,294 passed, 3 skipped, 0 failed** (baseline on `main` at the start: 613 suites, 9,784 passed) |
| `npm run build` with CI's dummy env | exit 0, "Compiled successfully"; shared first-load JS 89 kB; `/[locale]` 306 kB first load |
| Playwright, all 27 local specs (251 tests), fresh `next dev`, 3 workers | 239 passed, 10 skipped (8 pre-existing `test.fixme`, screenshot-only, env-gated), 2 failed under load: `landing.spec.ts:116` (dev server reset the connection, ECONNRESET) and `swarm-pipelines.spec.ts:28` (60 s timeout across six cold route compiles). **Both pass when re-run alone on a fresh server (4 / 4).** |
| GitHub CI on PR #42 | green on every pushed head through `70a5fe88`, and on the deployed head `5013d87c` |
| Deployed head `5013d87c`, full jest (2026-10-09) | **684 / 684 suites, 10,678 passed, 3 skipped, 0 failed** |
| Branch head `0d239f26`, 2026-10-09 ~06:10Z | tsc 0; `next lint` 0 errors, 35 warnings; **jest 696 / 696 suites, 10,776 passed, 3 skipped, 0 failed**; `scripts/check-i18n-parity.ts` OK |
| Branch head `76e8c525` (PR #44 ports), 2026-10-09 ~06:25Z | tsc 0; eslint clean on the 15 changed files; **jest 698 / 698 suites, 10,789 passed, 3 skipped, 0 failed** |
| Playwright, all 27 local specs (251 tests), 2026-10-09 on `76e8c525`+ | Without Supabase env: 220 passed, 21 failed, 10 skipped. The 21 again with CI's dummy Supabase env: 19 passed. Of the last 2, alone ×2: `live-voice-e2e.spec.ts:30` passed both (load); `landing.spec.ts:380` (the landed image) fails 4 of 5 runs, phone and desktop: the request for `/brand/v1/card-image.jpg` is sent and never answered, so the image stays 0×0. Not touched by this branch, not in CI. **Cause PROVEN 2026-10-09: the dev server.** On a production build of `7c8dd9b3` (`next build` + `next start`, CI's dummy env) it passes 10 / 10 (phone + desktop, repeat ×5). The same build fails 4–5 other `landing.spec.ts` tests that pass on `next dev`: on a phone `?tool=video` opens the Video Create sheet (by design, `OmniStudio.tsx:2994`) whose backdrop covers the header, and the build POSTs `/api/analytics/track`. **Why `next dev` differed, PROVEN 2026-10-09:** React StrictMode (dev only) re-ran the studio's "put the sheet away in the chat" effect with the first render's state and closed the sheet the deep link had just opened, so CI's E2E saw a phone Production never serves. The effect now closes only on the way into the chat (Production unchanged), and the tests hold the real phone behaviour and treat the analytics log as background. After the fix: all 27 specs on `next dev` 240 passed, 10 skipped, 1 failed (the landed-image test above, dev only); `landing`, `ui-image` and `vfx-genjutsu` on a production build 88 / 88 (engineering report §4.17, part 10) |
| Branch head `7c8dd9b3`, 2026-10-09 ~07:45Z | tsc 0; eslint clean on the changed files; **jest 702 / 702 suites, 10,817 passed, 3 skipped, 0 failed**; `next build` succeeded (CI's dummy env); `[i18n-parity] OK` |
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
- Status: **BUILT_NOT_PROVEN** in production (deployed 2026-10-09, not checked live). Unit tests: `lib/catalog/*.test.ts`; E2E: the tool sheet and
  the desktop sidebar render the catalog's category lists (`tests/landing.spec.ts`, `tests/ui-newtools.spec.ts`, local run).
- §50 analytics events: **BUILT_NOT_PROVEN** (deployed 2026-10-09, not checked live). `lib/analytics/serviceEvents.ts` names the funnel by catalog id:
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
- §51 search: **BUILT_NOT_PROVEN** (deployed 2026-10-09, not checked live). The sidebar's „ძებნა" box now finds services as well as chats:
  `searchServices` (lib/catalog/services.ts) matches what is typed, half words included („მუს", „реклам"), against every
  service's aliases, label and modes in ka/en/ru; Agent G's pick for the same text is always first; a coming-soon service
  is listed as „მალე" and opens nothing. A found service opens with its mode and is counted as `catalog_service_opened`
  with surface `search`. Same change fixed a broken shortcut: the catalog link to Music video
  (`?tool=video&mode=musicvideo`, used by /services) opened plain Video; the studio now applies the mode. Tests:
  `services.test.ts` (searchServices, serviceModeQuery), `ServiceSearchResults.test.tsx`, `serviceSearch.wiring.test.ts`.
- Service audit (owner, 2026-10-09 18:25Z: „remove everything superfluous … check one by one everything we offer"):
  **BUILT_NOT_PROVEN** on PR #50 (cert Preview only, Production unchanged). Retired: the three-card hub (`#hub`), the old
  Music Video director (`#film`), the Lip-Sync studio (`#lipsync`), `/{lang}/studio` „Studio Beta" (now a redirect home)
  and the Connectors · Plugins · Skills hub; Music video is a sidebar row of its own and a Film | Music video switch at
  the top of the Video panel; four tools renamed so the name says what they do (Video remix, VFX effects, Motion
  transfer, Video editing); „Soon" rows left the sidebar search; VFX offers only its open modes. Service-by-service
  table and owner items: `docs/handoffs/2026-10-09-service-audit.md`. Tests: `tests/simplified-studio.spec.ts`,
  `tests/vfx-genjutsu.spec.ts`, `nav.test.ts`, `VideoCreatePanel.test.tsx`, `serviceSearch.wiring.test.ts`.
- Service audit finalization (owner, 2026-10-09 21:29Z): **BUILT_NOT_PROVEN** on PR #50. All 22 catalog services traced
  UI → Agent G → API → provider → credits → result → Library, with every gap and its status
  (`docs/handoffs/2026-10-09-service-audit.md` §6): 9 BLOCKED_OWNER (a non-allowed engine runs by default), 9
  BUILT_NOT_PROVEN, 2 PARTIAL (dubbing and presentation charge nothing), 2 MISSING (audio remix, terminal); none PROVEN
  end to end. Fixed: one name per tool everywhere (TOOL_META, KA/EN/RU, pinned by `serviceCatalogue.test.ts`); the
  Library files a file of ours once (remix / swap / product ad no longer make two rows); VFX results reach the chat;
  catalog engine notes match the code. Video keeps storyboard, director V1–V6, scene management and Music video after
  the Film Studio removal (a55f1d18). A video attached in chat plus an edit sentence no longer starts a paid remix on
  its own: a charged op waits for Agent G's Create card with the price (BUILT_NOT_PROVEN, mocked browser test). Open: the
  interior 3D plan is not filed to the Library.
- Still open: 5 legacy registries are imported by legacy API routes (`/api/pipeline`, `/api/agents/*`) and must be deprecated
  with them.

## D. Agent G

| Area | State | Evidence |
|---|---|---|
| Tool matrix | Chat (Gemini), Google Search grounding, `/api/agent/run` ReAct loop with `web_search` and `scrape_webpage`, prepare-only Instagram post. **2026-10-09 (PR #50, behind `AGENT_G_MEDIA_EXEC`, off in Production):** the loop also has `quote_montage_to_music` for a request that carries the user's files; it plans and prices only, and the render runs on the user's confirm. Since 2026-10-09 ~13Z it also has `quote_audio_from_link` (checks a link and its rights and plans an MP3; the extraction runs only on the user's Start; registry action `audio_extract_run`) | `lib/agent/react/bindLiveAgent.ts`, `bindLiveAgent.test.ts` |
| Media execution (owner, 2026-10-09 09:32Z; PROJECT_MASTER Section F) | **BUILT_NOT_PROVEN** (slice 1: clips + one track → beat-cut MP4 in the chat). Quote (spends nothing, HMAC-signed 30 min) → Start → one `generation_jobs` row per quote on the existing `runMontage` → ffprobe QC → the master in the same chat bubble and the Library; Stop; refund and audit (`audit.agent_g.media`). Free (owner's choice 09:43Z). AG-8 (a Preview run with an admin session) not done. **Execution foundation (owner 11:15Z):** `run` now only queues; a worker renders under a lease (heartbeat, one retry, per-minute sweep), Stop kills the running ffmpeg, refunds are owed in the failing write and paid by whoever comes next; typed tool allowlist; sandbox contract with a refusing runner (host = owner decision); one Task API BUILT_NOT_PROVEN (`/api/tasks`: one TaskView per job, owner-only, read + Stop, its own rate-limit bucket; every screen reads it: the chat's job cards, the job tray (Stop on Agent G jobs; a job a chat card shows is never drawn twice), the service panels, the montage export and a reload's batch tiles; the older `agent_g_tasks` routes now owner-checked) (`docs/handoffs/2026-10-09-agent-g-execution-foundation.md`). **Chat cards as task panels (owner 17:02Z, after the Preview run):** one card per job with every step from the upload to the saved result (✓ / spinner / circle, a clock), kept after the run with the result under it; the tray no longer flashes a finished job; own video and audio players (`AgentTaskCard`, `taskSteps`, `ChatVideoPlayer`, `ChatAudioPlayer`). Preview admin run PARTIAL (AG-8): Stop PROVEN (job 2bb56123, 16:49Z, 0 credits) and a full montage delivered (job cf55ed33, 16:57:00Z → 16:58:24Z, 10.57 s, 0 credits; DB + audit rows); no screenshot of the end and no outside ffprobe; ↻ and tray-flash bugs found there and fixed | `lib/agent/media/*` tests, real-ffmpeg run `montageExec.ffmpeg.test.ts` (120 BPM track → 119.96 BPM, master 9.53 s for a 9.5 s plan), `tests/agent-g-montage.spec.ts` 6/6 (routes mocked; the tray shows a running montage once and never again after the card finishes it); `AgentTaskCard.test.tsx` 5, `taskSteps.test.ts` 15; queue: `jobLease.test.ts` 20, `montageWorker.test.ts` 14, real-ffmpeg cancel kills the encoder |
| URL-to-Audio (owner, 2026-10-09 12:34Z; PROJECT_MASTER F-AU) | **BUILT_NOT_PROVEN**. A video/audio link or one upload + "take the MP3 out" → plan card (host, name, size, rights, free) → Start → MP3 in the same bubble (player, name, length, size, Download, Save to Library). Only direct media files on public hosts; 32 platforms (YouTube, TikTok, Instagram, …) and their CDNs plus HLS/DASH streams refused by name before any request and on every redirect hop, with an "Upload a file" offer; no extractor, no workaround. Rights: licensed (Commons API, `Link: rel=license`), own (upload), else unverified (Start = the user's word). Same quote → lease queue → worker → QC (`qcMp3`) → bubble as the montage; Stop kills ffmpeg; one job per quote; sweep recovery. Text (chat branch + ReAct tool) and Live Voice (`extract_audio`). Off in Production (`AGENT_G_MEDIA_EXEC`); the Preview admin run is not done (`docs/handoffs/2026-10-09-agent-g-url-to-audio.md`) | Real-internet E2E 2026-10-09 13:01Z (`audioLive.e2e.test.ts`, opt-in): MDN shared-assets `flower.mp4` → MP3 5.09 s, 122,941 B, 192 kb/s 44.1 kHz stereo, QC passed, storage and DB local; YouTube refused before any request. `audioLive.ffmpeg.test.ts` (no-audio, redirect onto YouTube refused mid-download, Stop kills ffmpeg). `tests/agent-g-audio.spec.ts` 7/7 (routes mocked, real MP3). jest 725 suites / 11,188 passed |
| Routing | Deterministic catalog router (`lib/catalog/agentRoute.ts`) opens a tool, never renders or charges; questions are answered in prose; coming-soon services are named as unavailable, never substituted | `agentRoute.test.ts`, `agentRoute.wiring.test.ts` (forbids fetch / `/api/` in the branch) — BUILT_NOT_PROVEN |
| Orchestration | ReAct loop bounded (max steps, deadline), Gemini-only under `AI_GOOGLE_ONLY`. Observations are wrapped as untrusted data ("never instructions") | `coordinator.ts`, `coordinator.test.ts` |
| Approvals | Paid generation needs the priced button (text) or a spoken "yes" plus a cancellable 3 s countdown (voice). Click guard refuses spend / pay / delete / sign-out / password | `liveActions.test.tsx`, `lib/voice/liveUi.test.ts` — PROVEN (unit) |
| System prompt | One prompt on every Agent G door (`lib/chat/platformPrompt.ts`: catalog services, prices from `lib/credits/pricing`, Google engines only where they are the primary path). Until 2026-10-08 `/api/chat/stream`, `/api/agent-g/chat` (and `/api/agent-g/delegate`), the Telegram channel and `/api/chat`'s non-Google fallback still sent the old prompt, which named HeyGen, Replicate, LTX, Udio and WorldLabs as the engines, offered services that do not exist (Game Creator, Tourism AI, Voice Clone) and gave three different service counts (7, 13, 14). `lib/agent-g-orchestrator.ts` now returns the platform prompt per request, with the request's locale and whether it has Google Search. BUILT_NOT_PROVEN (deployed 2026-10-09, not checked live) | `lib/agent-g-orchestrator.test.ts`, `platformPrompt.test.ts` |
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
| Extract audio from a link by voice | BUILT_NOT_PROVEN (2026-10-09) | Live function `extract_audio`: `plan` (a spoken or on-screen link, or the attached file) puts Agent G's plan card in the chat and reads it back as an `[App]` note; `start` only with `confirmed: "yes"` after a clear yes; `stop` cancels. Unit (`liveTools.test.ts`, `liveActions.test.tsx`) and Playwright (`tests/agent-g-audio.spec.ts`). Not tried on a real call (owner action 13) |
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
every menu (sidebar, + sheet, tools picker, `/services`) reads the catalog; Agent G is first; every catalog service
opens inside the studio by `?tool=` (no separate app). Legacy `/services/<slug>` pages remain as SEO landing pages whose
CTA opens the studio. `/{lang}/studio` (Studio V2) was retired on PR #50 on the owner's word (2026-10-09 18:25Z,
4cde9d04): it redirects home and its UI is deleted; its API routes stay behind `STUDIO_V2` so a started job can still
finish or refund (owner: unset the env in Production). The `#hub`, `#film` and `#lipsync` surfaces now open Chat, Video
and Avatar; the Plugins hub is gone (f28c2181). **BUILT_NOT_PROVEN** (deployed 2026-10-09; `/ka/hub` landing on the studio is PROVEN live, the rest is not checked live).

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
| Wired into the product's video flow | BUILT_NOT_PROVEN (unit + route + component tests): the studio's Approve runs the director when `VIDEO_DIRECTOR_RUNS` lets the user in; off by default and unset in Production, so the director does not run there (also after the 2026-10-09 deploy). Migration `20261008b` is applied (2026-10-08); the flag is `admin` on Preview only since 16:42Z (owner action 3b done), so an admin can try it there; no director run has been tried live yet |
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

**Silent fallbacks removed on this branch (R7, commits `8a2d1b0f`, `32abf9ad`; BUILT_NOT_PROVEN, in Production since
the 2026-10-09 deploy, not checked live).** Each request now uses one provider and a miss is the route's explicit error, refunded where the route charged:
image has no Grok / FLUX leg behind NanoBanana; `lib/ai/llmText` (14 internal text callers, the director's planner among
them) is Gemini only; `/api/pipeline` text tools and Terminal are Gemini only; music Auto is Lyria alone; the film music
bed and the product-ad music have no MusicGen leg; TTS and film voice-over have no Azure / Google leg behind ElevenLabs.
Every removed leg, put back, fails the new tests. Admin health now reports scene planning as live only on the Gemini key.

**One engine per job, and a switch for the rest (2026-10-09 evening, BUILT_NOT_PROVEN on PR #50).** No outside engine
falls back to another outside engine any more: avatar (HeyGen or SadTalker, never one after the other, 0a01031e), chat
images (one outside engine, a miss moves only to Google's image model, 15ae21e2), remix (a roop or image-edit miss refunds,
97f949f2), Georgian song (no MusicGen behind ElevenLabs Music, 35a010ab); motion transfer no longer claims a reference
video it never sends (12300b06). `MEDIA_GOOGLE_ONLY` (`lib/providers/mediaPolicy.ts`, **default OFF**): when the owner
sets it, Image / Photographer / Interior render on Google's image model and every tool with no Google / ElevenLabs engine
(avatar, film lip-sync, swap, motion, remix edits, 3D, music extras, photo and audio editors, upscale, raw Replicate
routes) answers 503 `google_only` in the user's language **before any charge or provider call**; status routes stay open
so started jobs finish. 23 entries, each pinned by `mediaPolicy.test.ts`. Turning it on is an env var plus a redeploy
(owner action 9); unsetting it is the rollback.

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
"your voice" songs (MiniMax, RVC), cover art (Pollinations; off under Google-only since `29e7d67`, 2026-10-09 ~08:07Z); `/api/pipeline` voice on OpenAI TTS when Google-only is off;
`lib/chat/ServiceManager` still imports the Grok image client. The owner chose "not now" on removing them (decision card,
2026-10-08 17:16 UTC): action 9 stays open, and PR #44's provider removals are not merged into this branch.

**In Production since 2026-10-09 ~08:07Z (`ba74fa21`, PR #49 → `29e7d67`; BUILT_NOT_PROVEN live):** `/api/orbit/agent` answered any signed-in user from
OpenRouter / OpenAI (`chatEngine.executeStream`) with no credit charged and no `AI_GOOGLE_ONLY` gate, though no screen calls it;
it now answers 404 under Google-only. Music cover art no longer goes to Pollinations.ai under Google-only (the track ships
without a cover). Ratchet `__tests__/provider-boundary.test.ts`: runtime code may not gain a new non-Google,
non-ElevenLabs AI vendor (API host in a literal or an SDK value import); today's 60 files / 22 vendors are frozen in
`__tests__/provider-boundary.allowlist.json`, which may only shrink. Tests fail on the old code.

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
presentation charge nothing; so does Upscale (a paid Replicate call). A dialogue film or a music video charges 20 avatar
credits per lip-sync pass on top of the film price shown on the button, although the music-video ×1.4 already claims to
cover that leg (`videoPricing.ts`): a likely double charge, left for the owner (service audit §6 gap 1). **Open:** ≥10 pricing sources. PROVEN live 2026-10-09 (`/ka/pricing`): Basic $19.99 ≈ 54 ₾ / 230 credits, Pro $39.99 ≈
108 ₾ / 525, Business $79.99 ≈ 216 ₾ / 1,200 (`lib/billing/tiers.ts`), while the studio's top-up packs are 9 / 29 / 89 ₾ for
90 / 290 / 890 credits (`lib/credits/pricing.ts`, 10 credits per lari): a subscriber gets ≈ 4.3–5.6 credits per lari, a pack
buyer 10. `lib/billing/pricingConfig.ts` holds further numbers. Choosing the canonical table is an owner pricing decision (no
pricing change without an SSoT update).

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
| **Email OTP sign-in, sign-up, password reset in Production** | **PROVEN live in Production 2026-10-09: log-in by code (14:17Z), password reset (14:26Z) and sign-up by code (16:09:05Z, the AUTH-4 fix, below)**; signed-in non-admin refused PROVEN live 14:50Z. Was **FAILED** from at least 2026-10-03 to 2026-10-09, for two separate reasons. (1) AUTH-1, code check: Vercel log "no email_otp in generateLink response"; `lib/auth/otpEmail.ts` accepted exactly 6 digits. Fix: 6–10 digit codes (PR #43 commit `87122ff`, also on this branch as `0421377a`; 10 suites / 127 auth tests and `tests/auth-sheet.spec.ts` 8 / 8 pass). PROVEN on this branch's Preview (2026-10-08 13:57 UTC): Supabase `/admin/generate_link` answered 200 and the code passed the check. (2) AUTH-2, delivery: the same request then failed at Resend, `[email-otp/send] resend 403 "The myavatar.ge domain is not verified"` (Vercel log 13:57:04, deployment of `e1dfffc2`). `MAIL_FROM` is unset, so every auth code and `/api/mail/send` uses `info@myavatar.ge`, and one `RESEND_API_KEY` serves Production and Preview. Owner action: verify `myavatar.ge` in that Resend account. AUTH-1 is in Production since the 2026-10-09 deploy (not tried there: a Production attempt would still stop at Resend). FAILED in Production until AUTH-2 is done. **2026-10-09 (Supabase Auth review, draft PR #51):** code generation PROVEN (14× `/admin/generate_link` 200, last 2026-10-08 14:42Z); delivery root cause PROVEN: `myavatar.ge` (DNS at Vercel) has no MX, SPF, DKIM or DMARC record (`vercel dns ls`, `dig`), Resend shows the domain "Not Started"; Production `RESEND_API_KEY` is set (a probe reached Resend). **AUTH-2 resolved 2026-10-09:** the owner pasted the DKIM value; the Supabase Auth thread added four records with `vercel dns add`, additive only, website records untouched (rollback `vercel dns rm` `rec_560f9c29eee79e60d2305798` DKIM TXT, `rec_99755b55743aeb80f54a6442` `send` MX, `rec_9628cf1d4c29ed6a04f0f6fe` `send` SPF TXT, `rec_fc9703e01c73e8c20e2e52fa` `_dmarc` p=none); propagation PROVEN on `ns1.vercel-dns.com`, 1.1.1.1 and 8.8.8.8; the owner pressed Verify: Resend **VERIFIED** (photo 14:10Z). Live on Production, the owner's hands, Claude reading the Vercel and auth logs: **email code log-in (KA) PROVEN 14:17Z** (`email-otp/send` 200, Resend accepted, `/admin/generate_link` 200, 8-digit code in the inbox, `/verify` 200 `login` 14:17:43Z); **password reset (EN) PROVEN 14:26Z** (`myavatar.ge@gmail.com`, a non-admin: recovery code, `/verify` 200, `PUT /user` 200, login with the new password 14:26:51Z). Signed-in non-admin refused PROVEN live 14:50Z (myavatar.ge@gmail.com signed in 14:49:59Z, /en/admin showed "Admin access restricted", server log "[admin] access denied" for that address 14:50:00Z). AUTH-3 (a sign-in code request for an unknown address created an unconfirmed account) is fixed (PR #51, shipped by PR #52 `6c7dff4`) and PROVEN live in Production ~16:02Z. AUTH-4 (sign-up by code dead for everyone in Production) is fixed, PROVEN on the PR #51 Preview and PROVEN live in Production 16:09:05Z. Report `docs/handoffs/2026-10-09-supabase-auth-security.md` §6–§9 (PR #51, `d73a5d6`; hotfix in §9, `771eac5`; live sign-up `7eba867`) |
| Email sign-up by code (AUTH-4) | **PROVEN live in Production 2026-10-09 16:09:05Z on `6c7dff4`** (FAILED for everyone before the 16:01Z deploy). Fix `776c7ff` (draft PR #51), PROVEN on the PR #51 Preview 15:27:39Z, shipped by PR #52. The Production run: the owner signed up (KA) on https://myavatar.ge/ka with a never-used address; auth log `/admin/generate_link` 16:08:52Z → `PUT /admin/users` 16:08:53Z → `/admin/generate_link` 16:08:54Z → `/verify` 200 `user_signedup` + login 16:09:05Z; read back (SQL): email confirmed, 1 session, users 23 → 24; the owner's photo shows the signed-in dashboard with the 50-credit balance. GoTrue voids a pending code when the sign-up takeover guard rotates the password, so every sign-up code mailed was already dead. The fix's run: the owner signed up (RU) on the PR #51 Preview; auth log `generate_link` → `PUT /admin/users` → `generate_link` → `/verify` 200 `user_signedup`. The owner chose "ჰოტფიქსი ახლა" at 15:47:19Z, and PR #52 carried the four auth commits (the same files) to `main`. Follow-ups, built and tested, also in Production since 16:01Z, BUILT_NOT_PROVEN live: `6aa0770` (a `mailto:` address pasted from a link is read as the address; an address GoTrue refuses answers 400 `invalid_email` instead of "could not send"), `adc28d7` (the sign-up profile step refuses a name equal to the new password, KA/EN/RU; Playwright `auth-sheet` 8/8; the owner's sign-up used a real name, so the refusal itself was not exercised live). Report §8/§9 (`d73a5d6`, hotfix `771eac5`, live sign-up `7eba867`) |
| Google OAuth, callback open-redirect guard | **PROVEN working** in Production (Supabase auth logs 2026-10-08: 8× `/authorize` 302 → `/callback` 302, 8 Google identities; PR #51 report) / guard PROVEN (unit). GitHub sign-in is enabled with 0 users (owner may turn it off, Y 19) |
| Confirm email | **PROVEN ON** 2026-10-09 (`/auth/v1/settings` `mailer_autoconfirm: false`); the admin rule's "confirmed email" holds |
| Sign-in code for an unknown address (AUTH-3) | **Fixed (`5216aa7`, draft PR #51; in Production via PR #52 `6c7dff4` since 16:01Z), PROVEN live in Production 2026-10-09 ~16:02Z**: an unknown address gets lookup none, then the `signin` send answers 404 `no_account`; the auth log has no `generate_link` and 0 users were created. Found live 2026-10-09 12:48Z: GoTrue turns an admin magiclink for an unknown address into a sign-up, so `POST /api/auth/email-otp/send` with `purpose: 'signin'` created an unconfirmed user. Now `signin` asks `public.auth_account_status` first and answers 404 `no_account`. The one probe account (example.com, no mail sent) was deleted ~12:55Z after the owner's card tap (1 `auth.users` + 1 `profiles` row; users back to 22) |
| Site URL / Redirect URLs | Site URL **PROVEN** `https://myavatar.ge`; Redirect URLs **PARTIAL**: `myavatar.ge/**`, `localhost:3000/**` and the PR #43 alias are there, the cert alias `…-git-ef1fad-…/**` is missing (Y 18) |
| Session refresh, paid routes require auth | PROVEN (unit, static scan of 446 routes) |
| Return to the workflow after login | BUILT_NOT_PROVEN: the URL, and since 2026-10-08 the typed request and its tool across Google sign-in (which reloads the page; the email code never did). `lib/studio/pendingPrompt.ts` keeps them in this tab's sessionStorage when the studio stops a guest (composer send, product / swap / remix), puts them back once into an empty composer within 30 min and sends nothing. Attachments are not kept. Tests: `pendingPrompt.test.ts`, `pendingPrompt.wiring.test.ts` |
| RLS | **Applied.** In the repo's migrations 8 tables had no RLS and `tracking_tokens` had a public SELECT policy; migration `20261008a_rls_internal_tables.sql` fixes all 9 and verifies itself. Checked live on 2026-10-08: **none of the 9 tables exists in Production**, so Production never had this leak; the migration was applied there at 16:06Z as a self-verified no-op that guards any environment built from the older migrations. Security advisor after it: 0 errors, 22 warnings (14 functions without a fixed `search_path`, 3 trigger functions callable over RPC by anon and by authenticated, `vector` in `public`, leaked-password protection off; the 17 function warnings were fixed by `20261009a` on 2026-10-09, leaving 2, see P), 23 info (RLS on with no policy, i.e. service-role-only tables, `director_runs` among them). `agent_definitions` keeps an authenticated `USING(true)` read policy. No DB-level RLS test (MISSING) |
| Admin routes | **Fixed and deployed** (PR #45 merged in `a02f0bf0`; in Production since the 2026-10-09 deploy). `run-migration` answering 404 is **PROVEN in Production** (anonymous GET after the deploy: 404 `{"error":"Not found"}`; 401 before); the one admin rule: anonymous probes PROVEN refused and admin sign-in + panel PROVEN live 2026-10-09 14:12Z (the owner's admin account, admin API 200 in the Vercel log; PR #51 report §4), signed-in non-admin refused PROVEN live 14:50Z (`myavatar.ge@gmail.com`: "Admin access restricted", server log "[admin] access denied" 14:50:00Z). 14:45:17Z the owner removed the one panel-granted admin: `public.admin_emails` has 0 rows, the only admins are the 2 built-in addresses. Before (`main` until 2026-10-09): 3 inconsistent admin guards; `run-migration` ran SQL behind a header key only, and 2 other routes were header-key only. After: one rule, `isAdminIdentity` (`lib/auth/adminGuard.ts`): an `app_metadata` admin role, or a confirmed email on the static allowlist or the panel-granted list; anything else, or a failed lookup, is refused. The `/admin` page, the admin APIs and the ops endpoints all use it. `run-migration` answers 404 unless `ADMIN_MIGRATION_ROUTE=enabled`, and then needs an admin session plus its own `MIGRATION_RUN_KEY` (timing-safe, logged); the other header keys compare timing-safe. Proof: unit (`lib/admin/guard.test.ts`, `app/api/admin/run-migration/route.test.ts`); full suite 682 suites green on the merge |
| Production schema matches the code | **FAILED** (checked live 2026-10-08 16:05Z). Production `public` has 52 tables; the code (app, lib, components, workers, services; tests excluded) calls `.from()` on 160 names, and **124 of them do not exist in Production** (`webhook_events`, `stripe_events`, `payment_attempts`, `agent_g_*`, `smm_*`, `orders`, `projects`, `messages`, …). Triage: one live 500 (the Agent G hub's Connectors tab, `GET /api/agent-g/channels`, fixed on this branch); WhatsApp linking, push notifications, affiliate commissions, Stripe webhook dedupe and the monthly-allowance display quietly do nothing; sign-in, studio chat, uploads, BOG and Stripe checkout are clean. Full list: `docs/handoffs/2026-10-08-production-schema-drift.md`. **2026-10-09:** a ratchet test (`__tests__/schema-drift.test.ts`, PR #50) now reads `.rpc()` too: 125 tables and 11 functions missing, and no new one can be added. Row-11 triage: the missing `debit_wallet_gel` is dead (no live path asks it to debit; film and music video charge up front), RAG is dead, Research and Plugins are gated by design, three orphan pages (`/services/workflow`, `/account/invoices`, `/admin/disputes`) failed when opened by address; retired on the owner's word (redirect + page deleted, on the branch). Fixed on the branch: the two Vapi webhooks failed open without `VAPI_WEBHOOK_SECRET` (anyone could write `voice_calls` rows); they answer 503 now (`7cc1a781`; Production `voice_calls` had 0 rows). Five owner decisions listed in the drift doc |

## P. Security

| Area | State |
|---|---|
| SSRF on every caller-chosen fetch, ffmpeg included | **fixed this run**, PROVEN (unit) — see G |
| Prompt injection | ReAct observations and Live page reads are labelled untrusted data; no adversarial live test (BUILT_NOT_PROVEN) |
| Cross-user file access (`/api/studio/library`) | **fixed this run**, PROVEN (unit): `POST` needs a session and accepts only a currently valid signed link to our own storage (probed) or a public URL; `GET` re-signs only the caller's rows, on our project host, in our media buckets. Accepted gap: whoever holds a valid signed link can file that object |
| **Storage read policy in Production** | **PROVEN fixed** (found 2026-10-08 19:40Z, fixed 21:27:25Z with the owner's yes). Before: `storage.objects` had a permissive SELECT policy "Public read music 1q2q05_0" for role `public` with `USING (true)`: it named no bucket, so anon and authenticated (both hold SELECT) could list and download every object in every bucket, the private ones included (`uploads` 2,589 objects, `studio` 1, `twins` 0, plus the public `renders` 494, `avatars` 16, `music` 10). The anon key ships in every browser bundle. Made in the dashboard, not in the repo. Gateway logs 2026-09-30 19:00Z to 2026-10-08 19:45Z: 0 storage requests as anon or authenticated other than public-bucket reads and signed uploads, so nothing legitimate used it and nobody was seen using it. Fix: `supabase/migrations/20261008d_storage_read_scope.sql` applied to Production (Supabase migration history `20261008212725`); its self-check passed. Proof after the change: `pg_policies` shows the policy as `(bucket_id = 'music'::text)`, and a rolled-back transaction as role `anon` sees only `music=10` objects (before: every bucket) |
| Media a request names, signed by the service role | **fixed this run**, BUILT_NOT_PROVEN (unit; in Production since the 2026-10-09 deploy, not tried live). Found 2026-10-08 after the storage policy fix: the editors (`/api/ai/edit`, `edit-photo`, `edit-audio`), lip-sync, remix, assemble, montage, motion control, voice training, dubbing and 3D signed whatever upload path or storage URL the body named, with the service role, and handed the result to a provider or ffmpeg; `reSignIfInternal` also re-signed URLs on any `*.supabase.co` host and public-bucket URLs. One account could have the server fetch another account's upload (a path learnt while the read policy was open, or an old shared link) and get the output back. Now `lib/security/callerMedia.ts` signs one of our objects for a caller only when it sits under the caller's own prefix (`omni-uploads/<uid>/`, `<uid>/`, and the editors' chain outputs, now `photo-studio/<uid>/` and `audio-studio/<uid>/`), or one of the caller's own Library rows holds that exact object, or the link's token is live right now (probed); otherwise 403 `media_not_yours` before any credit is reserved. `reSignIfInternal` re-signs only signed URLs on our own host. The run tracker (`/api/orchestrator/jobs` `complete`) no longer files a dead link to another account's object into the caller's Library (`url_not_verified`), which closed a way to make the Library re-sign it. Not provable: rows the tracker filed before this fix cannot be told apart |
| Script link on public share pages | **fixed this run**, BUILT_NOT_PROVEN (unit; in Production since the 2026-10-09 deploy; there `/share/<unknown>` and `/api/share/<unknown>` answer not-found, PROVEN). Found 2026-10-09: `user_creations` lets its owner write every column straight through the anon key (RLS checks only `user_id`), and `POST /api/creations` validated links with `z.string().url()`, which accepts `javascript:`. `/share/<token>` rendered `url` as its Download `href`, and the CSP allows inline script, so a creation made public with a `javascript:` link would most likely have run script on myavatar.ge for whoever pressed Download (inferred from React 18 rendering such hrefs and the CSP; not tried in a browser). Production has 0 `user_creations` rows (read 2026-10-09), so nobody was exposed. Now `lib/security/publicMediaUrl.ts` lets only an absolute https link (no credentials) reach `/share/<token>`, `/api/share/<token>` and a stranger's `/api/creations/<id>`; `POST /api/creations` refuses anything else. Tests: `publicMediaUrl.test.ts`, `app/api/share/[token]/route.test.ts`, `app/api/creations/[id]/route.test.ts` |
| Voice id in the ElevenLabs URL | **fixed, deployed 2026-10-09 ~05:15Z (`185b84d`)**, BUILT_NOT_PROVEN live (unit only: the routes need a session, so no public check reaches the 400). Found 2026-10-09: `/api/elevenlabs/tts`, `/api/orbit/voice`, Voice Lab jobs and the film voiceover put the voice id from the request, unencoded, into `…/v1/text-to-speech/<id>` with the platform key. `../` or `?` in it moved the POST to another ElevenLabs endpoint (fetch resolves dot segments) and the TTS route streamed the answer back to the signed-in caller (traced in code, not tried against ElevenLabs). Now `lib/audio/voiceId.ts` lets only a 1–64 character alphanumeric id through: 400 before any provider call or job row, and `generateVoice` and the film voiceover refuse it too; `/api/ads/tts` (already encoded) is checked the same way. Not added: a check that a named clone is the caller's own. All clones live on one ElevenLabs account, but no route or table lets a user read another user's voice id in Production (`voice_samples`, `voice_jobs`, `avatars` RLS is owner-only, read 2026-10-09; the `/api/avatars` leak below is inert there) and the ids are 20 random characters. Tests: `lib/audio/voiceId.test.ts`, `app/api/elevenlabs/tts/voiceId.test.ts`, `lib/ai/elevenlabs.test.ts`, `app/api/orbit/[service]/auth.test.ts`, `lib/chat/filmVoiceover.provider.test.ts` (mutation-checked) |
| Avatars list by `owner_id` | **fixed, deployed 2026-10-09 ~05:15Z (`185b84d`)**; PROVEN for the no-session case (the public check in A answers 200 with an empty list and no query). `GET /api/avatars?owner_id=<uuid>` with no session listed that user's avatars on the service role (voice id, system prompt, image); the parameter is now ignored and only a Bearer session's own rows are read (`app/api/avatars/route.test.ts`, fails on the old code). The same column error broke the whole family: `avatars` has `user_id` (Production, read 2026-10-09, and every migration in this repo) and no `owner_id`, so `/api/avatars` answered 500 to signed-in users and `/api/avatars/latest`, `/api/user/stats`, `/api/profile/landing` and the `avatar_id` check in `/api/video/generate` never found a row. **Fixed and deployed 2026-10-09 ~05:44Z (`66d7163`, PR #47)**, BUILT_NOT_PROVEN for signed-in users (unit: `app/api/avatars/route.test.ts`, `app/api/avatars/latest/route.test.ts`, which fail on the old code; the no-session checks in A pass): they filter on `user_id`, and the studio's avatar import reads `image_url`. Not changed: `/api/avatars/save` writes `model_url` / `preview_image_url`, which Production lacks, so it still fails; no screen calls it, and a named row it wrote would become the user's Live persona in `/api/avatar`, so it stays broken rather than half-fixed. Production has 5 `avatars` rows, none with an image, so nobody sees a difference yet |
| User-writable `jobs` rows (latent) | **Fixed, deployed 2026-10-09 ~05:44Z (`66d7163`, PR #47)**, BUILT_NOT_PROVEN (unit; the no-session 401s in A pass); inert in Production either way. Production's `jobs` lets `authenticated` INSERT and UPDATE its own rows (policies read 2026-10-09). `GET /api/editing/jobs/<id>` downloaded, wrote and signed whatever bucket / path a row named (`payload.source_assets`, `output_path_prefix`, `result.exports`): now a queued row runs only when every object is one `POST /api/editing/jobs` minted for the caller (`job-artifacts/editing-input|output/<uid>/`, `ownsEditingObject` in `lib/security/callerMedia`), else 403, and only the caller's own outputs are signed. `GET /api/jobs/<id>` ran an unbilled Runway render for a queued `generate_video` row on every poll: it is read only now (nothing in the app polls it; Runway is not an allowed provider). Production's `jobs` has no `agent_id`, `payload`, `result` or `type` column, so neither path could run there. Tests: `app/api/editing/jobs/[id]/route.test.ts`, `app/api/jobs/[id]/route.test.ts` (9 of 11 fail on the old code; the other 2 are positive controls) |
| Database function warnings | **PROVEN fixed** (applied 2026-10-09 ~05:39Z with the owner's yes, "გაუშვი" 05:38:12Z). Before: 14 `public` functions ran with the caller's `search_path` (5 of them SECURITY DEFINER, none executable by anon or authenticated) and 3 SECURITY DEFINER trigger functions (`chat_messages_fill_user_id`, `chat_messages_touch_session`, `support_touch_chat`) were executable by anon and authenticated. `supabase/migrations/20261009a_function_hardening.sql` pinned `search_path = public, pg_temp` on the 14 and revoked EXECUTE on the 3 (PostgreSQL checks it only at CREATE TRIGGER, so the triggers keep firing; dry-run on a local PostgreSQL 16 proved it). Read back from `pg_proc`: all 14 carry the pinned path, the 3 are not executable by anon or authenticated, `match_memories` stays callable by signed-in users. Security Advisor after it: 0 errors, 2 warnings (`vector` in `public`; leaked-password protection, an Auth setting the owner holds), 23 info (RLS on with no policy); since 2026-10-09 14:56Z (leaked-password protection on): 0 errors, 1 warning (`vector` in `public`, accepted) |
| Public `renders` bucket | **PROVEN fixed 2026-10-09 07:14Z** (owner's "Deploy + renders", 07:08:11Z): `20261009b` applied, `storage.buckets` reads `public = false` for `renders` (494 objects) and its public object URL answers 400 "Bucket not found" (checks in A). Signed links keep working by Supabase's design (BUILT_NOT_PROVEN live: no signed link was minted for the check); the 3 `render_jobs` rows from 2026-01-25 that hold a public link no longer open. Before: `renders` (494 objects, server outputs) is a public bucket in Production, so a leaked path stays readable forever whatever the signed link says. Paths are random ids and, since `20261008d` (applied 2026-10-08 21:27Z), cannot be listed. Neither `main` nor this branch builds a public `renders` URL (all signed); only 3 `render_jobs` rows from 2026-01-25 hold one. Making the bucket private: `supabase/migrations/20261009b_renders_private.sql` is written (2026-10-09, self-verifying, rollback in its header; every writer already signs, no code builds a public `renders` URL; Production read: only 3 `render_jobs` rows from 2026-01-25 hold a public link). **Not applied: needs the owner's yes** |
| Upload MIME / size | **fixed this run**, PROVEN (unit): images, video and audio only (415) and at most 50 MB (413) on `/api/upload` and `/api/upload/sign`; server renders and RVC zips moved to `renders`. The bucket-level cap, migration `20261008c`, was **applied 2026-10-09 03:38Z**, right after the deploy went live (owner action 3c, owner's "Deploy + ლიმიტი"). **PROVEN** by reading `storage.buckets`: `uploads` private, `file_size_limit` 52428800, 38 MIME types, no `application/zip`, no `text/html` (before: both null, which are the rollback values) |
| Secrets | none found in logs or the repo; SA keys never created (WIF, keyless) |
| Table RLS, functions, storage (re-run 2026-10-09, PR #51 report) | **PROVEN**: 52/52 `public` tables RLS on; as anon and as a signed-in stranger 0 rows in all 52; 31 SECURITY DEFINER functions, none executable by anon or authenticated, all with a fixed `search_path`; storage public read only on `music`, `renders` private |
| Server identity on `/api/avatar/generate` | **Fixed on draft PR #51 (`40992a8d`), ported onto the cert branch / PR #50 2026-10-09**, BUILT_NOT_PROVEN until deploy: `auth.getSession()` (cookie, not validated) → `auth.getUser()`; guard test `lib/security/serverAuthBoundary.test.ts` keeps it from coming back and also checks that no service-role key or client reaches `components/`, `hooks/` or a `'use client'` file (PROVEN, static). It was the only route doing this; its writes went through RLS with the user's JWT, so the impact was low |
| Leaked-password protection | **PROVEN ON 2026-10-09 14:55Z**: the owner switched it on in the Email provider settings (Pro plan, no upgrade). Security Advisor re-run 14:56Z: 0 errors, 1 warning (`vector` in `public`, accepted). Nothing else changed: `mailer_autoconfirm=false` (Confirm email ON), sign-up allowed, providers email / google / github, Captcha off (PR #51 report `55e1a84`) |
| Agent G URL-to-Audio file handling | BUILT_NOT_PROVEN (2026-10-09): public hosts only through `publicFetch` (pinned DNS, SSRF rules), the platform/stream rule on every redirect hop, 200 MB and 60 min caps, media types only, server-built output paths in the private `renders` bucket, temp dir removed after each run (D) |
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

The sidebar's Connectors · Plugins · Skills hub was removed on PR #50 (f28c2181, owner 2026-10-09 18:25Z: „confusing");
Web Push moved to Settings. The connector list lives only in Deep Research, renamed „My documents".
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
Static audit 2026-10-09 (`7c8dd9b3`, in Production since `29e7d67`): import graph from every `app/**/page|layout` (569 files), ka/en-only
ternaries and `{ ka, en }` objects without `ru`, and literal `t(key)` calls missing from `messages/`. Fixed:
`/account/billing` showed `billing.history.loading` while loading in every language (key missing; next-intl renders the
path, so `|| 'Loading…'` never fired), now a key plus a test over every literal `t(key)`; the video "Scenes & camera"
panel's 43 camera options were English in the Russian UI, now Russian (test requires Cyrillic); the wallet "min" badge
reads "мин.". Left: most remaining ka/en-only ternaries on reachable screens are font sizes, not text; the admin panel
(11 files) is ka / en on purpose; `lib/business-agent/generator.ts` and `dialogueLanguageWarning` have no Russian but no
screen calls them. A screen-by-screen audit with screenshots, and a search for untranslated hardcoded English, need
the running app (not done).

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

Only the owner can do or decide these. Rows marked done say who did them.

| # | Action | Unblocks |
|---|---|---|
| 1 | ~~Deploy the OTP sign-in fix (PR #43; also on this branch)~~ **Done 2026-10-09** with this branch's deploy (owner action 15). Sign-in by email works since 1a (PROVEN live 14:17Z) | O, §55 "auth blocking normal flow" |
| 1a | ~~Verify the `myavatar.ge` domain in the Resend account whose key is `RESEND_API_KEY`~~ **Done 2026-10-09 14:10Z**: the owner pasted the DKIM value, Claude added the four records (additive, ids in O), the owner pressed Verify; Resend VERIFIED. Email code log-in PROVEN live 14:17Z, password reset 14:26Z. Non-admin refusal PROVEN live 14:50Z. Sign-up by code: the owner's RU run 15:27:39Z on the PR #51 Preview PROVED the AUTH-4 fix; it is in Production since 16:01Z (PR #52, `6c7dff4`, the owner's "ჰოტფიქსი ახლა"), and the owner's KA sign-up on myavatar.ge PROVED it live 16:09:05Z. Never press Resend "Auto configure" | O, §55 "auth blocking normal flow" |
| 2 | ~~Press the Veo smoke button on the PR #43 Preview~~ **Done 2026-10-08 15:48Z**: the clip rendered on Vertex (INFERENCE VERIFIED 15:49Z, see J). Left: confirm in Billing > Credits that the $300 credit covered it | L, VIDEO V1-V6 |
| 3 | ~~Apply `supabase/migrations/20261008a_rls_internal_tables.sql`, then run the Supabase security advisor~~ **Done 2026-10-08 16:06Z** (no-op in Production, see O) | O (RLS) |
| 3a | ~~Apply `supabase/migrations/20261008b_director_runs.sql`~~ **Done 2026-10-08 16:01Z** (table exists, RLS on, anon/authenticated hold no privilege, 0 rows) | J, VIDEO V1-V6 |
| 3d | ~~Say yes to applying `supabase/migrations/20261008d_storage_read_scope.sql`~~ **Done:** the owner said yes 21:26Z, applied 21:27:25Z, verified (anon now sees only the `music` bucket) | P, §55 "RLS failure" |
| 3c | ~~Right after the deploy, apply `supabase/migrations/20261008c_uploads_bucket_limits.sql`~~ **Done 2026-10-09 03:38Z** by Claude on the owner's "Deploy + ლიმიტი"; verified in `storage.buckets` (P) | P (uploads) |
| 3b | ~~Set `VIDEO_DIRECTOR_RUNS=admin` on Preview only and remove the Production scope~~ **Done 2026-10-08 16:42Z** by the owner (Preview director route answers 401 without a session; Production has no flag, so the director stays off there after the 2026-10-09 deploy). An admin can now run a storyboard shot by shot on Preview (paid Veo per shot) | J, VIDEO V1-V6 |
| 3e | ~~Say yes to applying `supabase/migrations/20261009a_function_hardening.sql`~~ **Done:** the owner chose "გაუშვი" 2026-10-09 05:38:12Z; applied ~05:39Z, verified (advisor warnings 22 → 2) | P |
| 4 | Confirm the Supabase global upload limit is ≥ 50 MB; if `UPLOAD_BUCKET` is not `uploads`, apply the migration's bucket section to it | P |
| 5 | Subscribe the Stripe **Live** webhook endpoint to `charge.refunded` and `charge.dispute.created` (dashboard.stripe.com/webhooks). The reversal runs only if that endpoint's URL is `/api/stripe/webhook` or `/api/webhooks/stripe`; `/api/billing/webhook` ignores both events. `webhook_events` does **not** exist in Production (checked live), so the webhook's dedupe is in-memory only; the credit grant (`sub:<invoice>`) and the reversal refs are idempotent on their own | N |
| 5a | BOG: in BOG's business manager, confirm the merchant is enabled for online payments (api.bog.ge) and that `BOG_CLIENT_ID` / `BOG_SECRET_KEY` in Vercel Production are the **live** pair (a sandbox pair needs `BOG_ENV=sandbox`, and then takes no real money). This branch is deployed (2026-10-09): start one 10 ₾ top-up and stop at BOG's page (creating the order charges nothing); if it fails, `bog_orders.reject_reason` names the cause | N, §55 billing |
| 6 | **Done before the deploy:** confirm `deduct_credits` and `SUPABASE_SERVICE_ROLE_KEY` exist in Production (otherwise every paid render is now refused, not given away). **Checked by Claude 2026-10-09 00:2xZ (read-only):** `deduct_credits(p_user_id uuid, p_amount integer, p_ref text)` and `refund_credits` exist with the arguments the code sends; the columns the branch's new queries use exist; the service-role key is inferred present (the server writes `credit_ledger`, which has no user write policy; last `commit` row 2026-10-06), not read (Vercel connector 403) | N |
| 7 | Choose the canonical pricing table (`/pricing` 25/75/149 GEL vs studio 9/29/89 GEL) | M |
| 8 | Decide the browser-control infrastructure (none exists) | H, BROWSER CONTROL |
| 9 | Approve the provider migration plan (Part 2): strip Replicate, Udio, Kling/Higgsfield, HeyGen paths and their Production keys. The code is ready on PR #50: set `MEDIA_GOOGLE_ONLY=1` (then redeploy) and every media tool runs on Google / ElevenLabs or refuses before charging; unset it to roll back | L, PROVIDER BOUNDARY |
| 10 | Imagen 4 quota / availability on Vertex for this project (404 today) | L |
| 11 | Separate Preview and Production Supabase projects, or add the Preview redirect pattern to Supabase Auth | O, E2E on Preview |
| 12 | Set the Sentry DSN; share Vercel Speed Insights | W, X |
| 13 | Real-device pass (iPhone, Android) with Live voice: Google accepting `ask_agent_g`, mic → speech, same-context calls | E, T |
| 14 | Credit coverage check in Cloud Billing → Credits ≈ 24 h after the T2 test | L |
| 15 | ~~Production deploy approval~~ **Done:** the owner chose "Deploy + ლიმიტი" 2026-10-09 03:19:58Z; merged as `9f1bff68`, live as `9f1bff6`, checks in A. Request with ship list and rollback: `/mnt/project-files/reports/2026-10-09-production-deploy-request.md`. Any further merge to `main` or deploy needs the owner's new word | — |
| 16 | ~~Say yes to applying `20261009b` (`renders` bucket private)~~ **Done:** the owner chose "Deploy + renders" 2026-10-09 07:08:11Z; applied 07:14Z, checks in A | — |
| 17 | ~~Supabase Dashboard → Authentication → Attack Protection: turn on leaked-password protection~~ **Done 2026-10-09 14:55Z** (advisor: 0 errors, 1 accepted warning). ~~Confirm "Confirm email" is on~~ **PROVEN ON 2026-10-09** (O) | O, P |
| 18 | Supabase → Authentication → URL Configuration → Add URL `https://avatar-g-frontend-v3-git-ef1fad-kintsurashviligaga-ops-projects.vercel.app/**` (additive; Site URL stays `https://myavatar.ge`), so Google sign-in works on the cert Preview | O, Preview E2E |
| 19 | Optional: turn GitHub sign-in off (0 users; the sign-in screen shows its button while it is on) | O |
| 20 | Agent G Preview run as admin on the cert-branch Preview (the flag defaults to admins there). Montage Stop and delivery are PROVEN (16:49Z, 16:58Z); left: URL-to-Audio (AU-8), the Task API owner check, an audio Stop, lost-worker recovery and retries running out. Exact steps: `docs/handoffs/2026-10-09-preview-run-sheet.md`; steps E and F need the owner's word to lapse a lease on the owner's own test row | D |
| 22 | Price decisions from the service audit: the 20-credit lip-sync charge inside dialogue films and music videos (keep, fold into the film price, or drop); a price for dubbing, presentation and upscale; the VFX button's price key (R5) | M |
| 23 | Motion transfer: keep it (Kling image-to-video on Replicate, refused under `MEDIA_GOOGLE_ONLY`) or retire it (Veo image-to-video in Video does the same) | C, L |
| 21 | ~~Merge word for the auth fixes~~ AUTH-3 and AUTH-4 reached Production through PR #52 (`6c7dff4`, the owner's "ჰოტფიქსი ახლა" 15:47:19Z); AUTH-3 PROVEN live 16:02Z, AUTH-4 PROVEN live 16:09:05Z (the owner's KA sign-up). PR #51's remaining change (`/api/avatar/generate` identity + guard test) is ported onto PR #50 and main is merged into it, so PR #50 carries every auth fix; PR #51 itself stays a draft (it can be closed once PR #50 merges). Left: the merge word for PR #50 | O, P |

### §55 launch blockers still open after the 2026-10-09 deploy

Any one of these means NO LAUNCH. Owner, dependency, evidence and Definition of Done for each, with the fix order:
`docs/handoffs/2026-10-09-engineering-report.md` §4–6 (2026-10-09).

| §55 blocker | Where it stands |
|---|---|
| Auth blocking normal flow | **No longer blocking (2026-10-09 16:09Z)**: email sign-up by code PROVEN live in Production 16:09:05Z (the AUTH-4 fix, PR #52 `6c7dff4`; the owner's KA sign-up). The rest is not blocking either: Supabase Auth VERIFIED and Admin Security PROVEN (PR #51 report `55e1a84`): email code log-in (14:17Z) and password reset (14:26Z) PROVEN live in Production (O; AUTH-1 deployed, AUTH-2 Resend domain VERIFIED); admin sign-in (14:12Z) and the signed-in non-admin refusal (14:50Z) PROVEN live; leaked-password protection ON 14:55Z. AUTH-3 PROVEN live in Production ~16:02Z. Open: only the optional cert-alias Redirect URL (not blocking). Google sign-up also works in Production |
| Wrong provider / silent fallback | Silent fallbacks removed for image, text, music and voice (deployed 2026-10-09, not checked live); on PR #50 also for avatar, chat images, remix and the Georgian song, plus the `MEDIA_GOOGLE_ONLY` switch (off; owner action 9). Forbidden providers are still the primary engine for avatar, swap / motion / product ad, 3D, interior, several music modes, and NanoBanana is a reseller (L) |
| Browser nonfunctional | No browser control exists (H) |
| RLS failure | Storage: **fixed in Production 2026-10-08 21:27Z** (`20261008d`; the open `USING (true)` read is now limited to the `music` bucket, PROVEN by policy read and an anon check, P). Tables: none open, the 9 tables do not exist there; `20261008a` applied (O); row isolation PROVEN on Production as anon and as two signed-in users, and no money function is callable from the browser (Q, 22:20Z) |
| Broken V1–V6 | Director built, wired into the studio behind `VIDEO_DIRECTOR_RUNS` (`admin` on Preview, off in Production), unit-proven; its table is applied (2026-10-08). One live Veo clip is INFERENCE VERIFIED on Vertex (PR #43's smoke button, not the director); no director run has been tried live yet (J) |
| Wrong pricing / billing inconsistency | Subscription tiers and top-up packs price a credit differently (M, PROVEN live 2026-10-09). No payment has ever completed in Production: every BOG checkout failed at start (N, owner action 5a) |
| Live Voice unable to invoke Agent G tools | Built (`ask_agent_g`), not proven on a live call (E) |
| Unresolved P1 | Admin panel P1 (Admin Panel audit): the fix (`a02f0bf0`, from PR #45) is in Production since the 2026-10-09 deploy. `run-migration` answers 404 there (PROVEN live); the one admin rule: admin sign-in and panel PROVEN live 2026-10-09 14:12Z, signed-in non-admin refused PROVEN live 14:50Z, anonymous refused PROVEN (O). No other P1 is known open |
| Fake capability claims | Fixed and deployed 2026-10-09 (`/hub` fake stats deleted, sitemap from the catalog, the `/account/payments` provider page retired). `/ka/hub` now lands on the studio in Production (PROVEN); the rest not checked live |

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
