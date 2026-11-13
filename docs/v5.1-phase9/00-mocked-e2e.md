# v5.1 Phase 9 — Agent execution tests and UI tests (MOCKED)

Status: **draft, nothing merged, all flags off.** Everything here runs against fakes. Nothing calls Google, nothing
touches the database and nothing spends money. These tests only prove behaviour. They are not a production
certification: the live integration run waits until prod Supabase is back and GG gives the go-ahead.

How to run: `npm run test:e2e:phase9`, or the two halves on their own:

- `npx jest lib/agent/e2e`
- `npx playwright test -c playwright.phase9.config.ts` (this boots `next dev` with `AGENT_WORKSPACE_PREVIEW=on`. The
  flag exists only inside this test server; it is never set on Vercel.)

CI: `.github/workflows/phase9-mocked-e2e.yml` runs both on any PR that touches `lib/agent/**`, the workspace UI or these
files.

## 1. Agent G execution (jest, `lib/agent/e2e/`)

These tests use the real run engine (`lib/agent/run/runExec`) and the real step executors and workers. They run
against an in-memory job store, faked media tools and a faked wallet ledger (`world.ts`). The workers run by hand, the
same way `runAfterResponse` would run them.

The montage is free in production (`MONTAGE_PRICE_CREDITS = 0`). So the money scenarios price the cut at ✦6, which
makes credits actually move.

| ID | Scenario | What must hold |
|---|---|---|
| AG-01 | Happy path: sound out of a video, clips cut to it | Run completed. Result delivered. Wallet −✦6, exactly what was approved. Owner told once. |
| AG-02 | No tap, no run | A plan alone makes no run and no job. A forged, foreign or edited-spec start is refused. With no signing key, no plan at all (fail closed). |
| AG-03 | Double tap | The same signed plan started twice gives the same run. One job per step, one charge. |
| AG-04 | Parallel steps | Three independent extractions plus a cut. Never more than `MAX_PARALLEL` (2) live jobs, and the cap is actually used. |
| AG-05 | Google-side failure (D-15) | The cut fails in the render. The delivered sound stays, the run is partial, and the charge is paid back (wallet 0). |
| AG-06 | Stop | A stop during step 1 means nothing is charged and the worker finds a stopped job. A stop after the cut was approved and queued means the cut is stopped and paid back, and the delivered step stays. Another user cannot stop my run. |
| AG-07 | Price above the approval | Held at `awaiting_approval` with no job. More ticks never start it. A wrong quote id is refused. The right yes runs it. |
| AG-08 | No balance | The wallet refuses, so the step fails, nothing is charged and nothing is rendered. |
| AG-09 | Resume after failure | The delivered step is reused, not run or charged again. Only the delivered cut is charged. The old run stays as it was. |
| AG-10 | Finished run | Ticks after the end change nothing. |
| AG-11 | Another user's file | It never charges and never delivers. |
| AG-12 | Two ticks at once | Each step is queued once. |

**Invariants checked after every tick of every scenario** (`invariants.ts`, each one proven to fire in
`invariants.test.ts`):

- I-1: every run status change is a legal transition (`RUN_TRANSITIONS`), and there is no `run.invariant` event.
- I-2: at most `MAX_PARALLEL` steps hold a live job.
- I-3: no step with a job was quoted above what the user approved for it.
- I-4: a final run never changes again.
- I-5: the wallet is never charged more than the sum the user approved.
- I-6: event numbers only go up.

## 2. Live Workspace UI (Playwright, `e2e-phase9/`)

These tests run against the Phase 7 preview route `/{lang}/admin/agent-workspace`. The route replays two invented runs:

- a research plan that waits for one spend tap
- a Browser Agent run that stops at a card field for an explicit tap

| ID | Test | What must hold |
|---|---|---|
| UI-01 | First load (ka) | The mock banner says nothing runs. Both approvals are pending (spend and sensitive). The count is 2. Nothing starts and nothing is spent before the yes. There are no page errors. |
| UI-02 | Yes to the plan | Both searches go active side by side (∥ mark), and the run is then delivered with every step done. |
| UI-03 | Decline the card-field step | That run ends as cancelled, the held step is skipped, and there are no more controls on it. |
| UI-04 | Pause / resume | Paused, the steps stay frozen. After resume, the run carries on to the end. |
| UI-05 | Cancel | The run is cancelled, its approval no longer waits, and no step stays active. |
| UI-06 | Phone (390 px) | There are two tabs, and Approvals carries the pending count. Buttons are at least 36 px. There is no sideways scroll. |
| UI-07 | en / ru | The banner and the approval center are in that language. |
| UI-08 | Progress | Progress shows as step dots and a percent, not a drawn bar (GG 13:32Z / 13:44Z: keep the percent and the dots). |

Locally the run gave 22 of 22 jest tests and 9 of 9 Playwright tests passing.

## 3. Not covered here (and why)

- A real Vertex render, real wallet rows, or real `generation_jobs` leases. These need prod Supabase, which is down,
  and GG-approved spend. They are covered by the integration run after the DB is back.
- The workspace drawing a real run stream (`GET /api/runs/:id/stream`). It is not wired yet (Phase 7 is prep only).
- Georgian answer quality. That is Phase 8 (#315).
