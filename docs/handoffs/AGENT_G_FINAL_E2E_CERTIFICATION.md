# Agent G — final end-to-end certification

The owner asked for this on 2026-10-10 at 05:49Z (Master Task thread, AGENT G AUTONOMOUS EXECUTION MASTER TASK), with
the Gemini supplement at 06:00Z; on 12:42Z / 12:44Z the owner set the order (PART 6, then PART 7's checks that need no
approval, then the pricing audit). This document closes PART 7. It covers the work of PART 0–7 on branch
`claude/launch-certification-wmvitt` (draft PR #50). Each part has its own report in `docs/handoffs/agent-g/`.

**How to read the labels.** BUILT ≠ TESTED ≠ VERIFIED ≠ PROVEN_IN_PRODUCTION.

| Label | Meaning here |
|---|---|
| PROVEN | Ran for real on the real system (Production, or a Preview with a real signed-in session), with evidence |
| PROVEN IN ISOLATION | Ran for real on a throwaway Postgres 16 + PostgREST 12.2.3 built from Production's shapes (Production's own ledger function bodies, md5-matched) with real FFmpeg; the shared database was not touched |
| BUILT, TESTED | Unit, component or browser tests with the server or provider mocked |
| BUILT_NOT_PROVEN | Built; no real run on the current code |
| PARTIAL / MISSING / DISABLED | Part of it works / not built / built and switched off on purpose |
| BLOCKED_OWNER | Waits on a step only the owner may take (deploy, merge, migration, money, paid infrastructure, a flag, a secret, the owner's admin session) |

---

## 1. Executive verdict

**NO-GO** for opening Agent G's autonomous execution to Production users. The verdict follows the Master Task's rule:
NO-GO while any critical security, billing or task-integrity item is open. These are open:

1. **No real end-to-end run since PART 1.** Every path PART 1–7 added has run in tests and in isolation, not on a
   Preview with a real signed-in user and not in Production. The last real run is 2026-10-09's Preview admin run (Stop
   and a montage MP4 PROVEN in the database). The Preview runs need the owner's admin session; Claude never signs in as
   the owner (BLOCKED_OWNER).
2. **Provider boundary open in Production.** 9 of the 22 services still run a forbidden primary engine until
   `MEDIA_GOOGLE_ONLY` is turned on (owner action 9). The switch and its 34 gated paths are built and tested.
3. **Money.** No payment has ever completed (every BOG checkout `init_failed`, merchant side). Production sells every
   Veo video below its cost (an 8 s Fast film: 25 credits for 3.63 ₾ of cost, −77 %). The pricing audit wrote the one
   price model (`docs/handoffs/pricing/SERVICE_UNIT_ECONOMICS.md`); it waits for the owner's approval and then a deploy.
   Two billing defects it found are fixed on the branch, not in Production (§16 D15, D16).
4. **Alerts reach no person.** The sweep logs unpaid refunds, given-up jobs, backlog and its own failure, but no alert
   rule or Sentry DSN routes them to anyone (owner action 12). A refund debt could sit unseen.
5. **No real device.** No iPhone Safari run of the cards and players, no real Live Voice call on the current code.

**What holds today, with evidence.** No known open defect in Agent G's money or integrity paths:
- charge once, refund once, one job per approval, one winner among eight racing ticks, recovery after a dead worker and
  a server restart, Stop that kills the encoder and pays back once: PROVEN IN ISOLATION (§9)
- the same-ref double-debit race is fixed in Production (`20261002d`, applied 2026-10-10 11:05Z on the owner's word;
  function hashes read again at 13:52Z and still match the migration) (§10)
- only a person approves: a tap, or the user's own spoken yes judged on the server; forged approvals, another user's
  run, a model's "yes" and an unknown tool are refused (§8, §12)
- every Agent G route refuses an anonymous or forged-token caller on a production build (§12)

**Production is unchanged by PART 0–7** except migration `20261002d`. Production serves `6c7dff4`;
`AGENT_G_MEDIA_EXEC` is off there and `AGENT_G_FILE_ANALYSIS` is off everywhere.

## 2. Starting and ending commit

| | Commit | When |
|---|---|---|
| Start | `97acd163` (PART 0 baseline: jest 747 suites / 11,391 passed) | 2026-10-10 ~06:15Z |
| Code head certified here | `cc4484f3` (PART 7 fixes, the two billing fixes, the pricing engine, a type fix, a test pin) | 2026-10-10 |
| This document | the commit that carries it | 2026-10-10 |

| Part | Commits |
|---|---|
| 0 audit, gap analysis | `95a5e015` |
| 1 one contract, intent reader, capability registry | `42fbf0fb` |
| 2 runs, one status model, memory | `438cc918`, `bd2790e0` |
| 3 edit action, analyze my file | `60d1cfdd`, `7a4f99b1` |
| 4 Live Voice parity | `be0f9dcf`, `86bc9286`, `94792785`, `480c62ff` |
| 5 security and billing | `df670cca`, `2e6aedab`, `f17ebd90`, `af2c1496`, `a705e8db`, `27bb4c03`, `49352d04`, `6fd158e4`, `058409e0`, `ded93632`, `7c0e1c69`, `cccfba3a` |
| 6 one-window UX | `c51959fc`, `7050d91b`, `863ed698`, `73c7acfe`, `d926cc62`, `dfd797dd`, `5826b326` |
| 7 checks, fixes, this document | `0ac386f2` (runs on a real database), `1e8bcc07` (intent corpus 48 → 69), `78fe3ab4` (what the production-build browser run found: one product defect and two test defects, §16 D12–D14), `448b0a22` (two billing defects the pricing audit found, §16 D15–D16), `3f3fa34d` (the pricing engine and SERVICE_UNIT_ECONOMICS.md), `7c1a061a` (a type fix to 448b0a22), `cc4484f3` (a parity test still pinned the D16 one-price quote), the docs commit |

