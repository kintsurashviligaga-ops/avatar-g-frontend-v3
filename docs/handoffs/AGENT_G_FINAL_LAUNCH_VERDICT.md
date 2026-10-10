# Agent G final launch verdict (PART 10 + PART 11, 2026-10-10)

Owner's ask: GG, 2026-10-10 19:07:45Z (Master Task). PART 10 is the complete E2E certification by evidence tier. PART 11
is this verdict. The same message pre-approved one action, and only if every release gate passes: merge PR #50 to
`main` by a normal merge, let Vercel deploy Production, run the post-deploy checks, ship safe hotfixes, and roll back on a
critical regression. Everything else stays the owner's (§12).

Labels: **PROVEN** (a check that ran proves it, at the tier named) · **PROVEN IN ISOLATION** (real Postgres 16 +
PostgREST + real FFmpeg on a throwaway local database) · **BUILT_NOT_PROVEN** · **PARTIAL** · **MISSING** ·
**BLOCKED_OWNER** · **BLOCKED_EXTERNAL** · **FAILED** · **DISABLED**. A mocked test is never Production proof.

Evidence tiers, as GG named them:

| Tier | What it is here |
|---|---|
| T1 UNIT / MOCKED | Jest with providers, ledger and database mocked; Playwright with every generation route mocked |
| T2 INTEGRATION | Route handlers run whole with only the outside edges mocked; Playwright against a local production build (`next build` + `next start`) |
| T3 REAL LOCAL POSTGRES + FFMPEG | `scripts/lease-isolation/run.sh`: Postgres 16 with Production's table shapes and real `deduct_credits` / `refund_credits` bodies, a real PostgREST, real FFmpeg |
| T4 AUTHENTICATED PREVIEW | the cert-branch Preview with a real signed-in session; it shares Production's Supabase project |
| T5 REAL PROVIDER | a paid Google or ElevenLabs call |
| T6 PRODUCTION | https://myavatar.ge |

---

## 1. Exact repo commit and PR

