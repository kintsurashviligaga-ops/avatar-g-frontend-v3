# v5.1 Phase 7 prep: Live Agent Workspace (UI with mocked data)

**Status: PREPARED, MOCKED, NOT WIRED.** Draft PR off `main`. It calls no API, runs nothing and spends nothing.

GG 2026-11-13 13:06Z: "start drafting the UI/UX plan and code for Phase 7 (Live Agent Workspace). Design the frontend components (the task timeline, the approval center, the progress bars) with mocked data so we can see how it will look and function."

## 1. What the user sees

One screen where every Agent G task, its steps and every approval it waits for are visible at once.

- **Desktop:** tasks on the left, the approval center on the right (it stays in view while the list scrolls).
- **Phone:** two tabs, "Tasks" and "Approvals". The Approvals tab shows the count of pending approvals.
- **Task timeline (`RunTimeline`):** the goal, state, a live clock, credits spent out of the reservation (`✦3 / ✦6`), the percent with a step count, then each step with the same spinner / ✓ / hand / ✕ look as today's task card (#272, #275). Steps that run side by side carry an "in parallel" mark. Each step shows its tool, a detail line and its cost once done. Files the task made show up as chips. Pause, Resume and Cancel buttons appear while the task is live. The list folds.
- **Approval center (`ApprovalCenter`, M-7):** one card per approval. Each card shows what a yes allows (scope), the price, why a tap is needed and a countdown to expiry. Sensitive actions (passwords, payments, buy, send, delete; GG 12:34Z) get an amber card that says "this action only goes ahead with your tap". Nothing approves itself. Answered and expired approvals stay below, greyed.
- **Progress:** a percent and a short label ("75% · 3/4 steps"), plus one small dot per step, coloured by state. The percent never shows 100 while anything is still running, and never goes back.

Screenshots (Georgian, desktop and iPhone 13) are in `/mnt/project-files/v5.1-phase7/`.

## 2. Code

| File | What |
|---|---|
| `lib/agent/liveWorkspace/model.ts` | Pure state. It folds the timeline events from `06 §4` (`run.planned`, `step.started`, `step.progress`, `step.needs_approval`, `step.done`, `step.failed`, `run.paused`, `run.resumed`, `run.cost`, `run.delivered`, `run.settled`, plus `approval.answered`) into runs, steps, percent and approvals. A bad, repeated or out-of-order event is ignored and never thrown. Spend never shows more than the reservation. |
| `lib/agent/liveWorkspace/mock.ts` | Two invented runs. (1) A research task: one plan-level spend approval (GG 08:14Z, one tap per plan), two parallel searches, CSV, chart, Georgian PDF, Library. (2) A Browser Agent task that stops at a card field for a sensitive tap. |
| `lib/agent/liveWorkspace/player.ts` | Pure replay. Lines wait for their approval's yes. A pause holds a run and a resume shifts its timings. A decline or cancel ends the run. |
| `components/studio/liveWorkspace/*` | `RunTimeline`, `ApprovalCenter`, `LiveWorkspace` (layout and mock player), `labels` (ka / en / ru). |
| `app/[locale]/admin/agent-workspace/page.tsx` | **Preview route only.** Returns 404 unless `AGENT_WORKSPACE_PREVIEW=on`, which is never set in Production. Not indexed. The real workspace mounts inside the main window (One Window), not on its own route. |

Tests: model and replay (11), components (5). The studio's `noProgressBars` guard still passes.

## 3. Open choice for GG: "progress bars"

MASTER TASK v3.1 §3.3 (GG-approved, Phase 2 PR 4, #157 and #158) removed every drawn progress bar from the studio: a wait shows **a percent and a short label**. `components/studio/noProgressBars.test.ts` enforces that rule. So this preview shows the percent plus one dot per step (discrete states, not a fill). If GG wants a real filled bar in the workspace, that is a one-line change plus an exception in the guard.

## 4. Wiring later (each step needs GG)

1. `GET /api/runs/:id/stream` (05 §5) emits the same events. The mock player is swapped for an EventSource and the reducer stays.
2. `POST /api/approvals` and `/revoke` (05 §4) back the Allow / Decline buttons. An approval is bound to one quote, one user, one scope and one expiry, and is consumed once.
3. Pause, resume and cancel call `/api/runs/:id/pause|resume|cancel`. Cancel releases the unspent reservation (Phase 5 `settle.ts`).
4. Mount `LiveWorkspace` inside the dashboard (One Window) behind a flag, admins first (D-08 for browser and code steps).
