/**
 * lib/agent/liveWorkspace/model.ts — the Live Agent Workspace's view state (v5.1 Phase 7; PREPARED, NOT WIRED). Pure.
 *
 * The workspace draws runs from the timeline events of docs/v5.1-phase1/06 §4:
 *   run.planned · step.queued · step.started · step.progress · step.checkpoint · step.needs_approval · step.done ·
 *   step.failed · run.paused · run.resumed · run.cost · run.delivered · run.settled
 * each `{ runId, stepId?, at, data }`. Today those come from a mock script (./mock); later from GET /api/runs/:id/stream
 * (05 §5). `reduce` folds events into one state; it never throws on a bad or out-of-order event, it just ignores it,
 * so a dropped or repeated SSE line can't break the screen.
 *
 * Progress rules (MASTER TASK v3.1 §3.3, kept): a percent and a short label; never 100 while anything is still running;
 * never goes back (a replan that adds steps holds the number instead of dropping it).
 */

export type RunState = 'planned' | 'awaiting_approval' | 'running' | 'paused' | 'delivered' | 'failed' | 'cancelled' | 'settled';
export type StepState = 'pending' | 'queued' | 'active' | 'waiting' | 'done' | 'failed' | 'skipped';
export type ApprovalKind = 'spend' | 'external' | 'sensitive';

export interface StepView {
  id: string;
  title: string;
  /** The tool or capability, shown small ("browser", "code", "image"). */
  tool: string;
  dependsOn: string[];
  state: StepState;
  /** 0–100 inside the step, when the worker reports it. */
  pct: number | null;
  detail: string | null;
  credits: number | null;
  startedAt: number | null;
  endedAt: number | null;
}

export interface ApprovalView {
  id: string;
  runId: string;
  stepId: string;
  kind: ApprovalKind;
  title: string;
  /** What exactly a yes allows ("pay 2 ₾ on shop.example", "send this e-mail to 1 person"). */
  scope: string;
  credits: number | null;
  /** Why it needs a tap (the Browser Agent's sensitiveReason, or the spend). */
  reason: string;
  expiresAt: number;
  state: 'pending' | 'approved' | 'declined' | 'expired';
}

export interface RunView {
  id: string;
  goal: string;
  state: RunState;
  steps: StepView[];
  /** Shown percent: monotonic, below 100 until the run is delivered. */
  pct: number;
  creditsSpent: number;
  maxCredits: number;
  startedAt: number;
  endedAt: number | null;
  artifacts: { name: string; kind: string }[];
}

export interface WorkspaceState {
  runs: Record<string, RunView>;
  order: string[];
  approvals: Record<string, ApprovalView>;
}

export type TimelineEvent =
  | { type: 'run.planned'; runId: string; at: number; data: { goal: string; maxCredits: number; steps: { id: string; title: string; tool: string; dependsOn?: string[]; credits?: number }[] } }
  | { type: 'step.queued' | 'step.started' | 'step.checkpoint'; runId: string; stepId: string; at: number; data?: { detail?: string } }
  | { type: 'step.progress'; runId: string; stepId: string; at: number; data: { pct: number; detail?: string } }
  | { type: 'step.needs_approval'; runId: string; stepId: string; at: number; data: Omit<ApprovalView, 'runId' | 'stepId' | 'state'> }
  | { type: 'step.done'; runId: string; stepId: string; at: number; data?: { detail?: string; credits?: number; artifact?: { name: string; kind: string } } }
  | { type: 'step.failed'; runId: string; stepId: string; at: number; data: { detail: string } }
  | { type: 'run.paused' | 'run.resumed' | 'run.settled'; runId: string; at: number; data?: undefined }
  | { type: 'run.cost'; runId: string; at: number; data: { creditsSpent: number } }
  | { type: 'run.delivered'; runId: string; at: number; data?: { failed?: boolean; cancelled?: boolean } }
  | { type: 'approval.answered'; runId: string; at: number; data: { approvalId: string; answer: 'approved' | 'declined' } };

