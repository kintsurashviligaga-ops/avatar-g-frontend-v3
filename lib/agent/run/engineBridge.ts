/**
 * lib/agent/run/engineBridge.ts — media runs on lib/agent/engine (v5.1 Phase 3.5b). Pure.
 *
 * A v2 run (`_run.v = 2`) keeps the v1 step records (quote, job id, output, approval) that ./runExec acts on and the run
 * card reads, and adds the engine's own run (`engine`). Each tick:
 *
 *   1. what the steps' jobs say, the quotes held for a yes and the owner's presses are handed to the engine
 *      (ChildView → StepResult, a quote above approval → StepHold, stop / pause / a yes → commands);
 *   2. the engine decides (lib/agent/engine/scheduler tick: order, the 2-at-a-time cap, retry once, deadline, pause);
 *   3. its decision is projected back onto the step records, in the step vocabulary the card already renders, and its
 *      effects become today's RunActions (start = quote then queue, under the tick lease; stop = the executor's cancel,
 *      which refunds).
 *
 * The run's own status is then settled from the projected steps exactly as v1 does, so the card, the job tray and the
 * Library read a v2 run the same way. Money never moves here: quotes, debits and refunds stay in the executors, and a
 * retry is a NEW quote checked against the step's approval (decision 3: above it, the step waits for a yes).
 *
 * Mapping (01-wiring-plan.md §3.5b):
 *   step job id (taskId)    ↔ engine attemptId (kept on the step as `attemptId`; a late answer from an old job is ignored)
 *   ChildView completed     → StepResult ok, outputs [url]
 *   ChildView failed        → StepResult failure; retryable only for the codes in RETRYABLE (never a refusal or bad input)
 *   ChildView cancelled     → a failure the engine did not ask for (an engine stop is no longer an attempt in flight)
 *   a running job gone      → failure 'lost' (not retried: nothing will deliver it)
 *   engine start            → RunAction start (quote + queue) or enqueue (a quote the user already said yes to)
 *   engine stop             → RunAction cancel
 */
import { createRun, tick as engineTick } from '@/lib/agent/engine/scheduler';
import type { EngineCommand, StepHold, StepResult, StepState } from '@/lib/agent/engine/types';
import type { AgentApproval } from '../contracts';
import {
  MAX_PARALLEL, emit, isFinalStep, isTerminalRun, moveStep, newRun, resumedRun, settle,
  type ChildView, type RunAction, type RunState, type RunStepState,
} from './runEngine';
import { planOfSpec } from './runValidate';
import type { RunSpec, RunTool } from './runSpec';

/**
 * Failure codes worth one automatic retry: the executor or its upstream was busy or lost, not the request. A content
 * refusal, bad input or a QC failure is never retried. Today's media executors report none of these (their workers are
 * retried by the lease itself), so a v2 media run retries only once an executor starts reporting one.
 */
export const RETRYABLE: ReadonlySet<string> = new Set(['timeout', 'rate_limited', 'worker_lost', 'upstream_5xx']);
export const isRetryable = (code: string | undefined): boolean => !!code && RETRYABLE.has(code.split(':')[0]!.trim());

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** A new v2 run: the v1 records as newRun makes them, plus the engine's run on the same plan and prices. */
export function newRunV2(runId: string, spec: RunSpec, approval: AgentApproval, listPrice: (tool: RunTool) => number, at: number): RunState {
  const run = newRun(spec, approval, listPrice, at);
  const plan = planOfSpec(spec, listPrice);
  const approved = Object.fromEntries(run.steps.map((s) => [s.id, s.approvedCredits]));
  return { ...run, v: 2, engine: createRun(runId, plan, at, { approved }).run };
}

/**
 * The v2 run that carries a final v2 run on (resumeRun): delivered steps reused with their job and result (v1's rule),
 * and the engine told so through its checkpoints, so it never starts them again or pays for them twice.
 */
export function resumedRunV2(prev: RunState, prevId: string, runId: string, approval: AgentApproval, at: number): RunState | null {
  const run = resumedRun(prev, prevId, approval, at);
  if (!run || !prev.engine) return null;
  const plan = prev.engine.plan;
  const approved = Object.fromEntries(run.steps.map((s) => [s.id, s.approvedCredits]));
  const engine = createRun(runId, plan, at, { approved }).run;
  // A reused step is done in the engine from the start: its outputs are the delivered link (inputs of the next steps).
  engine.steps = engine.steps.map((es): StepState => {
    const s = run.steps.find((x) => x.id === es.id)!;
    return s.reused && s.output ? { ...es, status: 'done', outputs: [s.output.url], credits: 0, reused: true, endedAt: at } : es;
  });
  return { ...run, v: 2, engine };
}

