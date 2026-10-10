# Agent G Autonomous Execution — PART 7: checks and the final certification

The owner asked for this on 2026-10-10 at 05:49Z (Master Task thread), with the Gemini supplement at 06:00Z. At 12:42Z
and 12:44Z the owner set the order: finish PART 6, then PART 7's checks that need no approval, then the pricing audit;
at 13:10Z the Omnichannel + Mobile UX task was queued after those. PART 7 continues from PART 6
(`docs/handoffs/agent-g/part-6-report.md`) on branch `claude/launch-certification-wmvitt`, draft PR #50.

The certification itself is `docs/handoffs/AGENT_G_FINAL_E2E_CERTIFICATION.md` (20 sections). Verdict: **NO-GO** for
Production; the five open items are in its §1.

| Commit | What |
|---|---|
| `0ac386f2` | Multi-step runs on a throwaway Postgres + PostgREST with real FFmpeg: I, E, F, G1, G2, H (6 / 6) |
| `1e8bcc07` | Every Master Task sentence in English and Russian too: the intent corpus 48 → 69 (69 / 69) |
| `78fe3ab4` | What the production-build browser run found: one product defect, two test defects (below, §2) |
| `448b0a22` | Two billing defects the pricing audit found (below, §2) |
| `3f3fa34d` | The pricing audit's engine and `docs/handoffs/pricing/SERVICE_UNIT_ECONOMICS.md` |
| `7c1a061a` | A type fix to `448b0a22` (`tsc` caught an unchecked index) |
| `cc4484f3` | A parity test still pinned the one-price product quote that `448b0a22` fixed; it now pins the length quote |
| this commit | The certification, this report, PROJECT_MASTER |

Nothing was merged or deployed. No migration, no environment variable, no flag, no price and no paid call changed.
Production was read only (the ledger and `generation_jobs` at 13:52Z, the `20261002d` function hashes).

## 1. The E2E scenarios, A–J

A "real" run means a Preview or Production with a real signed-in session. None was possible in PART 7: the Preview runs
need the owner's admin session, and Claude never signs in as the owner. So each scenario got the strongest proof that
needs no approval, and its real run is named as BLOCKED_OWNER.

| | Scenario | What ran in PART 7 | Label |
|---|---|---|---|
| A | Text, Georgian: a question never spends; an order gets a priced card first | intent pack 395 passed (12 suites), corpus 69 / 69 (KA 26, EN 22, RU 21); the chat gate specs on the production build | BUILT, TESTED; real BLOCKED_OWNER |
| B | Montage: clips + a track → MP4 in the chat | lease isolation 7 / 7 and run I with real FFmpeg; `agent-g-montage.spec.ts` on the production build and on `next dev` | PROVEN IN ISOLATION; Preview 2026-10-09 PROVEN in the database (older code) |
| C | Audio: a video link or file → MP3, platforms refused by name | run I (the sound step, MP3 8.05 s); URL-to-Audio E / F; `agent-g-audio.spec.ts` | PROVEN IN ISOLATION; real BLOCKED_OWNER |
| D | Voice: the user's own yes starts it, Stop and status by voice | `live-voice-e2e.spec.ts` and `live-actions.spec.ts` with a simulated Google socket; the spoken-yes suites | BUILT, TESTED; a real call BLOCKED_OWNER |
| E | Recovery: a dead worker and a server restart | run E: attempt 2 by the sweep, a fresh process finishes from the database alone, the late worker is told it lost the job | PROVEN IN ISOLATION |
| F | Cancellation: Stop kills the encoder and pays back once | run F: ffmpeg killed within 3 s, ledger −7 then +7, a second stop `not_running` | PROVEN IN ISOLATION |
| G | Billing: charge once, a priced step's own yes, eight racing ticks | runs G1 and G2; Production ledger clean (read only) and `20261002d` hashes intact | PROVEN IN ISOLATION; ledger PROVEN clean |
| H | Security: another user, a forged approval, an anonymous or forged caller | run H; 25 probes of every Agent G route on the production build, nothing answered 200; security pack 833 passed | PROVEN IN ISOLATION / local production build |
| I | Multi-step: one message, three steps | run I: sound → cut of two clips to it → noir look with fades, 3 real results, one run per double tap | PROVEN IN ISOLATION |
| J | Every service | the 22-service matrix (certification §6): 9 BLOCKED_OWNER, 8 BUILT_NOT_PROVEN, 3 PARTIAL, 2 MISSING, 0 PROVEN on the current code | as labelled |

## 2. Found and fixed

- **A failed card said its reason twice.** On the production build `agent-g-audio.spec.ts` caught it: a refused YouTube
  link showed the same sentence in the bubble and on the card. The bubble is what a reload keeps, so it carries the
  reason; the card marks the step the work broke on (✕) and says nothing twice. The same for the analysis card. A run's
  card keeps a reason per step, since its bubble speaks for the whole run. (`lib/agent/media/taskSteps.ts`,
  `lib/agent/media/analyzeChat.ts`, their tests.)
