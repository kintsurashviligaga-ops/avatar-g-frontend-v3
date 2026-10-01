# Super Chatbox — architectural status (2026-10-01)

The Master Directive of 2026-10-01 asked for four phases: Phase 1 (fix and deploy), Phase 2 (UI/UX and guest mode), Phase 3 (omni-modal capabilities) and Phase 4 (billing). This file says what exists now, where it lives and what is still blocked. Nothing in it is aspirational: every "done" item has tests behind it, and every "dark" item is switched off in code until someone turns it on.

## 0. Where the code is

| Branch | State |
|---|---|
| `main` @ `1d59084` | Phase 1 (`d11bc1e` plus the SSE keep-alive). **Not live**: every production build fails, see §1. |
| `feat/chat-first-guest` @ `f1c9276` (local) | Phases 2–4 plus the four foundation branches merged in. tsc is clean, jest is 348 suites / 5,527 tests (3 skipped), the Playwright specs pass. **Not merged to main**: that needs the owner (§1). |

## 1. Blockers only the owner can clear (in order)

1. **Production cannot deploy.** Vercel discontinued Node 20.x, and every build since `30dee4a` fails in about 4 seconds. The fix is ready on `chore/node-24-runtime` (`d02d637`): `engines.node` 24.x in `package.json`, the lockfile, `.nvmrc` and both CI workflows. Merging it needs your approval.
2. **Merge `feat/chat-first-guest` to main.** This is everything below.
3. **Gemini prepay is empty again.** Production logged `402 "Your prepayment credits are depleted"` on `/api/chat/gemini` at 17:09 on 09-30, and the local key returns the same today. Until the AI Studio prepay is topped up, chat, Veo, Lyria and TTS all fail.
4. **Delete the old shell and the legacy pages.** You chose this, but the auto-mode classifier blocked the `git rm`. The plan is in §3.5.
5. **A funded image provider for the template thumbnails.** Gemini is 402, Replicate and OpenAI have no credit, and Vercel withholds the production `HF_CREDENTIALS` value. Run `npm run hf:credentials` (enter the key locally), then `npx jiti scripts/hf-art-pack.ts --pack templates --yes-spend`. The cap is $5 and the stop line is $4.50; the expected cost is about $0.46.
6. **Reconcile live Stripe.** No Stripe top-up has ever reached the ledger (§5.2). Check the live dashboard for paid `wallet_topup` sessions. Any you find can be replayed once the fix is deployed.
7. **Vertex AI.** The switch is already automatic: `veoTransport()` prefers Vertex whenever the GCP variables are complete. None are set in production, so Veo runs on the Gemini API today. The variables are listed in `docs/VEO_VERTEX_SETUP.md`.

## 2. Phase 1: chat reliability (on main)

- **SSE keep-alive.** The stream sends a `: keep-alive` comment as soon as it opens and every 8 s after that (`HEARTBEAT_MS`). The browser watchdog (20 s before the first token, 45 s while idle) re-arms on any byte, so a Pro or Thinking model can reason for a long time without the turn timing out. With heartbeats flowing the browser can no longer catch a hung upstream, so the server does: `TURN_DEADLINE_MS` is maxDuration − 20 s. Past it the model call is aborted and the user gets a retryable notice.
- **maxDuration.** It is 300 s in both the route and `vercel.json`, where it used to be 60.
- **Pro allowance.** It is 20 per day per account. The 21st Pro turn is answered by Fast, never refused, and its meta frame carries `reason: pro_cap` and `resetAt` (integration test with the real limiter). `CHAT_PRO_DAILY_LIMIT=0` really does turn Pro off now.
- **Retired models.** No `gemini-1.x` or `2.0` id remains in any model list; a repo guard test fails if one comes back. A per-call model now passes the same guard.

## 3. Phase 2: UI/UX (`feat/chat-first-guest`)

