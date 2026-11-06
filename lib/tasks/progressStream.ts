/**
 * lib/tasks/progressStream.ts — the server half of the live timeline: read one task again and again, and send an
 * `agent_progress` event (./agentProgress) the moment anything about it changes, until it ends (GG 2026-11-06 06:30Z:
 * the card must update without a reload as soon as the agent starts, finishes or moves to a step).
 *
 * Each read is the same read /api/tasks makes (lib/tasks/taskService readTask), so it also does what a read does there:
 * a lease job no worker holds gets one, a multi-step run moves on. A run's events are asked for after the newest one
 * already sent, so each event carries only what is new.
 *
 * The stream ends on its own: when the task ends (one last event, then `end`), when it is gone, when the client goes
 * away, or after `maxMs` (`reconnect`: a serverless function has a time limit; the browser opens a new stream and
 * the job goes on server-side meanwhile). A comment line every `heartbeatMs` keeps proxies from closing a quiet one.
 *
 * Every effect is injected (the read, the clock, the sleep, the writer), so the tests drive it without a server.
 */
import { agentProgress } from './agentProgress';
import { isFinalStatus } from './statusModel';
import type { TaskView } from './taskView';

export const STREAM_INTERVAL_MS = 1_200;
export const STREAM_HEARTBEAT_MS = 15_000;
/** Under the route's maxDuration (300 s), with room for the last read. */
export const STREAM_MAX_MS = 270_000;

export interface StreamDeps {
  /** One read of the task, events after `after` (null: gone, or not the caller's). */
  read: (after: number | undefined) => Promise<TaskView | null>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** Write one SSE frame (an event with JSON data, or a comment). False: the client is gone. */
  write: (frame: string) => boolean;
  /** Has the client gone away? */
  closed: () => boolean;
}

export type StreamEnd = 'final' | 'gone' | 'closed' | 'timeout';

export const sseEvent = (event: string, data: unknown): string => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** What is compared between two reads: everything but the clock of the row's last write. */
function signature(t: TaskView): string {
  const { updatedAt: _u, events: _e, ...rest } = t;
  return JSON.stringify(rest);
}

export async function streamTask(
  deps: StreamDeps,
  opts: { lang?: unknown; after?: number; intervalMs?: number; heartbeatMs?: number; maxMs?: number } = {},
): Promise<StreamEnd> {
  const interval = opts.intervalMs ?? STREAM_INTERVAL_MS;
  const heartbeat = opts.heartbeatMs ?? STREAM_HEARTBEAT_MS;
  const until = deps.now() + (opts.maxMs ?? STREAM_MAX_MS);
  let after = opts.after;
  let last = '';
  let lastWrite = deps.now();
  let first = true;
  let misses = 0;
  const seen = new Set<string>();

  const send = (frame: string): boolean => {
    lastWrite = deps.now();
    return deps.write(frame);
  };

  while (deps.now() < until) {
    if (deps.closed()) return 'closed';
    if (!first) await deps.sleep(interval);
    first = false;
    if (deps.closed()) return 'closed';

    let task: TaskView | null;
    try {
      task = await deps.read(after);
    } catch {
      misses++;
      // A database hiccup: keep the stream and read again; a long run of them ends it (the client falls back).
      if (misses >= 5) { send(sseEvent('reconnect', { reason: 'read_failed' })); return 'timeout'; }
      continue;
    }
    misses = 0;
    if (!task) {
      send(sseEvent('gone', { error: 'not_found' }));
      return 'gone';
    }
    if (task.stage) seen.add(task.stage);
    for (const st of task.steps ?? []) if (st.stage) seen.add(st.stage);
    const newEvents = task.events?.length ?? 0;
    if (newEvents) after = Math.max(after ?? 0, ...task.events!.map((e) => e.seq));
    const sig = signature(task);
    if (sig !== last || newEvents) {
      last = sig;
      if (!send(sseEvent('agent_progress', agentProgress(task, { lang: opts.lang, seen })))) return 'closed';
    } else if (deps.now() - lastWrite >= heartbeat) {
      if (!send(': keep-alive\n\n')) return 'closed';
    }
    if (isFinalStatus(task.status)) {
      send(sseEvent('end', { status: task.status }));
      return 'final';
    }
  }
  send(sseEvent('reconnect', { reason: 'time_limit' }));
  return 'timeout';
}
