/**
 * lib/agent/media/taskStream.ts — the browser half of the live timeline: one task's Server-Sent Events
 * (app/api/tasks/stream) as a watch the follows (./jobFollow followTask, lib/agent/run/runClient followRun) wait on
 * instead of a fixed poll interval. An `agent_progress` event hands them the task at once, so the card moves the
 * moment the server sees the step change (GG 2026-11-06 06:30Z).
 *
 * A watch that cannot work (no EventSource, the route refused, the stream broke for good) is `dead`: the follow goes
 * back to reading /api/tasks every few seconds, as before. A stream the server ends at its time limit (`reconnect`) or
 * that drops for a moment is opened again by the browser itself (EventSource retries), up to a few times.
 */
import type { TaskView } from '@/lib/tasks/taskView';
import type { AgentProgressEvent } from '@/lib/tasks/agentProgress';

export const STREAM_ROUTE = '/api/tasks/stream';
/** How long a follow waits on the stream before it reads /api/tasks itself anyway (a quiet stream is not a dead job). */
export const STREAM_WAIT_MS = 20_000;
/** Errors in a row after which the watch gives up and the follow polls. */
const MAX_ERRORS = 4;

export interface TaskWatch {
  /** The next task the stream sends, or null after `timeoutMs` or once the watch is dead. */
  next: (timeoutMs: number) => Promise<TaskView | null>;
  /** True once the stream cannot help any more: the follow polls instead. */
  readonly dead: boolean;
  close: () => void;
  /** The last progress event (the timeline payload), for whoever wants the server's own step list. */
  readonly progress: AgentProgressEvent | null;
}

/** The smallest EventSource surface used here (the tests pass a fake). */
export interface EventSourceLike {
  readyState: number;
  onerror: ((e: unknown) => void) | null;
  addEventListener: (type: string, fn: (e: { data?: unknown }) => void) => void;
  close: () => void;
}
export type EventSourceCtor = new (url: string, init?: { withCredentials?: boolean }) => EventSourceLike;

const CLOSED = 2;

export function watchTask(id: string, opts: { lang?: string; after?: number; ES?: EventSourceCtor | null } = {}): TaskWatch | null {
  const ES = opts.ES !== undefined ? opts.ES : (typeof EventSource === 'undefined' ? null : (EventSource as unknown as EventSourceCtor));
  if (!ES) return null;
  const qs = new URLSearchParams({ id });
  if (opts.lang) qs.set('lang', opts.lang);
  if (opts.after !== undefined) qs.set('after', String(opts.after));
  let es: EventSourceLike;
  try {
    es = new ES(`${STREAM_ROUTE}?${qs.toString()}`, { withCredentials: true });
  } catch {
    return null;
  }

  let dead = false;
  let errors = 0;
  let progress: AgentProgressEvent | null = null;
  let pending: TaskView | null = null;
  let waiter: ((t: TaskView | null) => void) | null = null;

  const hand = (t: TaskView | null) => {
    if (waiter) { const w = waiter; waiter = null; w(t); } else if (t) pending = t;
  };
  const kill = () => {
    if (dead) return;
    dead = true;
    try { es.close(); } catch { /* ignore */ }
    hand(null);
  };

  es.addEventListener('agent_progress', (e) => {
    errors = 0;
    try {
      const ev = JSON.parse(String(e.data)) as AgentProgressEvent;
      if (ev?.type === 'agent_progress' && ev.task && typeof ev.task === 'object') {
        progress = ev;
        hand(ev.task);
      }
    } catch { /* a frame that is not ours: ignore it */ }
  });
  // The task ended or is gone: the follow's own read says how. The stream has nothing more to give.
  es.addEventListener('end', () => kill());
  es.addEventListener('gone', () => kill());
  es.onerror = () => {
    // EventSource retries by itself (a `reconnect` at the time limit, a dropped connection) unless it gave up.
    if (es.readyState === CLOSED || ++errors >= MAX_ERRORS) kill();
  };

  return {
    next(timeoutMs) {
      if (pending) { const t = pending; pending = null; return Promise.resolve(t); }
      if (dead) return Promise.resolve(null);
      return new Promise((resolve) => {
        const timer = setTimeout(() => { if (waiter === done) waiter = null; resolve(null); }, timeoutMs);
        const done = (t: TaskView | null) => { clearTimeout(timer); resolve(t); };
        waiter = done;
      });
    },
    get dead() { return dead; },
    get progress() { return progress; },
    close: kill,
  };
}
