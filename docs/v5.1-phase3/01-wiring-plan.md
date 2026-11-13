# v5.1 Phase 3.5: wiring the engine into today's runs (plan)

**Status: plan only.** Nothing here is built or merged. Each stage below is its own PR, needs GG's OK to merge, and goes in order. Stages 3.5a to 3.5c need **no migration**. Stages 3.5d and 3.5e need the database (and staging, D-14) first.

The engine itself is `lib/agent/engine` (PR #308, `00-engine-architecture.md`). It is pure: it decides, and the caller acts.

## 1. What runs today

| | Media runs | Work-mode tasks |
|---|---|---|
| Code | `lib/agent/run/runExec.ts` (effects, compare-and-set) + `runEngine.ts` (`planTick`, pure) | `lib/agent/taskGraph.ts` + `taskGraphStore.ts`, `lib/agent/workspace/actions.ts` |
| Tools | `audio_extract`, `montage`, `edit` (`runSpec.ts`, at most 6 steps) | `browser`, `code`, `pdf`, `export` (at most 12 nodes) |
| State | one `generation_jobs` row per run, `params._run` (v1), each step is an ordinary job with `params._parent` | `tasks/<id>.json` in the user's workspace, one version per change |
| Who moves it | a tick: the owner's status read (`GET /api/tasks?id=`), the request that changed it, the per-minute sweep (`/api/agent/media/sweep`) | the user's tap on each step (each node is its own confirmed action) |
| Approval | one tap on the plan, signed quote token bound to user, spec and list price; a step whose real quote is above that waits for its own yes (`approveStep`) | one confirmation per node |
| Parallel | 2 steps per run (`MAX_PARALLEL`) | none |
| Missing | VALIDATE, retry, pause, replan, deadline | a scheduler (all of it) |

## 2. The approach: swap the decision, keep the machinery

`runExec` already does the hard, proven parts: compare-and-set writes on `_exec.v`, the tick lease so two ticks never quote the same step, the sweep, the cancel that refunds, the resume that reuses delivered steps. None of that is rewritten.

What changes is the pure function in the middle. Today `tickRun` calls `planTick(run, childViews, now)`. After 3.5b, a run created with the new version calls the engine's `tick(engineRun, {now, results, commands, sandboxBusyElsewhere})` instead. Both return "the next state + effects", so `tickRun` keeps its shape.

- **No in-place migration of live runs.** Runs written as `_run.v = 1` keep `planTick` until they end. New runs are written as `_run.v = 2` with an `EngineRun` inside. `tickRun` picks the function by version. A v1 run never becomes v2.
- **One flag per stage**, read on the server, default off. Turning it off makes new runs v1 again. Runs already started finish on the engine they started on.

## 3. Stages

### 3.5a VALIDATE before every quote (M-4). No migration, low risk.

- New `lib/agent/engine/context.ts`: `buildValidateContext(user, now)`, built from `lib/capabilities/lifecycle` (`lifecycleEntry` → `{known, level}`), `lib/server/serviceSwitches`, the profile (admin, plan), the audience gates, the research allow-list, and a `priceOf` that reads the same price book `planRun` uses.
- The engine's tool list gets the three media tools (`audio_extract`, `montage`, `edit`), with `modelOf` → null for pure ffmpeg work and the Gemini model for any step that calls one.
- `planRun` calls `validatePlan` after `validateRunSpec` and **before signing the quote**. A refusal is a new `RunErrorCode` `capability_unavailable` / `policy_denied`, with the step and the reason, and nothing is quoted or reserved.
- Work-mode: `task_plan` validates the same way before saving the graph.
- Flag: `AGENT_VALIDATE` (`off` / `on`). Tests: a step on a model the registry marks retired or blocked is refused before any quote; an admin-only tool for a non-admin is refused; the price-book ceiling refuses an over-ceiling plan.
- Rollback: flag off. Nothing stored changes.

### 3.5b Media runs on the engine. No migration.

**Mapping (one pure file, `lib/agent/run/engineBridge.ts`, fully unit-tested):**

| Today | Engine |
|---|---|
| `RunSpec` step + `refsOf` | `PlanStep` with `dependsOn` = the steps it names |
| step's job id (`taskId`) | `attemptId` (a late answer from an old job is ignored by id) |
| `ChildView` `completed` | `StepResult ok` with `outputs: [url]` |
| `ChildView` `failed` | `StepResult` failure; retryable only for codes in an explicit table (`timeout`, `rate_limited`, `worker_lost`, `upstream_5xx`). Content refusals and bad input are never retried. |
| `ChildView` `cancelled` | only what the engine itself stopped; anything else counts as a non-retryable failure |
| engine effect `start` | `adapter.quote` then `adapter.enqueue`, under the existing tick lease |
| engine effect `stop` | `adapter.cancel` (the executor refunds) |
| engine timeline events | the run's `events` list (capped at 50), in the vocabulary `runCard` already renders |

**Engine additions needed first** (pure, testable now, small):

1. `EngineOptions.maxWorkers`: media runs keep **2** (today's `MAX_PARALLEL`), work-mode uses 3.
2. A per-run deadline from the plan. The 10 min default is too short for media: an Omni clip or a long montage can take several minutes per step. Proposal: the sum of each tool's longest normal run plus margin, capped at **30 min**. This needs GG's yes (decision 1 below).
3. **A step that waits for a yes.** Today a step whose real quote is above its approval waits for `approveStep`. The engine needs the same thing: a `start` effect can come back as `needs_approval` (with the quote id). The step then waits in its own state, holding no worker, and a `approve:<stepId>` command resumes it. Without this, the engine would either overspend or fail the step.
4. **Retry and money.** An engine retry is a **new job with a new quote**. The failed job was already refunded by its executor. The retry may start without asking only if its quote is still at or below the step's `approvedCredits`; otherwise it waits for a yes (item 3).

**Timer.** Backoff (5 s) and deadline only move when something ticks. Ticks come from the open card's status polling (every few seconds) and the per-minute sweep, so a retry starts within about a minute at worst. That is fine; no new timer is added.

**Pause / resume.** `POST /api/tasks` gets `action: 'pause' | 'resume'` for v2 runs. Pause is a flag (the run status contract has no `paused`), and running jobs finish. The card shows a pause button only on v2 runs.

**Sandbox per user.** `sandboxBusyElsewhere` = the user's running `code` jobs in other runs: one indexed read of `generation_jobs` per tick, only when the plan has a code step.

Flag: `AGENT_ENGINE_MEDIA` (`off` / `admins` / `everyone`). Tests: the bridge mapping (every `ChildView` case), a v1 run unchanged by the flag, a v2 run's parallel cap of 2, the quote-above-approval wait, a retry that waits for a yes when its price went up, and the existing `runExec.test.ts` race tests run against v2 as well.

Rollback: flag off. v2 runs already started still finish on the engine; nothing has to be rewritten.

### 3.5c Work-mode tasks on the engine (admins first). No migration.

- The task graph stays **the evidence trail**: every node still records start, inputs, outputs and how it ended in `tasks/<id>.json`. The engine decides the order and runs independent nodes side by side.
- The run state lives where media runs live: a `generation_jobs` row with `params._exec.kind = 'agent-run'` and a v2 `_run`. That reuses the compare-and-set, the tick lease and the sweep, with no new table.
- New step adapters, one per kind, each wrapping what the node's action already calls: `browser` (`lib/agent/browser/quote.ts`), `code` (`lib/agent/sandbox/codeQuote.ts`), `pdf` (`lib/documents`), `export` (Library). Each one gives `quote`, `enqueue`, `view`, `cancel`.
- **Approval changes from one tap per node to one tap per plan.** The plan's price is the sum of each node's quote. Each node still mints its own quote token when it starts, and must stay within what the plan was approved for, or it waits for a yes (3.5b item 3). This is a product change and needs GG's yes (decision 2 below).
- D-08 stays: `code` and `browser` are admin-only, enforced by VALIDATE's entitlement.
- Flag: `AGENT_ENGINE_WORKMODE` (`off` / `admins`). Tests: research ×3 in parallel → code → pdf → export, with the graph file showing every node's trail; a node refused by VALIDATE before the plan is quoted; cancel mid-run stops the browser task and the sandbox.

### 3.5d `run_steps` table (M-8). Migration: needs the database and staging.

Only needed once runs outgrow one jsonb value (12 steps, events capped at 50, checkpoints kept across runs). It is not a blocker for 3.5a to 3.5c.

```sql
create table public.run_steps (
  run_id      uuid not null references public.generation_jobs(id) on delete cascade,
  step_id     text not null,
  user_id     uuid not null,
  tool        text not null,
  status      text not null,
  attempts    int  not null default 0,
  attempt_id  text,
  inputs_hash text,
  outputs     jsonb not null default '[]',
  credits     int  not null default 0,
  error       text,
  updated_at  timestamptz not null default now(),
  v           int  not null default 0,          -- compare-and-set
  primary key (run_id, step_id)
);
alter table public.run_steps enable row level security;
create policy run_steps_owner_read on public.run_steps for select using (auth.uid() = user_id);
-- writes: service role only (the tick), never the browser
create index run_steps_user_running on public.run_steps (user_id) where status = 'running';
```

The `user_running` index is what makes "1 sandbox per user across runs" a single cheap read. Rollback: the code keeps writing `params._run` too until the table has been proven, so dropping the table loses nothing.

### 3.5e Approval center (M-7). Migration: needs the database.

One `approvals` record per yes, bound to one quote, one user, one scope and one expiry, used once (unique index), as `05-api-contracts.md` describes. The engine's `step.needs_approval` (replan, and a quote above approval) writes it. Voice, tap and panel all produce the same record. The engine's 24 h approval timeout should be the same as the record's expiry (set both from one constant when this is built).

### 3.5f Paid end-to-end test on Production

Two parallel steps plus a cancel, on a Production deployment (Previews refuse paid work, and localhost cannot reach Vertex), within a budget GG approves. Expected: about ✦50 to ✦80 for two short media steps. Checks: both steps start together, cancel stops the running one and refunds it, the delivered one stays in the Library, and the ledger matches the card.

## 4. Money rules (unchanged by the engine)

- **The engine never charges or refunds.** The executor's quote, reserve, debit and refund stay where they are. The engine's `credits` are for the card only. The ledger is the truth, and the reconcile job compares the two.
- **Nothing is paid twice.** A reused checkpoint costs 0. A retry is a new quote within the approval. A late answer from a stopped job is ignored by the engine, and its executor's cancel has already refunded it.
- **No model output approves anything.** The planner's plan is data. It is validated twice, priced from the price book (never the planner's estimate), and only a user's tap or spoken yes approves.

## 5. Decisions for GG (before 3.5b and 3.5c are built)

1. **Deadline for media runs**: 30 min (recommended), instead of the engine's 10 min default, which is too short for video.
2. **Work-mode approval**: one tap for the whole plan, with each step held to its share (recommended), or keep one tap per step.
3. **Automatic retry of a paid step**: allowed once, only within the approved price (recommended), or never without asking.

## 6. Order and size

| Stage | Needs | Size | Can start |
|---|---|---|---|
| Engine additions (maxWorkers, deadline per plan, step waiting for a yes, retry within approval) | nothing | small, pure | now |
| 3.5a VALIDATE | flag | small | once Supabase is back (to test on Production) |
| 3.5b media on engine | 3.5a, decisions 1 and 3 | medium | after 3.5a |
| 3.5c work-mode on engine | 3.5b, decision 2 | medium | after 3.5b |
| 3.5d `run_steps` | DB, staging | medium | when needed |
| 3.5e approvals | DB | medium | with or after 3.5c |
| 3.5f paid E2E | GG budget | small | after 3.5b |
