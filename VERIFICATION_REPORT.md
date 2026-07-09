# MyAvatar.ge — Ground-Truth Verification Report

**Audit date:** 2026-07-10 · **HEAD at report time:** `77bf887` (branch `main`)
**Method:** verify by observation only. Every ✅ below was *run and observed*. Claims that could not be exercised in this environment are marked ⚪ UNVERIFIABLE, not upgraded to PASS. Unit tests here mock all external services (ElevenLabs / Stripe / Kling / Supjson) — a green unit test is labeled "unit-tested (mocked)" and is **not** treated as end-to-end proof.

**Status taxonomy:** ✅ VERIFIED · 🔴 BROKEN→FIXED · 🔴 BROKEN→BLOCKED · 🟡 INERT (CORRECT, gated) · ⚪ UNVERIFIABLE

---

## Phase 0 — Ground-truth baseline

| # | Check | Observed reality |
|---|---|---|
| 0.1 | **Test suite** | `npm test` (= `jest --passWithNoTests`) → **114 suites / 1106 tests, 0 fail, 0 skip** at the pre-audit HEAD; **1107** after the audit added 1 hardening test. Runtime ~1.3s ⇒ pure/mocked unit tests (logic, not live integrations). The "1106" claim was **accurate**. No failing/skipped tests to list. |
| 0.2 | **Git** | HEAD `43d6365` (pre-audit) → `77bf887` (post-audit). Branch `main`. **No `v375` git tag exists** — "v375" is only the service-worker `CACHE_NAME` string in `public/sw.js`, never a tag/release. |
| 0.3 | **Deploy framework** | ⚪ **UNVERIFIABLE via tooling** — Vercel MCP returned **403 Forbidden** (token lacks scope on team `kintsurashviligaga-ops`). BUT behaviorally proven a **real dynamic Next.js app, not the historical static stub**: live `https://myavatar.ge` executes server-side route handlers — `/api/admin/financials`→`401 {"error":"Admin access required"}`, `/api/voice/chat`→`401 {"error":"unauthorized"}`, `/ka/dashboard`→`200` locale HTML. `.vercel/project.json` records `framework: "nextjs"`, `nodeVersion 20.x`. **GG: confirm build duration + framework in the Vercel dashboard** (a ~4s/null build would be the red flag; the live dynamic behavior argues strongly against it). |
| 0.4 | **DB schema** (live, service-role, project `zwksnayknzggdcenqqxy`) | Present: `profiles` (incl. `credits_balance`, `avatar_url`, `tier`, `free_films_remaining`, `free_avatar_chats_remaining`), `wallet_topups`, `credit_ledger`, `credit_transactions`, `notifications`, `analytics_events`, `agent_execution_feedback`, `prompt_optimization_proposals`, `agent_configs`. **Missing: `agent_evolution_traces`** (the D3 cost-ledger source — see D3). RPCs confirmed working live: `deduct_credits`, `refund_credits` (see D5). Note: `MIGRATIONS_TO_APPLY.sql` at repo root is the *agent-optimization* migration (feedback/proposals/configs — already applied), **not** the billing schema the task brief described; the billing columns already exist live. |
| 0.5 | **LIVE vs INERT inventory** | See table at end of Phase 1. |

> ⚠️ **The task brief's file paths were wrong.** `lib/film/filmPipeline.ts` and `lib/film/ffmpeg-assembly.ts` **do not exist**. The real code is `lib/chat/spokenText.ts` (sanitizer), `lib/orchestrator/ffmpeg-assembly.ts` + `lib/chat/dialogueCasting.ts` (multi-voice), `lib/video/videoProviderCascade.ts` (cascade). All findings below are against the **real** files.

---

## Phase 1 — The 7 claimed deliverables

