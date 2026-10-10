/**
 * lib/agent/run/runExec.ts — a multi-step Agent G run on the lease queue (PART 2, gap T1): plan, start, tick, approve,
 * stop, resume. Every effect is injected (./runLive wires the real ones), so every race is tested in memory.
 *
 * WHERE IT LIVES. One generation_jobs row per run, `params._exec.kind = 'agent-run'` (lib/orchestrator/jobLease) and the
 * run's state in `params._run` (./runEngine): no new table, no migration. Each step is an ordinary job of an existing
 * executor (an audio extraction, a montage) with `params._parent` naming the run, so its worker, its retry, its refund
 * and its Library card are exactly those of the same job started on its own. The run row itself is never claimed by a
 * worker: a TICK reads it and its steps' jobs, and moves it.
 *
 * WHO TICKS. The owner's status read (GET /api/tasks?id=…), the request that created or changed the run (after its
 * answer), and the per-minute sweep. Any number may tick at once: every write is a compare-and-set on `_exec.v`, so one
 * wins and the others read again. Starting a step (quoting probes the files, for seconds) is done under a short tick
 * lease in `_run.tick`, so two ticks never quote the same step; a tick that dies lets its lease lapse.
 *
 * APPROVAL. A run is created only from a plan the user approved by a tap: the plan is signed for that user, that exact
 * spec and its list price (lib/agent/media/quoteToken), and its id is the run's id, so a second tap replays the first
 * run instead of starting another. A step whose real quote is above what its approval covers waits for the user's yes
 * to that quote (approveStep, bound to the quote's id). Model output can neither create a run nor approve a step.
 */
import { createHash } from 'node:crypto';
import { enqueue, type LeaseRow, type LeaseStore, type LeaseWrite } from '@/lib/orchestrator/jobLease';
import type { ProduceKind } from '@/lib/orchestrator/rate-limit';
import type { AuditEvent } from '@/lib/agent/media/montageExec';
import { QUOTE_TTL_MS, signQuote, verifyQuote } from '@/lib/agent/media/quoteToken';
import type { AgentApproval } from '../contracts';
import {
  RUN_KIND, TICK_LEASE_MS, emit, isFinalStep, isTerminalRun, moveStep, newRun, planTick, resolvedRefs, resumedRun, runOf, settle,
  stepOf, type ChildView, type RunState, type StepQuote,
} from './runEngine';
import { specFingerprint, validateRunSpec, type RunSpec, type RunStepSpec, type RunTool } from './runSpec';

/** One step tool, as a run drives it: the same executor calls its own route makes. */
export interface StepAdapter {
  /** The lease kind of the step's jobs. */
  kind: string;
  /** What the step costs as listed (the plan the user approves shows it). */
  listPrice: number;
  /** Plan, price and sign the step with its inputs resolved (every `{ step }` replaced by that step's result link). */
  quote(userId: string, step: RunStepSpec): Promise<{ ok: true; quote: Omit<StepQuote, 'quoteId'> } | { ok: false; error: string }>;
  /** Queue the signed quote as a job of the run (once per quote: the insert is the idempotency check). */
  enqueue(userId: string, quote: StepQuote, ctx: { runId: string; prompt?: string }): Promise<{ ok: true } | { ok: false; error: string }>;
  /** What the step's job says now. */
  view(row: LeaseRow): ChildView;
  /** Does the job need a worker now (none took it, or its worker stopped renewing)? */
  needsWorker(row: LeaseRow, now: number): boolean;
  /** Stop the job (its executor's cancel: the worker stops at its next heartbeat, a charge is paid back). */
  cancel(userId: string, taskId: string): Promise<'ok' | 'not_running' | 'not_found'>;
}

export interface RunExecDeps {
  store: LeaseStore;
  adapters: Readonly<Record<RunTool, StepAdapter>>;
  /** Start a worker for a step's job (after the response); its claim decides whether it runs at all. */
  startWorker(kind: string, taskId: string): void;
  audit(ev: AuditEvent): Promise<void>;
  /** The plan-signing key; empty = no plans (fail closed). */
  key(): string;
  now(): number;
  newId(): string;
}

export type RunErrorCode =
  | 'bad_spec' | 'not_configured' | 'quote_invalid' | 'quote_changed' | 'quote_expired' | 'jobs_unavailable' | 'not_found'
  | 'not_running' | 'not_waiting' | 'not_final' | 'nothing_to_resume';

