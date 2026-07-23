# STAGE 1 — MASTER BLUEPRINT (myavatar.ge commercial-launch sweep)

**Produced:** 2026-07-10 · **Author:** Fable 5 (Lead AI Systems Architect / QC)
**Consumer:** Stage 2 executor (Opus 4.8 Ultracode) — every step below is written to be executed blindly.
**Method:** Direct codebase audit, every claim cited as `file:line`. Where the Stage-1 directive's
assumptions contradict the repo, the mismatch is recorded — Stage 2 must NOT invent fixes for code
that does not exist.

**Marketing promise being protected:** "All global AI giants orchestrating natively in Georgian, at a
fraction of the cost, with zero friction."

---

## 0. GLOBAL GROUND RULES FOR STAGE 2

1. **THE product surface** is the chatbot at `app/[locale]/dashboard` → `components/studio/ChatChrome.tsx`
   (813 lines, shell) + `components/studio/OmniStudio.tsx` (6,388 lines, composer + all 5 modes).
   `app/pricing/*` and `/services/[slug]` are DEAD surfaces. Never build features there.
2. **Billing balance-of-record** is `profiles.credits_balance` mutated ONLY via the `deduct_credits`
   RPC (idempotent, rejects overdraw — proven live). The app uses `deduct_credits`, never `debit_credits`.
   Idempotency refs are per-transaction (e.g. `remix:productad:<jobId>`). Never change an existing ref format.
3. **Load-bearing quirks that MUST survive** (regression guards, repeated per-vector below):
   - `app/globals.css:379-383` — the `.overflow-x-auto / .overflow-x-scroll → touch-action: pan-x pan-y`
     descendant exception. Removing it freezes every horizontal carousel.
   - `lib/chat/spokenText.ts` 20k/4k hard input caps (O(N²) paren-strip guard).
   - `next.config.js` `outputFileTracingIncludes` for ffmpeg-static (silent ENOENT in the lambda otherwise).
   - SW cache-name stamping gated on `VERCEL_GIT_COMMIT_SHA` (commit 498be24).
   - Text-chat path stays byte-unchanged when touching voice (Day-5 constraint).
4. **Run the full gauntlet (Vector 9) after every vector lands.** 1,092 jest cases across 116 files today
   (`grep -rE "^\s*(it|test)\(" -c` over lib/components/app); Playwright is installed (`@playwright/test@^1.58.2`)
   with 9 specs in `tests/`. The directive's "1116+ tests" ≈ reality (1,092 unit + e2e specs) — keep 100% green.

### Execution order (dependency- and risk-sorted)

| # | Vector | Why this position |
|---|--------|--------------------|
| 1 | V3 Pricing data + dead-code purge | Smallest, mostly already done; unblocks A4 visual pass |
| 2 | A1 Profile photo + A2 Rocket brand | Small isolated ChatChrome edits; get quick wins in |
| 3 | V2 Mobile hardening | CSS-only; establishes the stable shell every later UI change sits on |
| 4 | V8a Model lock-in + tint + ducking | Server-side; changes what every render produces — land before e2e baselines |
| 5 | V4 Billing coverage verification | Read-mostly audit + tests; depends on V8 model names being final |
| 6 | V6 Bridge start-image threading | Client + server contract touches kling `start_image` (aligned with V8) |
| 7 | A3 Director's Panel consolidation | Big OmniStudio refactor; do before V7 so product panel patterns match |
| 8 | V7 Product-ad context pin | Snapshot tests + persistence |
| 9 | V5 Progress streaming | UI + orchestrator events; benefits from A3's cleaned panel layout |
| 10 | V1 Voice (fix + Gemini-style surface) | Largest new surface; sits on the stabilized shell |
| 11 | A4 Pricing minimalist redesign | Pure visual, after V3 data is final |
| 12 | V8b 2× upscale layer | Flag-gated, riskiest for lambda budget — land last, default OFF |
| 13 | V9 Validation gauntlet | Continuous, with the full run as the final deployment gate |

### Shared-file edit map (conflict avoidance)

| File | Touched by | Constraint |
|------|-----------|------------|
| `components/studio/OmniStudio.tsx` | V1, V5, V6, V7, A3 | One vector at a time; run `npm run typecheck` between each; never touch the send() text-chat branch |
| `components/studio/ChatChrome.tsx` | V1, A1, A2 | Voice launcher block (796-808), header (602-639) are disjoint — keep edits scoped |
| `components/PricingSection.tsx` | V3 then A4 | V3 confirms data binding first; A4 restyles only |
| `lib/orchestrator/ffmpeg-assembly.ts` | V8a, V8b | Ducking edit lands before upscale insertion |
| `app/globals.css` | V2, A4 | Append-only; never edit the 340-383 lock block except as specified |

---

## VECTOR 1 — VOICE SYSTEM REPAIR + GEMINI-STYLE REAL-TIME SURFACE

### Ground truth (what actually exists)

Two independent voice systems exist today:

1. **Composer dictation (INSIDE OmniStudio)** — already sophisticated:
   - `toggleMic` at `components/studio/OmniStudio.tsx:4053` tries live Web Speech first
     (`continuous + interimResults`, 8s watchdog, `OmniStudio.tsx:4069-4108`), streaming
     `base + final + interim` into the composer via `setInput` (`:4102`).
   - Falls back to record-and-transcribe (`startRecorderFallback`, `:3999-4051`): MediaRecorder with
     platform-correct container detection (`:4004-4012`), chunks every 2.5s (`rec.start(2500)`, `:4046`),
     progressive transcription of the accumulated blob → `setInput(base + text)` (`:4031`), final full pass
     on stop (`:4043`). It labels the upload with the **matching extension** (`clip.${extFor(type)}`, `:4027`)
     — the comment at `:3996-3998` says explicitly: *"iOS records mp4, NOT webm — a wrong extension makes
     Whisper reject the audio (a real cause of 'the mic does nothing on mobile')."*
   - `send()` discards in-flight transcription via `sttDiscardRef` (`:3346-3351`, `:4019`, `:4092`).
2. **VoiceConversation overlay (Day-5, v375)** — `components/voice/VoiceConversation.tsx` (181 lines),
   launched from a floating authed-only mic button in `ChatChrome.tsx:798-808`. Self-contained
   tap-to-talk loop: MediaRecorder → `/api/voice/transcribe` → `/api/voice/chat` → `/api/elevenlabs/tts`.
   **By design it never writes into the composer** (comment `ChatChrome.tsx:796-797`).
3. **A realtime substrate already exists**: `lib/voice-v2v/` (`providers.ts` with
   `transcribeRealtimePcmChunk`, `geminiStt.ts`, `replicateStt.ts`, `session.ts`, `vad.ts`) plus
   `public/worklets/` and e2e specs `tests/voice-v2v-smoke.spec.ts`, `tests/voice.spec.ts`.
4. STT route `app/api/voice/transcribe/route.ts`: provider chain OpenAI-Whisper/Deepgram →
   Gemini (`hasGeminiSttKey`) → Replicate Whisper; 25MB cap; rate-limit `RATE_LIMITS.READ`
   = 100 req/min (`lib/api/rate-limit.ts:109`) — the 2.5s chunk cadence cannot trip it.

