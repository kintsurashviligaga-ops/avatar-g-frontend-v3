/**
 * lib/agent/run/runEngine.ts — the state of a multi-step run and the ONE pure function that moves it (PART 2, T1 + G8).
 *
 * A run lives in its generation_jobs row, in `params._run` (no migration): the spec the user approved, one record per
 * step (its status, the job that carries it, its result), the run's own status and a capped list of events. Nothing in
 * this file touches a database or an executor. `planTick` reads the run and what each step's job says now, and answers
 * with the next state and the effects to perform: start a step (quote it, queue it), queue a stored quote again, or
 * stop a step's job. ./runExec performs them and writes the state back under compare-and-set, so two ticks, a cancel
 * and the sweep can race on one run and exactly one write wins.
 *
 * Rules:
 *   · A step starts once every step it names is completed, at most MAX_PARALLEL at a time.
 *   · A step whose input step failed or was stopped never runs: it ends as cancelled with the error `skipped`.
 *   · A stop (cancelRequested) ends every step that has not started and stops the jobs of the ones that have; a result
 *     already delivered stays delivered.
 *   · The run ends when every step has ended: completed (all delivered), cancelled (stopped by its owner),
 *     partially_completed (some delivered) or failed (none). Final states never move (lib/agent/contracts): a retry is
 *     a new run that reuses the delivered steps (./runExec resumeRun).
 *   · Every status change goes the legal way through lib/agent/contracts RUN_TRANSITIONS, and is an event.
 */
import { TERMINAL_RUN_STATUSES, transitionPath, type AgentApproval, type CapabilityId, type RunStatus } from '../contracts';
import { refsOf, TOOL_CAPABILITY, type RunSpec, type RunTool } from './runSpec';

/** generation_jobs rows of Agent G runs carry this queue kind in params._exec. */
export const RUN_KIND = 'agent-run';
/** How many step jobs one run keeps going at once. */
export const MAX_PARALLEL = 2;
/** How many events a run keeps (the oldest are dropped). */
export const EVENTS_CAP = 50;
/** How long one tick may hold the right to start steps (quoting can probe files for seconds). */
export const TICK_LEASE_MS = 30_000;

export interface StepOutput {
  url: string;
  media: 'video' | 'audio';
  durationSec?: number;
  name?: string;
}

/** A step's quote, kept from the quote until its job exists (and while it waits for the user's yes). */
export interface StepQuote {
  taskId: string;
  credits: number;
  request: unknown;
  token: string;
  expiresAt: number;
  /** What the user's yes must name: this quote and no other (a re-quote is a new id). */
  quoteId: string;
}

export interface RunStepState {
  id: string;
  tool: RunTool;
  capability: CapabilityId;
  status: RunStatus;
  /** The most this step may charge without asking again: its list price when the run was approved, or the price the user said yes to. */
  approvedCredits: number;
  quote?: StepQuote;
  /** The generation_jobs row that carries the step, once quoted. */
  taskId?: string;
  output?: StepOutput;
  /** Why it ended without a result, as a code. */
  error?: string;
  /** The user's yes to this step's own quote (a price above what the run was approved for). */
  approval?: AgentApproval;
  /** Delivered by the run this one resumes: reused, never run again. */
  reused?: boolean;
}

export type RunEventType =
  | 'run.created' | 'run.resumed' | 'run.status' | 'run.cancel_requested' | 'run.invariant'
  | 'step.quoted' | 'step.awaiting_approval' | 'step.approved' | 'step.queued' | 'step.running' | 'step.completed'
  | 'step.failed' | 'step.cancelled' | 'step.skipped' | 'step.reused' | 'step.requote';

export interface RunEvent {
  seq: number;
  at: number;
  type: RunEventType;
  step?: string;
  detail?: string;
}

export interface RunState {
  v: 1;
  status: RunStatus;
  spec: RunSpec;
  steps: RunStepState[];
  /** The user's yes that created the run (a tap on its plan; never a model's output). */
  approval: AgentApproval;
  cancelRequested?: boolean;
  /** The run this one carries on from. */
  resumedFrom?: string;
  /** Why it ended without every result, as a code. */
  error?: string;
  /** The tick that may start steps now, until when. */
  tick?: { owner: string; until: number };
  /** The last event number (events keep their numbers when the oldest are dropped). */
  seq: number;
  events: RunEvent[];
}

/** What a step's job says now. */
export type ChildView =
  | { state: 'missing' }
  | { state: 'live'; running: boolean; stage: string | null; pct: number }
  | { state: 'completed'; output: StepOutput }
  | { state: 'failed'; error: string }
  | { state: 'cancelled' };

export type RunAction =
  /** Quote the step with its inputs resolved, and queue it (or ask the user when the price is above its approval). */
  | { type: 'start'; step: string }
  /** The step's stored quote has no job yet (a tick died between writing it and queuing it): queue it again. */
  | { type: 'enqueue'; step: string }
  /** Stop the step's job. */
  | { type: 'cancel'; step: string; taskId: string };