export interface RunError { ok: false; error: RunErrorCode; message: string; step?: string }

const err = (error: RunErrorCode, message: string, step?: string): RunError => ({ ok: false, error, message, ...(step ? { step } : {}) });
const iso = (ms: number) => new Date(ms).toISOString();
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/** A short id for a quote: what the user's yes to it must name. */
export const quoteIdOf = (token: string): string => createHash('sha256').update(token).digest('hex').slice(0, 16);

/** A run with a montage or an edit files as a film; a run of extractions only, as music (generation_jobs.service_type). */
const serviceOf = (spec: RunSpec): ProduceKind => (spec.steps.some((s) => s.tool === 'montage' || s.tool === 'edit') ? 'film' : 'music');
const listTotal = (deps: RunExecDeps, spec: RunSpec): number => spec.steps.reduce((n, s) => n + deps.adapters[s.tool].listPrice, 0);

/** Codes a queued quote can never recover from: the step ends with it. Anything else is tried again on the next tick. */
const FATAL_ENQUEUE = new Set(['invalid_request', 'quote_invalid', 'quote_changed']);

// ── plan and start (the user's tap) ──────────────────────────────────────────────────────────────────────────────────

export interface RunPlan {
  runId: string;
  credits: number;
  expiresAt: number;
  steps: Array<{ id: string; tool: RunTool; credits: number }>;
}

/** Check a spec and sign it for this user at its list price. Spends nothing, writes nothing but an audit event. */
export async function planRun(deps: RunExecDeps, input: { userId: string; spec: unknown }): Promise<{ ok: true; plan: RunPlan; spec: RunSpec; token: string } | RunError> {
  const valid = validateRunSpec(input.spec);
  if (!valid.ok) return err('bad_spec', valid.message, valid.step);
  if (!deps.key()) return err('not_configured', 'Plans cannot be signed on this server.');
  const spec = valid.spec;
  const runId = deps.newId();
  const credits = listTotal(deps, spec);
  const expiresAt = deps.now() + QUOTE_TTL_MS;
  const token = signQuote({ u: input.userId, j: runId, f: specFingerprint(spec), c: credits, x: expiresAt }, deps.key());
  if (!token) return err('not_configured', 'Plans cannot be signed on this server.');
  await deps.audit({ userId: input.userId, op: 'agent_run', phase: 'quote', outcome: 'ok', runId, credits, detail: `${spec.steps.length} steps` });
  return {
    ok: true,
    plan: { runId, credits, expiresAt, steps: spec.steps.map((s) => ({ id: s.id, tool: s.tool, credits: deps.adapters[s.tool].listPrice })) },
    spec,
    token,
  };
}

/** Create the run the user approved (once per plan), queued for its first tick. */
export async function startRun(
  deps: RunExecDeps,
  input: { userId: string; spec: unknown; token: unknown },
): Promise<{ ok: true; runId: string; replay: boolean } | RunError> {
  const { userId } = input;
  const valid = validateRunSpec(input.spec);
  if (!valid.ok) return err('bad_spec', valid.message, valid.step);
  const spec = valid.spec;
  const fingerprint = specFingerprint(spec);
  const check = verifyQuote(input.token, deps.key(), { userId, fingerprint, now: deps.now() });
  if (!check.ok) {
    await deps.audit({ userId, op: 'agent_run', phase: 'run', outcome: 'refused', detail: `plan_${check.reason}` });
    if (check.reason === 'expired') return err('quote_expired', 'This plan has expired. Ask again for a fresh one.');
    if (check.reason === 'changed') return err('quote_changed', 'The run differs from the plan.');
    return err('quote_invalid', 'This plan is not valid.');
  }
  // A price that moved since the plan was shown is not what the user said yes to.
  if (check.claims.c !== listTotal(deps, spec)) return err('quote_changed', 'The price changed since the plan was shown. Ask again for a fresh one.');
  const runId = check.claims.j;
  const now = deps.now();
  const approval: AgentApproval = {
    quoteFingerprint: fingerprint, channel: 'tap', evidence: (spec.title ?? `${spec.steps.length} steps`).slice(0, 120), at: iso(now), userId,
  };
  const state = newRun(spec, approval, (tool) => deps.adapters[tool].listPrice, now);
  const put = await enqueue(deps.store, {
    id: runId, userId, serviceType: serviceOf(spec), kind: RUN_KIND,
    params: { subtype: 'agent-run', via: 'agent-g', steps: spec.steps.length, ...(spec.title ? { prompt: spec.title } : {}), _run: state },
  });
  if (put === 'error') return err('jobs_unavailable', 'The run could not be recorded, so it was not started.');
  if (put === 'exists') {
    const row = await deps.store.read(runId);
    if (!row || row.userId !== userId || row.exec?.kind !== RUN_KIND) return err('jobs_unavailable', 'The run could not be recorded, so it was not started.');
    await deps.audit({ userId, op: 'agent_run', phase: 'run', outcome: 'replayed', runId, detail: row.status });
    return { ok: true, runId, replay: true };
  }
  await deps.audit({ userId, op: 'agent_run', phase: 'run', outcome: 'ok', runId, approval: 'tap', credits: check.claims.c, detail: `${spec.steps.length} steps queued` });
  return { ok: true, runId, replay: false };
}