### Broken flows (root causes)

| # | Symptom | Root cause | Evidence | Severity |
|---|---------|-----------|----------|----------|
| 1.1 | Voice overlay mic "does nothing" on iOS | `VoiceConversation.tsx:61` hardcodes the upload filename `speech.webm` while `pickMime()` (`:26-30`) legitimately selects `audio/mp4` on iOS Safari → mislabeled container → Whisper rejects → `said=''` → silent `setStatus('idle')` (`:67`). **This is the exact bug the composer path already fixed** (`OmniStudio.tsx:3996-3998`). | VoiceConversation.tsx:61 vs OmniStudio.tsx:4027 | HIGH |
| 1.2 | Composer dictation can silently produce nothing when no STT provider key is live | `/api/voice/transcribe` fails through 3 providers; if OPENAI/DEEPGRAM/GEMINI keys are absent in prod, everything rides on `REPLICATE_API_TOKEN`. Dev probe (2026-06-21) showed only Replicate live. No client-side surfacing of a provider-down state — the composer just never fills. | app/api/voice/transcribe/route.ts:54-62; memory: provider-key-state | MEDIUM |
| 1.3 | No continuous conversation mode | Overlay is strictly tap-to-talk, one turn at a time (`onMicTap`, `:135-139`); after TTS ends it returns to `idle` and waits for another tap. | VoiceConversation.tsx:97,135 | MEDIUM (feature gap, not regression) |
| 1.4 | Anonymous users see no voice entry point at all | Launcher is gated `authed && !voiceOpen` (`ChatChrome.tsx:798`). Acceptable product choice — record as intentional, do not change without a product decision. | ChatChrome.tsx:798 | LOW |

### Claim mismatches (directive vs repo)

- "Clicking the user microphone button fails to capture, stream, or append translated text into the
  active chat composer" — **the composer dictation path exists and is engineered correctly** (live +
  fallback + streaming append). The reproducible break is in the **overlay** (1.1) and, environmentally,
  in prod STT key coverage (1.2). Stage 2 must fix those two, not rewrite the working dictation.

### Fix plan (ordered, blind-executable)

1. **[V1-F1] Fix the overlay container mislabel.** `components/voice/VoiceConversation.tsx`:
   capture the chosen mime in state/ref at `startRecording` (`:115-116`); in `runTurn` replace
   `fd.append('audio', audio, 'speech.webm')` (`:61`) with an extension derived from the blob type —
   reuse the exact `extFor` mapping from `OmniStudio.tsx:4012` (`mp4→mp4, aac→m4a, mpeg→mp3, else webm`).
   Also pass the blob's real `type` when constructing it in `rec.onstop` (already done, `:120`).
2. **[V1-F2] Surface STT-provider failure honestly.** In the transcribe route's final fallthrough,
   return `{ text: '', provider: 'none', degraded: true }`; in BOTH clients (overlay `:64-67`,
   composer `:4030-4031`) treat `degraded:true` as an error state with the existing retry copy
   (overlay `t.micDenied`/`t.retry`; composer: brief toast) instead of silently idling.
3. **[V1-F3] Add `/api/voice/health`** (nodejs, admin-optional GET): reports which STT/TTS providers
   have keys present (booleans only, no secret values — mirror the alias-report pattern of
   `lib/chat/videoProvider.ts:44-70`). Stage 2's validation (V9) and ops use this to prove prod key coverage.
4. **[V1-F4] Gemini-style continuous mode (additive, inside the existing overlay).**
   Extend `VoiceConversation.tsx` — do NOT create a parallel surface, do NOT touch text chat:
   - Add a `conversationMode: boolean` toggle (default ON) rendered as a small pill in the overlay header.
   - **Auto re-listen:** in `el.onended` (`:97`) and the `catch`-free idle transitions, when
     `conversationMode && aliveRef.current`, call `startRecording()` after ~250ms instead of setting `idle`.
   - **Turn end-pointing (VAD):** import the existing `lib/voice-v2v/vad.ts`; run a WebAudio
     AnalyserNode RMS loop on `streamRef.current`; after ≥600ms of speech followed by ~900ms of
     silence, call `stopRecording()` automatically. Keep tap-to-stop as the manual override.
   - **Barge-in:** while `status==='speaking'`, a mic-orb tap pauses `audioRef.current`, cancels the
     playback (`el.pause(); el.currentTime=0`), and immediately `startRecording()`.
   - **iOS audio unlock:** create/resume a single `AudioContext` inside the first user tap
     (`onMicTap`) before any playback — required for autoplaying the reply audio in WKWebView.
   - **Latency:** keep the current chunked POST loop (proven); a WebSocket/streaming rewrite on
     `lib/voice-v2v/session.ts` is a fast-follow, NOT Stage 2 — the session-limit risk is too high
     before launch.
   - History cap stays at 12 turns (`:69,81`); replies flow through `/api/voice/chat` which already
     rate-limits and sanitizes via `sanitizeSpokenText` — **do not raise its 20k/4k caps**.
5. **[V1-F5] Keep `tests/voice-v2v-smoke.spec.ts` green and extend `tests/voice.spec.ts`** with:
   overlay opens from launcher; mock `getUserMedia` + stub `/api/voice/transcribe` → transcript renders;
   `degraded:true` → error state renders; conversationMode auto-re-listen fires (fake timers).

### Regression guards
- Text chat send path byte-unchanged (`OmniStudio` send()); launcher stays authed-gated; TTS stability
  stays locked at 0.48 (the route owns voice settings — the component must never send them,
  `VoiceConversation.tsx:8-9`); `sanitizeSpokenText` caps untouched.

---

## VECTOR 2 — MOBILE IMMOBILIZATION + UI HARDENING

### Ground truth

The immobilization system **already exists in layered form** in `app/globals.css`:
- Root lock: `max-width:100vw; overflow-x:hidden` (`:183-184`), `overscroll-behavior:none; overflow-x:hidden`
  (`:242-243`), `min-height:100dvh` with `@supports` fallback (`:167-169, 267, 282`).
- `.ag-fixed-shell` "fixed bounding box" (`:343-351`): `max-width:100vw; overflow-x:hidden;
  overscroll-behavior:none;` + `touch-action:pan-y` on touch.
- Touch-scoped global lock (`:365-372`): `max-width:100vw; overflow-x:hidden; overscroll-behavior:none;
  touch-action:pan-y` — media-queried to touch-width viewports so desktop pinch/zoom survives.
- **The carousel exception** (`:376-383`): descendants with `.overflow-x-auto/.overflow-x-scroll` get
  `touch-action: pan-x pan-y` — a descendant's own touch-action governs gestures starting on it.
- `100dvh` remaps for `.h-screen/.min-h-screen` (`:3867-3869`), `.um-modal/.cc-drawer` width caps (`:3878`).
- `AppShell.tsx:144` applies `ag-fixed-shell` — but AppShell wraps the MARKETING shell
  (TopNavbar/BottomNavigation from `components/shell/ModernShell`), not the dashboard. The dashboard
  (ChatChrome) relies on the touch-scoped global rules at `:365-383`.

### Broken flows / gaps