## 3. Branch and PR

- Branch `claude/launch-certification-wmvitt` → `main`, **draft PR #50**, not merged (a merge needs the owner's word).
- Preview of the branch: https://avatar-g-frontend-v3-git-ef1fad-kintsurashviligaga-ops-projects.vercel.app (shares the
  Production Supabase project; Agent G media there is open to admins only).
- Production: `main` = `6c7dff4` (PR #52), deployed 2026-10-09 16:01Z.
- Not touched: draft PRs #43 (GCP), #44 (Astra's Vertex work), #51 (auth review; its fixes shipped via #52).
- CI: `verify`, `preview-e2e` and the Vercel Preview run on every push; this commit's result is on PR #50 and in its
  body. The previous head, `5826b326`: all three green.

## 4. Architecture before and after

**Before (PART 0 §5, `97acd163`).** Four doors each routed words by their own rules:
- the typed chat ran a 19-step keyword chain and never reached the agent
- the composer's Run in Product / Swap / Remix started a paid job on any Enter, a question included
- Live Voice took the model's `confirmed: "yes"` as the user's approval
- the ReAct agent (voice `ask_agent_g`, the terminal) had a typed tool allowlist with read / prepare / quote tools

Work landed in `generation_jobs` under four status vocabularies. There were no multi-step runs, no resume, and no
server record of a voice approval. 14 dead orchestration stacks sat beside the live code. `deduct_credits` could charge
one ref twice under a race.

**After (this branch).**

```
words (chat · voice · terminal)
  └─ lib/agent/intent.ts            one KA/EN/RU reader: control | talk | question | feedback | act | unavailable | chat
       └─ lib/agent/chatTurn.ts     the chat's next step (stop · status · continue · ask · re-quote · pass), pure
            └─ capability registry  lib/agent/capabilities.ts: 26 records (22 services + montage, MP3, edit, analyze)
model tools (lib/agent/tools/registry.ts): read · prepare · quote · inspect — never execute, spend or publish
  quote ──► signed plan card (HMAC, 30 min, fixed job id) ──► the user's tap / own spoken yes
            └─ confirmed action route ──► generation_jobs row ──► lease worker (heartbeat 15 s, lease 90 s, one retry)
                 └─ ffmpeg ──► QC ──► result in the bubble ──► Library;  Stop kills ffmpeg;  refund owed in the failing write
multi-step run (lib/agent/run): one agent-run row, steps are ordinary jobs; CAS writes, 30 s tick lease,
  a priced step waits for its own yes, resume reuses delivered steps;  one Task API (/api/tasks), seven statuses
voice: transcript gate + fingerprint + 3 s countdown; the server judges the words again (/api/agent/approvals)
money: deduct_credits_once (20261002d), replayed refs refused, daily ceilings on free work; sweep raises alerts
```

Kept as they were, on purpose: the studio panels keep their own priced buttons; the 14 dead stacks are pinned by a
ratchet (their importers may only shrink) and removed only on the owner's word.

## 5. Implemented capabilities

| Capability | Where | Label |
|---|---|---|
| One contract set (request, intent, plan, approval, run, artifact) | `lib/agent/contracts.ts` | BUILT, TESTED |
| One intent reader, KA / EN / RU; a question never spends | `lib/agent/intent.ts`, corpus `lib/agent/intentCorpus.ts` (69 sentences: KA 26, EN 22, RU 21) | BUILT, TESTED (69 / 69) |
| Typed controls: stop, status, continue | `lib/agent/chatTurn.ts`, OmniStudio | BUILT, TESTED (browser, mocked) |
| Capability registry: 26 records with route, price key, approval, timeout, retry, idempotency, cancel, QC, artifact, label | `lib/agent/capabilities.ts` | BUILT, TESTED (pinned to the code) |
| Function declarations generated from the registry | `lib/agent/tools/declarations.ts` | BUILT, TESTED offline; live comparison BLOCKED_OWNER (paid calls) |
| Montage: clips cut to a track on the beat → MP4 in the chat | `lib/agent/media/montage*` | PARTIAL: Stop and an MP4 PROVEN in the database on the Preview (2026-10-09); PROVEN IN ISOLATION; BUILT_NOT_PROVEN on the current code |
| MP3 from a file or a direct media link (platforms refused by name) | `lib/agent/media/audio*` | PROVEN IN ISOLATION; real-internet run local (2026-10-09); BUILT_NOT_PROVEN live |
| Edit of the user's video or Agent G's last result (trim, speed, frame, look, fades, volume, caption, still) | `lib/agent/media/edit*` | PROVEN IN ISOLATION (real ffmpeg); BUILT_NOT_PROVEN live |
| Multi-step runs (plan, start once, a priced step's own yes, stop, resume, `partially_completed`) | `lib/agent/run/*`, `/api/tasks` | PROVEN IN ISOLATION (§9); BUILT_NOT_PROVEN live |
| One status model (7 words) across stores, tray and cards | `lib/tasks/statusModel.ts` | BUILT, TESTED |
| Run events (numbered, `after=n`) | `lib/agent/run/runEngine.ts` | BUILT, TESTED |
| Memory every surface reads, capped; delete one or all; auto-memory switch | `lib/memory/context.ts`, `/memory` | BUILT, TESTED |
| Analyze my file (whole file by reference; YouTube analysis only, never a download) | `lib/agent/media/analyze*` | BUILT, TESTED offline; DISABLED (`AGENT_G_FILE_ANALYSIS` off everywhere); live BLOCKED_OWNER |
| Voice parity: the user's own yes, fingerprint, plan numbers, stop and status, answers into the chat | `lib/voice/*`, `components/voice/live/*` | BUILT, TESTED (browser with a simulated Google socket); real device BUILT_NOT_PROVEN |
| Task cards: steps, credits held / spent / paid back, Retry, the failed step marked | `lib/agent/media/taskSteps.ts`, `components/studio/Agent*Card.tsx` | BUILT, TESTED |
| Same-ref charge race fixed; replayed refs refused | `20261002d`, `deductCreditsOnce`, `reserveProduce({ refuseReplay })` | APPLIED and verified in Production; PROVEN IN ISOLATION |
| Daily ceilings on work that bills no credits | dubbing 10, presentation 30, upscale 30, analyze 100, montage 40 | BUILT, TESTED |
| Run metrics (tokens, cache hits, time, estimated cost) and sweep alerts | `lib/ai/usageMetrics.ts`, `lib/agent/media/sweepAlerts.ts` | BUILT, TESTED; routing to a person BLOCKED_OWNER |
| Page reads drop hidden text and carry the page's date | `lib/web/readPage.ts` | BUILT, TESTED |

## 6. The 22 services (and Agent G's own operations)

No service is PROVEN end to end on the current code: every browser spec mocks its generation route and every route test
mocks its provider and ledger. "Last real result" is Production's history (read only, `generation_jobs`); it proves a
path worked on an earlier build, not on PR #50. J asks for one real path per service, or BLOCKED / DISABLED: a real run
of a paid engine needs the owner's word, so the provider services stay at their labels.

| # | Service | Path today | Last real result in Production | Label |
|---|---|---|---|---|
| 1 | video.generate | storyboard → Veo + Gemini + ElevenLabs → assemble | `film` 63 done / 19 failed, last 10-04 | BUILT_NOT_PROVEN |
| 2 | video.music-video | as #1 + lip-sync close-ups (+20 credits a pass, shown since PART 5) | inside `film` | BUILT_NOT_PROVEN |
| 3 | video.product-ad | Veo, else a Ken Burns still | 1 / 0, 09-30 | BUILT_NOT_PROVEN |
| 4 | video.character-swap | roop on Replicate (refused under `MEDIA_GOOGLE_ONLY`) | none | BLOCKED_OWNER |
| 5 | video.motion | Kling on Replicate (refused under the switch) | none | BLOCKED_OWNER |
| 6 | video.vfx | Veo scene | 0 / 2 (both refunded in full) | BUILT_NOT_PROVEN |
| 7 | video.remix | ffmpeg + ElevenLabs; restyle / background / character / redub on outside engines (refused under the switch) | 15 / 0, 09-29 | BLOCKED_OWNER |
| 8 | video.editing | ffmpeg in the app; Agent G montage card | 1 / 2, 10-09 (the Preview admin run) | PARTIAL (Stop + MP4 PROVEN in the database; run PROVEN IN ISOLATION) |
| 9 | image.generate | NanoBananaAI (Google image model under the switch) | 125 / 16, 10-06 | BLOCKED_OWNER |
| 10 | image.photoshoot | as #9 | inside `image` | BLOCKED_OWNER |
| 11 | image.interior | as #9; the 3D plan on Gemini | inside `image` | BLOCKED_OWNER |
| 12 | image.culling | on the device, nothing leaves it | none (by design) | BUILT_NOT_PROVEN |
| 13 | avatar.talking | ElevenLabs + HeyGen or SadTalker (refused under the switch) | none | BLOCKED_OWNER |
| 14 | music.generate | Lyria; Udio / MusicGen when picked (refused under the switch) | 107 / 4, 10-06 | BLOCKED_OWNER |
| 15 | music.remix | none; Agent G says it is not available | none | MISSING (DISABLED in every door) |
| 16 | voice.dubbing | ElevenLabs Scribe + TTS, Gemini translation; charges nothing (ceiling 10 a day) | 3 / 3, last success 08-01 | PARTIAL |
| 17 | text.write | Gemini chat | chat traffic | BUILT_NOT_PROVEN |
| 18 | design.presentation | Gemini outline + images; charges nothing (ceiling 30) | none | PARTIAL |
| 19 | design.model3d | TRELLIS on Replicate (refused under the switch) | 1 / 3, 10-06 | BLOCKED_OWNER |
| 20 | code.assistant | Gemini chat; no sandbox | chat traffic | BUILT_NOT_PROVEN |
| 21 | code.terminal | none; waits for the sandbox host | none | MISSING (DISABLED in every door) |
| 22 | research.web-search | Gemini Google Search grounding | chat traffic | BUILT_NOT_PROVEN |
| A1 | agent.montage | quote → Start → lease worker → ffmpeg → QC → bubble → Library | see #8 | PARTIAL |
| A2 | agent.audio-extract | quote (rights, platform refusal) → Start → worker → MP3 | none in Production (flag off) | PROVEN IN ISOLATION |
| A3 | media.edit | quote → Start → worker → ffmpeg → QC | none (flag off) | PROVEN IN ISOLATION |
| A4 | agent run (two or more steps) | plan → Start → steps on the queue → each step's own yes when priced | none (flag off) | PROVEN IN ISOLATION |
| A5 | media.analyze | Gemini, the file by reference | none (flag off everywhere) | DISABLED; live BLOCKED_OWNER |

Totals for the 22: 9 BLOCKED_OWNER, 8 BUILT_NOT_PROVEN, 3 PARTIAL, 2 MISSING, 0 PROVEN. Unchanged since the
certification run of 2026-10-10 05Z (service audit §7); PART 0–7 built Agent G's own operations, not new engines.

## 7. Every tool and its real executor

**The ReAct agent's model tools** (`lib/agent/tools/registry.ts`, pinned by `registry.test.ts`). A model can call only
these; `defineTool` refuses any other effect at load.

| Tool | Effect | Real executor | Offered when |
|---|---|---|---|
| `web_search` | read | Gemini Google Search grounding (`lib/agent/tools/googleSearch.ts`) | always |
| `scrape_webpage` | read | `lib/web/readPage` (SSRF guard, redirects re-checked, byte cap, hidden text dropped, page date) | always |
| `prepare_instagram_post` | prepare | assembles a draft for the user; never publishes | always |
| `quote_montage_to_music` | quote → `montage_run` | `lib/agent/media/montageExec` quote (ffprobe, beat plan, signed token) | files attached and `AGENT_G_MEDIA_EXEC` open |
| `quote_audio_from_link` | quote → `audio_extract_run` | `lib/agent/media/audioExtract` quote (host policy, rights, HEAD probe) | `AGENT_G_MEDIA_EXEC` open |
| `quote_media_edit` | quote → `media_edit_run` | `lib/agent/media/editExec` quote (owner check, ffprobe, edit plan) | `AGENT_G_MEDIA_EXEC` open |
| `analyze_media` | inspect | `lib/agent/media/analyzeExec` (Gemini by reference, one transport, no fallback) | `AGENT_G_FILE_ANALYSIS` open (off everywhere) |

**Confirmed actions** (never declared to a model; reached only by the user's tap or own spoken yes, with the session
and the signed quote): `montage_run` → `POST /api/agent/media/montage {action:'run'}` → `montageWorker`;
`audio_extract_run` → `POST /api/agent/media/audio` → `audioWorker`; `media_edit_run` → `POST /api/agent/media/edit` →
`editWorker`. Each queues one `generation_jobs` row per quote; a second press replays the same job.

**Task API** (`/api/tasks`, owner-only; another user's id is `not_found`): `plan` (signs the steps, runs nothing),
`run` (the user's tap; creates the run once), `approve` (the user's yes to one step's own price and quote id),
`resume`, `cancel` (the run and every step job it started), `GET ?id&after` (the run, its steps, new events). Run steps
are `audio_extract`, `montage` and `edit`, executed by the same workers as the single jobs (`lib/agent/run/runAdapters.ts`).

**Live Voice functions** (`lib/voice/liveTools.ts`, 24; executed in the browser by `components/voice/live/liveActions.ts`):

| Function | What really runs |
|---|---|
| `get_screen_state` | reads the studio: tool, settings, price and fingerprint, Agent G's cards with their numbers, running tasks |
| `prepare_generation`, `update_settings` | fill a studio tool and return its price and fingerprint; spend nothing |
| `start_generation` | the studio's own render, only after the user's own words after the price are a clear yes (transcript gate, fingerprint unchanged, 3 s countdown, server record `POST /api/agent/approvals` first); the route charges as for a tap |
| `agent_task` | `start` a quoted Agent G card by its number (same gate; its run request carries the user's words, judged again on the server), `stop`, `status` |
| `extract_audio` | `plan` → the MP3 quote route; `start` = `agent_task start`; `stop` |
| `ask_agent_g` | `/api/agent/run`: the ReAct agent with the registry above; its answer, sources and quoted cards land in the chat |
| `read_webpage` | `lib/web/readPage` on the server, as `scrape_webpage` |
| `montage` | drives the studio's free Montage editor through its own hook (open, music start, export, state) |
| `stop` | the reply being written, the tray's renders, followed server jobs (`POST /api/tasks` cancel), Agent G's running cards |
| `click`, `type_text` | press or type in the page; the click guard refuses spend, pay, delete, sign-out and password controls |
| `download`, `use_result` | save a result (`saveMedia`) or carry it into a tool |
| `open_studio`, `open_panel`, `open_url`, `chat_send`, `new_chat`, `set_chat_model`, `scroll_chat`, `call_view`, `show_code`, `end_call` | navigation and chat controls; none spends |

## 8. Text and voice parity

| Ability | Text | Voice | Parity |
|---|---|---|---|
| Start a priced studio render | the panel's Generate or Agent G's Create card with the price | the user's own yes after the told price; 3 s countdown; server record | yes; real device BUILT_NOT_PROVEN |
| Start Agent G's montage / MP3 / edit | Start on the plan card | `agent_task start <n>` with the user's words, judged on the server | yes (browser test for the MP3 card; the same code for the others) |
| A changed prompt or price after the quote | the card re-quotes | refused (`changed_since_price`) | yes |
| Stop | „stop" / Stop on the card / the tray | `stop` / `agent_task stop` | yes (one cancel per job, browser-tested) |
| Status | „where are you?" | `agent_task status`, `get_screen_state` | yes |
| A model's "yes" | not possible (only a tap) | never enough; the user's own words decide | yes |
| A two-step run | one message → the run card | **not available**: the Live planner has no run step | **no** (§16 D1) |
| Analyze my file | chat (flag off) | through `ask_agent_g` only where the flag is open | partial; flag off everywhere |
| Answers and sources in the chat | yes | yes, also after the call ends | yes |

## 9. Queue, recovery and cancel evidence

All on a throwaway Postgres 16 + PostgREST 12.2.3 (`scripts/lease-isolation/run.sh`, opt-in, skipped in CI), with
Production's `deduct_credits` / `refund_credits` / `update_credits_balance` bodies and real FFmpeg (ffmpeg-static).

| Suite | Result | What it proves |
|---|---|---|
| `lib/agent/media/leaseIsolation.pg.test.ts` | 7 / 7 | E: a worker dies mid-render, the sweep runs attempt 2 and delivers, charged once. F: two deaths, given up, refunded once, a second sweep pays nothing. A refund debt is paid once by the next sweep. The owner's Stop pays back once. An abandoned hold is failed and paid back. Eight workers race, exactly one wins. URL-to-Audio E / F |
| `lib/agent/run/runIsolation.pg.test.ts` (PART 7) | 6 / 6 | **I** one message, three steps (a video's sound → a cut of two clips to it → a noir look with fades); real results: MP3 8.05 s, master H.264 / AAC 6 s, graded 6 s; 4 rows (1 run + 3 steps); a double tap is one run. **E** the cut's worker dies and the server restarts; after the lease lapses the sweep runs attempt 2 and a fresh process finishes the run from the database alone; the late worker is told it lost the job. **F** Stop while ffmpeg encodes the priced cut kills the encoder within 3 s; ledger −7 then +7, the delivered sound stays, a second sweep pays nothing, a second stop is `not_running`. **G1** a priced step waits for its own yes; another user's approval `not_found`, a forged quote `quote_changed`, a step not waiting `not_waiting`; eight ticks race: one worker, one job, one −7 charge. **G2** a failed priced step ends `partially_completed`, refunded; resume by another user `not_found`; two resumes give the same run; the resumed run reuses the delivered sound (same task id) and charges −7 once. **H** another user cannot start, stop or resume the run, and an edit naming the other user's upload or result is refused at the quote (`not_yours`) |
| `lib/orchestrator/ledgerOnce.pg.test.ts` | 7 + 7 (before / after `20261002d`) | a replayed charge is refused before anything renders; after the migration eight concurrent twins give one debit |
| `scripts/lease-isolation/ledger-race.sh` (PART 5) | 53 / 53 | the same-ref race on Production's old function charges twice; on the migrated one never |
| Real-FFmpeg cancel tests (`montageExec.ffmpeg`, `audioLive.ffmpeg`, `editLive.ffmpeg`) | pass | Stop kills the running encoder; a redirect onto YouTube is refused mid-download |
| Preview, 2026-10-09 (owner's admin session) | PROVEN in the database | Stop: job `2bb56123` (16:49Z, 0 credits). Montage: job `cf55ed33`, 16:57:00Z → 16:58:24Z, 10.57 s, 0 credits, audit rows |

The run evidence (steps, quotes, results, ledger) is in `/mnt/project-files/reports/agent-g/run-isolation-evidence.json`.
The quote tokens in it are signed with the test's own key, not a Production secret.

## 10. Credits and billing

**Production ledger, read only, 2026-10-10 13:52Z:** 222 rows (125 debits, 97 credits); 0 duplicate debit refs, 0
duplicate credit refs, 0 debits without a ref; 0 negative balances. `generation_jobs`: 373 rows, 0 live, 0 stuck, 2 lease
rows, 0 run rows. Last ledger row 2026-10-09 16:09Z. Unchanged since the PART 5 read-back.

**`20261002d` in Production:** `deduct_credits` `b3359006…`, `deduct_credits_once` `f64d747a…`, `refund_credits`
`d6808dfd…`, each matching the hash recorded in the migration; anon and authenticated may not execute any of them;
indexes `credit_ledger_user_ref_negative_uniq` and `…_positive_uniq` valid.

| Check | Label |
|---|---|
| Charge once per ref, refund once, debt paid once | PROVEN IN ISOLATION; ledger in Production PROVEN clean (read only) |
| Same-ref race | fixed and verified in Production (PART 5) |
| Replayed ref renders free | refused (409 `duplicate_request`), PROVEN IN ISOLATION |
| Charge before the provider call (chat image, lip-sync) | BUILT, TESTED |
| Agent G montage, MP3, edit | free (the owner's „უფასო", price 0); credits line says so |
| A priced run step | gated by its own yes and quote id; tested with a re-signed 7-credit quote, since no Agent G price exists |
| Lip-sync +20 a pass | shown before Generate; keep / fold / drop is BLOCKED_OWNER |
| Free work on paid engines (dubbing, presentation, upscale, analyze) | daily ceilings; the proposed prices (`SERVICE_UNIT_ECONOMICS.md` §6) wait for the owner's approval |
| One price table | the assistant quotes what is charged and sold (10 / 20 / 50 ₾ packs); two dead pack lists kept off every screen by a ratchet. The pricing audit's engine (`lib/credits/unitEconomics.ts`) holds every proposed price to the 62 % floor in tests; the live table moves to it after approval and a deploy |
| Video price against cost | BELOW COST in Production: every tier and length, −49 % to −113 % (pricing audit §5) |
| Payments | none ever completed (BOG `init_failed`); BLOCKED_OWNER |

## 11. Provider compliance

| Area | State | Label |
|---|---|---|
| Agent G's own operations | ffmpeg in the app; Gemini through the one transport (analyze); no other engine | compliant |
| Silent fallback | none from one outside engine to another; `GEMINI_TRANSPORT` fails closed, never falls back to the API key | BUILT, TESTED |
| Text | `AI_GOOGLE_ONLY` (on by default): Gemini only; Claude reachable only behind flags that are off | BUILT, TESTED |
| Media | `MEDIA_GOOGLE_ONLY` (off in Production): with it on, image goes to Google's image model and 34 gated paths refuse before any charge; with it off, 9 services keep a forbidden primary engine | **FAILED in Production until the owner turns it on** (action 9) |
| Ratchet | `__tests__/provider-boundary.test.ts`: 60 files / 22 outside vendors frozen; the list may only shrink | BUILT, TESTED |
| No HeyGen / Replicate automatic switching | none (one engine per job, a miss refunds) | BUILT, TESTED |

## 12. Security findings

**PART 7 probes (production build on localhost, 2026-10-10 ~13:46Z).** 25 calls to every Agent G route, anonymous and
again with a forged bearer token: `/api/tasks` GET / plan / run / approve / resume / cancel and the old
`/api/tasks/<id>/status|cancel` → 401; `/api/agent/media/{montage,audio,edit,analyze}` quote and run (with SSRF
targets `169.254.169.254`, `127.0.0.1:5432`, `10.0.0.1`, `localhost`) → 404 before any fetch; `/api/agent/media/sweep`
→ 403 without the cron secret (POST 405); `/api/agent/approvals`, `/api/agent/run`, `/api/agent/feedback` → 401;
`/api/agent/proposals*` → 403; `/api/agent/video-queue*` → 401. Nothing answered 200. The forged-token half shows the
routes fail closed when the token cannot be verified; the owner checks themselves are proven by the unit suites and H.

| Area | Evidence | Label |
|---|---|---|
| Anonymous / forged caller | the probes above | PROVEN (local production build) |
| Cross-user | H in isolation; owner checks in `app/api/tasks/[taskId]/owner.test.ts`, the run and media route suites | PROVEN IN ISOLATION |
| Forged approval | G1 in isolation; quote HMAC and fingerprint suites | PROVEN IN ISOLATION |
| SSRF | `lib/web/publicFetch` (address rule, every IPv6 form carrying IPv4, redirects re-checked, pinned lookup, byte cap) and the security pack | BUILT, TESTED |
| Forbidden tool | `defineTool` refuses execute / publish / spend effects; unknown tools come back as observations | BUILT, TESTED |
| Unauthorized provider | provider ratchet; `MEDIA_GOOGLE_ONLY` gates | BUILT, TESTED (switch off in Production) |
| Prompt injection from pages | hidden-instruction regression through the real reader and ReAct loop | BUILT, TESTED |
| Security pack | 50 suites, 833 passed, 8 skipped (the opt-in database suites), 0 failed | TESTED |
| HawkScan | not run: no `HAWK_API_KEY` | not available |

Earlier findings still open: a film's master link fix (status id leaked it) is on PR #50, not deployed;
`/api/business/*` answer 500 instead of 401 (no data leaves); `/api/app/status` names which provider keys are set (names
only). V2 (studio render routes do not require the voice approval record) is a documented decision (PART 5 §3).

## 13. Test totals

| Check | Result |
|---|---|
| `jest` (whole repo, `--maxWorkers=3`) | 801 suites passed, 4 skipped (805); 12,398 tests passed, 26 skipped, 0 failed (the first full run failed 1: a parity test still pinned the one-price product quote, fixed in `cc4484f3`) |
| `tsc --noEmit` | 0 errors |
| `next lint` | 0 errors, 33 warnings |
| `next build` (dummy Supabase env, as CI) | OK |
| Playwright, every committed spec (33 files), **production build** | 283 passed, 7 skipped, 0 failed (290) on the final code (second run, 7.1 min). The first run on the same build: 281 passed, 2 failed: `landing.spec.ts:256` and `:318` (phone) failed in the shared setup step, where Escape closes the sheet the video link opens, and the sheet stayed open. Alone, the whole landing spec ×3 passes 162 / 162, and 28 probes (CPU ×6, slow API and chunks) lost no Escape. Cause not found: D17 |
| Playwright, every committed spec, **`next dev`** | 276 passed, 7 skipped, 7 failed (290). Run alone with 1 worker: ui-newtools ×2 pass; landing ×3 (the dev-server effect PROVEN 2026-10-09 §4.17), ui-image:231 (the same 0×0 image queue; also failed on dev 2026-10-09) and live-voice:30 (1 of 2 on a warm dev server, lazy panel mount) still fail on dev. All 7 pass on the production build |
| Isolation (real Postgres + PostgREST + ffmpeg) | lease 7 / 7, run 6 / 6, ledger once 7 + 7, ledger race 53 / 53 (PART 5) |
| Security pack | 833 passed, 8 skipped, 0 failed |
| Intent pack (KA / EN / RU) | 12 suites, 395 passed; corpus 69 / 69 |
| Real FFmpeg | the montage, audio and edit ffmpeg suites; the isolation runs above |
| Real provider | none in PART 7 (paid calls need the owner's word) |
| Mobile regression | Chromium at 390 / 820 / 1280 px in the browser specs; no real iPhone |

Skipped tests are the opt-in database suites (they need the isolation harness) and tests that skip themselves outside
their environment; none was skipped to get green.

## 14. Real Preview E2E evidence

| Run | When | Result |
|---|---|---|
| Vertex: Gemini text inference with the Preview's Workload Identity | 2026-10-08 18:28:55Z | PROVEN |
| Agent G montage Stop, Preview admin | 2026-10-09 16:49Z | PROVEN in the database (job `2bb56123`, 0 credits) |
| Agent G montage to MP4, Preview admin | 2026-10-09 16:57–16:58Z | PROVEN in the database (job `cf55ed33`, 10.57 s, 0 credits) |
| Everything PART 1–7 added (runs, edits, voice approvals, cards, analysis) | — | **not run**: needs the owner's admin session (run sheet `docs/handoffs/2026-10-09-preview-run-sheet.md`, A–D in about 6 minutes) → BLOCKED_OWNER |

## 15. Production deployment readiness

- **Code:** deployable with every new path off (`AGENT_G_MEDIA_EXEC` unset = off in Production; `AGENT_G_FILE_ANALYSIS`
  off). No migration is pending for PR #50 (`20261002d` is already in Production). No new environment variable is
  required.
- **Not ready to open:** the five NO-GO items in §1. Opening Agent G in Production is a flag change after a Preview run.
- **Owner gates:** merge PR #50 to `main`, the Production deploy, any flag in Production.
- **After a deploy (if the owner orders one):** `/api/health`, `/ka`, `/ru` 200; the anonymous probes of §12 against
  Production; the ledger read of §10 again; no `agent_g_*` error lines in the logs.

## 16. Remaining defects

| # | Defect | Severity | State |
|---|---|---|---|
| D1 | Live Voice cannot start a two-step run (the Live planner has no run step) | P2 | open |
| D2 | A reload does not redraw an Agent G card (the work goes on server-side; the tray and Library show it) | P2 | open |
| D3 | An analysis cannot be stopped mid-read (one request of up to ~2 minutes) | P2 | open |
| D4 | A studio render cannot be stopped through the Task API (409 `not_cancellable`, T3) | P1 | open; the chat says only what it stopped |
| D5 | „Next scene, same character" is answered in words (a Veo generation, not an edit) | P2 | MISSING |
| D6 | Split, join and mix are not single edits (join and mix go through the montage) | P2 | MISSING |
| D7 | music.remix, code.terminal have no executor | P2 | MISSING, DISABLED in every door |
| D8 | Text hidden by a stylesheet class reaches the model as visible text | P2 | mitigated: framed as untrusted data, no tool can spend or publish |
| D9 | Grounded search gives no source dates (Google does not return them) | P2 | open |
| D10 | `/api/orchestrate` (legacy, no caller) charges after its work | P2 | refused under `AI_GOOGLE_ONLY`; retire on the owner's word |
| D11 | 14 dead orchestration stacks | P2 | pinned by a ratchet; removal on the owner's word |
| D12 | **Found in PART 7, fixed:** a failed Agent G card repeated the bubble's reason word for word (a YouTube refusal read twice) | P2 | fixed in `78fe3ab4`; the card marks the step, the bubble (which a reload keeps) says why once; tests updated |
| D13 | **Found in PART 7, fixed in the specs:** the download tests of seven specs (montage, MP3, edit, run, chat attachments, interior plan, the voice chain) failed on a production build because their mock host was outside the CSP; the dev-bypass spec expected the bypass on a local production build | test-only | fixed in `78fe3ab4`: mock results on the storage domain the CSP allows (`*.supabase.co`), `PLAYWRIGHT_PRODUCTION_BUILD=1` for a local production build. The old host was run again and fails the same way; the new one passes. PART 0 planned a test-only CSP allowance instead; changing the specs keeps the product's CSP untouched |
| D14 | **Found in PART 7, fixed in the spec:** the guest-photo check met the chat route's per-IP burst limit (100 a minute, shared by every read route) because a whole suite on one machine is one IP | test-only | fixed in `78fe3ab4`: the test waits out one window and asks again; proven by spending the limit on purpose (105 calls: 100 × 400, 5 × 429), after which the test waited and passed. The limit itself is unchanged |
| D15 | **Found by the pricing audit, fixed:** the Agent G video queue charged a clip at the Fast price but rendered it on the Standard model (`resolveModel(transport, DEFAULT_TIER)`): 25 credits for $3.20 of Veo | P1 (billing) | fixed in `448b0a22`: the queue renders `STUDIO_DEFAULT_VEO_TIER`, the tier its price is computed on; a test pins the `veo-3.1-fast-` model. Not in Production |
| D16 | **Found by the pricing audit, fixed:** a product ad was charged one clip's price at every length (the button quoted 6 s; the route charged from the client's own duration, 25 or 45); a 48 s ad renders 6 Fast clips (18.79 ₾ of cost) | P1 (billing) | fixed in `448b0a22`: one length rule (8 / 24 / 48 s) for the button, the four chat notices, the remix route's charge and the scene gate; tests pin each length. Not in Production. Still open: a scene that fails after the primary is not paid back (pricing audit D15) |
| D17 | **Found in PART 7, open:** once in two full production-build runs, the phone dashboard's test setup pressed Escape and the settings sheet stayed open (`landing.spec.ts:256`, `:318`). It does not reproduce alone (162 / 162) or under CPU ×6 and slow responses (0 of 28). A person whose Escape is lost presses it again or taps ✕ | test stability (P3) | open; cause not found, nothing changed to hide it |

## 17. BLOCKED_OWNER decisions

1. The Preview A–D run as admin (about 6 minutes; the run sheet), then E / F on the shared database only on the owner's
   separate word.
2. The one price model for one approval (`docs/handoffs/pricing/SERVICE_UNIT_ECONOMICS.md` §6: packs, no plans at
   launch, video by length and tier, free-work prices and caps, lip-sync not sold), then its deploy.
3. `MEDIA_GOOGLE_ONLY` in Production (action 9).
4. Alert routing: a log alert rule on `ops_marker` lines, or a Sentry DSN (action 12).
5. BOG live credentials and merchant activation.
6. Browser / code sandbox host (`browser-sandbox-decision.md`: Vercel Sandbox recommended, paid).
7. `AGENT_G_FILE_ANALYSIS` on a Preview, and the paid Gemini calls (analysis, the function-calling comparison, Live
   model checks, the latency / cost baseline).
8. Production `GEMINI_TRANSPORT`, an explicit context cache, the Deep Research migration `20261003b`.
9. PR #50 merge and the Production deploy; then opening `AGENT_G_MEDIA_EXEC` in Production.
10. A real-device Live call and an iPhone Safari run.
11. Removal of the 14 dead stacks and the legacy `/api/orchestrate`.

## 18. Rollback plan

| Change | Rollback |
|---|---|
| A Production deploy of PR #50 | Vercel Instant Rollback to `6c7dff4` (or revert the merge commit). Before rolling back, unset `AGENT_G_MEDIA_EXEC` and let running Agent G jobs end (a lease is 90 s; a job runs at most 10 minutes), so no queued job is left for an older build that does not sweep it |
| `AGENT_G_MEDIA_EXEC` / `AGENT_G_FILE_ANALYSIS` opened | unset the variable; started jobs finish or are swept |
| `MEDIA_GOOGLE_ONLY` turned on | unset it; status routes stayed open, so started jobs finish |
| `20261002d` | its rollback section in `supabase/migrations/20261002d_ledger_ref_race_hardening.sql` (restores the earlier functions; the unique index is kept unless the owner says otherwise) |

## 19. Next exact action

- **Owner:** the Preview A–D run as admin (one page, about 6 minutes), when convenient; reply „A–D მზადაა" and Claude
  reads the database and audit rows.
- **Owner:** approve or change the price model (`SERVICE_UNIT_ECONOMICS.md` §6), one answer.
- **Claude, now:** the Omnichannel + Mobile UX task; after the price approval, the engine change (`SERVICE_UNIT_ECONOMICS.md`
  §8) on the branch, ready for the owner's deploy word.

## 20. Final GO / NO-GO

```
AGENT G AUTONOMOUS EXECUTION, PRODUCTION:  NO-GO
AGENT G ENGINE (queue, runs, approvals, refunds):  PROVEN IN ISOLATION
AGENT G ON A PREVIEW WITH A REAL SESSION:  NOT PROVEN since PART 1 (BLOCKED_OWNER: admin session)
PROVIDER BOUNDARY IN PRODUCTION:  FAILED for 9 services until MEDIA_GOOGLE_ONLY (BLOCKED_OWNER)
BILLING INTEGRITY:  ledger clean in Production; same-ref race fixed; payments never completed (BLOCKED_OWNER)
PRICES:  video sold below cost in Production; one price model written, waiting for approval (BLOCKED_OWNER)
SECURITY (Agent G routes):  anonymous and forged callers refused; cross-user and forged approvals refused in isolation
PRODUCTION READY:  NO
```
