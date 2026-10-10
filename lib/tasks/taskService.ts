/**
 * lib/tasks/taskService.ts — read, list and stop the caller's tasks (./taskView) through one door, whatever runs them.
 * Every effect is injected (./taskLive wires the real ones), so the rules are tested without a database.
 *
 * Rules:
 *   · Only the owner's rows: every read is scoped to the caller's user id, and a row of anyone else is "not found",
 *     never "forbidden" (no probing for other people's ids).
 *   · A lease job (Agent G's montage, audio extraction) is read through ITS executor, so the task API and the job's own
 *     route can never disagree about what the row means. That read is also recovery: a job no worker holds is handed to
 *     one, exactly as the job's own route does, but only while Agent G's media execution is open to this user.
 *   · Stopping is the executor's cancel (its worker kills ffmpeg at the next heartbeat; a charge is paid back). A studio
 *     render has no server-side stop: it is reported as not cancellable, never faked.
 */
import { isFinal, type TaskRow, type TaskView } from './taskView';

/** How a read was asked for: whether work may start on it, and (a run) the last event the caller already has. */
export interface ReadOpts {
  workersOpen: boolean;
  after?: number;
}

/** One lease kind, as the task API sees it. */
export interface TaskKind {
  /**
   * The owner's view through the executor, and whether the job needs a worker now. Null = not theirs / not this kind.
   * A multi-step run is also MOVED by this read (lib/agent/run tickRun), but only while `workersOpen`.
   */
  status(row: TaskRow, userId: string, opts: ReadOpts): Promise<{ task: TaskView; needsWorker: boolean } | null>;
  /** The view for a list: no recovery, no re-signing. */
  view(row: TaskRow): TaskView | null;
  cancel(userId: string, id: string): Promise<'ok' | 'not_running' | 'not_found'>;
  startWorker(id: string): void;
}

export interface TaskDeps {
  /** The caller's row with this id, or null (none, or someone else's). */
  readRow(userId: string, id: string): Promise<TaskRow | null>;
  /** The caller's newest rows (by last change), live ones only when `active`. */
  listRows(userId: string, opts: { active: boolean; limit: number }): Promise<TaskRow[]>;
  /** The lease kind a row runs under (params._exec.kind), or null for a studio render. */
  kindOf(row: TaskRow): string | null;
  kinds: Readonly<Record<string, TaskKind>>;
  /** Fallback view of a row that is not a lease job. */
  plain(row: TaskRow): TaskView;
}

export const MAX_LIST = 20;

/** One task of the caller's, or null. A lease job with no live worker gets one when `workersOpen`. */
export async function readTask(deps: TaskDeps, input: { userId: string; id: string; workersOpen: boolean; after?: number }): Promise<TaskView | null> {
  const row = await deps.readRow(input.userId, input.id);
  if (!row) return null;
  const kind = deps.kindOf(row);
  const k = kind ? deps.kinds[kind] : undefined;
  if (!k) return deps.plain(row);
  const s = await k.status(row, input.userId, { workersOpen: input.workersOpen, ...(input.after !== undefined ? { after: input.after } : {}) });
  if (!s) return null;
  if (s.needsWorker && input.workersOpen) k.startWorker(row.id);
  return s.task;
}

/** The caller's newest tasks, newest first. */
export async function listTasks(deps: TaskDeps, input: { userId: string; active: boolean; limit: number }): Promise<TaskView[]> {
  const limit = Math.min(MAX_LIST, Math.max(1, Math.floor(input.limit) || 1));
  const rows = await deps.listRows(input.userId, { active: input.active, limit });
  const out: TaskView[] = [];
  for (const row of rows) {
    const kind = deps.kindOf(row);
    const k = kind ? deps.kinds[kind] : undefined;
    const t = k ? k.view(row) : deps.plain(row);
    if (t && (!input.active || !isFinal(t))) out.push(t);
  }
  return out;
}

export type CancelOutcome =
  | { ok: true; task: TaskView | null }
  | { ok: false; error: 'not_found' | 'not_running' | 'not_cancellable' };

/** Stop one of the caller's tasks. Only a lease job can be stopped server-side. */
export async function cancelTask(deps: TaskDeps, input: { userId: string; id: string }): Promise<CancelOutcome> {
  const row = await deps.readRow(input.userId, input.id);
  if (!row) return { ok: false, error: 'not_found' };
  const kind = deps.kindOf(row);
  const k = kind ? deps.kinds[kind] : undefined;
  if (!k) return { ok: false, error: isFinal(deps.plain(row)) ? 'not_running' : 'not_cancellable' };
  const r = await k.cancel(input.userId, input.id);
  if (r !== 'ok') return { ok: false, error: r };
  const after = await deps.readRow(input.userId, input.id);
  return { ok: true, task: after ? k.view(after) : null };
}
