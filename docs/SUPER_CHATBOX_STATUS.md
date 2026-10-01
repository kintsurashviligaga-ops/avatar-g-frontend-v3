# Super Chatbox — architectural status (2026-10-01)

The Master Directive of 2026-10-01 asked for four phases: Phase 1 (fix and deploy), Phase 2 (UI/UX and guest mode), Phase 3 (omni-modal capabilities) and Phase 4 (billing). This file says what exists now, where it lives and what is still blocked. Nothing in it is aspirational: every "done" item has tests behind it, and every "dark" item is switched off in code until someone turns it on.

## 0. Where the code is

| Branch | State |
|---|---|
| `main` | Everything below, merged on 2026-10-01 with the owner's explicit approval: Phase 1 (`d11bc1e` + the SSE keep-alive), the Node 24 runtime, `feat/chat-first-guest` (Phases 2–4, the four foundation branches, the Stripe top-up fix, the old-shell deletion). |

## 1. Blockers only the owner can clear (in order)

1. ~~Production cannot deploy (Node 20.x discontinued).~~ Done: `chore/node-24-runtime` merged (`engines.node` 24.x, lockfile, `.nvmrc`, both CI workflows).
2. ~~Merge `feat/chat-first-guest` to main.~~ Done.
3. **Gemini prepay is empty again.** Production logged `402 "Your prepayment credits are depleted"` on `/api/chat/gemini` at 17:09 on 09-30, and the local key returns the same today. Until the AI Studio prepay is topped up, chat, Veo, Lyria and TTS all fail.
4. ~~Delete the old shell and the legacy pages.~~ Done, §3.5.
5. **A funded image provider for the template thumbnails.** Gemini is 402, Replicate and OpenAI have no credit, and Vercel withholds the production `HF_CREDENTIALS` value. Run `npm run hf:credentials` (enter the key locally), then `npm run art:templates -- --dry` (free: it prices every shot and adds the quotes up against the stop line) and `npm run art:templates -- --yes-spend`. Takes land in `scripts/templates/raw/`, the spend log in `scripts/templates/manifest.json` — neither under `public/`. The cap is $5 and the stop line is $4.50; the expected cost is about $0.46.
6. **Reconcile live Stripe.** No Stripe top-up has ever reached the ledger (§5.2). Check the live dashboard for paid `wallet_topup` sessions. Any you find can be replayed once the fix is deployed.
7. **Phone sign-in.** The sign-in sheet already accepts a phone number, but it only offers one once Supabase has an SMS sender. Supabase → Authentication → Providers → Phone: switch it on and enter an SMS provider (Twilio Verify needs the Account SID, Auth Token and Verify Service SID; there are no Twilio credentials anywhere in production today). The field then reads „ელ.ფოსტა ან ტელეფონის ნომერი" by itself. SMS to Georgia is among the pricier routes, so set Twilio's geo-permissions to the countries you serve.
8. **Vertex AI.** The switch is already automatic: `veoTransport()` prefers Vertex whenever the GCP variables are complete. None are set in production, so Veo runs on the Gemini API today. The variables are listed in `docs/VEO_VERTEX_SETUP.md`.

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
- **The cards.** There are 30 cards: 8 for video, 8 for image, 8 for music and 6 presenters. They absorb the old presets (the three 4K image presets now start at 2K, see below).
- **What a card does.** A card writes the panel's real parameters: style, format, length, quality, genre, tempo and vocal, or for a presenter the face, voice and format. The lit card is derived from the panel's values, never stored, so it goes dark the moment someone edits a field it set.
- **A lit card is not a picked card.** Some panels start out equal to a card: the video defaults are the Reel, and the image defaults plus the Photorealistic chip are the Product shot. So a request names a card only after the user picked it, and only while the values still select it (`requestTemplateId`, `hooks/usePickedTemplate`). The first edit away forgets the pick; setting the field back re-lights the card but sends nothing until it is picked again. The panel defaults live in `lib/studio/templates.ts` (`*_PANEL_DEFAULTS`) so a test pins that a default panel sends no `templateId`.
- **What a card adds (owner decision 2026-10-01 a).** A video, image or music request made after a pick also carries the card's `templateId`. It is an id, never text. The route resolves it on the server (`lib/studio/templateContext.ts`, `server-only`) into one short, capped context: an image prompt suffix (≤200 characters, after the style directive, via `lib/studio/composeImagePrompt.ts`), a music descriptor (≤160, in the brief's reserved suffix, so the user's words are never cut for it), or a film look (≤160, which replaces "<style> aesthetic" in both continuity guides and joins the drift-negative conflict filter) plus a director note (≤400). The context applies only when the request's own values still select that card: image and music re-run `match*Template`. Video checks the style and the music-video mode, plus the film's length whenever the request states it (the storyboard's package `sceneCount`, the render's pinned scene count × clip length, compared as a scene count), which is what separates the Reel from the Teaser. A storyboard frame call states no length and is matched on style and mode. An unknown, malformed, stale or borrowed id adds nothing. The storyboard route and the render (`/api/chat/orchestrate` → `filmComposite`) run the same resolver, so the approved board and the paid film share one look; a frame re-roll whose prompt came back from the browser gets the look at the head of its frame prompt, because that prompt is cut to 600 characters and the look sits near character 500 of the style guide. The image and music mutex keys hash the applied id. Re-rolls keep it (`ImageRegenSpec`, `MusicRegenSpec`).
- **Disclosure.** Every video, image and music card shows one „ამატებს: … / Adds: … / Добавляет: …" line (`templateAddsLine`). The copy describes the effect. The context tables live only in server code, and the server never accepts context text from the browser. The text is not secret, though: a film look is part of the storyboard's frame prompts, which the board returns for display and re-rolls. Presenter cards add nothing (decision f) and show no line.
- **Quality (decision c).** Product, Poster and Wallpaper start at 2K (`high`), not 4K. Ultra is still one tap away in the Quality control; picking it un-lights the card.
- **Dark:** the director note reaches the Prompt Agent (`templateNote`) but has no effect until Gemini is funded; until then only the look shapes a film.
- **Images.** Four cards use honest matches from the brand pack, and the presenters use the real preset faces. The other 20 show palette tiles until the capped Higgsfield pack runs (§1.5).