// ── reading and writing the run row ──────────────────────────────────────────────────────────────────────────────────

export interface RunRead {
  row: LeaseRow;
  run: RunState;
  /** What each started step's job says now (absent from a list read). */
  children: Record<string, ChildView>;
}

async function readRunRow(deps: RunExecDeps, id: string): Promise<{ row: LeaseRow; run: RunState } | null> {
  const row = await deps.store.read(id);
  const run = row && row.exec?.kind === RUN_KIND ? runOf(row.params) : null;
  return row && run ? { row, run } : null;
}

/** The step jobs' rows and views, by step id. */
async function readChildren(deps: RunExecDeps, run: RunState): Promise<{ views: Record<string, ChildView>; rows: Record<string, LeaseRow> }> {
  const views: Record<string, ChildView> = {};
  const rows: Record<string, LeaseRow> = {};
  for (const step of run.steps) {
    if (!step.taskId || step.reused) continue;
    const row = await deps.store.read(step.taskId);
    const adapter = deps.adapters[step.tool];
    if (!row || row.exec?.kind !== adapter.kind) { views[step.id] = { state: 'missing' }; continue; }
    rows[step.id] = row;
    views[step.id] = adapter.view(row);
  }
  return { views, rows };
}

/** Read a run with its steps' jobs, moving nothing. */
export async function readRun(deps: RunExecDeps, id: string): Promise<RunRead | null> {
  const r = await readRunRow(deps, id);
  if (!r) return null;
  return { ...r, children: (await readChildren(deps, r.run)).views };
}

/** The run row's own columns for a state: the job tray and the Library read them. */
function rowWriteOf(row: LeaseRow, run: RunState): Omit<LeaseWrite, 'params'> {
  const done = run.steps.filter((s) => s.status === 'completed').length;
  const pct = Math.round((done / run.steps.length) * 100);
  if (run.status === 'completed' || run.status === 'partially_completed') {
    const artifacts = run.steps.filter((s) => s.output).map((s) => ({ step: s.id, taskId: s.taskId ?? null, ...s.output }));
    // The steps' own jobs are the Library's entries; the run row keeps its links out of it (signed_url null).
    return { status: 'completed', stage: run.status, pct: 100, error: null, result: { status: run.status, artifacts }, signedUrl: null };
  }
  if (run.status === 'failed' || run.status === 'cancelled') {
    return { status: 'failed', stage: 'failed', pct, error: run.status === 'cancelled' ? 'cancelled by the user' : `failed: ${run.error ?? 'failed'}`.slice(0, 300) };
  }
  // Live: pending until a step has started, processing from then on (a row never goes back to pending).
  const started = row.status === 'processing' || run.steps.some((s) => s.taskId || isFinalStep(s));
  return { status: started ? 'processing' : 'pending', stage: run.status === 'running' ? `${Math.min(done + 1, run.steps.length)}/${run.steps.length}` : run.status, pct };
}

