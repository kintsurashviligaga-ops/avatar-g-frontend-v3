# Agent G Autonomous Execution — PART 4: Live Voice parity

The owner asked for this on 2026-10-10 at 05:49Z, with the Gemini supplement at 06:00Z (Master Task thread). It continues
from PART 3 (`docs/handoffs/agent-g/part-3-report.md`) on branch `claude/launch-certification-wmvitt`, draft PR #50.
Three code commits and the commit that carries this report:

| Commit | What |
|---|---|
| `be0f9dcf` | The server records how the user said yes: `approval` on every Agent G run request, judged again on the server; `POST /api/agent/approvals` for a studio render |
| `86bc9286` | The call waits for the user's own yes: the heard log, the call's ledger, the transcript gate, the fingerprint, the `agent_task` tool |
| `94792785` | The studio side: plans told with their number, voice starts of exactly what was told, stop parity, status, Agent G's voice answers and plans in the chat |
| this commit | The report, `docs/voice/LIVE_ACTIONS.md`, one more browser test (voice stop of a server job) |

Nothing was merged, deployed, migrated or paid for. No Gemini call was made and Production was not touched. No new
switch: Live actions keep `GEMINI_LIVE_ACTIONS`, Agent G's cards keep `AGENT_G_MEDIA_EXEC` (off in Production, admins
only on a Preview).

## 1. What PART 4 set out to do, and what it did

The rule from the owner's task: a voice yes is the user's, never the model's, and voice uses the same
quote → approve → task contract as text.