/** What a step's job says, as the engine's result for the attempt in flight (null: nothing to say yet). */
type Answer = { ok: true; outputs: string[]; credits: number } | { ok: false; error: string; retryable: boolean };

function resultOf(step: RunStepState, c: ChildView): { result: Answer; done?: ChildView & { state: 'completed' } } | null {
  if (c.state === 'completed') return { result: { ok: true, outputs: [c.output.url], credits: step.quote?.credits ?? 0 }, done: c };
  if (c.state === 'failed') return { result: { ok: false, error: c.error, retryable: isRetryable(c.error) } };
  if (c.state === 'cancelled') return { result: { ok: false, error: 'cancelled', retryable: false } };
  if (c.state === 'missing' && step.status === 'running') return { result: { ok: false, error: 'lost', retryable: false } };
  return null;
}

/**
 * One v2 tick: the same contract as planTick (the next state and what to do), decided by the engine.
 * `sandboxBusyElsewhere` is the user's sandbox steps in other runs; media runs have none, so it is 0 unless given.
 */
export function planTickV2(
  state: RunState, children: Readonly<Record<string, ChildView>>, now: number, opts: { sandboxBusyElsewhere?: number } = {},
): { next: RunState; actions: RunAction[] } {
  if (isTerminalRun(state) || state.v !== 2 || !state.engine) return { next: state, actions: [] };
  const run = clone(state);
  const eng = run.engine!;
  const actions: RunAction[] = [];
  const engStep = (id: string) => eng.steps.find((s) => s.id === id)!;
  const completedViews = new Map<string, ChildView & { state: 'completed' }>();

  // ── 1. inputs for the engine ───────────────────────────────────────────────────────────────────────────────────
  const commands: EngineCommand[] = [];
  if (run.cancelRequested) commands.push('cancel');
  if (run.paused && !eng.paused) commands.push('pause');
  if (!run.paused && eng.paused) commands.push('resume');
  const results: StepResult[] = [];
  const holds: StepHold[] = [];
  for (const step of run.steps) {
    const e = engStep(step.id);
    if (e.status === 'awaiting_approval' && !step.quote) {
      // The held quote expired before the yes (approveStep dropped it): the step is priced again, at the price it is
      // approved for, and a price above that waits for a yes to the NEW quote. Nothing was charged for the old one.
      e.status = 'pending';
      e.heldQuote = undefined;
      delete step.approvedQuoteId;
      continue;
    }
    if (step.approvedQuoteId && e.status === 'awaiting_approval' && e.heldQuote?.quoteId === step.approvedQuoteId) {
      commands.push({ type: 'approve', stepId: step.id, quoteId: step.approvedQuoteId });
    }
    if (e.status !== 'running' || !e.attemptId || step.attemptId !== e.attemptId) continue;
    const ids = { stepId: step.id, attemptId: e.attemptId };
    if (step.attemptError) {
      results.push({ ...ids, ok: false, error: step.attemptError, retryable: isRetryable(step.attemptError) });
      delete step.attemptError;
      continue;
    }
    if (step.status === 'awaiting_approval' && step.quote) {
      holds.push({ ...ids, quoteId: step.quote.quoteId, credits: step.quote.credits });
      continue;
    }
    if (!step.taskId) {
      // Started by the engine but never quoted (the tick that should have quoted lost the lease, or died first): ask for
      // the quote again. startSteps quotes it only under the start lease, and never a step that already has a quote.
      if (!step.quote && step.status !== 'awaiting_approval') actions.push({ type: 'start', step: step.id });
      continue;
    }
    const c = children[step.id] ?? { state: 'missing' as const };
    if (c.state === 'live') {
      if (c.running) moveStep(run, step, 'running', now, 'step.running');
      continue;
    }
    if (c.state === 'missing' && step.status === 'queued') {
      // A quote whose job is not there yet (a tick died between writing it and queuing it): queue it again, or price it
      // again once it expired. The engine's attempt carries on either way.
      if (step.quote && now < step.quote.expiresAt) actions.push({ type: 'enqueue', step: step.id });
      else {
        delete step.quote;
        delete step.taskId;
        emit(run, now, 'step.requote', step.id);
        actions.push({ type: 'start', step: step.id });
      }
      continue;
    }
    const r = resultOf(step, c);
    if (!r) continue;
    results.push({ ...ids, ...r.result } as StepResult);
    if (r.done) completedViews.set(step.id, r.done);
  }

  // ── 2. the engine decides ──────────────────────────────────────────────────────────────────────────────────────
  let out = engineTick(eng, { now, results, holds, commands, sandboxBusyElsewhere: opts.sandboxBusyElsewhere ?? 0 }, { maxWorkers: MAX_PARALLEL });
  // A yes that landed before any tick handed the engine its hold (quoted above approval and approved at once): the
  // engine applies commands before holds, so it holds the quote only now. Release it in this same tick, not the next.
  const lateYes: EngineCommand[] = run.steps
    .filter((s) => s.approvedQuoteId && out.run.steps.some((e) => e.id === s.id && e.status === 'awaiting_approval' && e.heldQuote?.quoteId === s.approvedQuoteId))
    .map((s) => ({ type: 'approve', stepId: s.id, quoteId: s.approvedQuoteId! }));
  if (lateYes.length && !commands.some((c) => typeof c === 'object' && c.type === 'approve')) {
    const again = engineTick(out.run, { now, results: [], holds: [], commands: lateYes, sandboxBusyElsewhere: opts.sandboxBusyElsewhere ?? 0 }, { maxWorkers: MAX_PARALLEL });
    out = { ...again, events: [...out.events, ...again.events], effects: [...out.effects, ...again.effects] };
  }
  run.engine = out.run;
  const retried = new Set(out.events.filter((e) => e.type === 'step.retry').map((e) => e.stepId));
  for (const e of out.events) {
    if (e.type === 'run.paused') emit(run, now, 'run.paused');
    if (e.type === 'run.resumed') emit(run, now, 'run.unpaused');
  }

  // ── 3. its decision, projected onto the step records ───────────────────────────────────────────────────────────
  for (const step of run.steps) {
    const e = out.run.steps.find((s) => s.id === step.id)!;
    if (isFinalStep(step) && !(e.status === 'pending' && retried.has(step.id))) continue;
    if (e.status === 'done') {
      const c = completedViews.get(step.id);
      if (c) step.output = c.output;
      moveStep(run, step, 'running', now, 'step.running');
      moveStep(run, step, 'completed', now, 'step.completed', step.output?.media);
    } else if (e.status === 'failed') {
      step.error = e.error ?? 'failed';
      delete step.quote;
      moveStep(run, step, 'failed', now, 'step.failed', step.error);
    } else if (e.status === 'skipped') {
      step.error = 'skipped';
      delete step.quote;
      moveStep(run, step, 'cancelled', now, 'step.skipped');
    } else if (e.status === 'cancelled') {
      step.error = e.error ?? 'cancelled';
      delete step.quote;
      delete step.approvedQuoteId;
      moveStep(run, step, 'cancelled', now, 'step.cancelled', step.error === 'cancelled' ? undefined : step.error);
    } else if (e.status === 'pending' && retried.has(step.id)) {
      // Retry once (decision 3): a NEW job on a NEW quote, checked against the approval when it starts. The failed job
      // was refunded by its executor.
      step.error = e.error;
      delete step.quote;
      delete step.taskId;
      delete step.attemptId;
      if (step.status === 'queued') emit(run, now, 'step.retry', step.id, e.error);
      else moveStep(run, step, 'queued', now, 'step.retry', e.error);
    } else if (e.status === 'awaiting_approval') {
      step.approvedCredits = e.approvedCredits;
    }
  }
  for (const eff of out.effects) {
    const step = run.steps.find((s) => s.id === eff.stepId)!;
    if (eff.type === 'stop') {
      if (step.taskId) actions.push({ type: 'cancel', step: step.id, taskId: step.taskId });
      continue;
    }
    step.attemptId = eff.attemptId;
    step.approvedCredits = eff.approvedCredits;
    const approved = step.approvedQuoteId && step.quote && step.quote.quoteId === step.approvedQuoteId;
    delete step.approvedQuoteId;
    if (approved && step.quote && now < step.quote.expiresAt && step.quote.credits <= eff.approvedCredits) {
      // The user said yes to this exact quote: queue its job now, no new price.
      step.taskId = step.quote.taskId;
      moveStep(run, step, 'queued', now, 'step.approved', `${step.quote.credits} credits`);
      actions.push({ type: 'enqueue', step: step.id });
    } else {
      delete step.quote;
      delete step.taskId;
      actions.push({ type: 'start', step: step.id });
    }
  }

  settle(run, now, new Set(actions.filter((a) => a.type === 'start').map((a) => a.step)));
  if (isTerminalRun(run) && (out.run.error === 'deadline' || out.run.error === 'approval_timeout') && run.status !== 'completed') run.error = out.run.error;
  return { next: run, actions };
}
