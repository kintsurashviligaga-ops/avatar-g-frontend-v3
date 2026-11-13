/**
 * EXECUTE: the parallel DAG scheduler (v5.1 M-8; 06 §2–§3). One pure function, `tick`, moves a run: it reads the run,
 * what the executors answered and what the owner pressed, and returns the next run, the effects to perform (start a
 * step, stop a step) and the timeline events. The caller performs the effects and stores the run under
 * compare-and-set, exactly as lib/agent/run/runExec does for media runs today, so a tick, a cancel and the sweep can
 * race and one write wins.
 *
 * Rules (each pinned in scheduler.test.ts):
 *   · A step starts once every step it depends on is done: up to MAX_WORKERS at once per run, and at most
 *     MAX_SANDBOX_PER_USER sandbox steps per USER across runs (`sandboxBusyElsewhere`). A sandbox step that must wait
 *     never holds back the others. Ready steps start in plan order, so the same inputs always give the same schedule.
 *   · A result counts only for the attempt in flight (a late answer from a stopped or retried attempt is ignored), and
 *     only after its VERIFY check passes.
 *   · A retryable failure is retried once (MAX_STEP_RETRIES); after that the step fails. A step whose input failed, was
 *     skipped or was stopped is skipped: it can never run.
 *   · Pause stops new starts; running steps finish. Resume carries on. Cancel stops the running steps and ends the rest.
 *   · The deadline (default 10 min) cancels what is left; the run ends partially_completed when something was
 *     delivered, failed when nothing was.
 *   · With `replanOnFailure`, a run whose steps all ended with a failure (and replans left) waits for the user
 *     (awaiting_approval) instead of ending; `replan` swaps in a new tail, keeping every step already done.
 *   · Checkpoints: a step records the hash of what it was made from. A run created with `reuse` from an earlier one
 *     takes a done step with the same hash as delivered, without running it or paying for it again.
 *   · Every run status change goes the legal way through lib/agent/contracts RUN_TRANSITIONS.
 */
import { TERMINAL_RUN_STATUSES, transitionPath, type RunStatus } from '../contracts';
import {
  DEFAULT_RUN_DEADLINE_MS, MAX_REPLANS, MAX_SANDBOX_PER_USER, MAX_STEP_RETRIES, MAX_WORKERS, SANDBOX_TOOLS, TERMINAL_STEP,
  type EngineEffect, type EngineRun, type Plan, type PlanStep, type StepState, type TickInput, type TickOutput,
  type Checkpoint, type TimelineEvent, type TimelineType, type Verifier,
} from './types';
import { topoOrder } from './plan';

export interface EngineOptions {
  verify?: Verifier;
  replanOnFailure?: boolean;
}


