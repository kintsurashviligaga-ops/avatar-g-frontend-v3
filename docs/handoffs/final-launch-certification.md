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
- Still open: 5 legacy registries are imported by legacy API routes (`/api/pipeline`, `/api/agents/*`) and must be deprecated
  with them; §50 analytics events are MISSING; §51 has no search box (PARTIAL).

## D. Agent G

| Area | State | Evidence |
|---|---|---|
| Tool matrix | Chat (Gemini), Google Search grounding, `/api/agent/run` ReAct loop with `web_search` and `scrape_webpage`, prepare-only Instagram post. No render tool by design (renders go through the priced studio) | `lib/agent/react/bindLiveAgent.ts` |
| Routing | Deterministic catalog router (`lib/catalog/agentRoute.ts`) opens a tool, never renders or charges; questions are answered in prose; coming-soon services are named as unavailable, never substituted | `agentRoute.test.ts`, `agentRoute.wiring.test.ts` (forbids fetch / `/api/` in the branch) — BUILT_NOT_PROVEN |
| Orchestration | ReAct loop bounded (max steps, deadline), Gemini-only under `AI_GOOGLE_ONLY`. Observations are wrapped as untrusted data ("never instructions") | `coordinator.ts`, `coordinator.test.ts` |
| Approvals | Paid generation needs the priced button (text) or a spoken "yes" plus a cancellable 3 s countdown (voice). Click guard refuses spend / pay / delete / sign-out / password | `liveActions.test.tsx`, `lib/voice/liveUi.test.ts` — PROVEN (unit) |
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

| Invariant | Label |
|---|---|
| V1–V6 in the domain layer | BUILT_NOT_PROVEN (unit) |
| Wired into the product's video flow | **MISSING**: the studio's video tool still uses the existing engine path, not the director |
| Live Veo run | BLOCKED_OWNER: Part 0 is AUTH VERIFIED for the Preview identity (build log of e222e38, 14:21:20 UTC: `mode:wif token:ok bucket:ok sign:ok`); the owner-approved one-clip smoke test (≈ $0.40) waits on the owner's sign-in on the PR #43 alias |
| Byte-for-byte on the wire | BUILT_NOT_PROVEN (unit): the director's requests carry `verbatimPrompt: true`, so `lib/veo/payload.ts` sends the prompt and negative prompt exactly as given on both transports (commit `a24bb320`; other callers keep the trim). The preflight still refuses any wire that would alter a prompt |

## K. Model Catalog

`lib/ai/google/models.ts` allowlists the Live model; the chat model picker offers Google models. On `main` the studio
catalogue still lists Higgsfield / Udio / NanoBanana / Grok / FLUX rows. PR #44 (the earlier agent's WIP, now green:
tsc 0, jest 9789 passed, lint 0 errors) makes the catalogue Google-only, but it is unmerged and keeps known gaps (listed in
the PR). **NOT PROVEN.**

## L. Provider boundary

**FAILED on `main` and on this branch.** 10 of the 20 usable catalog services run on a §A violation path today
(`docs/handoffs/service-taxonomy.md` §2): image = NanoBananaAI → Grok → FLUX; avatar = HeyGen / Replicate; music cascade
includes Udio; product ad / motion / swap = Kling (Replicate / Higgsfield); 3D = Replicate TRELLIS; `/api/pipeline` text
services fall back Gemini → Anthropic → OpenAI with no gate (R7 silent fallback). Only Veo can run on Vertex, and only in
Preview. GCP Part 0 is CONFIGURED; Gemini text, Gemini image and Lyria **INFERENCE PROVEN on Vertex** from the owner's Mac
(≈ $0.11, owner-approved 11:47 UTC); Imagen 4 is not available on Vertex for this project (404). The migration is Part 2.

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
| Refund or dispute takes back the credits it bought | **fixed this run**, BUILT_NOT_PROVEN (unit: proportional, never more than granted, idempotent per charge, shortfall alerted). Needs the Stripe endpoint subscribed to `charge.refunded` and `charge.dispute.created` (owner). A dispute the merchant wins does not restore credits automatically |
| Stripe webhook writes (event dedupe, subscription sync) | **fixed this run**: service-role client instead of the anon client (unit). `webhook_events` must exist in Production (owner check) |
| A paid render when the ledger cannot charge | **fixed this run**: refused with `billing_unavailable` in production instead of rendering free (unit). Before deploy, confirm `deduct_credits` and the service-role key exist in Production, or every render is refused |
| Credit history | **fixed this run**: reads `credit_ledger`; the client-written `POST /api/credits/record` (forgeable "+N credits" rows) is gone (unit). Admin analytics still reads the now-unwritten `credit_transactions` (PARTIAL) |
| Live payment, webhook delivery, invoices | BLOCKED_OWNER |
| Tax / VAT | MISSING |

