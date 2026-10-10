# Agent G Autonomous Execution — PART 2: reliable task runtime

The owner asked for this on 2026-10-10 at 05:49Z, with the Gemini supplement at 06:00Z (Master Task thread). It continues
from PART 1 (`42fbf0fb`, `docs/handoffs/agent-g/part-1-report.md`) on branch `claude/launch-certification-wmvitt`, draft
PR #50, commit `438cc918`. Nothing was merged, deployed, migrated or paid for. No Gemini call was made, and Production
was not touched. Everything new sits behind the same switch as before: `AGENT_G_MEDIA_EXEC` (off in Production, admins
only on a Preview).

## 1. What PART 2 set out to do, and what it did

| Gap (PART 0 §6) | What changed | Label |
|---|---|---|
| T2: status words conflict; `generation_jobs` has no `cancelled` | `lib/tasks/statusModel.ts`: one set (queued, awaiting_approval, running, completed, partially_completed, failed, cancelled). It is the only place that translates a store's or a provider's own word. A stop stored as `failed` with a „cancel…" error reads as cancelled | BUILT, TESTED |
| T1: no multi-step run | `lib/agent/run/*`: a run is one `generation_jobs` row (kind `agent-run`, state in `params._run`), its steps are ordinary jobs of the existing executors. Dependencies, two steps at a time, checkpoints, stop, resume, `partially_completed`. No migration | BUILT, TESTED (in memory over the real executors); live run BUILT_NOT_PROVEN |
| G8: no event stream | Every status change of a run and of each step is a numbered event on the row (at most 50 kept). `GET /api/tasks?id=…&after=n` sends only the new ones | BUILT, TESTED (the UI that shows them is PART 6) |
| G4: memory manual only, no "delete all", voice and ReAct never read it, nothing caps it | One memory reader for every surface, with caps and sanitizing. `/memory` lists both stores, deletes one fact or everything, and has an on/off switch for automatic memory | BUILT, TESTED |
| O1 (PART 2 half): audit rows lack run, tool and approval channel | Run and step audit rows carry `runId`, `toolId` and `approval: 'tap'`. Single montage and MP3 rows carry `toolId` (and `runId` when a run started them) | PARTIAL: the single jobs' approval channel waits for PART 4, where a voice yes becomes a server record. Stuck-job alerts are PART 5 |
| T3: a studio render cannot be stopped from the Task API | Unchanged: 409 `not_cancellable`. The chat says only what it really stopped | MISSING (documented, §7) |

## 2. One status model (`lib/tasks/statusModel.ts`)

Before, four vocabularies met in one screen (PART 0 §5): `generation_jobs` (pending, processing, completed, failed),
the studio's client queue (queued, rendering, done, failed, canceled), provider words (succeeded, partial, error…) and
the run statuses from PART 1. Now every surface that shows a task reads the same seven words:

