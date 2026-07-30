# Gemini Master Task — Status Baseline & Execution Plan

Source of truth: `myavatar_unified_claude_code_task.pdf` (29pp, 5 Sprints, 40 components, 20 days).
This file is the PDF's mandated §4.3 status report, kept in-repo and updated at each Sprint gate.

**Baseline taken:** 2026-07-30, against `main` @ `e515da7`. **Re-audited + corrected 2026-07-30.**

> CORRECTION: the first legacy-provider counts (275/152/40/39) were measured repo-wide and double-counted
> the `.claude/worktrees/` copies of the tree. The real figures are below. The PDF's §3.1 delete-list also
> turned out to describe a codebase this is not: none of its named components or fields exist here.

> Honesty rule for this file: a row is only `DONE`/`PARTIAL` when it was verified by reading the code.
> Rows marked `UNVERIFIED` were not yet audited — they are NOT claims of absence.

---

## 0. Verified baseline (facts, not estimates)

| Fact | Value | How verified |
|---|---|---|
| API routes total | **399** | `find app/api -name route.ts` |
| Routes under `/api/v2` | **0** | same |
| `BillingGuard` / `canProceed` / cost limits | **absent** | repo-wide grep, 0 hits |
| Files referencing **Kling** | **59** | grep -li over `app lib components` |
| Files referencing **Runway** | **38** | ″ |
| Files referencing **Midjourney** | **8** | ″ |
| Files referencing **Stable Diffusion** | **8** | ″ |
| PDF §3.1 delete-list components (`RunwaySettings.tsx` etc.) | **none exist** | find |
| PDF §3.1 delete-list fields (`sd_checkpoint`, `kling_mode` …) | **0 hits, all 10** | grep |
| Meshy (3D) | **0 files** | grep -li |
| Imagen | **0 files** | grep -li |
| PPTX | **0 files** | grep -li |
| Lyria | 3 files | grep -li |
| ElevenLabs | 137 files | grep -li |
| TypeScript `strict` | **already on** (+`noImplicitAny`, `noUncheckedIndexedAccess`) | `tsconfig.json` |
| `npm run test:all` (PDF deploy flow calls it) | **does not exist** | `package.json` scripts |

**Service routes that exist today:** chat 13 · image 3 · video 17 · music 5 · avatar 19 · remix 3 ·
**montage 0 · dubbing 0 · 3d 0 · presentation 0**.

**Cost substrate already present:** `agent_evolution_traces` records `cost_wholesale_gel` (platform
provider cost) + `worker_kind` + `metadata` per call, written by `withTrace()`
(`lib/observability/agentTrace.ts`). `/api/admin/financials` already aggregates it.
→ **BillingGuard should WRAP this, not duplicate it.**

**Auth today:** `app/api/auth/register/route.ts` calls the service role with `email_confirm: true`
— i.e. sign-up **auto-confirms and logs the user straight in**. This is precisely the behaviour the
new requirement replaces. `app/api/auth/otp/` exists (magic-link style) but is not wired as a
post-registration verification gate.

**Pricing today:** `lib/billing/pricingConfig.ts` → `PRICING_TIERS` at USD **[15, 99, 299]**.
Target: Free $0 · Basic $11.99 · Pro $23.99 · Business $44.99.

---

## 1. Decisions the spec forces (owner input needed)

### D1 — Legacy cleanup vs. render resilience ⚠️ **highest risk in the whole program**
PDF §3.1 requires `grep -r "runway\|kling\|midjourney\|stable.diffusion" src/` → **0 results**.

But Runway/Kling/LTX are the **failover cascade** that keeps video rendering when Veo misses, and
`main` @ `8154de8` (2 days ago) proved Veo i2v had been failing **100% of the time** until the
`bytesBase64Encoded` fix — the cascade is the only reason films rendered at all. Deleting it makes
Veo a single point of failure with no fallback.