| # | Issue | Evidence | Severity |
|---|-------|----------|----------|
| 2.1 | `--app-screen-width: 100vw` (`globals.css:149`) — on mobile Chrome `100vw` includes the scrollbar gutter in some webviews → 1-2px horizontal drift on elements sized by the var. | globals.css:149 | MEDIUM |
| 2.2 | ChatChrome (the product surface) does not carry `.ag-fixed-shell` on its own root — it depends on the global touch-media rules; a future refactor of those rules silently unlocks the product surface. | AppShell.tsx:144 is the only `ag-fixed-shell` use | MEDIUM |
| 2.3 | iOS keyboard viewport jump: composer uses fixed positioning; no `interactive-widget=resizes-content` / visualViewport handling was found in the audit scope. | layout viewport export (verify in app/layout.tsx during execution) | MEDIUM |
| 2.4 | "Ghost elements": no `#hub` remnants or rolled-back-hero remnants surfaced in grep; the historical "blue ghost" overlay (`ag-silver-neon-overlay::after` z-index) was fixed by raising shells to `z-[2]` (commit f25789e). Treat as VERIFY-ONLY, not rebuild. | memory: blue-ghost-overlay, library-back-navigation | LOW |

### Claim mismatch
- "Plan the absolute elimination of layout drift…lock viewport metrics" — the locks the directive
  demands (`overflow-x:hidden`, `overscroll-behavior:none`, `touch-action:pan-y`) **are already
  implemented** at `:365-372`. Stage 2's job is hardening + proof, not introduction.

### Fix plan
1. **[V2-F1]** Change `--app-screen-width` (`globals.css:149`) to `100%` (and verify no consumer needs
   viewport units; grep `var(--app-screen-width)` and adjust each consumer to `100%`-based sizing).
2. **[V2-F2]** Add `ag-fixed-shell` to ChatChrome's root wrapper div (the outermost div returned by
   `ChatChrome`) so the product surface carries its own lock independent of the global media block.
3. **[V2-F3]** In the locale layout's viewport export add `interactiveWidget: 'resizes-content'`
   (Next.js `Viewport` type) so the iOS keyboard resizes the layout instead of panning the canvas.
4. **[V2-F4]** DOM-hygiene verification (not blind deletion): run the app, assert
   `document.documentElement.scrollWidth === clientWidth` at 360/390/414px widths; if any offender
   is found, fix that element's width (never widen the lock).
5. **[V2-F5]** Encode all of the above as the Playwright mobile spec in V9 (no-horizontal-scroll +
   carousel-still-pans + keyboard-open composer visibility).

### Regression guards
- **NEVER remove `globals.css:376-383`** (carousel exception) — carousels freeze.
- Don't `!important` a global background (breaks theming — the blue-ghost lesson).
- The `input:not()` global rule wins specificity battles — use `!` (important) Tailwind prefix for
  input color/bg overrides, never bare utilities.

---

## VECTOR 3 — LIVE PRICING RECONCILIATION

### Ground truth — **this vector is ~90% already shipped**

- SSoT `PRICING_TIERS` (`lib/billing/pricingConfig.ts:168-171`):
  `starter 38 GEL {videos:2, music:10, images:20}` · `pro_creator 299 {10,50,100}` ·
  `studio_annual 899 annual {40,250,500}` — **exactly the directive's numbers.**
- Live page `app/[locale]/pricing/page.tsx` renders `components/PricingSection.tsx`, which imports
  `PRICING_TIERS` directly (`PricingSection.tsx:6`) and derives the feature rows from
  `tier.creditCeiling` (`:77-82`) — *"the display can never drift from the grant"* (`:11-15`).
  CTA routes to signup while Stripe Price IDs are unset (`:14-15, :143-144`) — i.e. **already decoupled
  from deployment env vars**; no code path renders empty/env-dependent numbers.
- `components/studio/CreditsModal.tsx:20,40`: `PACKAGES = PRICING_TIERS` (Day-6 / commit 8c02d02).
- **Per-item tetri labels are already purged**: repo-wide grep for `თეთრი` finds only a hair-color
  label and an art-style suggestion (`lib/i18n/LanguageContext.tsx:199,302`); grep for `ღირს` finds
  nothing pricing-related; `CreditsModal.tsx:39,230` confirms *"the per-item 'tetri' cost guide is removed"*.
- `components/dashboard/PricingGrid.tsx` = admin-only FounderVerificationGate mount, renders nothing public.
- DEAD: `app/pricing/*` + `components/pricing/PricingPageClient.tsx` (legacy `canonicalPricing` $9/$29/$89).

### Claim mismatches
- "Purge sub-text grids showing per-item tetri costs" — **already done** (8c02d02). Nothing to purge in
  reachable DOM. The only surviving "თეთრი" strings are unrelated (hair color / b&w portrait).
- "Decouple from unset deployment variables" — already the case (display never reads Stripe env).

### Fix plan (what actually remains)
1. **[V3-F1] Delete the dead pricing surface** to prevent future drift-confusion:
   remove `app/pricing/` (page + `PricingPageClient.tsx` there), `components/pricing/PricingPageClient.tsx`,
   and — ONLY IF `grep -rn "canonicalPricing"` shows no remaining importer — `lib/pricing/canonicalPricing.ts`.
   Run typecheck + full jest; some tests may pin these files (fix by deleting the paired tests).
2. **[V3-F2]** Add a jest pin: render `PricingSection` and assert the six quota strings (2/10/20 ·
   10/50/100 · 40/250/500) and the three prices (38/299/899) appear; assert `/თეთრი/` does NOT appear.
3. **[V3-F3]** Reconcile the annual label: Studio Annual renders `899₾ /yr` (`PricingSection.tsx:76`) —
   confirm with product that "/yr" is the intended display (SSoT says `billing:'annual'`); no code change
   unless product says monthly.
4. Visual redesign is **Addendum A4** (below) — do not restyle here.

### Regression guards
- `stripePriceIdForTier` lookup (`pricingConfig.ts:193`) must keep compiling — deleting canonicalPricing
  must not touch `pricingConfig.ts`. CreditsModal top-up flow (`/api/billing/wallet-topup`) untouched.

---

## VECTOR 4 — TRANSACTIONAL CREDIT DEDUCTION COVERAGE

### Ground truth

Verified-live billing architecture (2026-07-10 ground-truth audit): `deduct_credits` RPC decrements
`profiles.credits_balance`, idempotent, rejects overdraw. Coverage as found in code:

| Path | Entry | Debit mechanism | Status |
|------|-------|-----------------|--------|
| Image (SYNC chat) | OmniStudio chat image | `lib/chat/chatBilling.ts` (Vector-2 leak FIXED, commit 388eb20) | ✅ |
| Image/Music/Voice/Avatar/Interior/root (queued) | 6 × `/api/orchestrator/*/produce` | Reserve-before-render Saga: debit up-front + refund-on-failure in `finally` (`lib/orchestrator/produceBilling.ts`, `saga.ts`; commit a080de6) | ✅ |
| Film (chat) | film pipeline | `lib/chat/filmBalanceGate.ts` + chatBilling; free-film counter `consumeFreeFilm` | ✅ |
| Video remix (7 ops) | `/api/video/remix` | per-txn ref `remix:${op}:${jobId}` (commit 2d9d766) | ✅ |
| Product ad | `/api/video/remix` op `productad` | primary clip charged, ref `remix:productad:<jobId>`; retries dedupe, new ad charges (`OmniStudio.tsx:2407-2411` comment) | ✅ |
| `notifyCredit(...)` client calls | e.g. `OmniStudio.tsx:2457-2460` | **display/toast only — NOT a debit** (`lib/credits/pricing.ts` layer) | by design |