export const EMPTY: WorkspaceState = { runs: {}, order: [], approvals: {} };

const clampPct = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null);

/** Work done, 0–99 while running: finished steps count whole, a running step counts its own percent (or half). */
export function rawPct(steps: readonly StepView[]): number {
  const counted = steps.filter((s) => s.state !== 'skipped');
  if (counted.length === 0) return 0;
  const done = counted.reduce((sum, s) => sum + (s.state === 'done' || s.state === 'failed' ? 1 : s.state === 'active' ? (s.pct ?? 50) / 100 : 0), 0);
  return Math.floor((done / counted.length) * 100);
}

function withStep(run: RunView, stepId: string, f: (s: StepView) => StepView): RunView {
  const old = run.steps.find((s) => s.id === stepId);
  if (!old) return run;
  const next = f(old);
  return next === old ? run : { ...run, steps: run.steps.map((s) => (s.id === stepId ? next : s)) };
}

function settlePct(prev: RunView, next: RunView): RunView {
  const finished = next.state === 'delivered' || next.state === 'settled';
  const pct = finished && next.steps.every((s) => s.state === 'done' || s.state === 'skipped') ? 100 : Math.min(99, Math.max(prev.pct, rawPct(next.steps)));
  return { ...next, pct };
}

/** Fold one event. Unknown runs, steps and types are ignored. A finished run takes no more step events. */
export function reduce(st: WorkspaceState, ev: TimelineEvent): WorkspaceState {
  if (ev.type === 'run.planned') {
    if (st.runs[ev.runId]) return st; // a repeated plan line
    const steps: StepView[] = ev.data.steps.map((s) => ({ id: s.id, title: s.title, tool: s.tool, dependsOn: s.dependsOn ?? [], state: 'pending', pct: null, detail: null, credits: s.credits ?? null, startedAt: null, endedAt: null }));
    const run: RunView = { id: ev.runId, goal: ev.data.goal, state: 'planned', steps, pct: 0, creditsSpent: 0, maxCredits: ev.data.maxCredits, startedAt: ev.at, endedAt: null, artifacts: [] };
    return { ...st, runs: { ...st.runs, [ev.runId]: run }, order: [ev.runId, ...st.order] };
  }
  const prev = st.runs[ev.runId];
  if (!prev) return st;
  const closed = prev.state === 'delivered' || prev.state === 'failed' || prev.state === 'cancelled' || prev.state === 'settled';
  let run = prev;
  let approvals = st.approvals;
  switch (ev.type) {
    case 'step.queued':
      run = withStep(run, ev.stepId, (s) => (s.state === 'pending' ? { ...s, state: 'queued' } : s));
      break;
    case 'step.started':
      run = withStep(run, ev.stepId, (s) => (s.state === 'done' || s.state === 'failed' ? s : { ...s, state: 'active', startedAt: s.startedAt ?? ev.at, detail: ev.data?.detail ?? s.detail }));
      if (run !== prev && (run.state === 'planned' || run.state === 'awaiting_approval')) run = { ...run, state: 'running' };
      break;
    case 'step.progress': {
      const p = clampPct(ev.data?.pct);
      run = withStep(run, ev.stepId, (s) => (s.state === 'active' && p !== null ? { ...s, pct: Math.max(s.pct ?? 0, p), detail: ev.data.detail ?? s.detail } : s));
      break;
    }
    case 'step.checkpoint':
      run = withStep(run, ev.stepId, (s) => ({ ...s, detail: ev.data?.detail ?? s.detail }));
      break;
    case 'step.needs_approval': {
      run = withStep(run, ev.stepId, (s) => (s.state === 'done' || s.state === 'failed' ? s : { ...s, state: 'waiting' }));
      if (!run.steps.some((s) => s.id === ev.stepId) || approvals[ev.data.id]) break;
      approvals = { ...approvals, [ev.data.id]: { ...ev.data, runId: ev.runId, stepId: ev.stepId, state: 'pending' } };
      if (run.state === 'planned') run = { ...run, state: 'awaiting_approval' };
      break;
    }
    case 'approval.answered': {
      const a = approvals[ev.data.approvalId];
      if (!a || a.state !== 'pending' || a.runId !== ev.runId) break;
      approvals = { ...approvals, [a.id]: { ...a, state: ev.data.answer } };
      if (ev.data.answer === 'declined') run = withStep(run, a.stepId, (s) => ({ ...s, state: 'skipped', detail: s.detail }));
      break;
    }
    case 'step.done':
      run = withStep(run, ev.stepId, (s) => ({ ...s, state: 'done', pct: 100, endedAt: ev.at, detail: ev.data?.detail ?? s.detail, credits: ev.data?.credits ?? s.credits }));
      if (ev.data?.artifact) run = { ...run, artifacts: [...run.artifacts, ev.data.artifact] };
      break;
    case 'step.failed':
      run = withStep(run, ev.stepId, (s) => ({ ...s, state: 'failed', endedAt: ev.at, detail: ev.data?.detail ?? s.detail }));
      break;
    case 'run.paused':
      if (run.state === 'running') run = { ...run, state: 'paused' };
      break;
    case 'run.resumed':
      if (run.state === 'paused') run = { ...run, state: 'running' };
      break;
    case 'run.cost': {
      const c = ev.data?.creditsSpent;
      // spend only grows, and never past the reservation (the ledger caps it; the screen must not show more)
      if (typeof c === 'number' && Number.isFinite(c)) run = { ...run, creditsSpent: Math.min(run.maxCredits, Math.max(run.creditsSpent, c)) };
      break;
    }
    case 'run.delivered': {
      const state: RunState = ev.data?.cancelled ? 'cancelled' : ev.data?.failed ? 'failed' : 'delivered';
      run = { ...run, state, endedAt: ev.at, steps: run.steps.map((s) => (s.state === 'pending' || s.state === 'queued' || s.state === 'waiting' ? { ...s, state: 'skipped' } : s)) };
      approvals = Object.fromEntries(Object.entries(approvals).map(([k, a]) => [k, a.runId === ev.runId && a.state === 'pending' ? { ...a, state: 'expired' as const } : a]));
      break;
    }
    case 'run.settled':
      if (closed) run = { ...run, state: run.state === 'delivered' ? 'settled' : run.state };
      break;
    default:
      return st;
  }
  if (closed && ev.type !== 'run.settled' && ev.type !== 'run.cost') return st;
  if (run === prev && approvals === st.approvals) return st;
  return { ...st, runs: { ...st.runs, [ev.runId]: settlePct(prev, run) }, approvals };
}