const FINAL_STEP: ReadonlySet<RunStatus> = new Set(['completed', 'failed', 'cancelled', 'partially_completed']);
export const isFinalStep = (s: RunStepState): boolean => FINAL_STEP.has(s.status);
export const isTerminalRun = (r: Pick<RunState, 'status'>): boolean => TERMINAL_RUN_STATUSES.has(r.status);

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Append an event (numbered), keeping only the newest EVENTS_CAP. */
export function emit(run: RunState, at: number, type: RunEventType, step?: string, detail?: string): void {
  run.seq += 1;
  run.events.push({ seq: run.seq, at, type, ...(step ? { step } : {}), ...(detail ? { detail: detail.slice(0, 120) } : {}) });
  if (run.events.length > EVENTS_CAP) run.events.splice(0, run.events.length - EVENTS_CAP);
}

/** Move a step the legal way; false (and an invariant event, nothing changed) when there is none. */
export function moveStep(run: RunState, step: RunStepState, to: RunStatus, at: number, type: RunEventType, detail?: string): boolean {
  if (step.status === to) return true;
  if (!transitionPath(step.status, to)) {
    emit(run, at, 'run.invariant', step.id, `${step.status} -> ${to}`);
    return false;
  }
  step.status = to;
  emit(run, at, type, step.id, detail);
  return true;
}

function moveRun(run: RunState, to: RunStatus, at: number): void {
  if (run.status === to) return;
  const path = transitionPath(run.status, to);
  if (!path) {
    emit(run, at, 'run.invariant', undefined, `${run.status} -> ${to}`);
    return;
  }
  for (const s of path) emit(run, at, 'run.status', undefined, s);
  run.status = to;
}

/** A fresh run for a spec the user approved. Every step waits; the first tick starts what can start. */
export function newRun(spec: RunSpec, approval: AgentApproval, listPrice: (tool: RunTool) => number, at: number): RunState {
  const run: RunState = {
    v: 1,
    status: 'queued',
    spec: clone(spec),
    steps: spec.steps.map((s) => ({
      id: s.id, tool: s.tool, capability: TOOL_CAPABILITY[s.tool], status: 'planned' as RunStatus, approvedCredits: listPrice(s.tool),
    })),
    approval,
    seq: 0,
    events: [],
  };
  emit(run, at, 'run.created', undefined, `${spec.steps.length} steps; approved by ${approval.channel}`);
  return run;
}

/**
 * The run that carries a final run on: the same spec and approval channel, every delivered step reused with its result
 * and job, every other step planned again. Null for a run that is not final, or delivered everything (nothing to do).
 */
export function resumedRun(prev: RunState, prevId: string, approval: AgentApproval, at: number): RunState | null {
  if (!isTerminalRun(prev) || prev.status === 'completed') return null;
  const run: RunState = {
    v: 1,
    status: 'queued',
    spec: clone(prev.spec),
    steps: prev.steps.map((s) => (s.status === 'completed' && s.output
      ? { id: s.id, tool: s.tool, capability: s.capability, status: 'completed' as RunStatus, approvedCredits: s.approvedCredits, taskId: s.taskId, output: clone(s.output), reused: true }
      : { id: s.id, tool: s.tool, capability: s.capability, status: 'planned' as RunStatus, approvedCredits: s.approvedCredits })),
    approval,
    resumedFrom: prevId,
    seq: 0,
    events: [],
  };
  emit(run, at, 'run.resumed', undefined, prevId);
  for (const s of run.steps) if (s.reused) emit(run, at, 'step.reused', s.id);
  return run;
}

/** The steps each step names as input, by id. */
const depsOf = (run: RunState): Map<string, string[]> =>
  new Map(run.spec.steps.map((s) => [s.id, refsOf(s)]));

/**
 * One tick: fold what each step's job says into the run, then decide what to start or stop. Pure; `children` holds a
 * view for every step that has a job (`taskId`).
 */