### Broken flows / open items

| # | Issue | Evidence | Severity |
|---|-------|----------|----------|
| 4.1 | `/api/video/assemble` (film master assembly, also product-ad enrichment leg `OmniStudio.tsx:2432-2447`) — debit not confirmed in this audit. If assemble is separately billable, a leak; if bundled into the clip charges, fine — must be PROVEN, not assumed. | OmniStudio.tsx:2432 | HIGH (verify) |
| 4.2 | `restore_free_avatar_chat` RPC missing in live DB → free-counter refund fail-opens (known follow-up from a080de6). | memory: produce-billing-saga | MEDIUM |
| 4.3 | Multi-clip product ads charge only the primary clip by deliberate design (`OmniStudio.tsx:2408-2410`) — if pricing intends per-clip billing, this under-charges 30/60s ads. Product decision, not a bug. | OmniStudio.tsx:2405-2411 | MEDIUM (decide) |

### Claim mismatches
- "the 100 GEL virtual test wallet" — **no such thing exists**; the wallet is the real
  `profiles.credits_balance` (the historical "pinned at 100" display bug is FIXED and proven live).
- "trigger a native deduction immediately upon asset generation" — the architecture is deliberately
  **reserve-BEFORE-render + refund-on-failure** (strictly stronger). Do not convert to post-generation
  debits; that reintroduces the race the Saga killed.

### Fix plan
1. **[V4-F1] Assemble-leg audit:** read `app/api/video/assemble/route.ts`; if it runs paid work
   (ElevenLabs music/TTS + lambda ffmpeg) with NO debit and is invocable directly, add a Saga debit
   with ref `assemble:<jobId>` (cost from `lib/credits/pricing.ts`) OR document that its cost is
   bundled into the initiating op's charge and gate it to internal calls (require the initiating
   op's jobId). Choose the option matching lib/credits/pricing.ts's cost model.
2. **[V4-F2] Ship the missing RPC:** add `supabase/migrations/<ts>_restore_free_avatar_chat.sql`
   creating the RPC (mirror `consumeFreeFilm`'s inverse); keep the app-side fail-open until applied.
   ⚠️ All DDL channels to prod were dead at last probe — deliver the SQL as paste-ready, do NOT
   attempt to self-apply to prod.
3. **[V4-F3] Balance-delta e2e proof (feeds V9):** for each of the 5 areas, the Playwright loop asserts
   `/api/credits/balance` decreases by the `lib/credits/pricing.ts` amount after a generation and is
   restored after a forced provider failure (stub) — this converts "no leaks" from claim to gate.
4. **[V4-F4]** Decide + document 4.3 (per-clip vs per-ad pricing) in `lib/credits/pricing.ts` comments.

### Regression guards
- Never change existing idempotency ref formats (breaks dedupe against the live ledger).
- Keep refunds in `finally` blocks; keep `idemRef` client-generated where it already is.

---

## VECTOR 5 — AGENT PIPELINE PROGRESS STREAMING

### Ground truth

- **The real roster is 9 agents, not 25**: `lib/chat/filmAgentRoster.ts:2-12` — *"the 9-agent
  'Director's Console' view-model … unified 9-agent roster"*, rendered by
  `components/studio/FilmDirectorConsole.tsx`, fed by `FilmStudioProgress` snapshots
  (`filmAgentRoster.ts:58-60`, `overallFilmPct` `:188`). Server side there are additional
  pipeline agents (`lib/orchestrator/agents/`, `lib/pipeline/agents/` incl. `nano-banana-agent`),
  but the user-facing model is the 9-agent console.
- Progress infrastructure already shipped (agency sprint, all landed): Cap-3 durable queue with
  per-job bubbles + tray positions (`store/useJobQueue`, `OmniStudio.tsx:1821-1837`), durable
  `generation_jobs` hydration + polling so renders survive reload (`useDurableProgress`, `:1824-1826`),
  eased progress bar that never fakes 100% (`:235-297`), per-scene frame-load progress (`:1156`),
  scenes-ready percentage (`:2041`), stall detection with honest "provider slow" notes (`:2058`,
  product `StallDetector` `:2464-2470`), busy events `myavatar:busy` (`ChatChrome.tsx:138`).
- SSE transport exists: `app/api/pipeline/stream/route.ts` + `lib/orchestrator/sse-hub.ts`.
- **The gap the directive senses is real but narrow**: `OmniStudio.tsx:210-235` — *"Staged process
  labels for the live progress card. The engines don't emit a real …"* → outside the film flow
  (which has the 9-agent console) the stage labels are timer-eased simulations, not engine events.

### Claim mismatches
- "Agent G and the 25 sub-agents" — no 25-agent roster exists anywhere; the console is 9 agents.
- "restore the loading bars" — they were never removed; they're simulated for non-film modes.

### Fix plan
1. **[V5-F1] Film:** ensure `FilmDirectorConsole` renders inside the film job bubble (verify the
   mount in OmniStudio's film bubble renderer; if it's behind a click, surface a compact inline
   variant with the 3 currently-active agents + `overallFilmPct`).
2. **[V5-F2] Real stages for queued modes:** the queue jobs already call `onProgress({stage})`
   (`OmniStudio.tsx:2413`) and write `trackJobUpdate(jobId, stage, pct)` to durable rows — replace
   the timer-simulated labels (`:210-235`) with these real stage strings whenever present; keep the
   eased bar ONLY as the between-stages animation.
3. **[V5-F3] Server truth for long renders:** for produce-route renders, forward orchestrator
   `pipeline-stages` events through `/api/pipeline/stream` (SSE already built) into the bubble's
   stage line — subscribe per jobId in `useDurableProgress` when a job passes 20s wall-clock.
4. **[V5-F4] Busy/queued messaging:** the known live defect ("silent concurrency serialization" —
   spinning button, no message) — assert every submit while ≥3 jobs run yields the queued-position
   bubble (`positions` from useJobQueue) instead of silence; fix any composer path that still gates
   on the legacy single-flight message (`OmniStudio.tsx:61`).
5. **[V5-F5]** Jest: stage-label reducer tests (real stage overrides simulation; simulation resumes
   between stages); Playwright: submit 4 image jobs → 4th shows position `#4` immediately.

### Regression guards
- Never fake 100% before the asset lands (`:297` invariant). Don't add a second transport —
  reuse sse-hub + durable rows. Per-job isolation (`:1908-1941`) must survive.

---

## VECTOR 6 — IMAGE→VIDEO CROSSLINK BRIDGE

### Ground truth

The bridge is **fully wired for chat-feed image cards**:
- Every generated image card renders TWO triggers — an always-visible corner 🎬 badge and a hover/touch
  pill — both calling `sendImageToVideo(m.imageUrl!)` (`OmniStudio.tsx:4330-4343`).
- `hooks/useServiceBridge.ts:21-26`: `sendImageToVideo` writes `bridge.setTransitCharacter(imageUrl)`
  (zustand module singleton, `store/useStudioBridge.ts`) then `router.push('/{locale}/dashboard?service=video&from=image')`.
- OmniStudio's consumer effect (`OmniStudio.tsx:1838-1851`, deps `[transitCharacterUrl, transitAudioUrl]`
  at `:1868`): sets `mode='video'`, opens options, `setVideoCharacterRefs([url])`, clears store, toasts,
  and flash-highlights `#character-ref-zone`.