/** Deterministic, dependency-free string hash (FNV-1a, 32-bit, hex). A checkpoint key, not a security boundary. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Stable JSON: keys sorted, so the same params always hash the same. */
export function stableJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(',')}}`;
}

/** What a step is made from: its tool, its params and the outputs of its inputs, in dependency order. */
export function inputsHashOf(step: PlanStep, inputs: string[]): string {
  return fnv1a(stableJson({ tool: step.tool, params: step.params, inputs }));
}

const passVerify: Verifier = () => ({ ok: true });

class Tick {
  run: EngineRun;
  effects: EngineEffect[] = [];
  events: TimelineEvent[] = [];
  constructor(run: EngineRun, readonly now: number) {
    this.run = { ...run, plan: run.plan, steps: run.steps.map((s) => ({ ...s })) };
  }
  emit(type: TimelineType, stepId?: string, data?: Record<string, unknown>) {
    this.run.seq += 1;
    this.events.push({ seq: this.run.seq, runId: this.run.id, at: this.now, type, ...(stepId ? { stepId } : {}), ...(data ? { data } : {}) });
  }
  moveTo(to: RunStatus) {
    if (this.run.status === to) return;
    const path = transitionPath(this.run.status, to);
    if (!path) throw new Error(`illegal run transition ${this.run.status} → ${to}`);
    for (const s of path) {
      this.run.status = s;
      this.emit('run.status', undefined, { status: s });
    }
  }
  step(id: string): StepState {
    return this.run.steps.find((s) => s.id === id)!;
  }
  planStep(id: string): PlanStep {
    return this.run.plan.steps.find((s) => s.id === id)!;
  }
  out(): TickOutput {
    return { run: this.run, effects: this.effects, events: this.events };
  }
}

/** A new run on an approved plan (APPROVE and RESERVE happen before this, outside the engine). */
export function createRun(
  id: string, plan: Plan, now: number,
  opts: { deadlineMs?: number; reuse?: Record<string, Checkpoint> } = {},
): TickOutput {
  if (!topoOrder(plan.steps)) throw new Error('createRun: the plan has a cycle (parsePlan first)');
  const run: EngineRun = {
    v: 1, id, status: 'planned', plan,
    steps: plan.steps.map((s) => ({ id: s.id, status: 'pending', attempts: 0 })),
    paused: false, cancelRequested: false, replans: 0, createdAt: now, deadlineAt: now + (opts.deadlineMs ?? DEFAULT_RUN_DEADLINE_MS), seq: 0,
    ...(opts.reuse && Object.keys(opts.reuse).length ? { reuse: opts.reuse } : {}),
  };
  const t = new Tick(run, now);
  t.emit('run.planned', undefined, { steps: plan.steps.length, title: plan.title });
  t.moveTo('queued');
  return t.out();
}

/** The checkpoints of a finished run, for `createRun(..., { reuse })` of the next one. */
export function checkpointsOf(run: EngineRun): Record<string, Checkpoint> {
  const out: Record<string, Checkpoint> = {};
  for (const s of run.steps) if (s.status === 'done' && s.inputsHash && s.outputs) out[s.id] = { inputsHash: s.inputsHash, outputs: s.outputs };
  return out;
}

function inputsOf(t: Tick, step: PlanStep): string[] {
  return step.dependsOn.flatMap((d) => t.step(d).outputs ?? []);
}

export function tick(run: EngineRun, input: TickInput, opts: EngineOptions = {}): TickOutput {
  const t = new Tick(run, input.now);
  if (TERMINAL_RUN_STATUSES.has(t.run.status)) return t.out();
  const verify = opts.verify ?? passVerify;

  // 1. The owner's presses, in order.
  for (const c of input.commands ?? []) {
    if (c === 'pause' && !t.run.paused) { t.run.paused = true; t.emit('run.paused'); }
    if (c === 'resume' && t.run.paused) { t.run.paused = false; t.emit('run.resumed'); }
    if (c === 'cancel' && !t.run.cancelRequested) t.run.cancelRequested = true;
  }

  // 2. Executor answers: only the attempt in flight counts, and only once VERIFY passes.
  for (const r of input.results ?? []) {
    const s = t.run.steps.find((x) => x.id === r.stepId);
    if (!s || s.status !== 'running' || s.attemptId !== r.attemptId) continue;
    const ps = t.planStep(s.id);
    const credits = r.credits ?? 0;
    s.credits = (s.credits ?? 0) + credits;
    if (credits) t.emit('run.cost', s.id, { credits });
    const failure = r.ok
      ? (() => { const v = verify(ps, r.outputs); return v.ok ? null : { error: `verify: ${v.error}`, retryable: v.retryable }; })()
      : { error: r.error, retryable: r.retryable };
    if (!failure && r.ok) {
      s.status = 'done';
      s.outputs = r.outputs.slice(0, 30);
      if (r.inputsHash) s.inputsHash = r.inputsHash;
      s.endedAt = t.now;
      t.emit('step.checkpoint', s.id, { inputsHash: s.inputsHash, outputs: s.outputs.length });
      t.emit('step.done', s.id);
    } else if (failure) {
      const canRetry = failure.retryable && s.attempts <= MAX_STEP_RETRIES && !t.run.cancelRequested && t.now < t.run.deadlineAt;
      s.error = failure.error.slice(0, 300);
      s.attemptId = undefined;
      if (canRetry) {
        s.status = 'pending';
        t.emit('step.retry', s.id, { error: s.error, attempt: s.attempts });
      } else {
        s.status = 'failed';
        s.endedAt = t.now;
        t.emit('step.failed', s.id, { error: s.error });
      }
    }
  }

  // 3. The deadline is a cancel the run gives itself.
  if (!t.run.cancelRequested && t.now >= t.run.deadlineAt) {
    t.run.cancelRequested = true;
    t.run.error = 'deadline';
  }

  // 4. A stop ends everything that has not ended.
  if (t.run.cancelRequested) {
    for (const s of t.run.steps) {
      if (s.status === 'running') {
        t.effects.push({ type: 'stop', stepId: s.id, attemptId: s.attemptId! });
        s.attemptId = undefined;
      }
      if (s.status === 'running' || s.status === 'pending') {
        s.status = 'cancelled';
        s.endedAt = t.now;
        s.error = t.run.error === 'deadline' ? 'deadline' : 'cancelled';
        t.emit('step.cancelled', s.id, { reason: s.error });
      }
    }
  }

  // 5. In dependency order: skip what can never run, take reusable checkpoints, start what is ready.
  const order = topoOrder(t.run.plan.steps)!;
  let running = t.run.steps.filter((s) => s.status === 'running').length;
  let sandboxRunning = t.run.steps.filter((s) => s.status === 'running' && SANDBOX_TOOLS.has(t.planStep(s.id).tool)).length + (input.sandboxBusyElsewhere ?? 0);
  if (t.run.status !== 'awaiting_approval') {
    for (const id of order) {
      const s = t.step(id);
      if (s.status !== 'pending') continue;
      const ps = t.planStep(id);
      const deps = ps.dependsOn.map((d) => t.step(d));
      if (deps.some((d) => d.status === 'failed' || d.status === 'skipped' || d.status === 'cancelled')) {
        s.status = 'skipped';
        s.endedAt = t.now;
        s.error = 'skipped';
        t.emit('step.skipped', id, { because: deps.filter((d) => d.status !== 'done').map((d) => d.id) });
        continue;
      }
      if (!deps.every((d) => d.status === 'done')) continue;
      const inputs = inputsOf(t, ps);
      const hash = inputsHashOf(ps, inputs);
      const cp = t.run.reuse?.[id];
      if (cp && cp.inputsHash === hash) {
        Object.assign(s, { status: 'done', inputsHash: hash, outputs: cp.outputs, credits: 0, reused: true, endedAt: t.now });
        t.emit('step.done', id, { reused: true });
        continue;
      }
      if (t.run.paused || t.run.cancelRequested || running >= MAX_WORKERS) continue;
      const sandbox = SANDBOX_TOOLS.has(ps.tool);
      if (sandbox && sandboxRunning >= MAX_SANDBOX_PER_USER) continue;
      s.status = 'running';
      s.attempts += 1;
      s.attemptId = `${t.run.id}:${id}:${s.attempts}:r${t.run.replans}`;
      s.startedAt = t.now;
      s.inputsHash = hash;
      running += 1;
      if (sandbox) sandboxRunning += 1;
      t.effects.push({ type: 'start', stepId: id, attemptId: s.attemptId, tool: ps.tool, inputs });
      t.emit('step.started', id, { attempt: s.attempts });
    }
  }

  // 6. The run's own status.
  if (running > 0 && t.run.status === 'queued') t.moveTo('running');
  const allEnded = t.run.steps.every((s) => TERMINAL_STEP.has(s.status));
  if (allEnded) finish(t, opts);
  return t.out();
}

function finish(t: Tick, opts: EngineOptions) {
  const done = t.run.steps.filter((s) => s.status === 'done').length;
  if (t.run.status === 'awaiting_approval') {
    // Waiting for the user's yes to a new plan: only a stop (theirs or the deadline's) ends it.
    if (t.run.cancelRequested) t.moveTo('cancelled');
    return;
  }
  const failed = t.run.steps.some((s) => s.status === 'failed');
  if (!t.run.cancelRequested && failed && opts.replanOnFailure && t.run.replans < MAX_REPLANS) {
    t.moveTo('awaiting_approval');
    t.emit('step.needs_approval', undefined, { needs: 'replan', replansLeft: MAX_REPLANS - t.run.replans });
    return;
  }
  const byOwner = t.run.cancelRequested && t.run.error !== 'deadline';
  const to: RunStatus = byOwner ? 'cancelled' : done === t.run.steps.length ? 'completed' : done > 0 ? 'partially_completed' : 'failed';
  // transitionPath walks the legal hops (queued → running → completed).
  t.moveTo(to);
  if (done > 0 && to !== 'cancelled') {
    t.emit('run.delivered', undefined, { steps: done, credits: t.run.steps.reduce((a, s) => a + (s.credits ?? 0), 0) });
  }
}

/**
 * Swap in a new plan after a failure (or while running): every step that is done or running stays, unchanged, and must
 * be in the new plan with the same tool and inputs; everything else is replaced. At most MAX_REPLANS per run. The new
 * plan has already passed parsePlan and VALIDATE, and its price the user's yes (the run waits in awaiting_approval).
 */
export function replan(run: EngineRun, plan: Plan, now: number): ({ ok: true } & TickOutput) | { ok: false; error: string } {
  if (TERMINAL_RUN_STATUSES.has(run.status)) return { ok: false, error: `run is ${run.status}` };
  if (run.replans >= MAX_REPLANS) return { ok: false, error: `at most ${MAX_REPLANS} replans` };
  if (!topoOrder(plan.steps)) return { ok: false, error: 'the new plan has a cycle' };
  const t = new Tick(run, now);
  const kept = t.run.steps.filter((s) => s.status === 'done' || s.status === 'running');
  for (const k of kept) {
    const was = t.planStep(k.id);
    const now2 = plan.steps.find((s) => s.id === k.id);
    if (!now2 || now2.tool !== was.tool || stableJson(now2.dependsOn) !== stableJson(was.dependsOn) || stableJson(now2.params) !== stableJson(was.params)) {
      return { ok: false, error: `step "${k.id}" is ${k.status} and must stay as it is` };
    }
  }
  for (const s of t.run.steps) if (s.status === 'pending') t.emit('step.cancelled', s.id, { reason: 'replanned' });
  const keptIds = new Set(kept.map((k) => k.id));
  t.run.plan = plan;
  t.run.steps = plan.steps.map((ps) => (keptIds.has(ps.id) ? kept.find((k) => k.id === ps.id)! : { id: ps.id, status: 'pending', attempts: 0 }));
  t.run.replans += 1;
  t.emit('run.replanned', undefined, { replans: t.run.replans, steps: plan.steps.length });
  if (t.run.status === 'awaiting_approval') t.moveTo('queued');
  return { ok: true, ...t.out() };
}

/** What the card shows: one line per step, like lib/agent/taskGraph graphSummary. */
export function runSummary(run: EngineRun): string {
  const mark: Record<StepState['status'], string> = { pending: '○', running: '✱', done: '✓', failed: '✗', skipped: '–', cancelled: '■' };
  return [`${run.plan.title} [${run.status}${run.paused ? ', paused' : ''}]`, ...run.plan.steps.map((ps) => {
    const s = run.steps.find((x) => x.id === ps.id)!;
    return `${mark[s.status]} ${ps.id} [${ps.tool}] ${ps.title}${ps.dependsOn.length ? ` ← ${ps.dependsOn.join(', ')}` : ''}${s.reused ? ' (reused)' : ''}${s.error && s.status !== 'done' ? ` (${s.error})` : ''}`;
  })].join('\n');
}