export function planTick(state: RunState, children: Readonly<Record<string, ChildView>>, now: number): { next: RunState; actions: RunAction[] } {
  if (isTerminalRun(state)) return { next: state, actions: [] };
  const run = clone(state);
  const actions: RunAction[] = [];
  const byId = new Map(run.steps.map((s) => [s.id, s]));

  // ── what each started step's job says now ────────────────────────────────────────────────────────────────────────
  for (const step of run.steps) {
    if (!step.taskId || (step.status !== 'queued' && step.status !== 'running')) continue;
    const c = children[step.id] ?? { state: 'missing' as const };
    if (c.state === 'completed') {
      step.output = c.output;
      moveStep(run, step, 'running', now, 'step.running');
      moveStep(run, step, 'completed', now, 'step.completed', c.output.media);
    } else if (c.state === 'failed') {
      step.error = c.error;
      moveStep(run, step, 'failed', now, 'step.failed', c.error);
    } else if (c.state === 'cancelled') {
      step.error = 'cancelled';
      moveStep(run, step, 'cancelled', now, 'step.cancelled');
    } else if (c.state === 'live') {
      if (c.running) moveStep(run, step, 'running', now, 'step.running');
    } else if (step.status === 'running') {
      // A job that was running is gone (deleted under the run): nothing will deliver it.
      step.error = 'lost';
      moveStep(run, step, 'failed', now, 'step.failed', 'lost');
    }
  }

  // ── a stop: nothing new starts, every live job is stopped ────────────────────────────────────────────────────────
  if (run.cancelRequested) {
    for (const step of run.steps) {
      if (isFinalStep(step)) continue;
      const c = children[step.id];
      const hasJob = !!step.taskId && !!c && c.state !== 'missing';
      if (hasJob) {
        actions.push({ type: 'cancel', step: step.id, taskId: step.taskId! });
      } else {
        // Not started, waiting for a yes, or quoted with no job yet: it ends here (a job queued after this is stopped by
        // its own enqueuer, which reads the run again; ./runExec).
        step.error = 'cancelled';
        delete step.quote;
        moveStep(run, step, 'cancelled', now, 'step.cancelled');
        if (step.taskId) actions.push({ type: 'cancel', step: step.id, taskId: step.taskId });
      }
    }
  } else {
    // ── a quote with no job: queue it again, or quote again once it expired ──────────────────────────────────────────
    for (const step of run.steps) {
      if (step.status !== 'queued' || !step.taskId) continue;
      const c = children[step.id] ?? { state: 'missing' as const };
      if (c.state !== 'missing') continue;
      if (step.quote && now < step.quote.expiresAt) {
        actions.push({ type: 'enqueue', step: step.id });
      } else {
        delete step.quote;
        delete step.taskId;
        emit(run, now, 'step.requote', step.id);
      }
    }

    // ── what can start ───────────────────────────────────────────────────────────────────────────────────────────
    const deps = depsOf(run);
    let busy = run.steps.filter((s) => (s.status === 'queued' || s.status === 'running') && s.taskId).length;
    for (const step of run.steps) {
      const waiting = step.status === 'planned'
        || ((step.status === 'queued' || step.status === 'awaiting_approval') && !step.taskId && !step.quote);
      if (!waiting) continue;
      const needs = (deps.get(step.id) ?? []).map((id) => byId.get(id)!);
      if (needs.some((d) => d.status === 'failed' || d.status === 'cancelled')) {
        step.error = 'skipped';
        moveStep(run, step, 'cancelled', now, 'step.skipped', needs.find((d) => d.status !== 'completed')?.id);
        continue;
      }
      if (!needs.every((d) => d.status === 'completed')) continue;
      if (busy >= MAX_PARALLEL) continue;
      busy += 1;
      actions.push({ type: 'start', step: step.id });
    }
  }

  settle(run, now, new Set(actions.filter((a) => a.type === 'start').map((a) => a.step)));
  return { next: run, actions };
}

/**
 * The run's own status from its steps' (`starting` = steps a tick is about to start). Mutates `run`; every change goes
 * the legal way and is an event.
 */
export function settle(run: RunState, now: number, starting: ReadonlySet<string> = new Set()): void {
  if (isTerminalRun(run)) return;
  const all = run.steps;
  if (all.every(isFinalStep)) {
    const delivered = all.filter((s) => s.status === 'completed').length;
    const to: RunStatus = delivered === all.length ? 'completed'
      : run.cancelRequested ? 'cancelled'
      : delivered > 0 ? 'partially_completed'
      : 'failed';
    if (to !== 'completed') run.error = to === 'cancelled' ? 'cancelled' : firstError(all);
    moveRun(run, to, now);
    delete run.tick;
  } else if (all.some((s) => s.status === 'queued' || s.status === 'running' || starting.has(s.id))) {
    moveRun(run, 'running', now);
  } else if (all.some((s) => s.status === 'awaiting_approval')) {
    moveRun(run, 'awaiting_approval', now);
  }
}

const firstError = (steps: RunStepState[]): string =>
  steps.find((s) => s.status === 'failed')?.error ?? steps.find((s) => s.error && s.error !== 'skipped')?.error ?? 'failed';

/** A step's input files with every `{ step }` reference replaced by that step's result link; null while one is missing. */
export function resolvedRefs(run: RunState, refs: ReadonlyArray<string | { step: string }>): string[] | null {
  const out: string[] = [];
  for (const r of refs) {
    if (typeof r === 'string') { out.push(r); continue; }
    const url = run.steps.find((s) => s.id === r.step)?.output?.url;
    if (!url) return null;
    out.push(url);
  }
  return out;
}

/** The step record by id. */
export const stepOf = (run: RunState, id: string): RunStepState | undefined => run.steps.find((s) => s.id === id);

/** A run's state from a row's params, checked enough to be driven (null for anything else). */
export function runOf(params: unknown): RunState | null {
  const p = params && typeof params === 'object' && !Array.isArray(params) ? (params as Record<string, unknown>) : null;
  const r = p?._run as RunState | undefined;
  if (!r || typeof r !== 'object' || r.v !== 1 || !Array.isArray(r.steps) || !Array.isArray(r.events) || !r.spec || !Array.isArray(r.spec.steps)) return null;
  if (r.steps.length !== r.spec.steps.length || r.steps.some((s, i) => s.id !== r.spec.steps[i]!.id)) return null;
  return r;
}