### Broken flows / gaps

| # | Issue | Evidence | Severity |
|---|-------|----------|----------|
| 6.1 | The handoff seeds the image ONLY as a **character reference** (`setVideoCharacterRefs`, `:1842`) — it does not seed an i2v **start_image** nor auto-initiate an Image-to-Video task. The directive's expectation ("initiate an Image-to-Video task seamlessly") lands one step short: the user still has to compose + send. | OmniStudio.tsx:1842 | MEDIUM |
| 6.2 | The zustand store is non-persisted (`store/useStudioBridge.ts:30-38`) — a hard reload between click and consume drops the payload. In-SPA nav is safe; a full navigation (e.g. from a future non-SPA surface) is not. | useStudioBridge.ts | LOW |
| 6.3 | Coverage: the Library grid (`StudioLibraryGrid`) image cards — presence of the same 🎬 trigger not confirmed in this audit; if absent, that is likely the exact "dead icon" surface the report refers to. | ChatChrome.tsx:792-794 mounts StudioLibraryGrid | MEDIUM (verify first) |

### Claim mismatch
- "the dead Video Icon Overlay" — the chat-card trigger is demonstrably wired end-to-end in code.
  Stage 2 must first REPRODUCE deadness per surface (chat card vs library card) before changing the
  chat-card path. Do not redesign the bridge.

### Fix plan
1. **[V6-F1]** Extend the bridge payload: `setTransitCharacter(url, { asStartFrame?: boolean, prompt?: string })`
   (add optional meta to `StudioBridgeStore`); the image card's 🎬 handler passes the generating
   prompt (`m.promptText` if present on the message) so the video composer inherits context.
2. **[V6-F2]** In the consumer effect (`:1838`), additionally seed the i2v start frame: set the state
   the film/i2v request reads for `start_image` (the same field the Cinema panel uses —
   `ServiceManager.buildI2vInput` shapes `start_image`/`first_frame_image` per model family,
   `lib/chat/ServiceManager.ts:401-404`), and pre-fill the composer input with a locale-appropriate
   "animate this image" starter so ONE tap on send launches i2v.
3. **[V6-F3]** Audit `StudioLibraryGrid` — if its image cards lack the 🎬 action, add the identical
   corner-badge trigger calling `sendImageToVideo(item.url)` (the hook already handles routing from
   any route to the dashboard).
4. **[V6-F4]** Playwright: generate (stubbed) image → click 🎬 → assert mode=video, options open,
   `#character-ref-zone` populated, composer pre-filled; and the same from `/library`.

### Regression guards
- Music→MusicVideo leg (`:1852-1864`) untouched; effect must keep clearing the store (no re-fire loops);
  `eslint-disable exhaustive-deps` at `:1867` is deliberate — keep deps `[transitCharacterUrl, transitAudioUrl]`.

---

## VECTOR 7 — PRODUCT AD CONTEXT LOCK-IN

### Ground truth

The brand-context pipeline is **snapshot-hardened end to end**:
- Fields: `productBrand/Price/Hook/Cta(+Custom)/Voiceover`, images, preset, duration, aspect
  (`OmniStudio.tsx:1526-1532`, form at `:5415-5424+`, brand input `maxLength={40}`).
- On submit everything is **snapshotted into closure consts** (comment *"all snapshotted"*, `:2361-2375`):
  `overlayText` (`:2364`), `marketing` (`:2365-2368`), `voiceoverScript` via
  `generateVoiceoverScript({brandName, productPrice, productHook, ctaText, locale})` (`:2369`,
  `lib/ai/productAdAgent.ts`).
- Clips render via `/api/video/remix` op `productad` (jobId-scoped idempotent charge, `:2405-2411`);
  the finished clips go to `/api/video/assemble` **with `marketing` and `voiceoverScript` included**
  (`:2432-2444`) — including the 6s single-clip path when brand context exists (`:2450-2457`).
- Per-clip AbortController + 45s ceiling + StallDetector; each job reports into its own bubble.

### Broken flows / gaps

| # | Issue | Evidence | Severity |
|---|-------|----------|----------|
| 7.1 | Form state is component-state only — a reload (or any OmniStudio remount) wipes a filled-but-unsent form. This is the most plausible source of the "context wiping" report. | :1526-1532 | MEDIUM |
| 7.2 | `maxLength={40}` on brand (`:5423`) silently truncates long Georgian brand names mid-word. | :5423 | LOW |
| 7.3 | Server-side: the remix route's zod schema stripping unknown keys would silently drop future fields — must be pinned by a payload↔prompt snapshot test so any drop becomes a red test, not a silent wipe. | route not fully read in this audit | MEDIUM (pin) |

### Fix plan
1. **[V7-F1]** Persist the product panel draft to `sessionStorage` (`myavatar:product-draft`,
   JSON of the 8 fields, write-through on change, hydrate on mount, clear on successful submit).
