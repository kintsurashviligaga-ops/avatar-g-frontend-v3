# Agent G Autonomous Execution — PART 5: security and billing hardening

The owner asked for this on 2026-10-10 at 05:49Z, with the Gemini supplement at 06:00Z (Master Task thread). It continues
from PART 4 (`docs/handoffs/agent-g/part-4-report.md`) on branch `claude/launch-certification-wmvitt`, draft PR #50.

| Commit | What |
|---|---|
| `df670cca` | C1: the same-ref charge race proven on a throwaway Postgres; `20261002d` hardened (`deduct_credits_once`). C5: a replayed charge ref is refused before anything renders |
| `2e6aedab` | C6: the chat image's price is held before Google is called |
| `f17ebd90` | `20261002d` applied to Production on the owner's word (card 11:03Z, applied 11:05Z) and verified |
| `af2c1496` | C3, M4: per-account daily ceilings on the work that bills no credits |
| `a705e8db` | P1: 15 server paths that still reached an outside engine with a Google-only switch on now ask the switch first |
| `27bb4c03` | C2: the lip-sync charge is shown beside the film price; two stale test pins fixed (PR #50's verify check was red) |
| `49352d04` | C4: the assistant quotes films and top-ups as they are charged and sold; a ratchet keeps the dead price tables dead |
| `6fd158e4` | B3, G6: page reads drop hidden text and carry the page's own date; hidden-instruction regression test |
| `058409e0` | S1: the legacy Vapi `get_job_status` reads only the caller's own job |
| `ded93632` | G3, G7: each Agent G run's tokens, cache hits, time and estimated cost are measured and logged |
| `7c0e1c69` | O1: the media sweep raises what it cannot fix itself (unpaid refunds, jobs given up, backlog, its own failure) |
| this commit | This report, the browser / sandbox decision brief (`browser-sandbox-decision.md`), PROJECT_MASTER |

One Production change, on the owner's verified word: migration `20261002d` (11:05Z). Nothing was merged or deployed,
no environment variable changed, no paid infrastructure or paid API call was started. No Gemini call was made.

## 1. Gaps and what changed

| Gap (PART 0 §6) | What changed | Label |
|---|---|---|
| C1 (P0): `deduct_credits` same-ref double debit | Proven on Postgres 16 with Production's own function bodies (md5-matched): two same-ref calls interleaved past the check charge twice. `20261002d` re-checks the ref under the row lock, keeps the unique index as the backstop, adds `deduct_credits_once` returning `{balance, charged}`, a preflight and a rollback. 53/53 race checks pass on the migrated functions. **Applied to Production 11:05Z** after the owner's "დიახ, ახლა"; read back: index valid, function hashes match, no anon / authenticated execute, ledger unchanged (222 rows, 0 negative) | PROVEN in isolation; APPLIED and verified in Production |
| C2 (P0): the lip-sync pass was charged on top of the quoted film price, unseen | The create screen and the storyboard name it under Generate (`+20 for lip-sync — taken only if it runs, returned if it fails`, KA/EN/RU), on the same condition the film uses to run the pass; the music video's switch names it; a short balance reads "not enough credits", not "engine unavailable"; a paid singer clip the montage could not use is named as saved in the Library. The film's own number is unchanged | BUILT, TESTED. Keep, fold into the film price, or drop the charge: BLOCKED_OWNER |
| C3 (P1): dubbing, presentation, upscale, audio isolation bill no credits and had per-IP limits only | Per-account daily ceilings after sign-in and validation: dubbing 10 (isolation shares it), presentation 30, upscale 30, Agent G analyze 100. A malformed request spends nothing; a run that did not start gives its slot back | BUILT, TESTED. Their prices: BLOCKED_OWNER |
| M4 (P2): the free montage editor was limited per IP only | The editor and Agent G's montage `run` share one daily bucket of 40 per account | BUILT, TESTED |
| C4 (P1): several price tables; the assistant quoted packs nothing sells | The chat assistant's price line now comes from the functions that charge: a film is quoted by `videoQuote` (Fast 8 s = 25, 24 s = 75, 48 s = 150; Lite −40 %, Max +230 %, music video +40 %), the lip-sync pass is named, the 25 / 45 clip table is labelled as the chat clip and product ad price, and top-ups are the 10 / 20 / 50 ₾ packs the Credits window sells. No price changed. A ratchet test fails if any live file imports the dead tables (`lib/monetization/credits`, `hooks/useCredits`, `hooks/useSubscription`, `components/dashboard/omni`) or the two unsold pack lists | BUILT, TESTED. Which pack list is the product's (owner action 7): BLOCKED_OWNER |
| C5 (P1): a replayed ref answered success without a debit, so a byte-identical produce request rendered free | `deductCreditsOnce` and `reserveProduce({ refuseReplay })` on the six produce routes and the video remix: an already-charged ref is refused (409 `duplicate_request`) before anything renders. Proven through the real client on PostgREST before and after the migration | PROVEN in isolation |
| C6 (P1): charges taken after the provider call | The chat image now takes its debit before Google is called and gives it back for a failure, a throw or an async render (which pays under its poll ref as before). The lip-sync route reserves before HeyGen and refunds a failure (read again in PART 5). `/api/orchestrate` still charges after its work, see §3 | BUILT, TESTED |
| P1 (P0): services on outside engines until `MEDIA_GOOGLE_ONLY` | Read-only audit of every server path; 15 reached an outside engine with a switch on. Each now asks its switch first (table in §2). The switches' defaults are unchanged: `AI_GOOGLE_ONLY` and `VIDEO_GOOGLE_ONLY` on, `MEDIA_GOOGLE_ONLY` off in Production | BUILT, TESTED. `MEDIA_GOOGLE_ONLY` in Production (owner action 9): BLOCKED_OWNER |
| V2 (P0, PART 4 half): studio render routes do not require the voice approval record | Decided: documented, not enforced (§3) | DOCUMENTED (decision, reversible) |
| B3 (P2): research tools' SSRF, redirect and injection handling | Re-checked. SSRF: no change needed (address rule, DNS check over every IPv6 form that carries IPv4, redirects followed by hand with each hop re-checked, a pinned lookup, a byte cap; existing tests cover decimal / hex / octal literals, redirects and DNS rebinding). Injection: see G6 | VERIFIED (code + tests) |
| G6 (P1): no source dates; no hidden-instruction regression test | The reader drops elements a visitor never sees (`hidden`, `aria-hidden="true"`, inline `display:none` / `visibility:hidden`) before the model reads the page; attributes are parsed, so a class named `hidden` stays, and inline `opacity:0` (animations) and an anti-flicker hidden `<body>` are kept. `scrape_webpage` and voice `read_webpage` return `published` (YYYY-MM-DD) from the page's own meta, `<time>` or JSON-LD. A regression test runs a page with three hidden instructions through the real reader and the real ReAct loop: none reaches the model, the visible text arrives framed as untrusted data, no tool is called | BUILT, TESTED. Grounded search still gives no source dates (Google does not return them). Deep Research migration `20261003b`: BLOCKED_OWNER |
| S1 (P2): Vapi `get_job_status` read any job id | Filters on the call's user; a call with no user reads nothing | BUILT, TESTED |
| G3 (P2): no cache metrics | The Gemini client reads `cachedContentTokenCount`, `thoughtsTokenCount` and `totalTokenCount`; every Agent G run records its cache hit ratio. The ReAct transcript keeps the same prefix from step to step, which is what implicit caching keys on | BUILT, TESTED. An explicit cache (a stored, billed resource): BLOCKED_OWNER, and only if the measured ratio justifies it |
| G7 (P1): no latency, cached-token or per-task cost baseline | `runLiveAgent` meters each run (model calls, prompt / output / cached / thinking tokens, model time, tool time, wall clock, estimated provider cost from the platform's own price table) and logs one `agent_run_metrics` line (no user id, no text). `llmText` now books Gemini's real counts under the serving model instead of characters at the flat rate. The numbers stay off the browser | BUILT, TESTED. The baseline itself needs real runs: PART 7. Production `GEMINI_TRANSPORT`: BLOCKED_OWNER |
| O1 (P1, PART 5 half): no alert for stuck jobs, expired leases or refund debts | The per-minute sweep logs `agent_g_refund_debt` (error) for a refund it could not pay, `agent_g_gave_up` (warn) for jobs whose worker died twice, `agent_g_queue_backlog` (warn) at 3+ waiting jobs, and `agent_g_sweep_failure` (error). Job ids and counts only | BUILT, TESTED. Routing them to a person (a log alert rule, or Sentry with a DSN, owner action 12): BLOCKED_OWNER |
| B1, B2: browser control, code sandbox | Decision brief: `docs/handoffs/agent-g/browser-sandbox-decision.md` (options, list prices, recommendation: Vercel Sandbox, with the existing rules unchanged) | BLOCKED_OWNER (paid host) |

## 2. P1: the paths the switches missed

Every path below reached an outside engine although its switch was on. Each now refuses, or drops the outside leg,
before any balance read or charge, and is listed in `GATED_ENTRIES` (pinned by test).

| Path | Engine it reached | Switch |
|---|---|---|
| Chat: music request | Udio / MusicGen | MEDIA |
| Chat: Replicate intents | Replicate | MEDIA |
| Chat: interior redesign, 3D room | outside image / 3D engines | MEDIA |
| Chat: avatar | HeyGen | MEDIA |
| Chat: music video | Udio leg (dropped) | MEDIA |
| Object removal route | outside inpainting | MEDIA |
| Voice training route | outside voice engine | MEDIA |
| Studio models route | outside image engine | MEDIA |
| Genjutsu motion / face swap | outside video engines | MEDIA |
| Legacy wizard's media legs | outside engines | MEDIA |
| Image-creator jobs | outside image engine | MEDIA |
| Film lip-sync cascade, Georgian song MusicGen bed, motion clip music | HeyGen / MusicGen | MEDIA |
| `/api/orchestrate` text, app text jobs | OpenRouter / OpenAI / DeepSeek | AI (on by default) |
| Call STT, Telegram voice STT, Cartesia TTS fallback | outside STT / TTS | AI (on by default) |
| Hero / promo renders | outside video | VIDEO (on by default) |

Also: an explicit film request is routed first, so a brief that mentions "room" or "space" no longer gets "Upload a room
photo". **With `MEDIA_GOOGLE_ONLY` off (Production today), the MEDIA rows still reach their engines.** Turning it on is
owner action 9; until then nine services keep forbidden primary engines (certification §L).

## 3. Decisions taken (documented, reversible)

- **V2: the studio render routes do not require the voice approval record.** The server cannot tell a voice yes from a
  tap: both arrive as a request from the same signed-in user, and the words in a voice approval are text the client
  sends. Requiring an approval id on `/api/generate/*` would stop nothing a hand-made request cannot also claim. The
  gate PART 4 built is against the **model**, which runs in the browser: the call starts nothing without the user's own
  words after the price, and it fails closed when the record is refused (`liveVoiceGate.test.tsx`). The server's
  record (`POST /api/agent/approvals`) is the audit trail. Model output never authorizes anything on the server: the
  server judges the user's words again, and the price, quote signature and balance checks are the same as for a tap.
- **The lip-sync charge stays a separate charge until the owner decides**; it is now shown before Generate.
- **`/api/orchestrate` (legacy) keeps charging after its work.** Its text path is refused under `AI_GOOGLE_ONLY` (on by
  default), and its tool path runs four local text functions (summarize, translate, format, sentiment) that call no
  provider, then charges 1 credit. No page or module calls the route. A failed charge after free local work costs
  nothing; retiring the route is a candidate for the PART 7 clean-up.
- **The run metrics stay on the server.** The route strips them from the reply; they are in the deployment's logs.
- **Hidden text is judged by inline markup only.** Text hidden by a stylesheet class cannot be seen without the CSS;
  the untrusted-data framing stays the main defence against it.

## 4. Tests and checks

- Jest: 792 suites passed (3 skipped), 12,229 tests passed, 0 failed (full run before each push).
- `tsc --noEmit`: 0 errors. `next lint`: 0 errors, 33 warnings (all present before PART 5).
- New suites: `lib/ai/usageMetrics.test.ts`, `lib/agent/react/hiddenInstruction.test.ts`,
  `lib/agent/media/sweepAlerts.test.ts`, `lib/voice/webhook-processing.test.ts`, `lib/credits/priceTables.test.ts`,
  `components/studio/lipsyncCharge.wiring.test.ts`, the ledger race script (`scripts/lease-isolation/ledger-race.sh`,
  53/53) and `lib/orchestrator/ledgerOnce.pg.test.ts`. Extended: `readPage` (+28), `llmText`, `bindLiveAgent`,
  the agent run route, the sweep route, the Gemini client, the montage worker, Live actions.
- The hidden-instruction test was checked against a reader with the stripping removed: it fails, as it should.
- **CI incident:** after C5, PR #50's verify check went red on two stale source pins (the remix route's
  `deductCreditsOnce`, the interior reserve's `refuseReplay`). Fixed in `27bb4c03`; since then the full suite runs
  locally before every push.

## 5. What can still fail for a real user

- **Money owed but not paid back** if the ledger is down for long: the sweep now raises `agent_g_refund_debt`, but no
  person receives it until a log alert rule or Sentry is set (owner action 12).
- **Forbidden engines are still primary for nine services in Production** while `MEDIA_GOOGLE_ONLY` is off.
- **The lip-sync charge** is now visible but still separate; a documentary whose composite fails cannot tell the user
  whether the speaking head was charged (it was refunded if the head itself failed).
- **The assistant's pack prices** match the Credits window, but two other pack lists remain in the code until the owner
  picks one (the ratchet keeps them off every screen).
- **Pages hidden by CSS classes** reach the model as visible text; the model is told it is untrusted data and no live
  tool can spend or publish.
- **Free operations have ceilings, not prices.** A user can spend up to the daily ceiling of dubbing, decks, upscales
  and analyses at the platform's cost.
- **Metrics are estimates.** The cost uses the platform's price table; Production still bills Gemini on the API key.
- **No browser control or code running** until the owner picks a host.

## 6. Owner decisions (BLOCKED_OWNER)

1. **Lip-sync charge:** keep separate (as now), fold into the film price, or drop.
2. **Pack list** (owner action 7): 10 / 20 / 50 ₾ as sold, or another; the other two lists then get deleted.
3. **Prices for dubbing, presentation, upscale, isolation** (owner action 5), or keep them free with the ceilings.
4. **`MEDIA_GOOGLE_ONLY` in Production** (owner action 9).
5. **Browser / sandbox host** (`browser-sandbox-decision.md`): A, B or not now, and a spend limit.
6. **Alert routing:** a log alert rule on `ops_marker` lines, or a Sentry DSN (owner action 12).
7. Still open: an explicit context cache, Deep Research migration `20261003b`, Production `GEMINI_TRANSPORT`, paid
   Gemini test calls, PR #50 merge, the Production deploy, the A–D Preview run as admin, a real-device Live call.

## 7. Next: PART 6

One-window UX: task cards with credits, retry, steps and resume; the Library; mobile and KA / EN / RU checks.