### 3.5 Old shell deletion (done, `6c7961b`)
- **What it removed.** 37 route directories: the old `/chat`, `/agent`, marketplace and online-shop sub-pages, sell, tracking, tools, business, executive, analytics, config, app-preview, voice-smoke, the placeholders (about, blog, careers, contact), the old `/studio/*` and `/dashboard/*` sub-pages, the duplicate standalone `3d`/`dubbing`/`montage`/`slides` pages, `account/business`, `account/returns`, `avatar/[id]` and the two locale-less stubs. Then the 41 modules only those pages used (the old top bar and bottom nav, the support bubble, MyAvatarChatV2, the business and executive dashboards, the Vapi call UI, …).
- **Redirects.** `next.config.js` sends every old URL to its nearest surface with a temporary (307) redirect: `/ka/chat` → `/ka`, `/ka/dubbing` → `/ka/dashboard?tool=dubbing`, `/ka/contact` → `/ka/support`, `/ka/studio/history` → `/ka/library`, the blog and about pages → `/ka/landing`, and so on. `/avatar/:id` is deliberately not redirected, because it would also catch `/avatar/enroll`.
- **What stays, in the studio's own shell** (`components/studio/StudioPageShell.tsx`): pricing, settings, support, the services hub, and account billing, invoices, payments and delete.
- **How dead code was chosen.** Only files the deletion orphaned, found by diffing the import graph from every Next entry point before and after. 13 such modules are still imported by older dead code and were kept; the ~315 files that were already unreachable are a separate cleanup.

### 3.6 Sign-in (2026-10-01, the owner's requests)
- **No sign-in page.** `/{lang}/login`, `/signup`, `/auth` and their locale-less forms redirect to `/{lang}/dashboard?auth=login|signup`, keeping `redirect`, `error`, `plan` and `ref`. The studio opens its sign-in sheet; a signed-in visitor goes straight on to `redirect` (`lib/routing/signIn.ts`).
- **One line.** The sheet asks for an email (or an email or phone number once Phone is on, §1.7) and sends a 6-digit code. The same code signs an existing account in or creates a new one: `/api/auth/email-otp/send` purpose `continue`, which answers the same either way so it reveals nothing about who is registered. Password sign-in and reset stay one small link away.
- **Support chat.** The admin inbox's replies reach users again: the chat thread lives on `/{lang}/support` (it was the deleted floating bubble), and the settings drawer's „დახმარება" opens it.