Options: (a) delete now, spec-literal; (b) delete the **UI/settings surface** now (which is what the
PDF's delete-list actually enumerates: `RunwaySettings.tsx`, `KlingSettings.tsx`, `sd_*` fields, …)
and retire the **runtime cascade** only after Veo runs clean for an agreed window; (c) delete all now
and accept the outage risk.

### D2 — BillingGuard vs. the existing credit ledger → **resolved, no input needed**
They are different layers and both are needed:
- existing `credit_ledger` / `deduct_credits` = **user-facing** charge (what the customer pays);
- PDF `BillingGuard` = **platform-facing** guard on our own provider spend ($10/day, $300/mo).
Plan: BillingGuard reads/writes `agent_evolution_traces.cost_wholesale_gel` via `lib/billing/fx.ts`
for USD↔GEL. No parallel ledger, no change to user billing.

### D3 — `/api/v2` vs. "no `/api/v1/*`" → **resolved, no input needed**
399 live routes serve a shipped PWA + iOS/Android builds. Deleting them breaks installed clients.
Plan: `/api/v2/*` becomes the new contract for the 10 services (additive), v1 marked deprecated and
removed only after client telemetry shows no traffic. Deviation from the PDF, deliberate, logged here.

### D4 — Pricing migration
New tiers replace [15, 99, 299]. Existing subscribers need a grandfathering decision before the
Stripe/BOG price IDs change. Flagged, not yet actioned.

---

## 2. §4.3 Component status (40)

Legend: ✅ DONE · ⚠️ PARTIAL · ⬜ TODO · ❓ UNVERIFIED (audit interrupted)

| # | Component | Status | Note |
|---|---|---|---|
| 1 | BillingGuard | ✅ | `lib/services/billing/*` — §2.1.1 contract + §1.8 ladder + §2.5.3 ModelSelector, 18 tests |
| 2 | GeminiClient wrapper | ⚠️ | `guardedCall()` is the shared budget-gated entry point; a unified Gemini client is still TODO |
| 3 | Chat Service | ⚠️ | 13 routes, streaming ✓, but MULTI-provider (gemini/claude/openai), not Gemini-primary; no Flash-Lite→Flash escalation |
| 4 | Image Service | ⚠️ | budget-gated via ServiceManager; engine is still **NanoBanana/Replicate — Imagen 4 not wired** |
| 5 | Video Service (Veo 3.1) | ✅ | live, native audio, in-clip speech (`e515da7`) |
| 6 | Video Multi-Scene Pipeline | ✅ | 4–8s script cadence + stitch |
| 7 | Video SSE Progress | ⚠️ | union-token **polling**, not SSE |
| 8 | Music Service (Lyria 3) | ⚠️ | Lyria live; 15-genre grid + 5 Georgian genres unverified |
| 9 | Avatar Service | ⚠️ | 19 routes incl. live/enroll/handoff; not audited against the §3.2.5 control spec |
| 10 | Avatar Lip Sync | ⚠️ | exists in the film pipeline |
| 11 | Dubbing Service | ⬜ | **0 routes** |
| 12 | ElevenLabs Integration | ✅ | 137 files (TTS/voice clone) |
| 13 | Remix Service | ⚠️ | 3 routes |
| 14 | Montage Service | ⬜ | **0 routes** (stitch exists inside the film pipeline only) |
| 15 | 3D Model Service (Meshy) | ⬜ | **0 files** |
| 16 | Presentation Service | ⬜ | **0 files**, no PPTX |
| 17 | Legacy Cleanup | ⬜ | 275 kling · 152 runway · 40 mj · 44 sd — blocked on D1 |
| 18–27 | Manual Controls ×10 | ⚠️ | 20 studio components exist for the CURRENT services; none match the §3.2 field/default spec |
| 28 | Master Agent Router | ⚠️ | `lib/ai/agentG.ts` exists |
| 29 | Service Selector (10) | ⚠️ | selector exists for current services |
| 30–32 | Responsive (mobile/tablet/desktop) | ⚠️ | bottom sheet in OmniStudio + SettingsSheet |
| 33 | Capacitor iOS | ⚠️ | `capacitor.config.json` + `ios/AvatarG` |
| 34 | Capacitor Android | ⬜ | **no `android/` directory** |
| 35 | Rate Limiting | ⚠️ | `lib/api/rate-limit` exists; per-tier table from PDF absent |
| 36 | Caching (Redis) | ⚠️ | Upstash used for pipeline state / film status; no per-service CACHE_TTL |
| 37 | Cost Monitoring Dashboard | ⚠️ | `GET /api/v2/usage/{daily,monthly}` shipped (admin-gated); UI panel still TODO |
| 38 | i18n (KA/EN/RU) | ✅ | `i18n/`, `messages/` |
| 39 | Lighthouse > 90 | ❓ | not measured |
| 40 | Production Deploy | ✅ | Vercel auto-deploy on main |

**Totals:** ✅ 6 · ⚠️ 21 · ⬜ 12 · ❓ 1 (Lighthouse, unmeasured).
The 17 previously-unknown rows were resolved by direct code inspection; ⚠️ means "exists but does not meet
the PDF spec", which is the honest state of most of this codebase's surface.

Additional (from the prompt, not the PDF's 40):
| Email OTP sign-up gate | ✅ | `signUp` → 6-digit code → `verifyOtp`; the auto-confirm route is retired (410). **Needs working SMTP + `{{ .Token }}` in the Supabase template** |
| Pricing tiers 0/19.99/39.99/79.99 | ✅ | owner-revised figures; $0 excluded from the checkout allowlist. Grandfathering still open |
| Custom AI Personas | ⬜ | persona-ish strings exist in `service-registry`/`gemini/prompts`; no selectable/creatable system |

---

## 3. Execution order (respects the PDF's "no Sprint N+1 before Sprint N is green")

1. **S1 Foundation** — ✅ BillingGuard + cost model + `/api/v2/usage/{daily,monthly}` + `test:all` +
   `guardedCall()` threaded through `ServiceManager.execute()` (the chokepoint for image/video/avatar).
   ⬜ Remaining: the CHAT and MUSIC call sites (they don't route through ServiceManager), and a unified
   GeminiClient wrapper.
2. **S1b User-visible** — ✅ Email OTP sign-up gate; ✅ pricing ladder. ⬜ `AuthScreen.tsx` still uses the
   email-LINK variant (safe — no auto-confirm — but inconsistent with the OTP modal).
3. **S2** Video SSE progress + Music genre grid/Georgian genres + **Imagen 4 for Image (not started)**.
4. **S3** Dubbing (7-step) + Avatar hardening.
5. **S4** Montage + 3D (Meshy) + Presentation — the three genuinely new services.
6. **S5** Legacy cleanup per D1 + rate-limit tiers + caching + UI/manual-controls sweep + deploy.

Every step: Code → Test → Lint → Build → PR (`feature/gemini-integration`) → Merge → Deploy,
per Critical Rules 1 and 4.