2. **[V7-F2]** Raise brand `maxLength` to 60 and add a live character counter under the field.
3. **[V7-F3]** Pin tests: (a) jest — `generateVoiceoverScript` includes brand+price+CTA verbatim for
   ka/en/ru; (b) jest — the assemble body built from a filled form contains `marketing.overlayText`,
   price and CTA (extract the body-builder into a pure helper `buildProductAssembleBody()` in
   `lib/ai/productAdAgent.ts` so it's testable); (c) route test — POST `/api/video/assemble` with
   marketing → schema does NOT strip it.
4. **[V7-F4]** UX guard: submit with empty images stays blocked with the existing friendly toast
   (`:1398` pattern) — verify, don't rebuild.

### Regression guards
- The idempotency ref `remix:productad:<jobId>` and only-primary-clip charging are deliberate
  (V4.3 decides the pricing question) — do not "fix" silently. Per-clip timeout/abort chain
  (`:2415-2427`) must survive.

---

## VECTOR 8 — ENGINE LOCK-IN, TINT, 2× UPSCALE, DUCKING

### Ground truth — model routing today

| Call site | Default model | Env override |
|-----------|--------------|--------------|
| `lib/chat/ServiceManager.ts:66` (chat i2v `VIDEO_I2V_MODEL`) | `kwaivgi/kling-v2.1` ✅ | `REPLICATE_VIDEO_MODEL` |
| `lib/chat/ServiceManager.ts:404` (Cinema panel explicit "kling" toggle) | `kwaivgi/kling-v1.6-standard` ⚠️ | — (hardcoded) |
| `lib/video/remixOps.ts:459` (remix/product `I2V_MODEL`) | `kwaivgi/kling-v1.6-standard` ⚠️ | `REPLICATE_VIDEO_MODEL` |
| `lib/queue/renderProviders.ts:105` (async queue) | `kwaivgi/kling-v1.6-standard` ⚠️ | `REPLICATE_VIDEO_MODEL` |
| `lib/pipeline/statusAgent.ts:71` (status/cost display) | `kwaivgi/kling-v1.6-standard` ⚠️ | `REPLICATE_VIDEO_MODEL` |
| `lib/ai/klingClient.ts:21-22` (native cascade, INERT w/o keys) | `kwaivgi/kling-v2.1-master` | `KLING_MODEL` |
| `lib/video/videoProviderCascade.ts:239` (cascade, INERT) | `kwaivgi/kling-v2.1-master` | `KLING_MODEL`/`REPLICATE_VIDEO_MODEL` |

Images: `lib/replicate/models.ts` — `image` service default `flux` (=`black-forest-labs/flux-schnell`,
`:29-31`), `premium/ultra → flux-pro` (=`black-forest-labs/flux-1.1-pro`, `:34-36`); `avatar` service
default `sdxl` (`:94-97`); film scene frames come from the **Nano Banana** agent
(`lib/pipeline/agents/nano-banana-agent.ts` via `lib/pipeline/phases/phase2-assets.ts:7`;
cost `lib/pipeline/cost.ts:42` ≈ $0.003/image). Provider order: LTX if key present, else Replicate
(`lib/chat/videoProvider.ts:102-103`) — LTX key is absent in prod ⇒ Replicate is the live primary.

**Tint suspects (ranked):** (1) `lib/orchestrator/cinematic-lut.ts` — the `warm_golden` LUT ("warm
amber") is auto-picked from the film brief ("golden-hour → warm amber", `:6-8`), and even the default
`cinematic` look warms highlights (+0.05 R / −0.04 B, `:33-40`); (2) the legacy
`colorbalance + eq + vignette` chain the LUT replaced (`:4-5`) if any path still applies it;
(3) kling-v1.6-standard's own warmer rendition vs v2.1.

**Ducking:** the voice-keyed sidechain **already fires by default** — `vocal_ducking_pct` defaults to
30 (`lib/orchestrator/ffmpeg-assembly.ts:199`); music/SFX duck under the voice lane via
`buildFilterComplex`'s sidechain (`:224-226`); music-video path sidechain-ducks SFX under the song
(`:370`). The **−12 dB depth** (`DEFAULT_DUCK_DB`) currently resolves only under
`FILM_AUDIO_MIX_ENABLED` (default OFF, `:217-233`); the multi-voice spatial premix additionally
requires `manifest.dialogueStems`, which is INERT (`generateDialogueStems` has zero callers, `:93-94, 239-262`).

### Claim mismatches
- "verify kwaivgi/kling-v2.1 and FLUX 1.1 Pro are hard-locked as primary" — **neither is fully true**:
  three live defaults still point at kling-v1.6-standard, and FLUX 1.1 Pro is only the premium/ultra
  image variant (default is flux-schnell; film frames are Nano Banana, avatar is SDXL).
- "-12dB ducking fires flawlessly on script assembly" — ducking fires (30%), but the −12 dB contract
  is flag-gated OFF; the "multi-voice −12dB premix" specifically is inert by design (Day-4/5 state).

### Fix plan
1. **[V8-F1] Single lock module.** Create `lib/video/modelLock.ts`:
   `export const VIDEO_PRIMARY = process.env.REPLICATE_VIDEO_MODEL || 'kwaivgi/kling-v2.1'`
   `export const VIDEO_LAST_RESORT = 'kwaivgi/kling-v1.6-standard'` (deliberate cheap fallback)
   `export const IMAGE_PRIMARY = 'flux-pro'` (registry key). Replace the four v1.6 defaults
   (`ServiceManager.ts:404`, `remixOps.ts:459`, `renderProviders.ts:105`, `statusAgent.ts:71`) with
   `VIDEO_PRIMARY`. Keep the cascade's `-master` default (it's inert + higher-grade by design).
2. **[V8-F2] Image tiering (cost-aware lock).** In `lib/replicate/models.ts` `image` route: set
   `defaultModel:'flux-pro'` and keep `fast:'flux'` as the explicit cheap tier. ⚠️ Cost impact:
   flux-1.1-pro ≈ $0.04/img vs schnell ≈ $0.003 — update `lib/credits/pricing.ts` image cost and the
   V4 balance-delta expectations in the same commit. Do NOT touch the film-frame Nano Banana path
   (it is character-lock load-bearing) or the avatar SDXL/instant-id identity path.
3. **[V8-F3] Tint neutralization.** In `cinematic-lut.ts`: gate `warm_golden` behind an explicit
   brief keyword match only (never a default heuristic); reduce the default `cinematic` highlight
   warm push (+0.05→+0.02 R, −0.04→−0.02 B); grep for any surviving `colorbalance`/`eq=` legacy
   grade application in `ffmpeg-assembly.ts`/`ffmpeg-filtergraph.ts` and delete the legacy branch if
   the LUT path is always available. Add a jest LUT snapshot asserting neutral grey (0.5,0.5,0.5)
   maps within ±0.02 per channel for the default look.
4. **[V8-F4] Ducking contract.** In `ffmpeg-assembly.ts:217-233`: make `effectiveDuckDb` default to
   `DEFAULT_DUCK_DB` (−12) whenever a voice lane exists, WITHOUT requiring `FILM_AUDIO_MIX_ENABLED`
   (keep the flag for the mute-window/mixer-compiler extras). Do NOT wire `dialogueStems`/multi-voice
   (stays inert — Day-5 deferral stands; enabling it is a separate risk decision).
5. **[V8-F5] 2× upscale layer (flag `UPSCALE_2X_ENABLED`, default OFF).** RECOMMENDED approach —
   two cheap passes, no per-frame Replicate video upscale (cost/latency prohibitive):
   (a) **keyframes:** run `real-esrgan` (already registered, `models.ts` photo route) on each scene
   start_image BEFORE i2v so Kling receives 2× detail;
   (b) **master:** in `ffmpeg-assembly.ts`, after concat/grade, append
   `scale=iw*2:ih*2:flags=lanczos,unsharp=5:5:0.6:5:5:0.0` (1080→2160 wide). ⚠️ Lambda budget: the
   60s master already flirts with the 600s ceiling — the flag stays OFF for 60s renders
   (`duration<=30` gate) until the async worker (lib/queue) fronts assembly. Document cost delta in
   `lib/credits/pricing.ts`.
6. **[V8-F6]** Proof: render a stubbed assemble in CI asserting the filtergraph string contains the
   duck stage and (flag on) the scale stage — extend `ffmpeg-filtergraph.test.ts`.

### Regression guards
- `outputFileTracingIncludes` must keep covering every route that touches ffmpeg-static.
- Kling i2v ignores `aspect_ratio` with `start_image` — post-fit via `fitAspect` stays.
- Never break the fail-open provider chain: primary → LTX/legacy fallback remains reachable on
  provider 5xx (lock-in ≠ removing failover; it means the failover is v1.6, not zeroscope-era relics).
- `lib/replicate/models.ts` `video` service (`zeroscope`/`stable-video`) belongs to the DEAD
  /services surface — do not "upgrade" it; mark with a `@deprecated dead-surface` comment only.

---

## VECTOR 9 — AUTOMATED PRODUCTION VALIDATION GAUNTLET

### Ground truth
- `package.json`: `test` (jest), `typecheck` (tsc --noEmit), `lint`, `build`, plus
  `test:e2e` / `test:e2e:ui` / `test:e2e:preview` / `test:e2e:voice-smoke` (`:13-26`).
- Playwright `@playwright/test@^1.58.2` installed; specs already present:
  `tests/{smoke,smoke-live,preview-e2e,dashboard-contracts,dashboard-deep-flows,film-studio-nav,voice,voice-v2v-smoke,swarm-pipelines}.spec.ts`.
- 1,092 unit test cases / 116 files. Vercel branch previews run the chatbot **anonymously with real
  prod keys** — live-testable without merging. `/api/video/assemble` is directly re-testable.

### The non-negotiable Stage-2 gauntlet (run after EVERY vector, full pass before deploy)

**Gate 0 — static:** `npm run typecheck` ✅ · `npm run lint` ✅ · `npm test` 1,092+/1,092+ green ·
`npm run build` succeeds with SW cache-stamp intact (assert `sw.js` cache name contains the SHA when
`VERCEL_GIT_COMMIT_SHA` is set, unchanged locally — commit 498be24 behavior).

**Gate 1 — headless functional loops** (new file per area under `tests/launch/`, run against
`next dev` locally + the Vercel preview URL via `PLAYWRIGHT_BASE_URL`):

| Area | Drive | Assert |
|------|-------|--------|
| Image | composer mode=image, prompt, send (provider stubbed locally / real on preview) | asset `<img>` renders; URL fetch 200 + `content-type: image/*`; balance delta = pricing.ts image cost; zero console errors |
| Video | mode=video, 6s single-clip path | `<video>` src 200 + `video/mp4`; nonzero duration via `loadedmetadata`; balance delta; stage labels appeared (V5) |
| Music | mode=music, short brief | audio URL 200 + `audio/*`; nonzero duration; balance delta |
| Avatar | mode=avatar (lipsync) with fixture photo+audio | output video 200; balance delta; per-job bubble isolated |
| Product Ads | fill brand/price/CTA + fixture photo, 6s | final video 200; **overlay text present** (assemble body snapshot via route interception); voiceover leg fired; balance delta |

**Gate 2 — mobile immobilization (V2):** 390×844 viewport: `documentElement.scrollWidth === clientWidth`
on dashboard + pricing; horizontal carousel still pans (dispatch touch sequence on a `.overflow-x-auto`
element and assert scrollLeft changed); keyboard-open composer stays visible.

**Gate 3 — pricing DOM (V3/A4):** `/ka/pricing` shows exactly 38 ₾ / 299 ₾ / 899 ₾ and the
2/10/20 · 10/50/100 · 40/250/500 rows; `page.content()` contains ZERO `თეთრი` in a pricing context;
CTA hrefs → `/{locale}/signup?plan=<tier>`.

**Gate 4 — voice smoke (V1):** mock `getUserMedia`, stub `/api/voice/transcribe` → composer receives
text; overlay conversation-mode auto-relisten fires; `degraded:true` renders the retry state.
Keep `test:e2e:voice-smoke` green.

**Honesty constraints (cannot be truthfully automated cheaply):**
- Real paid Kling/ElevenLabs renders per CI run — proxy: provider-stubbed local runs + ONE manual
  live-preview run per area on the Vercel preview (anon + real keys) before the production promote.
- Subjective visual quality (tint, upscale sharpness) — proxy: LUT unit snapshot (V8-F3) + a
  side-by-side frame-grab artifact uploaded by the preview run for human sign-off.
- True device behavior (iOS mic/keyboard) — proxy: WebKit Playwright project + one manual pass on a
  physical iPhone for V1/V2 before launch.

---

# ADDENDUM VECTORS (mobile regression sweep)

## A1 — PROFILE PHOTO REFUSAL + AVATAR DOM BLEEDING

### Ground truth
- Upload path is complete and correct: `uploadAvatar` (`ChatChrome.tsx:404-427`) — optimistic dataURL
  preview → POST `/api/profile/avatar` → server uploads via SERVICE ROLE to public `avatars` bucket at
  unique path `{userId}/avatar-<ts>.<ext>`, writes `profiles.avatar_url` **with `?v=<ts>` cache-bust**,
  returns `{url}` (`app/api/profile/avatar/route.ts:36-46`). Re-auth clobber guards exist
  (`avatarUploadingRef`/`lastAvatarUserIdRef`, `ChatChrome.tsx:167-170, 203-220`).
- Render: `<img src={avatarUrl} alt="avatar" class="h-full w-full object-cover">` inside an
  `overflow-hidden rounded-full h-11 w-11` button (`ChatChrome.tsx:625-632`, again `:762-764`).

### Root causes
| # | Symptom | Root cause |
|---|---------|-----------|
| A1.1 | Circle shows clipped text like "**.vatar**" | When the stored URL 404s/fails (bucket missing, storage policy, offline), the broken `<img>` renders its **alt text "avatar"**, clipped by the `overflow-hidden rounded-full` container → the literal ".vatar" artifact. `ChatChrome.tsx:630,764`. |
| A1.2 | "Change photo" doesn't stick | `catch {}` at `:425` swallows upload failures — the optimistic preview shows until reload, then the OLD/NULL DB row wins. Most likely prod cause: the `avatars` storage bucket does not exist or isn't public (route then 500s at `:38-39`). No user-facing error is ever shown. |

### Fix plan
1. **[A1-F1]** `ChatChrome.tsx:630,764`: change to `alt=""` (decorative; button already has
   aria-label) AND add `onError={() => setAvatarUrl(null)}` so a dead URL falls back to the initial
   letter — the bleed becomes structurally impossible.
2. **[A1-F2]** In `uploadAvatar`: on `!res.ok` or fetch throw, revert `setAvatarUrl` to the previous
   value (capture before optimistic set) and show the existing toast pattern with a friendly
   ka/en/ru "photo upload failed" message. Keep the optimistic preview only for the success path.
3. **[A1-F3]** Paste-ready SQL (do NOT self-apply): create the `avatars` bucket public policy if
   missing —
   `insert into storage.buckets (id, name, public) values ('avatars','avatars', true) on conflict (id) do update set public = true;`
4. **[A1-F4]** Playwright: stub the route → success path swaps to server URL; failure path reverts
   and toasts; kill the image request → initial renders, never text.

## A2 — BRAND ROCKET LOGO IN THE APP HEADER

### Ground truth
- The product header's left side: functional hamburger (`Menu`, opens sidebar drawer,
  `ChatChrome.tsx:602-605`) + plain-text wordmark `My<span accent>Avatar</span>` (`:606-608`,
  mobile-only via `md:hidden`). No brand mark. `public/rocket.svg` and `public/logo.png` exist;
  the marketing `GlobalNavbar.tsx:76-78` already uses `/logo.png`.