## O. Auth

| Requirement | Label |
|---|---|
| **Email OTP sign-in, sign-up, password reset in Production** | **FAILED** since at least 2026-10-03, for two separate reasons. (1) AUTH-1, code check: Vercel log "no email_otp in generateLink response"; `lib/auth/otpEmail.ts` accepted exactly 6 digits. Fix: 6–10 digit codes (PR #43 commit `87122ff`, also on this branch as `0421377a`; 10 suites / 127 auth tests and `tests/auth-sheet.spec.ts` 8 / 8 pass). PROVEN on this branch's Preview (2026-10-08 13:57 UTC): Supabase `/admin/generate_link` answered 200 and the code passed the check. (2) AUTH-2, delivery: the same request then failed at Resend, `[email-otp/send] resend 403 "The myavatar.ge domain is not verified"` (Vercel log 13:57:04, deployment of `e1dfffc2`). `MAIL_FROM` is unset, so every auth code and `/api/mail/send` uses `info@myavatar.ge`, and one `RESEND_API_KEY` serves Production and Preview. Owner action: verify `myavatar.ge` in that Resend account. FAILED in Production until both are done |
| Google OAuth, callback open-redirect guard | BUILT_NOT_PROVEN / PROVEN (unit) |
| Session refresh, paid routes require auth | PROVEN (unit, static scan of 446 routes) |
| Return to the workflow after login | PARTIAL (URL only, no prompt stash) |
| RLS | **FAILED until applied.** 8 tables had no RLS and `tracking_tokens` had a public SELECT policy. Migration `20261008a_rls_internal_tables_and_upload_limits.sql` fixes all 9 and verifies itself; it is written, **not applied** (owner applies it, then runs the Supabase security advisor). `agent_definitions` keeps an authenticated `USING(true)` read policy. No DB-level RLS test (MISSING) |
| Admin routes | 3 inconsistent guards; `run-migration` and 2 other routes header-key only (Admin Panel audit thread) |

## P. Security

| Area | State |
|---|---|
| SSRF on every caller-chosen fetch, ffmpeg included | **fixed this run**, PROVEN (unit) — see G |
| Prompt injection | ReAct observations and Live page reads are labelled untrusted data; no adversarial live test (BUILT_NOT_PROVEN) |
| Cross-user file access (`/api/studio/library`) | **fixed this run**, PROVEN (unit): `POST` needs a session and accepts only a currently valid signed link to our own storage (probed) or a public URL; `GET` re-signs only the caller's rows, on our project host, in our media buckets. Accepted gap: whoever holds a valid signed link can file that object |
| Upload MIME / size | **fixed this run**, PROVEN (unit): images, video and audio only (415) and at most 50 MB (413) on `/api/upload` and `/api/upload/sign`; server renders and RVC zips moved to `renders`. The bucket-level cap is in migration `20261008a` (owner applies) |
| Secrets | none found in logs or the repo; SA keys never created (WIF, keyless) |
| HawkScan DAST | **not run**: `HAWK_API_KEY` is not set in this environment |
| High-risk browser actions | n/a: no browser control exists (H) |

## Q. Files / Library

| Requirement | Label |
|---|---|
| Upload MIME and size | **fixed this run**, PROVEN (unit) — see P |
| Malicious filename | PROVEN (by construction: names are server-generated) |
| Duplicate upload | MISSING (no hash or dedupe) |
| Signed URL lifetimes | BUILT_NOT_PROVEN: 15 min to 7 days for media; 1 year for voice-clone samples |
| Cross-user access through the Library | **fixed this run**, PROVEN (unit) — see P |
| Opening one's own private creation | **fixed this run** (owners got 403 on their own items), PROVEN (unit) |
| Deletion | PARTIAL: the Library row goes, the storage object stays |
| Saving and reusing generated assets | BUILT_NOT_PROVEN |
| RLS proof | MISSING (no DB-level test) |

## R. Connectors

Truthful labels (PROVEN, unit): Local files is ready; Google Drive, OneDrive, Notion and Dropbox are "soon" and `connect()`
refuses; Telegram / WhatsApp are status lines. No OAuth, no token storage, no scopes (MISSING by design until a connector
ships). Vocabulary lacks Beta / Disabled (PARTIAL).

## S. Localization

Key parity PROVEN: 843 / 843 / 843 keys in `messages/{ka,en,ru}.json`, 162 / 162 / 162 in `lib/i18n/translations.ts`, 0
missing, 0 empty. **FAILED:** 103 Russian values are English (89 in `studio.*`, used only by a dead component). The 8 English-only
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
fallback depth. PARTIAL: only one route sets `x-request-id`; 348 raw `console.*` calls in API routes; `/api/health` always
reports healthy; no alert rules in the repo (GCP budgets alert; they do not cap).

## Y. Remaining owner actions

Only the owner can do these. Nothing below was done by Claude.

| # | Action | Unblocks |
|---|---|---|
| 1 | Deploy the OTP sign-in fix (PR #43; also on this branch) after review: email sign-in, sign-up and password reset are FAILED in Production | O, §55 "auth blocking normal flow" |
| 1a | Verify the `myavatar.ge` domain in the Resend account whose key is `RESEND_API_KEY` (resend.com/domains → Add Domain → add the TXT / MX records at the DNS host → Verify). Until then every email code, sign-up and password reset is refused by Resend (403), on Preview and in Production | O, §55 "auth blocking normal flow" |
| 2 | Sign in as admin on the PR #43 Preview alias (password, or Google once that exact alias + `/**` is in Supabase Redirect URLs), then press the Veo smoke button on `/ka/admin/veo-smoke` once (approved clip, ≈ $0.40). AUTH itself is already verified from the build log | L, VIDEO V1-V6 |
| 3 | Apply `supabase/migrations/20261008a_rls_internal_tables_and_upload_limits.sql`, then run the Supabase security advisor | O (RLS), P (uploads) |
| 4 | Confirm the Supabase global upload limit is ≥ 50 MB; if `UPLOAD_BUCKET` is not `uploads`, apply the migration's bucket section to it | P |
| 5 | Subscribe the Stripe webhook to `charge.refunded` and `charge.dispute.created`; confirm `webhook_events` exists in Production | N |
| 6 | Before deploying this branch: confirm `deduct_credits` and `SUPABASE_SERVICE_ROLE_KEY` exist in Production (otherwise every paid render is now refused, not given away) | N |
| 7 | Choose the canonical pricing table (`/pricing` 25/75/149 GEL vs studio 9/29/89 GEL) | M |
| 8 | Decide the browser-control infrastructure (none exists) | H, BROWSER CONTROL |
| 9 | Approve the provider migration plan (Part 2): strip Replicate, Udio, Kling/Higgsfield, HeyGen paths and their Production keys | L, PROVIDER BOUNDARY |
| 10 | Imagen 4 quota / availability on Vertex for this project (404 today) | L |
| 11 | Separate Preview and Production Supabase projects, or add the Preview redirect pattern to Supabase Auth | O, E2E on Preview |
| 12 | Set the Sentry DSN; share Vercel Speed Insights | W, X |
| 13 | Real-device pass (iPhone, Android) with Live voice: Google accepting `ask_agent_g`, mic → speech, same-context calls | E, T |
| 14 | Credit coverage check in Cloud Billing → Credits ≈ 24 h after the T2 test | L |
| 15 | Production deploy approval (step 26: nothing was promoted) | — |

### §55 launch blockers still open on this branch

Any one of these means NO LAUNCH.

| §55 blocker | Where it stands |
|---|---|
| Auth blocking normal flow | Email OTP sign-in, sign-up and reset FAILED in Production (O): AUTH-1 code-check fix on PR #43 and this branch, not deployed; AUTH-2 Resend refuses mail until `myavatar.ge` is verified (owner action 1a) |
| Wrong provider / silent fallback | 10 of 20 usable services still run on forbidden providers; `/api/pipeline` falls back to Anthropic / OpenAI (L) |
| Browser nonfunctional | No browser control exists (H) |
| RLS failure | 9 tables open until migration `20261008a` is applied (O) |
| Broken V1–V6 | Domain layer built and unit-proven; not wired into the product, no live Veo run (J) |
| Wrong pricing / billing inconsistency | Two contradictory pack tables (M) |
| Live Voice unable to invoke Agent G tools | Built (`ask_agent_g`), not proven on a live call (E) |
| Unresolved P1 | Admin panel: `run-migration` executes SQL on Production behind a header key only; 3 inconsistent admin guards (Admin Panel audit) |
| Fake capability claims | Fixed on this branch (`/hub` fake stats deleted, sitemap from the catalog), still live in Production until a deploy |

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