| Gap (PART 0 §6) | What changed | Label |
|---|---|---|
| V1 (P0): approval was the model's argument only | Every voice start runs only when the user's **own** words (the session's transcript of their microphone) said after the price or plan are a clear yes. The model's `confirmed: "yes"` is still asked for, and is never enough. The server judges the same words again and records them | BUILT, TESTED (unit + browser with a simulated Google socket). Real device: BUILT_NOT_PROVEN |
| V2 (P0): voice paid renders skipped Agent G's price card; studio routes kept no approval record | The call tells the studio's own price (`priceCredits`) and a fingerprint of what would run; the yes must come after that. `POST /api/agent/approvals` records the voice yes (one audit row, `studio_run · approve`) **before** the studio runs, and the call starts nothing if that is not ok | PARTIAL. Recorded and tested; the studio render routes do not yet **require** that record (PART 5) |
| V3: `extract_audio start` pressed the newest card, no countdown | `extract_audio start` is now `agent_task start` on the newest MP3 plan **the call was told of**, with the 3-second countdown and the same check of the user's words. The studio no longer presses Start for the model (`use_agent_task`) | BUILT, TESTED (unit + browser) |
| V4 (bug): `fetchAgentRun` dropped `audioQuote` | Kept. The MP3 plan an `ask_agent_g` run made becomes its quoted card in the chat, told to the model with its plan number; the model is told to describe it and ask | BUILT, TESTED (unit + browser) |
| V5: the countdown ran whatever prompt was on screen | The run carries the fingerprint the price was told for (FNV-1a over the tool, the trimmed prompt and the price). A different tool, prompt or price refuses: `changed_since_price` on the call, `changed` on the studio | BUILT, TESTED (unit + browser) |
| V6: voice research answers and sources never reached the chat | The written answer and its sources become Agent G's reply in the chat (sources as http(s) links only, saved with the thread), also after the call has ended | BUILT, TESTED (unit + browser) |
| V7: no task-status tool | `agent_task status`: Agent G's cards in the chat (kind, phase, facts, price), numbered by the call, and the running tasks (the tray's renders and the server's durable jobs it follows). `get_screen_state` lists them too | BUILT, TESTED (unit + browser) |
| T4: voice `stop {generation}` never called `POST /api/tasks` | It now stops what the tray's own buttons stop: the tray's renders, the server's durable jobs it follows (`POST /api/tasks` cancel) and Agent G's running cards. A plan waiting for a yes stays | BUILT, TESTED (unit + browser, one cancel only) |
| M3: voice could not start Agent G's montage | `agent_task start` starts a montage, MP3 or edit card by its number, with the user's words on its run request | BUILT, TESTED (unit for all three kinds; browser for the MP3 card, same studio code for the other two) |

## 2. How a voice start works now

1. **Price or plan first.** `prepare_generation`, `update_settings` and `get_screen_state` answer with the price and a
   fingerprint. An Agent G card that reaches `quoted` during a call is told once as an `[App]` note with its id; the
   call numbers it 1, 2, 3 … (`lib/voice/voiceLedger.ts`). The ledger notes **when** each price or plan was told.
2. **The model asks.** It calls `start_generation` (with `confirmed: "yes"`) or `agent_task start`. The call checks:
   a transcript exists (`no_transcript` otherwise), the price or plan was told (`price_not_told`, `plan_not_told`), the
   screen still shows what was priced (`changed_since_price`), and the user has not said no since (`user_said_no`).
3. **A 3-second countdown** the user can cancel. A "wait" or "no" heard during it stops it at once. Hanging up stops it.
4. **The user's words decide.** When it ends, `lib/voice/spokenYes.ts judgeSince` reads what the user said since the
   price or plan (KA, EN, RU). It is strict: "yes, but make it blue", "how much?" and "yes for the cats video" are not a
   yes. A yes said during the countdown still counts (the transcript lags the audio). No clear yes: nothing starts, the
   banner says so, and the model is told "nothing was started" and must ask again.
5. **The server checks again and records it.**
   - Studio render: `POST /api/agent/approvals { channel: 'voice-transcript', said, tool, credits }`. The route judges the
     words again, writes one audit row, and the call starts nothing unless it answers ok (fail closed).
   - Agent G card: the run request (`/api/agent/media/{montage,audio,edit}` `run`) carries `approval`. The route refuses
     `approval_unclear` and keeps the channel and words on the job (`params._approval`) and in its audit row.
6. **Only what was told runs.** `myavatar:live-run` carries the target and the words. The studio runs exactly that:
   the priced render (or refuses `changed`, `busy`, `nothing_prepared`), or that very card by its id (or refuses `gone`,
   `not_quoted`). No words, no run. A second run of the same card is refused.

What this is not: proof that the words came from a microphone. A hand-made request can claim them, exactly as it can
claim a tap. It is the same signed-in user, the same signed quote and the same balance checks. The gate is against the
**model**: a misheard or invented yes, or an instruction read from a web page during the call.

The card buttons are unchanged: a tap is still the `tap` channel and needs no words.

## 3. Files

| Piece | File |
|---|---|
| The spoken-yes judge (pure, KA/EN/RU) | `lib/voice/spokenYes.ts` |
| The server's approval parser and record | `lib/agent/approval.ts`, `app/api/agent/approvals/route.ts`, the three media run routes and executors |
| The call's ledger: heard words, price told, plans by number | `lib/voice/voiceLedger.ts` |
| The gate, the countdown, `agent_task`, answers into the chat | `components/voice/live/liveActions.ts`, `useGeminiLiveSession.ts` (`onHeard`), `LiveDock.tsx` (`not_heard`), `GeminiLiveConversation.tsx` |
| Declarations and the instruction paragraph | `lib/voice/liveTools.ts` (`agent_task`, `LIVE_AGENT_ANSWER_EVENT`) |
| The studio's reading of Agent G's cards for a call (pure) | `lib/voice/livePlans.ts` |
| The studio side | `components/studio/OmniStudio.tsx` |
| The contract, for whoever works on the call next | `docs/voice/LIVE_ACTIONS.md` ("The money rule") |

## 4. Tests and checks

| Check | Result |
|---|---|
| New suites | `spokenYes` 93, `livePlans` 15, `liveVoiceGate` 19, `approval` 7, `voiceLedger` 5, approvals route 4 |
| Changed suites | `liveActions`, `liveTools`, `useGeminiLiveSession`, the three media run routes, `audioClient`, `audioExtract`, `editExec`, `montageExec` |
| PART 4 files together | 14 suites, 394 tests passed |
| Whole repo `jest` (`--maxWorkers=3`) | **778 suites passed, 2 skipped (opt-in database suites); 12,079 tests passed, 12 skipped, 0 failed** (PART 3: 11,914) |
| `tsc --noEmit` | 0 errors |
| `eslint` on the changed files | 0 errors; 13 warnings, all older hook-dependency warnings in OmniStudio (the same count as before) |
| Playwright (local Chromium, server and Google mocked) | **58 passed, 3 skipped (pre-existing skips), 0 failed**: `agent-g-audio` 9, `live-actions` 4, `live-voice-e2e` 6, and the montage, edit, gate and voice specs 39 |
| HawkScan | not run: `HAWK_API_KEY` is not set (certification §P) |
| Live runs | none (§6) |

What the browser runs prove, with the server mocked and Google simulated by a fake Live socket
(`tests/fixtures/liveVoice.ts`):

- **"The yes is the user's, never the model's"** (`live-voice-e2e`): the user asks "how much?", the model starts anyway:
  the countdown ends with "Nothing was started", the model is told, nothing is spent and nothing is recorded. The user
  says "no, wait": refused at once. In the chain test the user says "კი, დაიწყე" and exactly one approval is recorded
  (`voice-transcript`, those words, `image`) before the one paid call.
- **An MP3 plan by voice** (`agent-g-audio`): the plan card reaches the call once with its id; status lists it;
  `extract_audio start` no longer presses Start; a run with no words or empty words is not taken; with "yes, start it"
  that card runs once with the words on its run request; a second run is refused.
- **An answer from a call** lands in the chat with its sources, and its MP3 plan as a quoted card whose own Start runs
  it as a tap.
- **Voice stop of a server job** (T4): after a reload the tray shows the running extraction; `stop {generation}` sends
  one cancel to the task route and says "cancelled 1 generation".

A note for running these locally: the `agent-g-audio` upload test needs a Supabase URL in the dev server's environment
(any placeholder works, the storage calls are mocked); without one it fails at HEAD too.

## 5. Decisions taken (documented, reversible)

- **Live's function declarations stay hand-written** in `lib/voice/liveTools.ts`, not generated from the registry like
  the ReAct tools (PART 1). The Live wire accepts only a plain OpenAPI subset, the declarations are locked into the
  ephemeral token on the server, and a malformed lock costs the whole call its tools (`setup_lock_rejected`). The Live
  tools also act on the screen, which the registry's server tools do not. `lib/voice/liveTools.test.ts` pins the
  declarations' shape and their validators, and the countdown and gate are the same for every start.
- **`start_generation` keeps `explicit: true`** into the studio's own path: the price card for a voice render is the
  price the call says, and the yes must come after it. The studio's render routes do not yet check the recorded
  approval (§6).
- **A plan quoted while no call is on is not told later.** The call reads it with `agent_task status`.
- **Agent G's voice answer is shown where the studio is mounted** (the chat). On another page the call still says it.

## 6. What can still fail for a real user

- **No real call yet.** Nothing here ran on a real device with Google's Live model. Whether the native-audio model
  waits for a yes, says the plan's number, and whether its `inputTranscription` of a short "yes" arrives within the
  3-second countdown are unknown. If the transcript lags, the start reads "nothing was started" and the model asks
  again: the safe side, but it may annoy.
- **The studio render routes do not enforce the voice record.** A voice render is recorded at `/api/agent/approvals`
  before it runs, but `/api/generate/*` would still run without it. Enforcing it (an approval id the render route
  checks) is PART 5 with the billing hardening.
- **The answer listener needs the chat on screen.** An `ask_agent_g` answer during a call on another page is spoken,
  not written to a chat.
- **A montage plan by voice goes through the chat** (`chat_send` with the clips attached), and that path has no
  browser test of its own yet; the start by voice is the same code as the MP3's.

## 7. Owner decisions (BLOCKED_OWNER)

- **A real-device Live call** (a funded key, a phone and a laptop): the checks in `docs/voice/LIVE_ACTIONS.md`
  "Still to verify live" items 3 and 6. This needs the owner's hands; it is part of the PART 7 run.
- Still open from PART 1–3: the paid Gemini comparison, file analysis spend and switch, Production `GEMINI_TRANSPORT`,
  `MEDIA_GOOGLE_ONLY`, `20261002d`, the lip-sync charge, the price table, PR #50 merge and the Production deploy.

## 8. Next: PART 5

Security and billing hardening: the `deduct_credits` same-ref race (a migration, the owner's word), the studio render
routes checking the recorded approval, replayed refs and charges taken after the provider call (C1–C6), and the
research tools' SSRF and injection re-check (B3). B1 and B2 stay BLOCKED_OWNER (a paid isolated host).