/** Write the run's next state under compare-and-set on the version read. False = something else wrote first. */
async function writeRun(deps: RunExecDeps, row: LeaseRow, next: RunState): Promise<boolean> {
  if (!row.exec) return false;
  const exec = { ...row.exec, v: row.exec.v + 1 };
  const params = { ...row.params, _exec: exec, _run: next };
  return deps.store.cas(row.id, { v: row.exec.v, from: [row.status] }, { ...rowWriteOf(row, next), params });
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── the tick ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Move a run as far as it can go now: fold in what its steps' jobs say, start what is ready, queue a quote whose job is
 * missing, stop the jobs of a stopped run, and wake a step job that no worker holds (when `startWorkers`). Never throws
 * on a lost race: it reads again (at most a few times) and returns the run as it is.
 */
export async function tickRun(deps: RunExecDeps, input: { id: string; startWorkers: boolean }): Promise<RunRead | null> {
  const me = `tick-${deps.newId()}`;
  let last: RunRead | null = null;
  for (let pass = 0; pass < 4; pass += 1) {
    const r = await readRunRow(deps, input.id);
    if (!r) return last;
    const { row, run } = r;
    const { views, rows } = await readChildren(deps, run);
    last = { row, run, children: views };
    if (isTerminalRun(run)) return last;
    const now = deps.now();
    const { next, actions } = planTick(run, views, now);
    const starts = actions.filter((a) => a.type === 'start').map((a) => a.step);
    let mayStart = starts.length > 0;
    if (mayStart && run.tick && run.tick.until > now && run.tick.owner !== me) {
      // Another tick is starting steps right now: it writes their quotes. Fold the rest in, start nothing.
      mayStart = false;
      next.tick = run.tick;
    } else if (mayStart) {
      next.tick = { owner: me, until: now + TICK_LEASE_MS };
    }
    if (!same(run, next)) {
      if (!(await writeRun(deps, row, next))) continue; // raced: read again
      last = { row, run: next, children: views };
    }
    let acted = false;
    if (mayStart) { await startSteps(deps, row.id, row.userId, starts, me, input.startWorkers); acted = true; }
    for (const a of actions) {
      if (a.type === 'enqueue') { await enqueueStep(deps, row.id, row.userId, a.step, input.startWorkers); acted = true; }
      if (a.type === 'cancel') {
        const step = stepOf(next, a.step);
        if (step) await deps.adapters[step.tool].cancel(row.userId, a.taskId);
        acted = true;
      }
    }
    if (input.startWorkers) {
      for (const step of next.steps) {
        const child = rows[step.id];
        if (child && (step.status === 'queued' || step.status === 'running') && deps.adapters[step.tool].needsWorker(child, now)) {
          deps.startWorker(deps.adapters[step.tool].kind, child.id);
        }
      }
    }
    if (!acted) return last;
    // Something was started, queued or stopped: one more pass folds in what it changed.
  }
  return last ?? readRun(deps, input.id);
}

/** Quote the ready steps (holding the tick lease), then write what each quote says and queue the ones that may run. */
async function startSteps(deps: RunExecDeps, runId: string, userId: string, ids: string[], me: string, startWorkers: boolean): Promise<void> {
  const first = await readRunRow(deps, runId);
  if (!first || first.run.tick?.owner !== me) return;
  const quotes = new Map<string, Awaited<ReturnType<StepAdapter['quote']>>>();
  for (const id of ids) {
    const spec = first.run.spec.steps.find((s) => s.id === id);
    const step = stepOf(first.run, id);
    if (!spec || !step) continue;
    const resolved = resolveStep(first.run, spec);
    quotes.set(id, resolved ? await deps.adapters[spec.tool].quote(userId, resolved) : { ok: false, error: 'input_missing' });
  }
  const queued: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const r = await readRunRow(deps, runId);
    if (!r || isTerminalRun(r.run) || r.run.tick?.owner !== me) return; // the lease lapsed and another tick took over
    const next = clone(r.run);
    const now = deps.now();
    queued.length = 0;
    for (const [id, q] of quotes) {
      const step = stepOf(next, id);
      if (!step || isFinalStep(step) || step.taskId || next.cancelRequested) continue;
      if (!q.ok) {
        step.error = q.error;
        moveStep(next, step, 'failed', now, 'step.failed', q.error);
        continue;
      }
      const quote: StepQuote = { ...q.quote, quoteId: quoteIdOf(q.quote.token) };
      step.quote = quote;
      emit(next, now, 'step.quoted', id, `${quote.credits} credits`);
      if (quote.credits > step.approvedCredits) {
        moveStep(next, step, 'awaiting_approval', now, 'step.awaiting_approval', `${quote.credits} credits`);
      } else {
        step.taskId = quote.taskId;
        moveStep(next, step, 'queued', now, 'step.queued');
        queued.push(id);
      }
    }
    delete next.tick;
    settle(next, now);
    if (await writeRun(deps, r.row, next)) break;
    if (i === 3) return;
  }
  for (const id of queued) await enqueueStep(deps, runId, userId, id, startWorkers);
}