- **The download tests of seven specs could not pass on a production build.** Their mock results lived on `media.test`
  (and `e2e-media.example` in the voice chain), which the production CSP does not allow the download path to fetch. The
  specs now serve mock results from `e2e-media.supabase.co`, a name inside the CSP's `*.supabase.co`; the old host was
  run again and fails the same way. PART 0 had planned a test-only CSP allowance; changing the specs keeps the
  product's CSP untouched.
- **The guest-photo check met the chat route's per-IP burst limit** (100 a minute, shared by every read route): a whole
  suite on one machine is one IP. The test now waits out one window and asks again. Proven by spending the limit on
  purpose (105 calls: 100 answered 400, 5 answered 429), after which the test waited and passed. The limit is unchanged.
- **The dev-bypass spec expected the bypass on a local production build.** A production build has no dev bypass, so
  `swarm-pipelines.spec.ts` now reads `PLAYWRIGHT_PRODUCTION_BUILD=1` as a production server.
- **The Agent G video queue rendered on Standard at the Fast price** (found by the pricing audit): 25 credits for $3.20 of
  Veo a clip. It now renders the tier its price is computed on; a test pins the model. (`lib/agent/videoQueue.ts`)
- **A product ad was charged one clip's price at every length** (found by the pricing audit): a 48 s ad renders six
  clips. One length rule (8 / 24 / 48 s) now prices the button, the chat notices, the route's charge and the scene gate.
  (`lib/credits/quote.ts`, `lib/video/productAdCharge.ts`, `app/api/video/remix/route.ts`, the studio)

## 3. Tests

| Check | Result |
|---|---|
| `jest` (whole repo) | 801 suites passed, 4 skipped (805); 12,398 tests passed, 26 skipped, 0 failed (the first full run failed 1: a parity test still pinned the one-price product quote, fixed in `cc4484f3`) |
| `tsc --noEmit` | 0 errors |
| `next lint` | 0 errors, 33 warnings |
| `next build` (dummy Supabase env, as CI) | OK |
| Playwright, every committed spec, production build (`next start`) | 283 passed, 7 skipped, 0 failed (290) on the final code (second run, 7.1 min). The first run on the same build: 281 passed, 2 failed: `landing.spec.ts:256` and `:318` (phone) failed in the shared setup step, where Escape closes the sheet the video link opens, and the sheet stayed open. Alone, the whole landing spec ×3 passes 162 / 162, and 28 probes (CPU ×6, slow API and chunks) lost no Escape. Cause not found: certification §16 D17 |
| Playwright, every committed spec, `next dev` | 276 passed, 7 skipped, 7 failed (290). Run alone with 1 worker: ui-newtools ×2 pass; landing ×3 (the dev-server effect PROVEN 2026-10-09 §4.17), ui-image:231 (the same 0×0 image queue; also failed on dev 2026-10-09) and live-voice:30 (1 of 2 on a warm dev server, lazy panel mount) still fail on dev. All 7 pass on the production build |
| Run isolation (real Postgres 16 + PostgREST 12.2.3 + FFmpeg) | 6 / 6 (I, E, F, G1, G2, H) |
| Security pack | 50 suites, 833 passed, 8 skipped (opt-in database suites), 0 failed |
| Intent pack | 12 suites, 395 passed; corpus 69 / 69 |
| Probes of every Agent G route, anonymous and forged token | 25 calls, 0 answered 200 |

The run evidence (steps, quotes, results, ledger) is in `/mnt/project-files/reports/agent-g/run-isolation-evidence.json`;
its quote tokens are signed with the test's own key.

## 4. What can still fail for a real user

- **Nothing PART 1–7 added has run with a real session.** The engine is proven on a real database with real FFmpeg, but
  not on Vercel's functions, not against Production's storage, and not with a real Google sign-in. The first Preview run
  can still find a deployment difference (function time limits, the ffmpeg binary on Vercel, storage upload sizes).
- **9 services still call a forbidden engine in Production** until `MEDIA_GOOGLE_ONLY` is on.
- **Money.** No payment has completed; Production sells every video below its cost until the price model is approved
  and deployed; free work is capped, not priced.
- **A refund debt could sit unseen.** The sweep logs it, but no alert reaches a person yet.
- **Phones.** No real iPhone Safari run; no real Live Voice call on the current code.
- **The PART 6 gaps stand.** Live cannot start a two-step run; a reload does not redraw a card; an analysis cannot be
  stopped mid-read; a studio render cannot be stopped through the Task API.

## 5. Owner decisions (BLOCKED_OWNER)

The full list is the certification's §17. The ones that unblock the most:

1. The Preview A–D run as admin (`docs/handoffs/2026-10-09-preview-run-sheet.md`, about 6 minutes), then E / F on the
   shared database only on the owner's separate word.
2. The one price model (`docs/handoffs/pricing/SERVICE_UNIT_ECONOMICS.md` §6), then its deploy.
3. `MEDIA_GOOGLE_ONLY` in Production and alert routing.

## 6. Next

The pricing audit is written (`docs/handoffs/pricing/SERVICE_UNIT_ECONOMICS.md`) and waits for the owner's one
approval; nothing in Production changed. Next: the Omnichannel + Mobile UX task.