### 3.7 Hotfixes (2026-10-01, "Super App" directive, Phase 1)
- **Pricing cards.** Text no longer leaves the card at any width. The grid reads its OWN width (CSS container queries), not the window's: inside the studio shell the sidebar takes ~220 px, and at a 1024-px window the old rule packed four cards into 154-px columns. Now: 1 column, 2×2 from a 540-px container, 4 across from 1040 px. Every text run wraps; the price row wraps instead of pushing „/თვე" out; the button is one 52-px line. The hard-coded cyan is gone — the cards, the credit packages and `/account/billing` use the rocket-blue tokens. `tests/pricing-layout.spec.ts` measures every TEXT run against its card at 375/1024/1440 px in all three languages (proven to fail on the old cards).
- **Starter credits only for proven accounts** (live migrations `20261001c–e`). The 50-credit bonus, the free film and the 3 free avatar chats are granted when the email or phone is confirmed (Google sign-ups arrive confirmed and get them at once). Found while testing it: a PHONE sign-up crashed the profile trigger (no email → NOT NULL), and an address held by an orphaned profile (18 exist) aborted its sign-up — both fixed.
- **Code-email limits.** At most 5 codes per address per 15 minutes, whatever IP asks (on top of the per-IP limits); the sheet says how long to wait. No daily cap: anyone can spend an address's budget, so a day-long cap would let one IP lock a person out.
- **Old sign-up endpoint.** The retired two-field purpose answers the same 410 for every address — it no longer reveals who is registered.
- **Forgot password** now ends on a „new password" step in the sign-in sheet (the reset mail signs the person in through `/auth/callback`, then `?auth=recover` asks for the new password). An expired or used link says so.
- **Locale.** `/login`, `/signup`, `/auth` without a language keep the visitor's language (NEXT_LOCALE), and a failed Google sign-in returns in the language it started from.
- **Profile bootstrap.** The OAuth / reset callback fills a missing name or photo but never overwrites one the person set.

### 3.8 Super-App plan, Wave 1: leaks and shipped bugs (2026-10-01)
The plan for Phases 2–4 is `docs/SUPER_APP_PLAN.md`. Wave 1 closed what the mapping found already broken in production:
- **Avatar renders are paid before they run.** Lip-sync and the HeyGen presenter now require sign-in, reserve the price at POST (a ledger error refuses with 503 — it used to let the render through free) and refund a failed render. The signed charge token rides inside the job id the eight call sites already poll. The Film Studio's dead whole-master lip-sync toggle (it never polled, so it would have charged for nothing) is gone; a guard test fails if any caller starts a lip-sync job without polling it.
- **3D models cost 5 credits** (owner decision), reserved before the provider and refunded when Replicate reports a failure; a delivered model is never re-downloaded on every poll; the panel prefill, thumbnail and an expired-GLB crash are fixed.
- **Voice:** training needs a signed-in user (no demo fallback); cloning is rate-limited, audio-only, ≤ 10 MB; deleting a clone deletes it at ElevenLabs — only voices tagged with the caller's own id.
- **Biometrics:** Live Avatar voice samples go to the new private `twins` bucket, which every generic signer refuses. `scripts/avatar/migrate-live-avatar-voice.mjs` lists the old public samples; moving them (`--yes`) is the owner's call.
- **Client `style` text** is capped at 80 characters and stripped of invisible/bidi characters before it reaches an image, film or music prompt.
- **The stale-render refund exploit** (live): the drainer refunds `processing` job rows carrying a reservation, and users could write those rows. Owner insert/update RLS on `generation_jobs` is dropped and the progress route can no longer forge or revive billing state (`20261001f`).
- **Also:** music re-rolls keep their length, tempo and singer; the thumbnail runner writes nested takes, projects dry-run totals and no longer deploys its manifest publicly (`/brand/v1/manifest.json` now 404s); Live's „show code" says „saved in the canvas" only when the canvas confirms.

### 3.9 Super-App plan, Round 2 (2026-10-01)
- **Template cards shape the result** (owner decision). Each video, image and music card adds a short style context that the SERVER resolves from the card's id — never text from the browser — and the card says what it adds („Adds: A clean studio backdrop and soft light"). Only a card the user actually PICKED counts, and only while the panel still matches it; a panel that merely happens to equal a card adds nothing. Product / Poster / Wallpaper default to 2K, not 4K.
- **Photo culling** (new „ფოტოების შერჩევა" tool): drop JPEG/PNG/WebP photos; blur, blown highlights/shadows and burst duplicates are flagged in a worker on the device (nothing is uploaded), P/X/U keys work on Georgian and Russian layouts too, one-click grading, and picks export as a ZIP. Client galleries and server storage are not built (they need the storage decision).
- **Long-form video API** (dark): create / status / cancel routes, the director's 240 s deadline, Library filing — all 404 until `LONGFORM_VIDEO_ENABLED` and the migration `20261001b` is applied.
- **Template thumbnails**: the runner now drives Replicate (FLUX schnell, ~$0.24 for all 20) or Imagen 4 (~$3.04) as well as Higgsfield, under the $5 cap. A real run on 2026-10-01 bought nothing: Replicate and the Gemini prepay both answered 402 (no credit). Fund one, then `npm run art:templates -- --provider replicate --yes-spend` and `node scripts/templates/build-thumbs.mjs`.

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