### 3.1 The front door
- **Home.** `/` and `/{lang}` render the studio for guests, and it opens on the chat. Signed-in users go to `/{lang}/dashboard`, the same studio with their session.
- **Landing.** The marketing landing moved to `/{lang}/landing`. It is still server-rendered, appears in the sitemap and keeps its language switch.
- **Sidebar.** „ჩატი" is the first row, and the shared tool list starts with chat.
- **Studio address.** `isStudioPath()` recognizes the studio at both addresses, so a sidebar tap on the home page switches tools in place.

### 3.2 Guest mode (`lib/chat/guestChat.ts`, enforced server-side)
- **What a guest turn gets:** Fast only, text only, no grounding, answers up to 2,048 tokens and messages up to 4,000 characters.
- **Caps:** 10 turns per day per IP and **250 per day across all guests**. The global ceiling stops a flood from rotating IPs from spending the shared $10/day budget.
- **Refusals:** a cap, a file or an over-long message is answered in-stream with `auth_required`, which opens the sign-in sheet.
- **In the browser:** `send()` lets only a plain chat turn through. Any paid tool, file, "make me a video" request or studio intent opens sign-in before anything is sent, and the composer keeps the text. Read-aloud, dictation and Live behave the same way.
- **Switches:** `CHAT_GUEST_ENABLED=0` turns guest chat off, `CHAT_GUEST_SEARCH=1` allows grounding, and `CHAT_GUEST_DAILY_LIMIT` and `CHAT_GUEST_GLOBAL_DAILY_LIMIT` set the caps.

### 3.3 Brand
- **Colours.** The background is true black (`#000`). The accent is the rocket's blue, `#338FE8`: it reads 6.2:1 as text on black, and the existing dark text on accent fills reads 6.2:1 too. `--app-accent-deep` (`#1873CA`) is for glows. The light theme uses `#1873CA` (4.8:1).
- **The rocket mark.** `public/brand/rocket-mark.{png,webp}` is cut out of the supplied raster. `design/brand/rocket/extract.py` reproduces it: a soft matte against a fitted background model, so the glow stays and there is no box. `<Wordmark mark />` puts it in every navbar as one lockup with a single accessible name.

### 3.4 Template galleries (`lib/studio/templates.ts`, `components/studio/ui/TemplateGallery.tsx`)
- **The cards.** There are 30 cards: 8 for video, 8 for image, 8 for music and 6 presenters. They absorb the old presets exactly.
- **What a card does.** A card writes the panel's real parameters: style, format, length, quality, genre, tempo and vocal, or for a presenter the face, voice and format. The routes already turn those into context, for example the image route's `STYLE_SUFFIXES` and the film director's style and scene count. A card adds no hidden prompt. The selected card is derived from the panel's values, never stored.
- **Images.** Four cards use honest matches from the brand pack, and the presenters use the real preset faces. The other 20 show palette tiles until the capped Higgsfield pack runs (§1.5).

### 3.5 Old shell deletion (approved by the owner, blocked by the classifier)
- **What it removes.** 36 route directories: the old `/chat`, marketplace, online-shop, sell, executive, analytics, placeholders (about, blog, careers, contact), the old `/studio/*` and `/dashboard/*` sub-pages, the duplicate standalone `3d`/`dubbing`/`montage`/`slides` pages, and `account/business` and `account/returns`.
- **What replaces them.** Redirects to the nearest new surface, and removal of the old top bar, bottom nav and support bubble.
- **What stays, in the new shell:** pricing, settings, support, the services hub, and account billing, invoices, payments and delete.
- **How dead code is chosen.** Only files the deletion orphans are removed, found by diffing the import graph before and after. 315 files were already unreachable before today and are listed as a follow-up.

## 4. Phase 3: omni-modal (`feat/chat-first-guest`)

