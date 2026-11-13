/**
 * lib/agent/liveWorkspace/player.ts — replays a mock script into workspace state (v5.1 Phase 7 preview). Pure: the caller
 * owns the clock and calls `tick(now)`; nothing here touches timers or the network.
 *
 *   - a line due at `ms` is released once `now - t0 >= ms`;
 *   - a line with `after` waits for that approval's yes, then counts its `ms` from the yes;
 *   - a paused run holds its lines (their due times move by the pause), resume lets them go;
 *   - a decline or a cancel drops that run's held lines and ends it.
 */
import { EMPTY, reduce, type TimelineEvent, type WorkspaceState } from './model';
import type { ScriptLine } from './mock';

interface Held { line: ScriptLine; dueAt: number | null }

export interface Player {
  t0: number;
  state: WorkspaceState;
  queue: Held[];
  approvedAt: Record<string, number>;
  pausedAt: Record<string, number>;
}

export function start(script: readonly ScriptLine[], t0: number): Player {
  return { t0, state: EMPTY, queue: script.map((line) => ({ line, dueAt: line.after ? null : t0 + line.ms })), approvedAt: {}, pausedAt: {} };
}

const runOf = (ev: TimelineEvent) => ev.runId;

export function tick(p: Player, now: number): Player {
  let state = p.state;
  const queue: Held[] = [];
  for (const h of p.queue) {
    const due = h.dueAt ?? (h.line.after && p.approvedAt[h.line.after] !== undefined ? p.approvedAt[h.line.after]! + h.line.ms : null);
    if (due !== null && due <= now && p.pausedAt[runOf(h.line.ev)] === undefined) state = reduce(state, { ...h.line.ev, at: due } as TimelineEvent);
    else queue.push({ ...h, dueAt: due });
  }
  return state === p.state && queue.length === p.queue.length ? p : { ...p, state, queue };
}

export function answer(p: Player, approvalId: string, ans: 'approved' | 'declined', now: number): Player {
  const a = p.state.approvals[approvalId];
  if (!a || a.state !== 'pending') return p;
  let state = reduce(p.state, { type: 'approval.answered', runId: a.runId, at: now, data: { approvalId, answer: ans } });
  if (ans === 'approved') return { ...p, state, approvedAt: { ...p.approvedAt, [approvalId]: now } };
  state = reduce(state, { type: 'run.delivered', runId: a.runId, at: now, data: { cancelled: true } });
  return { ...p, state, queue: p.queue.filter((h) => runOf(h.line.ev) !== a.runId) };
}

export function pause(p: Player, runId: string, now: number): Player {
  if (p.state.runs[runId]?.state !== 'running' || p.pausedAt[runId] !== undefined) return p;
  return { ...p, state: reduce(p.state, { type: 'run.paused', runId, at: now }), pausedAt: { ...p.pausedAt, [runId]: now } };
}

export function resume(p: Player, runId: string, now: number): Player {
  const since = p.pausedAt[runId];
  if (since === undefined) return p;
  const shift = now - since;
  const pausedAt = { ...p.pausedAt };
  delete pausedAt[runId];
  // held lines of this run move by the length of the pause; so do approvals answered for it
  const queue = p.queue.map((h) => (runOf(h.line.ev) === runId && h.dueAt !== null ? { ...h, dueAt: h.dueAt + shift } : h));
  const approvedAt = Object.fromEntries(Object.entries(p.approvedAt).map(([k, v]) => [k, p.state.approvals[k]?.runId === runId ? v + shift : v]));
  return { ...p, state: reduce(p.state, { type: 'run.resumed', runId, at: now }), queue, approvedAt, pausedAt };
}

export function cancel(p: Player, runId: string, now: number): Player {
  const r = p.state.runs[runId];
  if (!r || r.state === 'delivered' || r.state === 'settled' || r.state === 'failed' || r.state === 'cancelled') return p;
  const pausedAt = { ...p.pausedAt };
  delete pausedAt[runId];
  return { ...p, state: reduce(p.state, { type: 'run.delivered', runId, at: now, data: { cancelled: true } }), queue: p.queue.filter((h) => runOf(h.line.ev) !== runId), pausedAt };
}