export const reduceAll = (events: readonly TimelineEvent[], from: WorkspaceState = EMPTY) => events.reduce(reduce, from);

/** The approval center's list: pending first (soonest expiry first), then the answered ones, newest first. */
export function approvalList(st: WorkspaceState, now: number): ApprovalView[] {
  const all = Object.values(st.approvals).map((a) => (a.state === 'pending' && a.expiresAt <= now ? { ...a, state: 'expired' as const } : a));
  const pending = all.filter((a) => a.state === 'pending').sort((a, b) => a.expiresAt - b.expiresAt);
  const rest = all.filter((a) => a.state !== 'pending').sort((a, b) => b.expiresAt - a.expiresAt);
  return [...pending, ...rest];
}

/** Steps that may run side by side: same dependencies, more than one of them (the "in parallel" mark). */
export function parallelGroups(steps: readonly StepView[]): Map<string, number> {
  const byDeps = new Map<string, string[]>();
  for (const s of steps) {
    const k = [...s.dependsOn].sort().join(',');
    byDeps.set(k, [...(byDeps.get(k) ?? []), s.id]);
  }
  const out = new Map<string, number>();
  let g = 0;
  for (const ids of byDeps.values()) if (ids.length > 1) { g += 1; for (const id of ids) out.set(id, g); }
  return out;
}

export function clockText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