### D1 — Narration sanitizer — ✅ VERIFIED (+ hardened)
`sanitizeSpokenText` / `sanitizeNarration` in `lib/chat/spokenText.ts`.
- **Observed:** compiled the real function and ran it on adversarial input — `[00:03]`, a Georgian `*stage direction*`, `NARRATOR:` label, a fenced ```code``` block, control chars, and clean Georgian `დღეს მზიანი ამინდია.` Annotations/timecodes/code all stripped; **clean Georgian passed byte-for-byte** (`Buffer.compare(out, clean) === 0`). Unit suites: `jest lib/chat/spokenText` → **10/10 pass** (was 9, +1 audit test).
- **0.48 invariant:** intact — `lib/audio/tts-model.ts:79` still returns `stability: 0.48` for `eleven_multilingual_v2`; `spokenText.ts` imports nothing and sets no voice settings.
- **Audit hardening applied (`77bf887`):** the sanitizer previously let C0 control chars (NUL/BEL/ESC) reach TTS. Added a `/[\x00-\x08\x0B\x0C\x0E-\x1F]/` strip (keeps `\t`). Cannot touch Georgian (UTF-8 Georgian bytes are all ≥ 0x80). New test asserts Georgian byte-for-byte survives while the ESC byte is removed.

### D2 — Brand unification — 🔴 BROKEN → FIXED
- **Root cause:** live-reachable "Avatar G" wordmarks remained on user-visible surfaces. (Note: `app/pricing/*` is **dead code** — middleware redirects `/pricing`→`/{locale}/pricing` — so those occurrences were *not* the visible ones and are flagged for optional cleanup, not counted.)
- **Fixed (`a83fad1`):** public **share page** metadata (`app/share/[token]/page.tsx` — title/og:title/description/og:siteName), **invoice PDF** (`lib/invoice/pdf.ts` h1 + footer), **invoice seller** fallback (`app/api/invoices/create/route.ts:208`), **pricing feature bullet** (`lib/pricing/canonicalPricing.ts` en+ka, rendered live by `PricingSection` in all 3 locales), and the localized `metadata.title` + ka pricing kicker across `messages/{en,ka,ru}.json`.
- **Re-verified:** grep of the reachable surfaces shows no remaining visible "Avatar G"; all 3 locale JSON valid; full suite green.
- **Left (correct):** `myavatar.ge` domain/config, code comments, and the "**Agent G**" assistant *persona* (not the wordmark).

### D3 — Admin financials endpoint — ✅ gate VERIFIED · 🔴 data source BROKEN → BLOCKED
- **Gate:** ✅ live prod returns `401 {"error":"Admin access required"}` unauthed. `lib/admin/guard.ts` trusts the **email allowlist ∪ `app_metadata` role — never `user_metadata`** (confirmed `guard.ts:13-16`).
- **Data source is REAL, not mocked:** `route.ts:44-52` aggregates `wallet_topups.amount_gel` (revenue) and `agent_evolution_traces.{cost_wholesale_gel,cost_retail_gel,worker_kind,status}` (API cost), both windowed by `created_at`; `computeFinancials` applies the 2.5% bank fee. Not hardcoded.
- **🔴 The gap:** `agent_evolution_traces` **does not exist in the live DB**. The route fails open (`degraded.push('agent_evolution_traces')`) → **API cost aggregates to 0 and Net Margin is overstated** on prod. The writer exists and is wired (`lib/observability/agentTrace.ts:75` insert via `withTrace`, best-effort try/catch) but also silently no-ops against the missing table. → **BLOCKED on GG**: provision the table (I did **not** create it — the target is the shared/prod Supabase; creating tables there is outside the safe-to-apply and manual-only scope). Paste-ready schema in the handoff section.

### D4 — Avatar persistence — ✅ VERIFIED (code path; not live-upload-tested)
`app/api/profile/avatar/route.ts` + `components/studio/ChatChrome.tsx`. All four legs present & read in full:
1. **Storage write** → `svc.storage.from('avatars').upload(...)`, auth-gated, 5MB + mime allowlist (`route.ts:34-37`).
2. **DB write** → `svc.from('profiles').update({ avatar_url: url }).eq('id', user.id)` (`route.ts:44`).
3. **Cache-bust** → `url = ${publicUrl}?v=${Date.now()}` stored *and* returned (`route.ts:35,42-43`).
4. **DB read on load/re-auth** → `ChatChrome.tsx:207-212` selects `avatar_url` on mount + `onAuthStateChange`, with correct race guards (`!error && !avatarUploadingRef.current`).
- **Honesty:** the `profiles.avatar_url` column exists live (observed), but I did **not** perform a live upload (would mutate Storage), so the round-trip is proven in code, **not at runtime**.

