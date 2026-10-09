/**
 * lib/agent/media/jobFollow.ts — the studio's half of an Agent G job on the lease queue (lib/orchestrator/jobLease),
 * shared by the montage (./montageClient) and the audio extraction (./audioClient): send `run` for the plan the user
 * confirmed to the job's own route, then read the TASK (/api/tasks, one shape for every job: lib/tasks/taskView) every
 * few seconds for its stage and percent until it is delivered or failed. Stop goes through the same task route.
 *
 * `run` only queues and answers at once; a worker does the work. Re-sending `run` for the same quote never starts a
 * second job (the server replays it), so an answer lost on the way is simply asked for again. The status read is also
 * what wakes a worker when none has the job, so a closed connection, a locked phone or a worker that died costs
 * nothing: the job goes on server-side either way. Browser-side, every effect injected (fetch, the clock).
 */

/** How often the job is read while it is queued or running. */
export const POLL_MS = 3_000;
/** How many times `run` is sent when its answer does not come back (it is idempotent per quote). */
export const SEND_TRIES = 3;
/**
 * How long the chat follows a job: a wait for a worker, a first attempt that dies at the route's 600 s budget, the lease
 * lapsing (90 s), and the one retry at full length.
 */
export const FOLLOW_MS = 25 * 60_000;

import type { TaskView } from '@/lib/tasks/taskView';

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** The one task route (app/api/tasks): read, list, stop. */
export const TASKS_ROUTE = '/api/tasks';

export interface FollowDeps {
  fetch: Fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  onProgress: (pct: number | null, stage: string | null) => void;
}

/** The `run` answer as a job's route reports it (an executor's JobView). */
export type JobViewBody = Record<string, unknown> & { ok?: unknown; jobId?: unknown; status?: unknown };

export const postJson = (f: Fetch, route: string, body: unknown) =>
  f(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });

export async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try { return (await res.json()) as Record<string, unknown>; } catch { return null; }
}

export interface FollowSpec<R> {
  /** The job's own route, where `run` goes. */
  route: string;
  /** The `run` request, sent verbatim (action: 'run', the signed plan, its token). */
  runBody: Record<string, unknown>;
  /** The quote's job id (the server may answer with the same). */
  jobId: string;
  /** A finished task's result (or its failure in the chat's codes), or null while it is still going. */
  done: (t: TaskView) => R | null;
  /** A refusal (or a failed job's reason) in the chat's own codes. */
  refused: (status: number, body: unknown) => R;
  /** The follow ended without an answer: the run never got through (network) or the job is gone (not_found). */
  lost: (why: 'network' | 'not_found') => R;
}

/** Queue the confirmed plan, then follow the job to its end, reporting its progress. */
export async function sendAndFollow<R>(deps: FollowDeps, spec: FollowSpec<R>): Promise<R> {
  let jobId = spec.jobId;
  let queued = false;
  // A replayed run that already ended is read at once instead of after a poll interval.
  let readNow = false;
  const report = (v: { pct?: unknown; stage?: unknown }) =>
    deps.onProgress(typeof v.pct === 'number' ? v.pct : null, typeof v.stage === 'string' ? v.stage : null);

  // ── queue it ───────────────────────────────────────────────────────────────────────────────────────────────────────
  for (let tries = 0; tries < SEND_TRIES && !queued; tries++) {
    if (tries) await deps.sleep(POLL_MS);
    try {
      const res = await postJson(deps.fetch, spec.route, spec.runBody);
      const body = (await readJson(res)) as JobViewBody | null;
      if (res.ok && body?.ok === true) {
        if (typeof body.jobId === 'string') jobId = body.jobId;
        queued = true;
        readNow = body.status === 'completed' || body.status === 'failed';
        if (!readNow) report(body as { pct?: unknown; stage?: unknown });
      } else if (body?.error === 'already_failed') {
        queued = true; // an earlier send of this run got through and the job ended: its task says how
        readNow = true;
      } else if (body && res.status < 500) {
        return spec.refused(res.status, body);
      }
      // No body, or a gateway error: whether it was queued is unknown. Send it again.
    } catch {
      // The connection dropped. Send it again.
    }
  }

  // ── follow it ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const until = deps.now() + FOLLOW_MS;
  let unknown = 0;
  while (deps.now() < until) {
    if (readNow) readNow = false;
    else await deps.sleep(POLL_MS);
    let res: Response;
    let body: Record<string, unknown> | null;
    try {
      res = await deps.fetch(`${TASKS_ROUTE}?id=${encodeURIComponent(jobId)}`, { credentials: 'include', cache: 'no-store' });
      body = await readJson(res);
    } catch {
      continue; // offline for a moment: the job goes on
    }
    const task = body?.ok === true && body.task && typeof body.task === 'object' ? (body.task as TaskView) : null;
    if (res.ok && task) {
      queued = true;
      const end = spec.done(task);
      if (end) return end;
      report(task);
      continue;
    }
    if (res.status === 404 && body?.error === 'not_found' && typeof body.message === 'string') {
      // No such job: the run never got through (or this is not the user's). Give it a few reads, then say so.
      if (queued || ++unknown >= 3) return spec.lost(queued ? 'not_found' : 'network');
      continue;
    }
    if (res.status === 401 || res.status === 404) return spec.refused(res.status, body);
    // 429 or a 5xx: read again on the next tick.
  }
  return spec.lost('network');
}

/** Stop a task (/api/tasks). The run's own follow then reports it as cancelled. */
export async function cancelTask(f: Fetch, id: string): Promise<boolean> {
  try {
    return (await postJson(f, TASKS_ROUTE, { action: 'cancel', id })).ok;
  } catch {
    return false;
  }
}

/** Is this route open to this user? A closed or unreachable route is simply "no": the chat keeps its old flow. */
export async function routeEnabled(f: Fetch, route: string): Promise<boolean> {
  try {
    const res = await f(route, { credentials: 'include', cache: 'no-store' });
    return res.ok && (await readJson(res))?.enabled === true;
  } catch {
    return false;
  }
}