/** The step spec with every `{ step }` input replaced by that step's result link; null while one is missing. */
function resolveStep(run: RunState, spec: RunStepSpec): RunStepSpec | null {
  if (spec.tool === 'montage') {
    const files = resolvedRefs(run, spec.files);
    return files ? { ...spec, files } : null;
  }
  if (spec.tool === 'edit') {
    const file = resolvedRefs(run, [spec.file]);
    return file ? { ...spec, file: file[0]! } : null;
  }
  if ('url' in spec.source) return spec;
  const file = resolvedRefs(run, [spec.source.file]);
  return file ? { ...spec, source: { file: file[0]! } } : null;
}

/** Queue a step's stored quote as its job; stop that job again if the run was stopped meanwhile. */
async function enqueueStep(deps: RunExecDeps, runId: string, userId: string, id: string, startWorkers: boolean): Promise<void> {
  const r = await readRunRow(deps, runId);
  const step = r ? stepOf(r.run, id) : undefined;
  if (!r || !step?.quote || !step.taskId || r.run.cancelRequested || isTerminalRun(r.run)) return;
  const adapter = deps.adapters[step.tool];
  const prompt = r.run.spec.steps.find((s) => s.id === id && s.tool === 'montage') as { prompt?: string } | undefined;
  const q = await adapter.enqueue(userId, step.quote, { runId, prompt: prompt?.prompt ?? r.run.spec.title });
  if (!q.ok) {
    if (FATAL_ENQUEUE.has(q.error)) await failStep(deps, runId, id, q.error);
    return;
  }
  // A stop that landed while the job was being queued: the stop's own tick could not see this job yet.
  const after = await readRunRow(deps, runId);
  if (!after || after.run.cancelRequested || isTerminalRun(after.run)) {
    await adapter.cancel(userId, step.taskId);
    return;
  }
  if (startWorkers) deps.startWorker(adapter.kind, step.taskId);
}

async function failStep(deps: RunExecDeps, runId: string, id: string, error: string): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    const r = await readRunRow(deps, runId);
    const step = r ? stepOf(r.run, id) : undefined;
    if (!r || !step || isFinalStep(step) || isTerminalRun(r.run)) return;
    const next = clone(r.run);
    const s = stepOf(next, id)!;
    s.error = error;
    delete s.quote;
    moveStep(next, s, 'failed', deps.now(), 'step.failed', error);
    settle(next, deps.now());
    if (await writeRun(deps, r.row, next)) return;
  }
}

// ── the user's actions on a run ──────────────────────────────────────────────────────────────────────────────────────

/** The user's yes to a step's own quote (its price is above what the run was approved for). Bound to that quote's id. */
export async function approveStep(
  deps: RunExecDeps,
  input: { userId: string; id: string; step: unknown; quoteId: unknown; startWorkers: boolean },
): Promise<{ ok: true } | RunError> {
  const stepId = typeof input.step === 'string' ? input.step : '';
  for (let i = 0; i < 3; i += 1) {
    const r = await readRunRow(deps, input.id);
    if (!r || r.row.userId !== input.userId) return err('not_found', 'No such run.');
    if (isTerminalRun(r.run) || r.run.cancelRequested) return err('not_running', 'This run is no longer running.');
    const step = stepOf(r.run, stepId);
    if (!step) return err('not_found', 'No such step.', stepId || undefined);
    if (step.status !== 'awaiting_approval' || !step.quote) return err('not_waiting', 'This step is not waiting for a yes.', stepId);
    if (step.quote.quoteId !== input.quoteId) return err('quote_changed', 'The step was priced again. Look at the new price first.', stepId);
    const now = deps.now();
    const next = clone(r.run);
    const s = stepOf(next, stepId)!;
    if (now >= step.quote.expiresAt) {
      // An old price is not approvable: drop it, and the next tick prices the step again (and asks again if it must).
      delete s.quote;
      emit(next, now, 'step.requote', stepId, 'quote expired before the yes');
      if (await writeRun(deps, r.row, next)) return err('quote_expired', 'This price has expired. The step is priced again.', stepId);
      continue;
    }
    s.approval = { quoteFingerprint: step.quote.quoteId, channel: 'tap', evidence: `${step.quote.credits} credits`, at: iso(now), userId: input.userId };
    s.approvedCredits = step.quote.credits;
    s.taskId = step.quote.taskId;
    moveStep(next, s, 'queued', now, 'step.approved', `${step.quote.credits} credits`);
    settle(next, now);
    if (!(await writeRun(deps, r.row, next))) continue;
    await deps.audit({
      userId: input.userId, op: 'agent_run', phase: 'approve', outcome: 'ok', runId: input.id, jobId: step.quote.taskId,
      toolId: step.capability, approval: 'tap', credits: step.quote.credits, detail: stepId,
    });
    await enqueueStep(deps, input.id, input.userId, stepId, input.startWorkers);
    return { ok: true };
  }
  return err('not_running', 'The run changed while this was being saved. Try again.');
}