| Capability | State | Notes |
|---|---|---|
| **Artifacts canvas** | On | Code and Preview tabs. The Preview frame is `sandbox="allow-scripts"` only, so it gets an opaque origin, and a CSP meta (`connect-src 'none'`) comes before any model markup. A navigation inside it is reset. Opens from a code block, or from Live via `myavatar:open-artifact`. |
| **URL reading** | Dark: `GEMINI_CHAT_URL_CONTEXT=1` | Gemini's native `urlContext` tool, only on turns that contain a link and never for guests. Not yet checked live with google_search on 3.8 Flash; a 400 would not rotate to another model. |
| **Voice-to-action** | On, client opt-in | Live declares `prepare_generation`, `show_code`, `open_studio` and `end_call`. These calls only prepare things; a paid run still needs the user's tap. If Google refuses the declarations, the session falls back to having no actions. Not yet verified: that the ephemeral-token lock accepts `functionDeclarations`. |
| **Long-form Director (8–240 s)** | Dark: `LONGFORM_VIDEO_ENABLED` | A bible plus per-act storyboards with the character locked, a pure state machine, an ffmpeg stream-copy stitch with a looped music bed, a cron tick, and the `20261001b` migration (**not applied**). Blockers: 50 MB upload (resumable upload or 720p needed above about 176 s), the $10/day budget against ~$96 for a 240 s Standard film, and the stitch time budget. See `docs/video/LONGFORM.md`. |
| **Skills & Integrations (MCP)** | Not started | No in-app MCP client exists. The built-in skills (search, URL reading, canvas) run on server policy. Shipping an empty menu would break the "every button works" rule. |

## 5. Phase 4: billing

### 5.1 The tier foundation (`docs/billing/TIERS.md`): inert
- **Catalogue.** `lib/billing/tiers.ts` defines Free, Starter $19.99, Creator $39.99 and Business $79.99, with monthly credits, Pro allowance, chat modes, premium templates and long-form limits.
- **Resolver.** `resolveUserTier()` reads an active subscription, then a comped `profiles.tier`, then falls back to Free.
- **Checkout.** `POST /api/billing/subscribe` creates a `mode: subscription` checkout and returns 503 until `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_CREATOR` and `STRIPE_PRICE_BUSINESS` exist.
- **Monthly allowance.** `invoice.paid` grants it once per invoice (ref `sub:<invoice>`).
- **Migration.** `20261001a` is **not applied**.
- **Tier caps are not wired into chat on purpose.** Everyone resolves to Free today, so wiring them would cut the audited 20 Pro turns to 5.

### 5.2 Fixed today: paid Stripe GEL top-ups were not credited
The webhook looked the payer up only in `subscriptions`, a table production does not have, through the cookie-based anon client, which a webhook cannot use. Meanwhile the session carried no user id.
- **Now:** the session carries the authenticated user id, and the webhook resolves the payer from metadata, then the client reference, then the subscriptions row (service role), then the Stripe customer's own `metadata.userId`. That last step recovers sessions created before the fix.
- **Failures:** a Stripe outage returns 500 so Stripe redelivers. A payer that truly can't be resolved raises a Sentry alert.
- **Ledger:** it has never recorded a Stripe-sourced credit, so reconcile the live dashboard (§1.6).

### 5.3 Money bugs found, not fixed (`docs/billing/TIERS.md` §5)
- `debit_wallet_gel` (missing in production) would debit CEIL(GEL) credits while top-ups credit GEL×10, about a 10× under-charge on film clip legs.
- The film balance gate compares credits to GEL.
- One-time packs are booked as `refund`.
- `hasPaidPlan` ignores subscriptions, so paying subscribers would get watermarked output.
- A free film is not limited to 8 s.
- Other Stripe webhook writes still use the anon client.

## 6. Risks to verify

- **`vercel.json` globs.** A catch-all `app/api/**: 15` sits beside the per-route `maxDuration` exports, and Vercel does not document which one wins. Production showed no function timeouts over 7 days, so the per-route export probably wins, but a single deploy log check would settle it.
- **Live checks pending.** These can be verified once Gemini is funded: Live with function declarations, URL context together with google_search, and the guest flow and heartbeat in production.
- **Dead code.** 315 files were already unreachable from any entry point before today.