| Item | Value |
|---|---|
| PR | #50, `claude/launch-certification-wmvitt` → `main` (draft until the gates pass) |
| Base | `main` = `6c7dff46` = Production since 2026-10-09 16:01Z (PR #52, auth hotfix) |
| Code head gated | `d41c7562` (this document and the records ride on the commit after it) |
| Size | 108 commits ahead of `main` (with this record), 0 behind; 665+ files, about +56,400 / −10,200 lines; `git merge-tree` clean |
| Migrations in the PR | none new against `main`; no workflow pushes to the database |

## 2. What changed (PR #50 against Production)

- **Agent G engine:** a durable lease queue on `generation_jobs` (lease, heartbeat, fenced writes, retry, sweep), real
  cancel that stops FFmpeg, a refund outbox, a typed tool allowlist, one Task API (`/api/tasks`), multi-step runs.
- **Agent G operations:** montage (clips + music → MP4), URL-to-Audio (licensed links → MP3, platforms refused, upload
  instead), media edit, analyze-my-file. All behind `AGENT_G_MEDIA_EXEC` / `AGENT_G_FILE_ANALYSIS`, **off in
  Production**.
- **Live Voice:** a spoken yes is required and recorded server-side before a paid action.
- **Billing and security hardening:** same-ref charge race closed (`deduct_credits_once`, migration `20261002d` already
  applied in Production), replayed charges refused, owner checks on the Task API and old task routes, a film master
  link no longer leaked, cron and webhook secrets compared in constant time, new per-user daily caps.
- **Provider boundary:** no silent fallback to another engine; a refused engine fails and refunds. VFX allows only Veo.
- **Omnichannel:** Connections centre, notification preferences, a delivery outbox (`DELIVERY_OUTBOX`, off), WhatsApp /
  Telegram / SMS on one run engine, WhatsApp Calling built and **off** (`WHATSAPP_CALLING_ENABLED`).
- **Pricing:** a pure unit-economics engine and the audit; the one price model waits on GG. **No Production price
  changes with this merge** (the product-ad length price is held behind `PRODUCT_AD_PRICING = 'production'`, §7).
- **One-window UX:** old surfaces retired into the studio (redirects, no 404s), task cards, players, phone layout, the
  guest Settings fix.

## 3. What is PROVEN

| Claim | Tier | Evidence |
|---|---|---|
| Whole repo: tsc 0, lint 0 errors | T1 | `d41c7562`: tsc exit 0; `next lint` 0 errors, 33 warnings (unchanged) |
| Full Jest, no regression | T1/T2 | `d41c7562`: 841 suites (836 passed, 5 opt-in skipped), **12,668 passed, 30 skipped, 0 failed** (baseline 12,599) |
| Every committed Playwright spec on a production build | T2 | final code head `d41c7562`: 35 specs, **289 passed, 7 skipped, 0 failed** (5.7 min); the same on `1058e7bd` (0 flaky) |
| Production build | T2 | `next build` exit 0 with CI's dummy env |
| Crash → recovery → retry, one debit (E2E-06) | T3 | `leaseIsolation.pg.test.ts` 7/7, run twice (before and after the ledger migration) |
| Refund exactly once (E2E-07) | T3 | `leaseIsolation` G cases + `ledgerOnce.pg.test.ts` 7 passed, 1 skipped, before and after `20261002d` |
| Multi-step run on real FFmpeg (E2E-04 engine) | T3 | `runIsolation.pg.test.ts` 6/6 |
| Delivery outbox compare-and-set and due list | T3 | `outboxIsolation.pg.test.ts` 4/4 |
| Signed-out callers refused | T2 | 465 routes, 596 requests on the production build: no private data on any 200 (every 200 is a guest, empty or public answer); new media routes answer `{"enabled":false}` |
| No secret in the diff | T1 | regex scan of 56,341 added lines: only test fixtures; new `NEXT_PUBLIC_*` names are public (Supabase URL, Vapi public key) |
| Montage Stop and a delivered MP4 | T4 | Preview admin run 2026-10-09 16:49Z / 16:58Z (jobs `2bb56123`, `cf55ed33`, 0 credits), an earlier build |
| Guest Settings fix | T4 (signed out) | Preview at `4cb13be`, 19:05Z, KA and EN, screenshots in `docs/handoffs/omnichannel/evidence/` |
| Sign-up, OTP log-in, password reset, Google OAuth | T6 | 2026-10-09 on `6c7dff4`; PR #50 does not change `app/auth/*`, `lib/auth*`, `lib/supabase*` or `app/api/auth/*` |
| Ledger integrity | T6 (read only) | 19:11Z: 222 ledger rows, 0 duplicate refs, 0 negative balances; 52/52 public tables have RLS |

## 4. What is BUILT_NOT_PROVEN

- Every Agent G operation on a real signed-in session at the current head (A–D of the run sheet): **BLOCKED_OWNER**.
- Live Voice on a real device, and a real iPhone Safari run: **BLOCKED_OWNER**.
- Every paid provider path (Veo, Lyria, image, ElevenLabs) at the current head: T5 needs the owner's word per test.
- The delivery outbox and every channel (WhatsApp, Telegram, SMS) in Production: **DISABLED**.
- WhatsApp Calling: built, fake-peer E2E only, **DISABLED**, **BLOCKED_EXTERNAL** (Meta, §10).
- analyze-my-file: **DISABLED** everywhere; its live run is BLOCKED_OWNER (paid Gemini reads).

## 5. All P0 / P1 / P2 blockers

**P0: none.** Two independent reviews of the full diff (security and billing; merge impact against `main`) found no P0.

**P1 for merging: none open.** The one P1 the merge-impact review found is resolved for this merge:

| # | Finding | Resolution |
|---|---|---|
| R1 | The product ad would have moved from 25 credits at every length to 25 / 75 / 150, and it keeps the whole charge when only part of the ad renders | The price stays at Production's 25 (`PRODUCT_AD_PRICING = 'production'`, `d41c7562`), so the merge changes no price and the partial-delivery gap stays what it is in Production today (pricing audit D15, ≤ 25 credits). The length price and the per-scene refund belong to the one price model (§12) |

**P1 for opening Agent G or the full product to users (not for this merge):**
- the price model: video below cost in Production (audit D2 and others), BLOCKED_OWNER;
- `MEDIA_GOOGLE_ONLY` off: 9 services still call engines outside Google + ElevenLabs as primary, BLOCKED_OWNER;
- payments never completed (BOG live credentials), BLOCKED_OWNER;
- D4: a studio render cannot be stopped through the Task API (the chat says only what it stopped);
- no authenticated Preview proof at the current head (A–D), BLOCKED_OWNER.

**P2, fixed in PART 10 (`d41c7562`, each with a test):**
- a replayed film key failed the original film's row while it could still render;
- the cron gate compared its secret with `===` (now constant time);
- the `analyze_media` agent tool skipped the analyze route's 100-a-day ceiling (flag off);
- the outbox isolation test read rows left by the run suite on the same throwaway database (test only).

**P2, open and recorded:**
- Vapi webhook: no replay window; call debits are read-modify-write (pre-existing; Production `voice_calls` has 0 rows);
- the studio routes do not require the voice-approval record (a documented design decision, PART 5 §3);
- memory and jobs routes return raw database error text (pre-existing);
- the new long-running routes declare `maxDuration` but have no `vercel.json` entry; add one before opening
  `AGENT_G_MEDIA_EXEC` (no effect while it is off);
- defects D1–D3, D5–D11, D17 of `AGENT_G_FINAL_E2E_CERTIFICATION.md` §16.

**Checked and closed:** "delete all memory" deletes. Production has the `FOR ALL` policy `auth.uid() = user_id` on
`user_profile_metadata` and `DELETE` granted to `authenticated` (read with SELECT only, 2026-10-10).

## 6. Security findings

| Area | Result | Tier |
|---|---|---|
| Auth, middleware, CSP, service worker, checkout, credits balance, admin | unchanged from `main` | T1 diff |
| Signed-out and forged callers | refused on every Agent G route; 465-route probe clean | T2 |
| Cross-user task or artifact (E2E-08) | refused (`app/api/tasks/[taskId]/owner.test.ts`, run and media route suites, H in isolation); Preview check C is BLOCKED_OWNER | T1 + T3 |
| Forged approval | refused (quote HMAC + fingerprint suites, G1 in isolation) | T1 + T3 |
| SSRF | `lib/web/publicFetch`: address rule, every IPv6 form carrying IPv4, redirects re-checked, pinned lookup, byte cap | T1 |
| Secrets | none in the diff, none in client code, none in new log lines | T1 |
| Webhooks and crons | WhatsApp signature constant-time and fail-closed; both new crons 403 without `CRON_SECRET` and skip before the database while their flag is off | T1 + T2 |
| Admin migration route | still 404 unless `ADMIN_MIGRATION_ROUTE=enabled` | T2 |
| HawkScan DAST | not run: no `HAWK_API_KEY` in this environment | — |

## 7. Billing and provider compliance

- **Quote = Charge = Ledger (E2E-14):** each studio button and each route charge read the same price function
  (`lib/credits/quote.ts`, `priceTables.test.ts`, `videoPricing.test.ts`, `productAdCharge.test.ts`). The ledger refuses
  a replayed ref (`deduct_credits_once`) and pays one refund per ref (T3). Production ledger clean (T6, read only).
- **Prices:** this merge changes **no** Production price, pack, subscription, balance or payment setting. The product
  ad charges 25 credits at 8, 24 and 48 s as today. All new Agent G work is free (GG's choice, 2026-10-09) and off.
- **Margin:** video is sold below cost in Production today (pricing audit). Confirming price and margin is the one
  price model in `docs/handoffs/pricing/SERVICE_UNIT_ECONOMICS.md` §6: **BLOCKED_OWNER**.
- **Provider boundary (E2E-12):** no silent fallback anywhere in the diff (provider ratchet test); a refused engine fails
  and refunds. Under `MEDIA_GOOGLE_ONLY` nothing outside Google + ElevenLabs is called (tests). In Production the switch
  is off, so the 9 services in §8 still use their primary outside engines: **FAILED until the owner turns it on**.

## 8. All 22 services' actual status

No service is PROVEN end to end at the current head: that needs T4/T5 runs the owner gates. "Last real result" is
Production history (read only); it proves a path worked on an earlier build.

| # | Service | Label | Note |
|---|---|---|---|
| 1 | video.generate | BUILT_NOT_PROVEN | Production `film` 63 done / 19 failed, last 10-04 |
| 2 | video.music-video | BUILT_NOT_PROVEN | inside `film` |
| 3 | video.product-ad | BUILT_NOT_PROVEN | price held at 25 (§7) |
| 4 | video.character-swap | BLOCKED_OWNER | outside engine; refused under `MEDIA_GOOGLE_ONLY` |
| 5 | video.motion | BLOCKED_OWNER | outside engine |
| 6 | video.vfx | BUILT_NOT_PROVEN | Veo only |
| 7 | video.remix | BLOCKED_OWNER | outside engines for restyle / background / character / redub |
| 8 | video.editing | PARTIAL | Stop + MP4 PROVEN on the Preview 2026-10-09; runs PROVEN IN ISOLATION |
| 9 | image.generate | BLOCKED_OWNER | outside engine as primary until `MEDIA_GOOGLE_ONLY` |
| 10 | image.photoshoot | BLOCKED_OWNER | as #9 |
| 11 | image.interior | BLOCKED_OWNER | as #9 |
| 12 | image.culling | BUILT_NOT_PROVEN | on the device, nothing leaves it |
| 13 | avatar.talking | BLOCKED_OWNER | outside engines |
| 14 | music.generate | BLOCKED_OWNER | Lyria; outside engines when picked |
| 15 | music.remix | MISSING | DISABLED in every door |
| 16 | voice.dubbing | PARTIAL | free, 10 a day |
| 17 | text.write | BUILT_NOT_PROVEN | Gemini chat |
| 18 | design.presentation | PARTIAL | free, 30 a day |
| 19 | design.model3d | BLOCKED_OWNER | outside engine |
| 20 | code.assistant | BUILT_NOT_PROVEN | no sandbox |
| 21 | code.terminal | MISSING | waits for a sandbox host |
| 22 | research.web-search | BUILT_NOT_PROVEN | Gemini grounding |

Totals: 9 BLOCKED_OWNER, 8 BUILT_NOT_PROVEN, 3 PARTIAL, 2 MISSING, 0 PROVEN. Agent G's own operations: montage PARTIAL;
URL-to-Audio, edit and multi-step runs PROVEN IN ISOLATION; analyze DISABLED.

## 9. Real E2E evidence (E2E-01 … E2E-15 by tier)

`—` means no evidence at that tier. T5 (real provider) is empty for every row: no paid test ran in PART 10.

| # | Scenario | T1 unit / mocked | T2 integration | T3 real local PG + FFmpeg | T4 authenticated Preview | T6 Production | Label |
|---|---|---|---|---|---|---|---|
| 01 | Registration → login → dashboard | auth suites | `auth-sheet.spec`, dashboard specs | — | — | PROVEN 2026-10-09 on `6c7dff4` (auth code unchanged since) | PROVEN (T6, earlier build) |
| 02 | Upload → Agent G → MP3 → download | audio suites | chat MP3 spec | real-media MP3 E2E (PART 3) | BLOCKED_OWNER (run sheet A) | DISABLED | PROVEN IN ISOLATION |
| 03 | 2–3 videos → montage → MP4 | montage suites | montage spec | montage + run suites | PROVEN 2026-10-09 16:58Z, earlier build | DISABLED | PARTIAL |
| 04 | One Georgian command → multi-step run → result | KA intent, run chat | run card spec | `runIsolation` 6/6 | BLOCKED_OWNER | DISABLED | PROVEN IN ISOLATION |
| 05 | Stop → FFmpeg really stops | real-FFmpeg kill test | — | lease suite | Stop PROVEN 2026-10-09 16:49Z; D BLOCKED_OWNER | DISABLED | PROVEN IN ISOLATION |
| 06 | Worker crash → recovery → retry, no double charge | lease unit suites | — | E/F 7/7 | not on shared data without GG's word | — | PROVEN IN ISOLATION |
| 07 | Refund exactly once | ledger suites | — | G + `ledgerOnce` | not on shared data | ledger clean (read only) | PROVEN IN ISOLATION |
| 08 | Another user's task / artifact → denied | owner suites | 465-route probe | H | BLOCKED_OWNER (run sheet C) | — | PROVEN (T1–T3) |
| 09 | Live Voice → plan → approval → execute → result | spoken-yes, approvals route | `live-voice-e2e.spec` (mocked) | — | BLOCKED_OWNER | BLOCKED_OWNER (real device) | BUILT_NOT_PROVEN; D1 open |
| 10 | KA / EN / RU and iPhone Safari | i18n parity | prod-build specs at phone, tablet, desktop (Chromium) | — | KA + EN guest checks 19:05Z | real iPhone BLOCKED_OWNER | PARTIAL |
| 11 | 22-service capability audit | catalog suites | service specs | ffmpeg services | — | history only | §8 |
| 12 | Provider boundary | provider ratchet | — | — | — | switch off: FAILED for 9 | BUILT, TESTED; Production BLOCKED_OWNER |
| 13 | Meta / WhatsApp safety simulation | gates, replay, ticket suites | bridge fake-peer E2E | — | — | Calling DISABLED | simulation PROVEN (T1–T2); real BLOCKED_EXTERNAL |
| 14 | Quote = Charge = Ledger | price-table suites | route suites | ledger suites | — | ledger clean (read only) | PROVEN (T1–T3); margin BLOCKED_OWNER |
| 15 | Error handling: real error, a way on, or the refund | card reason + Retry suites | error specs | refunds in isolation | — | — | PROVEN (T1–T3) |

**The owner-session run that turns T4 green (about 6 minutes).** URL:
<https://avatar-g-frontend-v3-git-ef1fad-kintsurashviligaga-ops-projects.vercel.app>, signed in with Google as
kintsurashviligaga@gmail.com. Steps A (MP3 from the MDN `flower.mp4`), B (a YouTube link is refused with Upload offered),
D (Start, then Stop) and C (`/api/tasks` in the same tab, then `/api/tasks?id=<id Claude sends>` in a private window
as myavatar.ge@gmail.com must answer `not_found`), exactly as in `docs/handoffs/2026-10-09-preview-run-sheet.md`.
Then "A–D მზადაა" in the Master Task; Claude reads the rows with SELECT only.

## 10. Meta case #28590089197308927

**SENT — TRANSFERRED TO EMAIL SUPPORT — AWAITING WRITTEN POLICY RESPONSE.** Sent by GG on 2026-10-10 from the
MyAvatar.ge business portfolio. Meta's AI-assistant pre-reply is not consent. Until a written answer: WhatsApp AI
creative execution and WhatsApp Calling stay **off** in Production, and every Meta-dependent item is
**BLOCKED_EXTERNAL**. This merge turns neither on.

## 11. Production rollback plan

| Trigger | Action |
|---|---|
| A critical regression after the PR #50 deploy | Revert the merge commit on `main` with a normal revert PR (no force push): Vercel redeploys `6c7dff4`'s code. Fastest path, GG's button: Vercel Instant Rollback to the `6c7dff4` deployment (`dpl_Ghoo53ZCY76BVF2iZsM984SmhQ6p`) |
| A flag was opened later | unset `AGENT_G_MEDIA_EXEC` / `AGENT_G_FILE_ANALYSIS` / `DELIVERY_OUTBOX` first; started jobs finish or are swept (a lease is 90 s, a job ≤ 10 min) |
| Data | the merge runs no migration and writes nothing on deploy, so there is nothing to undo in the database |

## 12. Owner decisions required (one list)

1. **Preview A–D as admin**, about 6 minutes (§9): the only way to prove Agent G on a real session.
2. **The one price model** (`SERVICE_UNIT_ECONOMICS.md` §6), including the product-ad length price and the per-scene
   refund; then its deploy.
3. **`MEDIA_GOOGLE_ONLY` in Production** (closes the provider boundary for 9 services).
4. **BOG live credentials** and merchant activation (no payment has ever completed).
5. **Opening Agent G** (`AGENT_G_MEDIA_EXEC`, later `AGENT_G_FILE_ANALYSIS`) after A–D; Claude adds the `vercel.json`
   durations first.
6. **Production `GEMINI_TRANSPORT`** (Vertex on the $300 credit, or the API key as now).
7. **Alert routing:** a log alert on `ops_marker` lines or a Sentry DSN.
8. **A real-device Live call and an iPhone Safari run.**
9. **Sandbox host** for code and browser tools (paid; Vercel Sandbox pilot ≤ $20 a month after checks).
10. **After Meta answers in writing:** WhatsApp creative scope and Calling.

## 13. Final GO / NO-GO

```
MERGE PR #50 + PRODUCTION DEPLOY, EVERY NEW FLAG OFF:   GO only if every release gate passes and CI is green
                                                        (GG's pre-approval of 19:07:45Z); outcome in §14
FULL OPENING TO USERS (Agent G public, all services):   NO-GO
  why: 0 of 22 services PROVEN end to end at this head; Agent G not proven on a real session at this head;
       provider boundary FAILED in Production until MEDIA_GOOGLE_ONLY; video sold below cost; payments never completed;
       Meta written answer pending
PRODUCTION READY:                                       NO
```

## 14. Merge, deploy and post-deploy record

Filled in as it happens; see the Master Task thread for the final report.
