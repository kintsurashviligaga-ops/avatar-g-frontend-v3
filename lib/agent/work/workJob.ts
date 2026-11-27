/**
 * lib/agent/work/workJob.ts — a work-mode step (browser, code, pdf, export) as a job on the lease queue. v5.1 Phase 3.5c,
 * PREPARED, NOT WIRED: nothing calls this yet, and nothing will until 3.5b works in production (GG 2026-11-13).
 *
 * Today each work-mode node runs inside the request that confirmed it (lib/agent/browser/quote runBrowserQuote,
 * lib/agent/sandbox/codeQuote runCodeQuote). A run on the engine needs each node to be an ordinary job instead, like a
 * montage step: queued once per signed quote, claimed by one worker, renewed by its heartbeat, stopped by the owner's
 * cancel, retried once by the lease if its worker dies. That is this file. What the node DOES is unchanged: the worker
 * calls the same run function with the same signed token, so the quote check, the one-time claim, the $20 sandbox
 * ledger and the workspace trail (tasks/<id>.json) all stay where they are.
 *
 *   enqueue  the signed quote becomes a pending row of kind WORK_KIND (the insert is the idempotency check)
 *   work     claim → heartbeat every HEARTBEAT_MS (an abort on cancel or a lost lease) → run → complete / fail
 *   view     what the row says, for the run's tick (outputs are workspace paths, never links)
 *   cancel   the owner's stop: the row fails, the worker aborts at its next heartbeat. Work steps charge 0 credits
 *            (the sandbox spend is the server's own $20 ledger), so nothing is owed back.
 *
 * A failure the tool reports is final at once (bad input, policy, a used quote). Only a dead worker is retried, by the
 * lease, and the run function's own one-time claim makes that retry answer `quote_used` rather than run twice: the
 * engine then sees a failure, not a double spend.
 */
import {
  HEARTBEAT_MS, cancel as cancelLease, claim, complete, enqueue, fail, heartbeat, mustStop, type Beat, type LeaseRow, type LeaseStore,
} from '@/lib/orchestrator/jobLease';

export const WORK_KIND = 'agent-work';
/**
 * Work rows are filed as 'document': the kind Agent G's PDFs and code-run reports already use in production (migration
 * 20261031a, DB-verified 2026-11-06). The row carries no signed URL, so it is never a Library item by itself, and the job
 * tray (app/api/orchestrator/jobs) already leaves 'document' rows out: the run's own row is what the user sees.
 */
export const WORK_SERVICE_TYPE = 'document' as const;
export const WORK_TOOLS = ['browser', 'code', 'pdf', 'export'] as const;
export type WorkTool = (typeof WORK_TOOLS)[number];
export const isWorkTool = (v: unknown): v is WorkTool => typeof v === 'string' && (WORK_TOOLS as readonly string[]).includes(v);

/** What one run of a work tool answers. `outputs` are paths in the user's workspace (or a Library id, for export). */
export type WorkRunOutcome =
  | { ok: true; outputs: string[]; summary?: Record<string, unknown> }
  | { ok: false; error: string; message?: string };

export interface WorkJobDeps {
  store: LeaseStore;
  now(): number;
  /** Run the tool exactly as its own route does, with the signed request and token, until done or `signal` aborts. */
  run(tool: WorkTool, input: { userId: string; request: unknown; token: string }, signal: AbortSignal): Promise<WorkRunOutcome>;
  /** Repeat `fn` every `ms` until the returned stop is called (setInterval in production, a manual clock in tests). */
  every(ms: number, fn: () => Promise<void>): () => void;
  audit(ev: { userId: string; runId?: string; jobId: string; tool: WorkTool | 'unknown'; outcome: 'ok' | 'retried' | 'failed' | 'cancelled' | 'lost' | 'delivered'; detail?: string }): Promise<void>;
}

interface WorkJobParams { tool: WorkTool; request: unknown; token: string }

const jobOf = (row: Pick<LeaseRow, 'params'>): WorkJobParams | null => {
  const j = row.params._work as Partial<WorkJobParams> | undefined;
  return j && isWorkTool(j.tool) && typeof j.token === 'string' && j.token ? { tool: j.tool, request: j.request, token: j.token } : null;
};
const runOf = (row: Pick<LeaseRow, 'params'>): { runId?: string } => {
  const p = row.params._parent;
  return typeof p === 'string' && p ? { runId: p } : {};
};

/** Queue one signed work step as job `jobId` of run `parent`. A second enqueue of the same quote answers 'exists' (ok). */
export async function enqueueWorkJob(
  deps: Pick<WorkJobDeps, 'store'>,
  input: { jobId: string; userId: string; tool: WorkTool; request: unknown; token: string; parent: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isWorkTool(input.tool) || !input.token) return { ok: false, error: 'bad_input' };
  const r = await enqueue(deps.store, {
    id: input.jobId, userId: input.userId, serviceType: WORK_SERVICE_TYPE, kind: WORK_KIND,
    params: { _work: { tool: input.tool, request: input.request, token: input.token }, _parent: input.parent },
  });
  return r === 'error' ? { ok: false, error: 'store_unavailable' } : { ok: true };
}