### D5 — Pricing / credits — ✅ VERIFIED BY LIVE DATABASE OBSERVATION (the critical one)
The historical bug (balance pinned at 100, generations never debiting) is **not present.** Real debit path = `lib/orchestrator/ledger.ts` → `deduct_credits(p_user_id, p_amount, p_ref)` / `refund_credits(...)`.
- **Observed** (ephemeral synthetic user `audit-probe-…@myavatar-audit.invalid`, created + **hard-deleted** afterward, only ever touched that one row):
  - baseline `credits_balance = 100`
  - `deduct_credits(30)` → row **decremented to 70** (real DB read-back, not the RPC's return value)
  - same `p_ref` again → **still 70** ⇒ **idempotent**, no double-charge
  - `deduct_credits(99999)` → **`insufficient_credits`**, balance unchanged (never negative) ⇒ rejects overdraw
  - `refund_credits(30)` → back to **100** ⇒ refund/rollback path works
- **Pricing SSoT:** `lib/billing/pricingConfig.ts:168-171` = **Starter 38 / Pro Creator 299 / Studio Annual 899 GEL**; ceilings `{videos,music,images}` → `creditsIncluded` **140 / 700 / 3250** (`tierCreditPool`, unit-tested `pricingTiers.test.ts`). Matches the claimed numbers. **GG: confirm the ceiling/price *intent* is final before flipping payments live.**
- **Note:** I did not burn any paid provider credits — the DB write was isolated from any provider call.

### D6 — Video fallback cascade — ✅ VERIFIED / 🟡 INERT (CORRECT)
`lib/video/videoProviderCascade.ts`.
- **Order confirmed:** `kling-native [PRIMARY] → luma [2nd] → ltx [3rd] → replicate-kling [FINAL, the verified prod path]` — exactly Kling→Luma→LTX→Replicate.
- **Gates:** `isConfigured` reads `KLING_ACCESS_KEY`+`KLING_SECRET_KEY` (kling), `LUMA_API_KEY` (luma), LTX key (ltx); `shouldUseNativeCascade` (`:351`) trips only when a native tier is configured. **All native keys are ABSENT in this env** ⇒ the native cascade is inert and the existing Replicate path runs, byte-identical. `jest videoProviderCascade` → **14/14 pass**, incl. the test asserting Replicate/LTX alone do **not** trip the native gate.
- **Invariants:** async **submit+poll preserved** (`submitVideoWithFallback` submits + returns an opaque task id, never blocks; `pollVideoProvider` polls separately) — no long blocking call that risks 504.
- **Note:** the failover *fall-through order* is verified by the unit suite + code reading; a real primary-provider outage was not simulated against live endpoints (no native keys). Endpoints are documented in-file; not re-checked against live provider docs.

### D7 — Multi-voice casting + ducking — 🟡 INERT (CORRECT) — wired, **NOT shipped**
`lib/orchestrator/ffmpeg-assembly.ts` + `lib/chat/dialogueCasting.ts` + `lib/orchestrator/dialogueCastPlan.ts`.
- **Consumer wired:** `ffmpeg-assembly.ts:245` premixes when `dialogueStems.length >= 2` — casts each speaker (`castRoster`) to a distinct voice seed + stereo pan and applies the `DIALOGUE_DUCK_DB = -12` duck (`dialogueCastPlan.ts:25`). `jest dialogueCasting ffmpeg-assembly filmVoiceover` → **22/22 pass**.
- **🟡 Emitter is dead:** `generateDialogueStems` (`filmVoiceover.ts:442`) has **ZERO callers** repo-wide (grep confirmed). The live path (`filmComposite.ts`) uses `generateDialogueVoiceover` = a single mixed track. So `dialogueStems` is never populated in prod → the premix branch **never executes**. Single-voice is the effective behavior.
- **0.48:** the cast path passes only voice-id/gender; `synthesizeVoiceover` merges `voiceSettingsForModel` untouched → 0.48 preserved.
- **Verdict:** correctly gated/inert, but **must not be reported as a shipped feature.** Activates only when a caller wires `generateDialogueStems` output into the assemble body (the deferred composite→client forwarding).

---

## LIVE vs INERT inventory (each mapped to its activator)

| Feature | State | Activator (exact gate) |
|---|---|---|
| Text chat / omni assistant | **LIVE** | always on |
| Credit debit/refund ledger | **LIVE** (verified D5) | `deduct_credits`/`refund_credits` RPCs (present) |
| Admin financials | **LIVE, admin-gated** | email allowlist ∪ `app_metadata` role; cost half degraded until `agent_evolution_traces` exists |
| Avatar upload/persistence | **LIVE** (code-verified) | `avatars` bucket + `profiles.avatar_url` |
| Voice interaction node | **LIVE-if-keyed** | `ELEVENLABS_API_KEY` (tts) + an LLM key; no dedicated flag |
| Music engine | **LIVE cascade** | EL-Music (`ELEVENLABS_API_KEY`) → MusicGen (`REPLICATE_API_TOKEN`); Udio optional |
| Lip-sync (HeyGen avatar) | **LIVE-if-keyed** | `HEYGEN_API_KEY`; `LIPSYNC_HEYGEN` flag (default true) |
| Film-master lip-sync stage | 🟡 INERT | `FILM_LIPSYNC_ENABLED=1` (default false) |
| Native video cascade (Kling/Luma/LTX) | 🟡 INERT | `KLING_ACCESS_KEY`+`KLING_SECRET_KEY` **or** `LUMA_API_KEY` (absent → Replicate path) |
| Multi-voice dialogue stems | 🟡 INERT (dead emitter) | a caller must wire `generateDialogueStems` → assemble body |
| Payments — Stripe | **LIVE-if-keyed** | `STRIPE_SECRET_KEY` (+`STRIPE_WEBHOOK_SECRET` for credit) — *manual, GG only* |
| Payments — BOG | 🟡 INERT (503 until set) | `BOG_CLIENT_ID`+`BOG_SECRET_KEY` — *manual, GG only* |

---

## Locked invariants — all CONFIRMED INTACT

- **ElevenLabs stability 0.48** — `lib/audio/tts-model.ts:79` unchanged; no audited change touched it.
- **npm** — `package-lock.json` present, no pnpm/yarn lock.
- **6-service menu** — untouched.
- **async submit+poll** — preserved (D6).
- **mapWithConcurrency 4-worker + Cap-3 queue** — not touched by any audited change.
- **SVG/resvg captions · FLUX locked seeds · Upstash** — not touched by any audited change.

---

## Fixes applied this audit

| Commit | Change |
|---|---|
| `a83fad1` | D2 brand — rebrand reachable visible "Avatar G" → "MyAvatar" (share page, invoice PDF/seller, pricing bullet, locale JSON) |
| `77bf887` | D1 hardening — strip C0 control chars before TTS (Georgian byte-for-byte preserved; +1 test) |

Post-fix gate: **tsc clean · jest 1107 green · `next build` clean.** Not yet pushed/deployed — awaiting your review.

---

## 🔴 BLOCKED / handoff — GG action required

1. **Provision `agent_evolution_traces`** (D3) — without it, API cost = 0 and Net Margin is overstated. Paste-ready (verified against the reader `route.ts:49` + writer `agentTrace.ts:75`):
   ```sql
   create table if not exists public.agent_evolution_traces (
     id                 uuid primary key default gen_random_uuid(),
     user_id            uuid references auth.users(id) on delete set null,
     agent_id           text,
     worker_kind        text,
     action             text,
     prompt_summary     text,
     output_summary     text,
     cost_wholesale_gel numeric not null default 0,
     cost_retail_gel    numeric not null default 0,
     latency_ms         integer,
     status             text not null default 'succeeded',
     metadata           jsonb   not null default '{}'::jsonb,
     created_at         timestamptz not null default now()
   );
   alter table public.agent_evolution_traces enable row level security;
   create index if not exists agent_evolution_traces_created_idx on public.agent_evolution_traces (created_at);
   ```
2. **Confirm the Vercel production build** framework/duration in the dashboard (MCP was 403 here).
3. **Payments** — insert live Stripe/BOG/webhook keys yourself (correctly inert until then). Do not ask the agent to.
4. **Confirm pricing intent** — 38/299/899 GEL + ceilings 140/700/3250 before go-live.
5. *(Optional cleanup)* delete the dead `app/pricing/*` + `components/pricing/PricingPageClient.tsx` route and orphaned i18n keys.
6. *(Deferred, correct)* wire `generateDialogueStems` → assemble body to activate multi-voice (D7).

---

## Bottom line — be conservative

### ✅ Safe to claim as DONE (observed)
- Credit **debit/refund ledger** decrements the real DB row, is idempotent, rejects overdraw, and refunds on rollback (**live DB-observed**).
- **PRICING_TIERS** 38/299/899 GEL + 140/700/3250 ceilings are the single source of truth (unit-tested).
- **Narration sanitizer** strips annotations, preserves Georgian byte-for-byte, keeps 0.48, and now strips control chars.
- **Admin financials** is admin-gated (`app_metadata`, never `user_metadata`) with a real (non-mock) revenue source.
- **Avatar persistence** path (storage → `avatar_url` → cache-bust → DB read) is fully present in code.
- **Video cascade** order + gating + async submit/poll are correct; the verified Replicate path runs today.
- The live site is a **real dynamic Next.js deployment**, not a static stub.
- **1107 unit tests green; locked invariants intact.**

### ⚠️ Must be described as in-progress / pending
- **Admin financials API-cost & Net Margin** — degraded/inaccurate until `agent_evolution_traces` is provisioned (cost currently 0).
- **Multi-voice dialogue casting (D7)** — wired + tested but **inert** (dead emitter); does nothing in production yet.
- **Native video cascade (Kling/Luma/LTX)** — inert until native keys are set; today only the Replicate tier runs.
- **Payments (Stripe live / BOG)** — inert pending your key insertion; **not** proven end-to-end.
- **Avatar & voice-node round-trips** — code-verified only; not exercised live (no headless mic / no test upload).
- **Vercel build framework/duration** — unverifiable here (MCP 403); confirm in dashboard.
- **v375** is a service-worker cache label, **not** a git tag/release.

---

# END-TO-END ACTIVATION (2026-07-10, deployed commit `5b08235`)

Follow-up pass: activate everything shippable without external credentials, deploy, and verify on the live site.
Deploy confirmed via `GET https://myavatar.ge/api/health` → `{ commit: "5b08235", ok: true, env_ok: true, status: "healthy" }` — a dynamic route that also proves the deployment runs real Next.js (a `framework:null` static stub cannot execute it).

## (1) NOW LIVE & OBSERVED WORKING on myavatar.ge

Observed against the deployed `5b08235` with a minted, then-deleted ephemeral authed user (service-role; only ever touched that one synthetic row/object):

- **Credit debit — the historical "pinned at 100" bug is GONE.** Live DB: balance `100 → deduct_credits(5) → 95` (real row read-back). Earlier D5 also proved idempotency + overdraw rejection + refund. A real generation reserves-then-debits through this exact RPC.
- **Avatar persistence.** Authed `POST /api/profile/avatar` → **200**, returned URL carries `?v=<ts>` cache-bust, and `profiles.avatar_url` was updated to that URL (read back from DB). Since the client reads `avatar_url` from the DB on load/`onAuthStateChange`, it survives sign-out/sign-in.
- **Admin financials gate.** Live `GET /api/admin/financials` → **401** unauthed **and** for a non-admin authed token (the admin gate resolves admin via the cookie session, so a non-admin Bearer surfaces as no-admin → denied). Access is blocked either way.
- **Admin financials data path.** `agent_evolution_traces` now exists (you ran the SQL); the route-equivalent query already reads **real non-zero API cost** (2 real traces = 1.14₾, `degraded=no`) — Net Margin is no longer overstated.
- **Brand.** Live `/share/*` title and `/en/pricing` HTML contain **no** reachable "Avatar G".
- **Multi-voice casting WIRED end-to-end (`5b08235`).** `generateDialogueStems` → film token → poll → client → `/api/video/assemble` premix. Pure wiring proven by `multiVoiceWiring.test.ts` (7) + adversarial review (single-voice byte-identical). See (3) for what remains manual.

Full pre-flight for the deploy: **tsc clean · jest 1114 green · next build clean.** Locked invariants intact (0.48, npm, Upstash, SVG/resvg, FLUX seeds, 6-service menu, async submit+poll, Cap-3/4-worker).

## (2) READY IN CODE, WAITING ON YOUR CREDENTIALS (do NOT let the agent activate)

### Payments — Stripe (wallet top-up + subscriptions)
Code is ready; activates the instant keys land. Checklist:
1. Set in Vercel (Production env): `STRIPE_SECRET_KEY` (live `sk_live_…`), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_live_…`), and the three subscription price IDs — `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO_CREATOR`, `STRIPE_PRICE_STUDIO_ANNUAL` (SSoT: `lib/billing/pricingConfig.ts:178`; these map to 38 / 299 / 899 GEL).
2. Register the webhook endpoint **`https://myavatar.ge/api/billing/webhook`** (the documented wallet-topup handler; credits via `creditWalletGel`, idempotent on `stripe:<session.id>`). Subscribe events: **`checkout.session.completed`** (and, if you also use the payment-intent handler at `/api/stripe/webhook`, `payment_intent.succeeded` / `payment_intent.payment_failed`). ⚠️ Two webhook routes both credit — register ONE and confirm it matches your checkout metadata (`kind: 'wallet_topup'`).
3. Copy the webhook's signing secret into `STRIPE_WEBHOOK_SECRET` (Vercel). Until this is set the webhook logs "not configured" and no credit lands.
4. Test → live: verify with a Stripe **test** key + `stripe listen`/test event first; confirm `wallet_topups` + `profiles.credits_balance` update; then swap to `sk_live_`/`pk_live_` and the live webhook secret.

### Payments — BOG / iPay (native GEL)
1. Set `BOG_CLIENT_ID`, `BOG_SECRET_KEY`, and `BOG_CALLBACK_PUBLIC_KEY` (RSA public key for webhook-signature verify; `\n`-escaped is handled) in Vercel. Until set, `POST /api/checkout/bog/initiate` returns **503 BOG_UNCONFIGURED** (correct).
2. Register the BOG callback/webhook to **`https://myavatar.ge/api/billing/bog/webhook`** (RSA-verified; credits via `creditWalletGel` on `bog:<shopOrderId>`).
3. Also apply the BOG migration if not yet applied (per `bog-payment-gateway` notes) so the ledger ref path is present.

### Native video providers (cascade tiers above Replicate)
The cascade order is Kling-native → Luma → LTX → **Replicate (verified, serving users now)**. Set any of these to unlock a higher tier; **until then the Replicate path serves correctly — confirmed live**:
- **Kling native:** `KLING_ACCESS_KEY` **and** `KLING_SECRET_KEY` (both required). Optional: `KLING_API_BASE`, `KLING_MODEL_NATIVE`.
- **Luma:** `LUMA_API_KEY`. Optional: `LUMA_API_BASE`, `LUMA_MODEL`.
- **LTX:** the LTX key (`resolveLtxApiKey` — `LTX_VIDEO_API_KEY` / `LTX2_API_KEY`). Optional: `LTX_API_BASE`, `LTX_NATIVE_MODEL`.
`shouldUseNativeCascade` stays false (→ Replicate) until Kling or Luma is configured — proven by 14 passing gate tests + absent-key live behavior.

### Voice interaction node & film multi-voice (need the ElevenLabs key, already on prod)
No action if `ELEVENLABS_API_KEY` is set in Production (it appears to be — the live voice/music paths work). The **multi-voice film render** activates automatically for any Master-Script with ≥2 distinct timecoded speakers.

## (3) UNVERIFIABLE FROM HERE — what YOU must check

- **Multi-voice ffmpeg render (the `5b08235` payload).** I could not run it here (`ELEVENLABS_API_KEY` is empty in this dev env, and I won't burn a live multi-minute render). **2-line manual test:** in Video mode paste a 2-speaker Master Script (two distinct SPEAKER names with timecodes, e.g. `[00:02] ნინო: …` / `[00:08] დათო: …`) and generate; then confirm the master's audio has the two voices spatially separated (one panned left, one right) with the music ducking ~-12 dB under each spoken line. Server log line to grep: `[assemble] multi-voice cast lane: N speakers → spatial premix`.
- **Per-service paid renders (Image / Music / Video / Avatar / Remix end-to-end).** I verified the shared billing/debit mechanism + admin gate + avatar + brand live, but did NOT drive each service to a completed paid render this pass (real provider spend + minutes; no browser session). They share the reserve-before-render saga + `deduct_credits` proven above. Confirm each in the UI as a signed-in user if you want per-service sign-off.
- **Vercel build framework = nextjs (not null) + build duration.** MCP is 403 here. Check Project → Settings → Framework Preset = **Next.js**, and Deployments → `5b08235` → **Ready** with a multi-minute build listing serverless functions. (The live `/api/health` dynamic route already rules out a static stub.)
- **Admin financials seen by a real admin.** I can only prove the non-admin denial live; log in as an allowlisted admin to confirm the Gross/Fees/Cost/Net figures render.