### Fix plan
1. **[A2-F1]** In `ChatChrome.tsx:606-608`: prepend the rocket mark inside the wordmark span —
   `<img src="/rocket.svg" alt="" className="h-[18px] w-[18px] shrink-0" />` in a flex row with the
   existing text, shown wherever the wordmark shows (keep `md:hidden` behavior; also show next to
   `title` on md+ at `:609`). **Do not replace the hamburger** — it is a functional menu affordance;
   the brand mark sits between hamburger and wordmark.
2. **[A2-F2]** Preload nothing; rocket.svg is tiny. Assert in the V9 pricing/dashboard spec that
   `img[src="/rocket.svg"]` is visible at 390px.

## A3 — CONSOLIDATED "DIRECTOR'S PANEL" (script channels)

### Ground truth — the duplicate channels are real
- **Channel 1:** "Script / scenario" dashed upload box (`OmniStudio.tsx:5020-5040`) → `videoScriptDoc
  {name, text}` (`:1572`; .txt/.pdf/.docx via client extract + `/api/utils/extract-text`) → consumed as
  `videoScript = videoScriptDoc?.text || extractScriptText(attachments)` (`:3425`) → the
  scene-splitting path (`splitStructuredScript`, deterministic; memory 289a3a3). Also gates
  send-readiness (`:3247`, `:4131`).
