# END-TO-END QA — feat/prod-upgrade-v180 (pre-merge sweep)

Local/preview walkthrough with a real minted test user (onboarded the legitimate way, deleted
after). Branch only · no prod deploy · no IG publish · no live payment keys · **$0 paid-API spend**
(nothing rendered). Green-gate held: `tsc` EXIT 0 · **790/790 tests**.

**Outcome: no genuine bugs found.** Every surface either works, or fails cleanly with the real
reason. The one "welcome tour keeps reappearing" suspicion was a **test artifact** (I hid/advanced
it instead of skipping) — the ✕/skip persists `localStorage['myavatar:welcomed']='1'`, verified.

| # | Surface | Result | Evidence |
|---|---------|--------|----------|
| 1 | Onboarding → profile once → dashboard | ✅ works | New user gated to onboarding; completed it; **profile row = exactly 1** (credits 0, **3 free films**), 1 avatar; `/dashboard` then loads with no re-onboarding. |
| 2 | 6 services in main window | ✅ works | Selector shows all **6: Chat · Image · Music · Video · Avatar · Remix**; each clicked → composer editable, **no errors**. Avatar = the `#lipsync` "AI Lipsync Studio" surface. |
| 3 | Agent one-window (`/dashboard#agent`) | ✅ works | Prompt handoff pre-fills the goal from the old path; ReAct run renders **in-window** (thought → tool card → observation); Instagram tool returns **`requiresManualPost: true`** (prepare-only ⛔, never posts). |
| 4 | STEP 2 ad pipeline (up to paid) | ✅ honest | `/api/ads/tts` fails **cleanly** with the real reason (`missing ELEVENLABS_API_KEY` local / `quota_exceeded` prod) — **no faked alignment**. Kling path is **enqueue-only** (`createJob` status `queued`, no synchronous paid render). Budget-guard + caption-glyph tests **16/16** (no-spend guards, **no tofu**). |
| 5 | Native share (mobile + desktop) | ✅ works (logic) | `shareOrDownload` unit-tested **4/4** (files → URL → **mandatory `<a download>`** fallback); wired into MediaActions ShareModal. Live share-sheet needs a generated asset → see "yours to verify". |
| 6 | Settings modal + notifications | ✅ works | Settings opens; **2 toggles, 0 overflow at 375px** (the "Updates" toggle fits). Notification bell opens → empty-state for a fresh user; item→route→auto-close is at `NotificationBell.tsx:132` (`setOpen(false); router.push`). |
| 7 | Top-Up UI → checkout | ✅ works (path) | Clean credits modal (Starter 9₾ / Pro 29₾ / Max 89₾, **TBC/BOG card**, "Free videos 3/3"). **Pay** → `POST /api/billing/wallet-topup` → **503 "Billing provider unavailable"** (no keys locally) — graceful, **no payment data entered, no redirect forced**. Live redirect needs keys → see below. |
| 8 | Admin proposals view | ✅ works | Non-admin test user → `/admin/agent-proposals` **redirects to /dashboard, no admin content leaked**. approve→promote / rollback logic unit-tested **5/5**; approve/reject endpoints **403** for non-admin. |

## 🔴 Only YOU can verify (needs a resource I don't have)
- **2.6 ElevenLabs live TTS** — the account is out of credits (1/14). The path is proven to fail
  cleanly with the real reason; the *successful* alignment → captioned frame needs EL credits.
- **Top-Up → live checkout redirect** — needs live **TBC/BOG** (bank checkout, not Stripe) keys +
  the registered callback URL in the provider dashboard. The path + graceful no-key handling are verified.
- **Native share "Save to Photos" on a real device** — needs a generated asset + a real iOS/Android
  browser (the strategy + mandatory download fallback are unit-proven).
- **DB-backed surfaces at full fidelity** — feedback telemetry, optimizer proposals, and `agent_configs`
  promotion need `MIGRATIONS_TO_APPLY.sql` applied (all fail-soft until then).
- **The PR merge to `main`** to go live.

## Notes
- The desktop preview renders the app in a narrow column (a preview-browser DPR quirk; DOM reports
  full width). All screenshots for this sweep were taken at **375px**, where it renders pixel-clean.
- No code changes were required by this sweep — it is a verification pass. `tsc` + tests stayed green.
