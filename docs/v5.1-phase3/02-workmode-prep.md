# v5.1 Phase 3.5c: work-mode on the engine. Preparation notes

**Status: PREPARED, NOT FINALIZED, NOT WIRED.** GG (2026-11-13): prepare 3.5c, keep it a draft, and don't finalize it until 3.5b (#310) works in production. Nothing in this branch is called by a route. A flag (`AGENT_ENGINE_WORKMODE`) comes in only when it is finalized.

Stacked on #310 (3.5b), which is stacked on #309 (3.5a), which is stacked on #308 (engine).

## 1. What was found in the code

| Node kind | How it runs today | Price | What it produces |
|---|---|---|---|
| `browser` | `runBrowserQuote` runs **inside the request** that confirmed it: verify token → one-time claim (`browser_run:<job>`) → `$20` sandbox ledger → fresh sandbox | 0 credits (the spend is the server's own sandbox ledger) | files in the workspace, `browser/<job>/` |
| `code` | `runCodeQuote`, the same shape | 0 credits | files in the workspace |
| `pdf` | workspace action `render_pdf`: no quote, no token, fast | free | a new file version next to the spec |
| `export` | workspace action `export`: no quote, no token, fast | free | a Library item |

The task graph (`tasks/<id>.json`) already records each node's start, inputs, outputs and end. It does that through `task: {graph, node}` on each action (`taskStep`). The engine keeps it as the evidence trail and does **not** replace it.

## 2. What this branch adds

`lib/agent/work/workJob.ts` turns a work step into an ordinary job on the lease queue (kind `agent-work`), like a montage step:

- `enqueueWorkJob`: puts one signed quote on the queue. The insert is the idempotency check.
- `workWorkJob`: claims the job, renews it with a heartbeat every 15 s, calls the **same** run function with the **same** signed token, then completes or fails the job.
  - If the owner cancels, or the lease is lost, the heartbeat aborts the tool.
  - A worker that stalled past its lease writes nothing.
  - A failure the tool reports is final straight away.
- `workViewOf`: what the job says, for the run's tick. Outputs are workspace paths.
- `cancelWorkJob`: the owner's stop. Nothing is owed back, because work steps cost 0 credits.

**Retries cannot double-spend.** The lease retries a dead worker once, and that retry reuses the same token. The tool's own one-time claim then answers `quote_used`, so the step fails cleanly and never runs twice. Tests: `lib/agent/work/workJob.test.ts`, 6 tests.

## 3. What is left before 3.5c can be finalized

1. **RunSpec for work steps.** Add a `browser`, `code`, `pdf` or `export` step whose inputs can name an earlier step (`{ step }`), resolved to that step's **workspace paths**, not a link. Raise the step cap from 6 to 12 for work runs, to match `MAX_TASK_NODES`.
2. **Step adapters** (`StepAdapter`):
   - **Quote:** `quoteBrowserTask` and `quoteCodeRun` give a signed 0-credit quote with `jobId`. pdf and export get a local, unsigned 0-credit "quote", since they need no token.
   - **Enqueue:** `enqueueWorkJob`.
   - **View:** `workViewOf` mapped to `ChildView`.
   - **Cancel:** `cancelWorkJob`.
   - **needsWorker:** the same `claimable` rule as the media adapters.
3. **Step output type.** `StepOutput` is a media link today (`url` + `video | audio | image`). Work steps need workspace paths, so add `media: 'file'` and `paths: string[]`. Then update `runCard` and `lib/tasks/taskView` so the card shows "3 files in the workspace" instead of a player. This changes the shape of the task API, so the UI must land together with it.
4. **The worker route.** Today `runAfterResponse` starts media workers. It needs a `WORK_KIND` case that wires the live browser and code runners, plus the sweep (`/api/agent/media/sweep` or a sibling).
5. **VALIDATE for the plan.** `planOfSpec` and `checkRunSpec` must cover work tools. `code` and `research` (the browser) are already admin-only in `context.ts` (D-08). The `task_plan` validation moves here, as decided in 3.5a.
6. **The task trail.** Each step's request carries `task: {graph, node}`, so `taskStep` keeps recording in `tasks/<id>.json` as it does now. Also check what `checkTaskReady` sees when the engine runs two ready nodes side by side.
7. **Flag:** `AGENT_ENGINE_WORKMODE` = `off` | `admins`, read in `runLive`.
8. **Tests named in the wiring plan:**
   - 3 research steps in parallel → code → pdf → export, with the graph file showing every node's trail;
   - a node refused by VALIDATE before the plan is quoted;
   - a cancel mid-run that stops the browser task and the sandbox.

## 4. Questions for GG (none block preparation)

- **`service_type` of the work rows.** `generation_jobs.service_type` only allows `film, avatar, interior, image, music, voice`, plus `document` from migration `20261031a_generation_jobs_document_kind.sql`. Is `document` applied in production? If it is, work rows use `document`. If not, it needs that migration first, after Supabase is back. Until then the type is a dependency (`WorkJobDeps.serviceType`), not a guess.
- **"One tap per plan, each step held to its share" (decision 2).** For work steps this is automatic: every browser, code, pdf and export quote is 0 credits, so no step can go above its share and none waits for a second yes. The real limit is the server's $20 sandbox ledger, which already refuses a run that would go over. Nothing to decide unless work steps get a credit price later.
- **Quote expiry.** Signed tokens live 30 min. The engine quotes each step only when it starts, so a long plan is fine. A step waiting behind the 2-at-a-time cap gets a fresh quote when its turn comes.