- **Channel 2:** "Master script (advanced)" textarea (`:5245-5255`, `videoMasterScript`) → sent as
  `masterScript` key only when non-musicvideo (`:2029`, `:2573`) → `parseMasterScript` → timecoded
  scenes + per-speaker casting (the Day-6 multi-voice path).
- The two states never sync; a user filling both sends BOTH keys with undefined precedence downstream.

### Fix plan (unify WITHOUT killing either parser)
1. **[A3-F1]** Build ONE "🎬 Director's Panel" card replacing both blocks (`:5020-5041` upload box and
   `:5245-5255` master block): a single card with (a) an upload dropzone row and (b) a "paste script"
   textarea, writing to ONE state `directorScript: {source:'upload'|'paste', name?, text}`.
   Uploading fills the textarea (read-only preview, editable on tap) — upload and paste are two inputs
   to the SAME text.
2. **[A3-F2]** Single payload key: send `script: directorScript.text` always, and additionally
   `masterScript: directorScript.text` **only when** the text matches the timecode signature
   (`/^\s*SCENE\s+\d+|\[\d{2}:\d{2}\]/m` — the shapes shown in the placeholder `:5253`). Server routing
   then stays: timecoded → `parseMasterScript` multi-voice path; plain → `splitStructuredScript`.
   This preserves both engines while the USER sees one surface.
3. **[A3-F3]** Migrate consumers: `:2029`, `:2573`, `:3425`, `:3247`, `:4131`,
   send-deps `:3646` — replace `videoScriptDoc`/`videoMasterScript` reads with `directorScript`.
   Keep `data-testid="master-script-input"` on the textarea (a Playwright spec keys on it).
4. **[A3-F4]** Jest: timecode detector (positive/negative cases incl. Georgian text); payload builder
   emits `script` always, `masterScript` iff timecoded. Playwright: upload path and paste path both
   reach the same request body (route interception).

### Regression guards
- The multi-voice premix stays gated exactly as V8-F4 leaves it. Music-video mode never sends
  `masterScript` (preserve the `videoMode !== 'musicvideo'` guard, `:2029`).

## A4 — ULTRA-MINIMALIST PRICING REDESIGN

### Design directive (applies to `components/PricingSection.tsx` ONLY, after V3-F1/F2)
1. **Strip visual weight:** remove the animated glow-border layer (`:93-99`), the floating
   "Most Popular" bounce animation (`:108-115` — keep a static badge), the per-card gradient icon
   tiles (`:117-119`), and the background blur decoration (`:44-46`). Replace `backdrop-blur-xl`
   cards with flat `var(--card-bg)` + a single `1px var(--color-border)` border; popular card gets
   `border-app-accent/40` only.
2. **Mobile-first rhythm:** cards stack with `gap-3`, internal padding `p-5`; price line
   `text-3xl` (from 4xl); feature rows `text-[13px]` with plain `Check` icons (drop the gradient
   check chips `:135-137`). Section padding `py-16` (from py-28), heading `text-3xl md:text-4xl`.
3. **Tactile CTA:** full-width button, `min-h-[48px]`, `active:scale-[0.98] transition-transform`,
   popular = solid accent, others = `bg-app-elevated ring-1 ring-app-border/20`; remove hover-only
   glow shadows (touch has no hover).
4. **Motion budget:** keep ONE `whileInView` fade per card (`:87-90`), delete all other framer-motion
   props. Respect `prefers-reduced-motion` (framer honors it via the existing config — verify).
5. Data mapping (`PRICING_TIERS` → rows) is untouched; the V3-F2 jest pin must stay green after the
   restyle; Gate 3 (V9) asserts the numbers still render.

---

## LAUNCH-BLOCKING GAPS OUTSIDE THE 13 VECTORS (completeness sweep)

| Gap | Severity | Disposition |
|-----|----------|-------------|
| Local commits a83fad1/77bf887 (reachable "Avatar G"→"MyAvatar" fix + control-char strip) were NOT pushed at last audit — verify `git log origin/main..main` and push before any Stage-2 work stacks on them | BLOCKER | Stage 2, step 0 |
| `agent_evolution_traces` table missing live → admin financials show API-cost=0 / overstated margin (paste-ready CREATE TABLE exists in VERIFICATION_REPORT.md; never self-create on prod) | HIGH | Stage 2 deliverable = SQL paste pack (with V4-F2, A1-F3) |
| `STRIPE_WEBHOOK_SECRET` + webhook endpoint registration — checkout works but credits can't land without it | HIGH | Pre-launch ops checklist |
| BOG/iPay gateway inert until BOG env + migration (native GEL rail is part of the cost story) | MEDIUM | Fast-follow |
| Georgian-native promise: EL Music sings ka when literal ka lyrics are in the brief (verified); `georgian-song` cloned-voice TTS is the correct-words fallback — keep both paths intact through V8 changes | GUARD | Continuous |
| Signup auto-confirm route (`/api/auth/register`) skips email verification BY DESIGN (mailer dead) — zero-friction claim holds, but document it | LOW | Note only |

---

## DEFINITION OF DONE (Stage 2 exit criteria)

1. All 13 vectors' fix steps landed, each behind its listed guards, in the execution order above.
2. Gauntlet Gates 0–4 fully green locally AND on a Vercel preview; one manual live run per area on
   the preview URL (anon + real keys) with saved proof artifacts (URLs + balance deltas + screenshots).
3. Zero changes to: idempotency ref formats, the carousel touch-action exception, spokenText caps,
   ffmpeg tracing includes, SW stamp gating, text-chat send path, film-frame Nano Banana path.
4. The paste-ready SQL pack (avatars bucket, restore_free_avatar_chat, agent_evolution_traces)
   delivered as a single reviewed file — applied by a human, never by the agent.
5. `MASTER_BLUEPRINT_STAGE1.md` updated in-place with a ✅/❌ status column per fix ID before the
   final deploy commit.