export type WorkJobResult =
  | { ran: false; reason: string }
  | { ran: true; outcome: 'delivered'; outputs: string[] }
  | { ran: true; outcome: 'failed'; error: string }
  | { ran: true; outcome: 'stopped' | 'lost' };

/** Run one queued work step, if this worker can claim it. Never throws. */
export async function workWorkJob(deps: WorkJobDeps, input: { jobId: string; worker: string }): Promise<WorkJobResult> {
  const { jobId, worker } = input;
  const c = await claim(deps.store, jobId, worker, deps.now());
  if (!c.ok) return { ran: false, reason: c.reason };
  const row = c.row;
  const userId = row.userId;
  const run = runOf(row);
  const job = jobOf(row);
  const tool = job?.tool ?? 'unknown';

  const halted = async (beat: Beat): Promise<WorkJobResult> => {
    const stopped = beat === 'stopped';
    await deps.audit({ ...run, userId, jobId, tool, outcome: stopped ? 'cancelled' : 'lost', detail: stopped ? 'stopped' : 'lease taken over' });
    return { ran: true, outcome: stopped ? 'stopped' : 'lost' };
  };
  const afterLoss = async (): Promise<Beat> => ((await deps.store.read(jobId))?.status === 'failed' ? 'stopped' : 'lost');
  const end = async (error: string): Promise<WorkJobResult> => {
    const e = error.slice(0, 300);
    if (await fail(deps.store, jobId, worker, e, false)) {
      await deps.audit({ ...run, userId, jobId, tool, outcome: 'failed', detail: e.slice(0, 200) });
      return { ran: true, outcome: 'failed', error: e };
    }
    return halted(await afterLoss());
  };

  if (!job) return end('invalid_request: the stored step is not readable');
  await deps.audit({ ...run, userId, jobId, tool, outcome: (row.exec?.attempt ?? 1) > 1 ? 'retried' : 'ok', detail: 'started' });

  const ctl = new AbortController();
  let beat: Beat = 'held';
  const stopBeating = deps.every(HEARTBEAT_MS, async () => {
    if (ctl.signal.aborted) return;
    const b = await heartbeat(deps.store, jobId, worker, deps.now());
    if (mustStop(b)) {
      beat = b;
      ctl.abort();
    }
  });
  try {
    await deps.store.progress(jobId, worker, job.tool, 10);
    let out: WorkRunOutcome;
    try {
      out = await deps.run(job.tool, { userId, request: job.request, token: job.token }, ctl.signal);
    } catch (e) {
      out = { ok: false, error: 'run_failed', message: e instanceof Error ? e.message : 'run failed' };
    }
    if (ctl.signal.aborted) return halted(beat);
    if (!out.ok) return end(`${out.error}${out.message ? `: ${out.message}` : ''}`);
    // Still ours? A worker that stalled past its lease writes nothing (the step was retried elsewhere, or stopped).
    const still = await heartbeat(deps.store, jobId, worker, deps.now());
    if (mustStop(still)) return halted(still);
    const outputs = out.outputs.filter((p) => typeof p === 'string' && p.length > 0 && p.length <= 500).slice(0, 30);
    const done = await complete(deps.store, jobId, worker, {
      signedUrl: null,
      result: { tool: job.tool, outputs, ...(out.summary ? { summary: out.summary } : {}), via: 'agent-g' },
    });
    if (!done) return halted(await afterLoss());
    await deps.audit({ ...run, userId, jobId, tool, outcome: 'delivered', detail: `${outputs.length} outputs` });
    return { ran: true, outcome: 'delivered', outputs };
  } finally {
    stopBeating();
  }
}

/** What a work step's row says, in the run's terms. Outputs are workspace paths (the next step reads them by name). */
export type WorkView =
  | { status: 'queued' | 'running'; stage: string | null; pct: number }
  | { status: 'completed'; tool: WorkTool; outputs: string[] }
  | { status: 'failed'; error: string }
  | { status: 'cancelled' };

export function workViewOf(row: LeaseRow): WorkView {
  if (row.status === 'completed') {
    const r = row.result ?? {};
    const outputs = Array.isArray(r.outputs) ? (r.outputs as unknown[]).filter((p): p is string => typeof p === 'string') : [];
    const tool = isWorkTool(r.tool) ? r.tool : jobOf(row)?.tool ?? 'browser';
    return { status: 'completed', tool, outputs };
  }
  if (row.status === 'failed') return row.error === 'cancelled' || row.exec?.lastError === 'cancelled' ? { status: 'cancelled' } : { status: 'failed', error: row.error ?? 'failed' };
  return { status: row.status === 'processing' ? 'running' : 'queued', stage: row.stage, pct: row.pct };
}

/** The owner stops a work step. Nothing is owed back (work steps are 0 credits); the worker aborts at its next beat. */
export async function cancelWorkJob(deps: Pick<WorkJobDeps, 'store'>, input: { userId: string; jobId: string }): Promise<'ok' | 'not_running' | 'not_found'> {
  const r = await cancelLease(deps.store, input.jobId, input.userId, 'cancelled', false);
  if (r.ok) return 'ok';
  return r.reason === 'final' || r.reason === 'busy' ? 'not_running' : 'not_found';
}
