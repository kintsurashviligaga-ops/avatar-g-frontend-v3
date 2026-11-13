# v5.1 Phase 3: Agent G execution engine (foundation)

**Status: foundation only.** This is pure code with mocked-data tests, in draft. Nothing here is wired to a route, a database, a sandbox or Google. Wiring it in is the next step and needs GG's OK (it is the M-4 / M-8 "needs GG" row in `docs/v5.1-phase1/09-migration-plan.md`).

The lifecycle this implements is `docs/v5.1-phase1/06-execution-lifecycle.md`:

```
REQUEST → UNDERSTAND → PLAN → VALIDATE → QUOTE → APPROVE → RESERVE → EXECUTE → VERIFY → DELIVER → SETTLE → RECONCILE
                        ^^^^   ^^^^^^^^                               ^^^^^^^   ^^^^^^
                        this PR covers these four stages (pure)
```

## What exists today, and what this adds

| Today | Where | Limits |
|---|---|---|
| Media runs (montage, MP3, edit): steps with dependencies, 2 at a time, cancel, resume reusing delivered steps | `lib/agent/run/runEngine.ts` + `runExec.ts` (job rows, CAS writes) | Media tools only. No VALIDATE. No pause. No retry. No replan. No deadline. |
| Work-mode task graph (browser → code → PDF → Library): an evidence trail | `lib/agent/taskGraph.ts` (workspace file) | A node may name only earlier nodes. No scheduler: each step is started by the user's own tap. Truth matrix: "no parallel steps". |
| Run status contract | `lib/agent/contracts.ts` `RUN_TRANSITIONS` | Reused as is. |

`lib/agent/engine/` is one tool-agnostic engine that both can move onto:

| File | Stage | What it does |
|---|---|---|
| `plan.ts` | PLAN | `decompose(request, model)` asks the planner model (injected; `gemini-3.8-flash` thinking low, per 06 §5), extracts the JSON, and checks it with `parsePlan`. The checks cover tools, ids, limits, unknown or self dependencies, and cycles, with the exact steps named. A refused answer gets **one** repair prompt carrying the error, then the fixed fallback template (for example taskGraph's work-mode template), then an honest refusal. `topoLevels` gives the parallel levels. The user's request is fenced as data in the prompt. |
| `validate.ts` | VALIDATE (M-4) | Checks every step before any quote. `capability_unavailable` covers a tool's model that is retired, urgent or in the block window in `config/google-lifecycle.json` (the M-1 registry), a model missing from that file, or a service switched off. `policy_denied` covers a tool the account isn't entitled to (D-08 admin-only code and browser), a tool outside its audience, a research link anywhere in the step's params that isn't plain https or isn't on the allow-list, or a plan over the account's run ceiling. The ceiling is checked against the **price book** (`priceOf`), never the planner's own estimate, and a step the price book has no row for is refused. |
| `scheduler.ts` | EXECUTE + VERIFY (M-8) | `tick(run, {now, results, commands, sandboxBusyElsewhere})` returns `{run, effects, events}`. It runs up to **3 workers per run** and **1 sandbox per user** across runs. It supports pause, resume and cancel, **1 retry** on a retryable error (after a 5 s backoff), VERIFY before a result counts, **≤ 2 replans** (the run waits in `awaiting_approval` for the user's yes to the new tail; the deadline is held while it waits, and after 24 h with no yes the run ends and still delivers what is done), a **10 min deadline**, and checkpoints (a step's inputs hash, so a later run reuses identical work for free). Late answers from a stopped or retried attempt are ignored. Every `start` carries the step's `approvedCredits`; a quote above it comes back as a `StepHold`, and the step waits (`awaiting_approval`) for the yes to that exact quote (Phase 3.5 decisions, `01-wiring-plan.md` §5). Every status change follows `RUN_TRANSITIONS`. |
| `simulate.ts` | (tests) | A fake clock and scripted executors. They drive the scheduler end to end so parallelism, ordering and timing are asserted, not assumed. It could later back an admin "show me the schedule" dry run. |
| `index.ts` | front door | `prepareRun` = PLAN → VALIDATE: either a plan with its estimate and width, or the refusal (stage, step, code, reason). |

Timeline events follow the 06 §4 names (`run.planned`, `step.started`, `step.checkpoint`, `step.done`, `step.failed`, `step.retry`, `step.needs_approval`, `run.paused`, `run.resumed`, `run.replanned`, `run.cost`, `run.status`, `run.delivered`, …). The existing spinner/✓/fold card (#272, #275) can render them.

## Design rules

- **Pure.** The engine decides; the caller acts. Effects are `start` and `stop` only. The caller performs them (quote, reserve, queue the job; stop the job) and stores the run under compare-and-set, the way `runExec` already does. This is what makes every rule testable without Google, Supabase or money.
- **Never trust the planner.** Its output is data. It is validated twice (shape and DAG, then registry and policy) before a price is even computed.
- **Nothing paid twice.** Checkpoints are keyed by `hash(tool, params, input outputs)`. Replan keeps every done or running step unchanged (it refuses to alter one).
- **Fail honestly.** A skipped step says which input failed. A deadline says `deadline`. A run with nothing delivered is `failed`, not `completed`.
- **Pause is a flag** on a queued or running run, because the run-status contract has no `paused` status yet. Adding one is a contract change for the wiring step.

## Tests (59, all mocked)

- `plan.test.ts` (21): DAG levels, 12 refusal cases (cycle, self-dependency, unknown id, limits, tool list…), JSON extraction, one repair, fallback, planner failure, prompt fencing.
- `validate.test.ts` (8): against the **real** lifecycle registry. 3.6 Flash on 2026-11-13 is refused, an unknown model is refused, and 3.1 Pro preview with no date runs. Also the service switch, entitlement, audience, allow-list (including links hidden under other keys), and the run ceiling from the price book.
- `scheduler.test.ts` (26): parallel cap, the sandbox-per-user limit across runs, retry once, skip propagation, VERIFY, pause/resume, cancel with a stop per running step, late answers ignored, deadline → partial, replan keeping done work, replan refusals, checkpoint reuse, determinism, legal status hops, retry backoff, the deadline held during a replan wait, the 24 h approval timeout, replan refusing duplicate or dangling steps; and the Phase 3.5 additions: `maxWorkers`, the 30 min media deadline, `admitQuote`, a held quote resumed only by the yes to that quote, a retry whose price went up waiting for a yes, and the approval timeout ending a run with what it delivered.
- `lifecycle.flow.test.ts` (4): a Georgian request goes through planner → VALIDATE → three research steps in parallel → chart and summary → PDF → Library, plus the refusals that must happen before any spend.

## Next steps (each needs GG's OK)

1. **Wire VALIDATE into today's runs** (M-4, low risk): build `ValidateContext` from `lib/capabilities/lifecycle`, `lib/server/serviceSwitches` and the profile, and call `validatePlan` in `lib/agent/run` before `step.quoted`. No migration.
2. **`run_steps` table** (M-8; a migration, so a DB step for GG): one row per step with its state, inputs hash and outputs pointer, instead of growing `params._run`. It needs Supabase back, and staging (D-14) first.
3. **Move work-mode tasks onto the engine** behind an admin flag. taskGraph stays the evidence trail. The engine drives the order and parallelism.
4. **Approval center** (M-7): `step.needs_approval` and replan approvals write the one `approvals` record.
5. **Paid E2E**: two parallel steps plus a cancel on a Production build, within a GG-approved budget.

The detailed wiring plan (stages 3.5a to 3.5f, the mapping, the money rules and three decisions for GG) is `01-wiring-plan.md`.