- `queued`: waiting for a worker or a slot
- `awaiting_approval`: waiting for a person (a step's price, or a run that is blocked on something only a person can do)
- `running`, `completed`, `partially_completed`, `failed`, `cancelled`

An unknown word is `failed`, never `completed`. The Task API, the task tray (`lib/jobs/durableJobs.ts`) and the task
cards read it. The tray shows a run as one row with its own title and "Step 2 of 3" (KA „ნაბიჯი 2 / 3"), and
"Waiting for your yes" while a step waits for approval. A run's step jobs are hidden from the tray, so one request is
one row.

## 3. Multi-step runs (`lib/agent/run/`)

**What a run is.** An ordered list of at most 6 steps. Each step is one of the typed media actions that already run on
the lease queue (an audio extraction, a montage). A step's input may be an earlier step's result, so the Master Task's
chain „take the sound out of this video, then cut these clips to it" is two steps:

```
[{ id: 'sound', tool: 'audio_extract', source: { file: <video> } },
 { id: 'clip',  tool: 'montage', files: [<clip 1>, <clip 2>, { step: 'sound' }] }]
```

A step may only name an earlier step, so a run can never loop. The spec is checked field by field before anything runs
(`runSpec.ts`): known tools only, bounded sizes (13 files per montage), nothing unchecked carried along.

**Where it lives.** One `generation_jobs` row per run, so there is no new table and no migration. Each step is an
ordinary job with `params._parent` naming the run. Its worker, retry, refund, QC and Library card are exactly those of
the same job started on its own; a run adds no executor.

**What moves it.** `planTick` (`runEngine.ts`) is one pure function: the run and what each step's job says now go in;
the next state and the effects (quote a step, queue it, stop a job) come out. `runExec.ts` performs the effects. A tick
happens on the owner's status read, after the request that created or changed the run, and in the per-minute sweep, so
a run whose tab was closed still starts its next step and ends.

**Races.** Any number of ticks, a stop and the sweep may hit one run at once:

- every write is a compare-and-set on the row's version, so one wins and the others read again
- starting a step (quoting probes files for seconds) happens under a 30 s tick lease, so two ticks never quote the
  same step; a tick that dies lets the lease lapse
- the step job's id is fixed by its quote, so a lost write that queued a job is found again, never doubled
- a stop that lands while a step is being queued is checked again after the queueing, and that job is stopped too

**Approval.** The user's tap on the plan card is the only way to create a run. The plan is signed for that user, that
exact spec and its list price, for 30 minutes, and its id is the run's id, so a second tap replays the first run. When
a step's real price (known once its input exists) is above what the plan covered, the step waits as
`awaiting_approval` and runs only after `approve` with that quote's own id. A changed price asks again; an expired
quote is quoted again. Model output can neither create a run nor approve a step.

**Ending.** A run ends `completed` (all delivered), `cancelled` (stopped by its owner), `partially_completed` (some
delivered) or `failed` (none). A step whose input failed is never run (`skipped`). A delivered result stays delivered
after a stop. Final states never move.

**Resume.** `resume` makes a new run from an ended one. Delivered steps are reused (no second extraction, no second
charge); the rest run again. Resuming twice gives the same new run.

**Task API** (`app/api/tasks/route.ts`), only while `AGENT_G_MEDIA_EXEC` is open to the caller:

| Call | What it does |
|---|---|
| `POST { action: 'plan', spec }` | checks the steps and signs them at their list price. Nothing runs |
| `POST { action: 'run', spec, token }` | the user's tap: creates the run once, moves it after the answer |
| `POST { action: 'approve', id, step, quoteId }` | the user's yes to one step's own price |
| `POST { action: 'resume', id }` | a new run that carries an ended one on |
| `POST { action: 'cancel', id }` | stops the run and every step job it started |
| `GET ?id=…&after=n` | the run with its steps and the events after n |

Owner-only throughout: another user's run is `not_found`. Errors keep their meaning (409 for a changed or expired
quote, 503 when the queue is unreachable, 429 on the produce limit).

## 4. Run events (G8)

Events: `run.created`, `run.resumed`, `run.status`, `run.cancel_requested`, `step.quoted`, `step.awaiting_approval`,
`step.approved`, `step.queued`, `step.running`, `step.completed`, `step.failed`, `step.cancelled`, `step.skipped`,
`step.reused`, `step.requote`. Each is numbered and timed, and comes from the server's own state change, never from an
estimate. A test drives every run through the real executors and checks that every status change it saw is a legal one
(`RUN_TRANSITIONS`). The supplement's "Thinking → Tool → Awaiting approval → Running → QC → Delivered" view reads these
in PART 6.

## 5. Memory every surface reads (G4)

Two stores, both the user's own (RLS `auth.uid() = user_id`, and every query here also filters by the user's id):

- `memories`: facts the user saved on `/memory`
- `user_profile_metadata`: name, age and similar facts picked out of the user's own messages (`lib/chat/userMemory`)

**Who reads it.** One reader, `lib/memory/context.ts`:

| Surface | Before | Now |
|---|---|---|
| Text chat (`/api/chat/gemini`) | 5 facts by embedding, uncapped | same 5 by embedding, capped and sanitized |
| Orchestrated chat (`/api/chat/orchestrate`) | profile only | profile + newest saved facts |
| Voice chat (`/api/voice/chat`) | profile only | profile + newest saved facts |
| ReAct agent (`/api/agent/run`, also Live's `ask_agent_g`) | nothing | profile + newest saved facts |
| Live call (`/api/voice/live`) | nothing | profile + newest saved facts |

Only the text chat searches by meaning. The others take the newest facts, so no surface adds a paid embedding call.

**Caps and safety.**

- at most 5 saved facts, each cut to 240 characters, the block at most 1,200 characters; at most 8 profile facts
- line breaks, control characters and the Unicode line separators are taken out, so a fact can never open a new
  section of the prompt
- the block is labelled as the user's data, not instructions
- a store that cannot be read gives no memory, and the request goes on

**What the user controls on `/memory`** (KA / EN / RU):

- the saved facts and the facts picked out automatically, both listed
- delete one fact
- "Delete all", with a confirm step: both stores, except the on/off switch itself; the answer says how many went
- an on/off switch for automatic memory. While it is off nothing new is picked out (the check runs before every save,
  and a failed check saves nothing)

Automatic memory stays on by default, as it was before. Making it opt-in is a product choice (§8).

**What memory does not hold yet.** The supplement also asks for previous tasks, approved plans, used files and results
in memory, with selective retrieval. Those live today in `generation_jobs` and the Task API, owner-scoped, but no
prompt reads them. That retrieval and its compact context assembly belong with context caching (G3) in PART 5:
MISSING.

## 6. Tests and checks

| Check | Result |
|---|---|
| New tests | runExec 22, runEngine 12, runSpec 6, statusModel 5, Task API +6, task view +4, tray +1, memory reader 4, profile memory +3, memory route 6, MemoryPanel 4, Live +1, ReAct +1: **75 tests, 0 failed** |
| Whole repo `jest` (`--maxWorkers=3`) | 762 suites passed, 2 skipped (opt-in database suites); 11,708 tests passed, 12 skipped, **0 failed** (PART 1: 755 / 11,633) |
| `tsc --noEmit` | 0 errors |
| `eslint` on the changed files | 0 errors, 0 warnings |
| Playwright | not run for this part. The memory page needs a signed-in session, and the run card UI is PART 6. The panel is covered by 4 jsdom tests (list, switch, delete one, delete all with confirm and failure) |
| HawkScan | not run: `HAWK_API_KEY` is not set (certification §P) |

What `runExec.test.ts` drives, over the real montage and audio executors with every outside effect faked and one shared
lease store:

- plan, start, replay of a second tap; refusals for another user, a changed spec, a bad spec, an expired plan
- a price change gives `quote_changed`
- the chain extract → montage: the extracted MP3 reaches the montage, the run completes with its artifacts
- a failed step ends the run `failed` and skips what needed it
- two ticks at once, a tick that loses its compare-and-set, a held and a lapsed tick lease, a lost enqueue (retried with
  the same quote id), an expired lost enqueue (quoted again)
- stop reaches the running step job; a stop during queueing; only the owner can stop
- step approval: wrong quote id, another user, not waiting, approve (audit row with tool and channel), expiry, a stop
  while waiting
- resume of a partly completed run reuses the delivered step and extracts nothing again; resume of a cancelled run
- the sweep ticks live runs and ends finished ones; reading a run never moves it while the switch is closed

## 7. What can still fail for a real user

- **No live run yet.** Every run in this part ran in tests. A Preview run by the owner's admin session is the first
  real one (PART 7, BUILT_NOT_PROVEN until then).
- **Resume after about a week.** A reused step's result is a signed link. If it has expired, the next step that needs
  it fails and the run ends `partially_completed`; the user must resume from the file again.
- **Studio renders still cannot be stopped** from the Task API (T3, 409). They run on the provider through the studio's
  own queue, which is outside `generation_jobs`. Moving that queue to the server is a separate change; until then
  "stop" says only what it stopped.
- **"Continue" in the chat does not resume a run yet.** The chat's continue (PART 1) resumes a cut-off reply, a waiting
  plan or the last failed card; wiring it to `resume` is PART 6, with the run card.
- **"Delete all" does not delete chat history.** Chat history has its own delete on the history page.
- **The tray polls.** Events are on the row, but the tray still reads the task list on a timer; showing the event
  stream is PART 6.

## 8. Owner decisions (BLOCKED_OWNER)

- automatic memory opt-in instead of opt-out (today: on by default, as before, with the new switch)
- the paid Gemini comparison over the PART 1 corpus, and the paid file-analysis and Live model checks
- Production `GEMINI_TRANSPORT`, `MEDIA_GOOGLE_ONLY`, `20261002d`, the lip-sync charge, the price table
- PR #50 merge and the Production deploy

## 9. Next: PART 3

Media execution coverage: the edits PART 1 refuses in words (frame change, an edit of the previous result, the next
scene with the same character) as typed steps, Gemini's whole-video understanding of the user's own file to pick
moments (G1; the cut itself stays FFmpeg), and more run step tools on the same queue.