/** The owner stops a run: nothing new starts, every step job is stopped (and paid back), delivered results stay. */
export async function cancelRun(deps: RunExecDeps, input: { userId: string; id: string }): Promise<{ ok: true } | RunError> {
  let requested = false;
  for (let i = 0; i < 3 && !requested; i += 1) {
    const r = await readRunRow(deps, input.id);
    if (!r || r.row.userId !== input.userId) return err('not_found', 'No such run.');
    if (isTerminalRun(r.run)) return err('not_running', 'This run is no longer running.');
    if (r.run.cancelRequested) { requested = true; break; }
    const next = clone(r.run);
    next.cancelRequested = true;
    emit(next, deps.now(), 'run.cancel_requested');
    requested = await writeRun(deps, r.row, next);
  }
  if (!requested) return err('not_running', 'The run changed while this was being saved. Try again.');
  await deps.audit({ userId: input.userId, op: 'agent_run', phase: 'cancel', outcome: 'cancelled', runId: input.id });
  await tickRun(deps, { id: input.id, startWorkers: false });
  return { ok: true };
}

/** The run that carries a run on from where it ended: one id per run resumed, so a second tap replays the first. */
export function resumeIdOf(runId: string): string {
  const h = createHash('sha256').update(`agent-run:resume:${runId}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Carry a run that ended without every result on: a NEW run (final states never move) with every delivered step reused
 * as it is (its result, its job; nothing runs or is charged twice) and every other step planned again.
 */
export async function resumeRun(deps: RunExecDeps, input: { userId: string; id: string }): Promise<{ ok: true; runId: string; replay: boolean } | RunError> {
  const r = await readRunRow(deps, input.id);
  if (!r || r.row.userId !== input.userId) return err('not_found', 'No such run.');
  if (!isTerminalRun(r.run)) return err('not_final', 'This run is still going.');
  if (r.run.status === 'completed') return err('nothing_to_resume', 'Every step of this run was delivered.');
  const now = deps.now();
  const runId = resumeIdOf(input.id);
  const approval: AgentApproval = {
    quoteFingerprint: specFingerprint(r.run.spec), channel: 'tap', evidence: `resume of ${input.id}`, at: iso(now), userId: input.userId,
  };
  const state = resumedRun(r.run, input.id, approval, now);
  if (!state) return err('nothing_to_resume', 'Every step of this run was delivered.');
  const put = await enqueue(deps.store, {
    id: runId, userId: input.userId, serviceType: serviceOf(r.run.spec), kind: RUN_KIND,
    params: { subtype: 'agent-run', via: 'agent-g', steps: r.run.steps.length, ...(r.run.spec.title ? { prompt: r.run.spec.title } : {}), resumedFrom: input.id, _run: state },
  });
  if (put === 'error') return err('jobs_unavailable', 'The run could not be recorded, so it was not started.');
  if (put === 'exists') {
    const again = await readRunRow(deps, runId);
    if (!again || again.row.userId !== input.userId) return err('jobs_unavailable', 'The run could not be recorded, so it was not started.');
    return { ok: true, runId, replay: true };
  }
  const reused = state.steps.filter((s) => s.reused).length;
  await deps.audit({ userId: input.userId, op: 'agent_run', phase: 'resume', outcome: 'ok', runId, approval: 'tap', detail: `from ${input.id}; ${reused} steps reused` });
  return { ok: true, runId, replay: false };
}

// ── the sweep ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Tick every live run (oldest first): a run whose tab closed still moves on. Step jobs are worked by their own sweeps. */
export async function sweepRuns(deps: RunExecDeps, opts: { limit?: number } = {}): Promise<{ ticked: number; ended: number }> {
  const rows = await deps.store.listLive(RUN_KIND, opts.limit ?? 10);
  let ended = 0;
  for (const row of rows) {
    const r = await tickRun(deps, { id: row.id, startWorkers: false });
    if (r && isTerminalRun(r.run)) ended += 1;
  }
  return { ticked: rows.length, ended };
}
