/**
 * lib/agent/run/runClient.ts — the studio's calls for a multi-step Agent G run (PART 6) over the one task route
 * (/api/tasks): upload the attachments, ask for the plan, start it on the user's tap, follow it (its steps and its
 * numbered events, `after=n` so each read carries only what is new), say yes to a step's own price, stop it, carry an
 * ended run on. Browser-side, every effect injected (fetch, the upload, the clock), so the whole conversation is tested
 * without a network.
 *
 * Nothing here decides anything the server does not check again: the plan is signed for this user and this exact spec,
 * a second Start replays the same run, a yes names the quote it is for, and a stop or a resume is the owner's own.
 */
import { cancelTask, postJson, readJson, POLL_MS, SEND_TRIES, TASKS_ROUTE, type Fetch } from '@/lib/agent/media/jobFollow';
import { isFinalStatus } from '@/lib/tasks/statusModel';
import type { TaskView } from '@/lib/tasks/taskView';
import type { RunEvent } from './runEngine';
import type { RunSpec, RunTool } from './runSpec';
import { runCodeOf, type RunChatCode } from './runChat';

/**
 * How long the chat follows a run: two steps, each of which may wait for a worker, die at its route's 600 s budget and
 * be retried once at full length, and a step that waits for the user's yes. A run outlives this either way (the sweep
 * moves it, the job tray shows it); the card then says it is still going.
 */
export const RUN_FOLLOW_MS = 45 * 60_000;
/** Events the card keeps (the run keeps 50; the card narrates the last few). */
export const EVENTS_KEPT = 50;

export interface RunPlanView {
  runId: string;
  credits: number;
  expiresAt: number;
  steps: Array<{ id: string; tool: RunTool; credits: number }>;
}

export interface UploadDeps {
  /** Puts one attachment in the user's own uploads and returns its storage path (null = it did not land). */
  upload: (dataUrl: string, mimeType: string) => Promise<string | null>;
  /** Each attachment that has settled (landed or not), as it happens: the card's „2/4" on its upload step. */
  onUploaded?: (settled: number, total: number) => void;
}

export type Fail = { ok: false; code: RunChatCode };

/** Upload every attachment, three at a time, in order. The indexes of the ones that did not land, when any. */
export async function uploadAll(
  deps: UploadDeps,
  files: ReadonlyArray<{ dataUrl: string; mimeType: string }>,
): Promise<{ ok: true; paths: string[] } | { ok: false; code: 'upload_failed'; files: number[] }> {
  const paths: Array<string | null> = new Array(files.length).fill(null);
  let next = 0;
  let settled = 0;
  const worker = async () => {
    while (next < files.length) {
      const i = next++;
      paths[i] = await deps.upload(files[i]!.dataUrl, files[i]!.mimeType).catch(() => null);
      settled += 1;
      try { deps.onUploaded?.(settled, files.length); } catch { /* a progress line never stops the upload */ }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const missing = paths.flatMap((p, i) => (p ? [] : [i]));
  return missing.length ? { ok: false, code: 'upload_failed', files: missing } : { ok: true, paths: paths as string[] };
}

/** Check the steps and have them signed at their list price. Spends nothing, starts nothing. */
export async function planRunClient(f: Fetch, spec: RunSpec): Promise<{ ok: true; plan: RunPlanView; spec: RunSpec; token: string } | Fail> {
  try {
    const res = await postJson(f, TASKS_ROUTE, { action: 'plan', spec });
    const body = await readJson(res);
    if (res.ok && body?.ok === true && body.plan && typeof body.token === 'string') {
      return { ok: true, plan: body.plan as RunPlanView, spec: (body.spec as RunSpec) ?? spec, token: body.token };
    }
    return { ok: false, code: runCodeOf(res.status, body) };
  } catch {
    return { ok: false, code: 'network' };
  }
}

/**
 * The user's Start: create the run from the signed plan. Sent again when its answer is lost (a second send of the same
 * plan replays the same run, it never starts another).
 */
export async function startRunClient(
  deps: { fetch: Fetch; sleep: (ms: number) => Promise<void> },
  input: { spec: RunSpec; token: string },
): Promise<{ ok: true; runId: string } | Fail> {
  for (let tries = 0; tries < SEND_TRIES; tries++) {
    if (tries) await deps.sleep(POLL_MS);
    try {
      const res = await postJson(deps.fetch, TASKS_ROUTE, { action: 'run', spec: input.spec, token: input.token });
      const body = await readJson(res);
      if (res.ok && body?.ok === true && typeof body.jobId === 'string') return { ok: true, runId: body.jobId };
      if (body && res.status < 500) return { ok: false, code: runCodeOf(res.status, body) };
      // No body, or a gateway error: whether it was created is unknown. Send it again (it replays).
    } catch {
      // The connection dropped. Send it again.
    }
  }
  return { ok: false, code: 'network' };
}

/** Events merged by number, oldest first, the newest EVENTS_KEPT kept. */
export function mergeEvents(have: readonly RunEvent[] | undefined, more: readonly RunEvent[] | undefined): RunEvent[] {
  const bySeq = new Map<number, RunEvent>();
  for (const e of have ?? []) bySeq.set(e.seq, e);
  for (const e of more ?? []) if (e && typeof e.seq === 'number') bySeq.set(e.seq, e);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq).slice(-EVENTS_KEPT);
}

export interface RunFollowDeps {
  fetch: Fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** Each read of the run, with every event seen so far. */
  onTask: (task: TaskView, events: RunEvent[]) => void;
  /** The card stopped following (a resume took over, the bubble went away): end quietly. */
  stopped?: () => boolean;
}

export type RunFollowEnd = { ok: true; task: TaskView; events: RunEvent[] } | { ok: false; code: 'network' | 'not_found' | 'unauthenticated' | 'stopped' };

/**
 * Follow a run to its end. Each read asks only for the events after the last one seen, and also moves the run on
 * server-side (a read is a tick), so a closed tab costs nothing: the sweep carries it on and the tray shows it.
 */
export async function followRun(deps: RunFollowDeps, runId: string, opts: { events?: RunEvent[] } = {}): Promise<RunFollowEnd> {
  let events = mergeEvents(opts.events, []);
  const until = deps.now() + RUN_FOLLOW_MS;
  let first = true;
  let unknown = 0;
  while (deps.now() < until) {
    if (deps.stopped?.()) return { ok: false, code: 'stopped' };
    if (first) first = false;
    else await deps.sleep(POLL_MS);
    if (deps.stopped?.()) return { ok: false, code: 'stopped' };
    const after = events.length ? events[events.length - 1]!.seq : undefined;
    let res: Response;
    let body: Record<string, unknown> | null;
    try {
      res = await deps.fetch(`${TASKS_ROUTE}?id=${encodeURIComponent(runId)}${after !== undefined ? `&after=${after}` : ''}`, { credentials: 'include', cache: 'no-store' });
      body = await readJson(res);
    } catch {
      continue; // offline for a moment: the run goes on
    }
    const task = res.ok && body?.ok === true && body.task && typeof body.task === 'object' ? (body.task as TaskView) : null;
    if (task) {
      events = mergeEvents(events, task.events);
      deps.onTask(task, events);
      if (isFinalStatus(task.status)) return { ok: true, task, events };
      continue;
    }
    if (res.status === 401) return { ok: false, code: 'unauthenticated' };
    if (res.status === 404 && body?.error === 'not_found' && typeof body.message === 'string') {
      // Just created and not readable yet, or not this user's: a few reads, then say so.
      if (++unknown >= 3) return { ok: false, code: 'not_found' };
      continue;
    }
    // 429 or a 5xx: read again on the next tick.
  }
  return { ok: false, code: 'network' };
}

/** The user's yes to one step's own price, bound to that quote. The run's state after it. */
export async function approveRunStep(f: Fetch, input: { runId: string; step: string; quoteId: string }): Promise<{ ok: true; task: TaskView | null } | Fail> {
  try {
    const res = await postJson(f, TASKS_ROUTE, { action: 'approve', id: input.runId, step: input.step, quoteId: input.quoteId });
    const body = await readJson(res);
    if (res.ok && body?.ok === true) return { ok: true, task: body.task && typeof body.task === 'object' ? (body.task as TaskView) : null };
    return { ok: false, code: runCodeOf(res.status, body) };
  } catch {
    return { ok: false, code: 'network' };
  }
}

/** Carry an ended run on: a NEW run that reuses every delivered step and runs the rest again. Its id. */
export async function resumeRunClient(f: Fetch, runId: string): Promise<{ ok: true; runId: string } | Fail> {
  try {
    const res = await postJson(f, TASKS_ROUTE, { action: 'resume', id: runId });
    const body = await readJson(res);
    if (res.ok && body?.ok === true && typeof body.jobId === 'string') return { ok: true, runId: body.jobId };
    return { ok: false, code: runCodeOf(res.status, body) };
  } catch {
    return { ok: false, code: 'network' };
  }
}

/** Stop a run: nothing new starts, each step job stops (and is paid back), delivered results stay. */
export function cancelRun(f: Fetch, runId: string): Promise<boolean> {
  return cancelTask(f, runId);
}
