/**
 * A deterministic, in-memory driver for the engine: a fake clock and scripted executors (how long each step takes,
 * whether an attempt fails), so the scheduler can be run end to end on mocked data (tests, and the admin dry run that
 * shows a plan's schedule before it is approved). Never calls a real tool.
 */
import { createRun, tick, type EngineOptions } from './scheduler';
import type { EngineCommand, EngineEffect, EngineRun, Plan, StepResult, TimelineEvent, Checkpoint } from './types';

export interface ScriptedAttempt {
  /** How long the attempt runs, in ms of the fake clock. */
  ms: number;
  /** Fail this attempt (retryable or not); default succeed. */
  fail?: { error: string; retryable: boolean };
  credits?: number;
  outputs?: string[];
}

export interface SimScript {
  /** Per step id: one entry per attempt (the last one repeats). Steps with no entry take 1 s and succeed. */
  steps?: Record<string, ScriptedAttempt[]>;
  /** Owner presses at given clock times. */
  commands?: Array<{ at: number; command: EngineCommand }>;
  /** Sandbox steps the user has running in other runs, as a function of the clock. */
  sandboxBusyElsewhere?: (now: number) => number;
}

export interface SimResult {
  run: EngineRun;
  events: TimelineEvent[];
  effects: Array<EngineEffect & { at: number }>;
  /** The largest number of steps that ran at the same time. */
  peakParallel: number;
  /** Start and end of each attempt that ran, by step id. */
  spans: Record<string, Array<{ start: number; end: number | null }>>;
  ticks: number;
}

export function simulate(
  plan: Plan, script: SimScript = {},
  opts: EngineOptions & { deadlineMs?: number; reuse?: Record<string, Checkpoint>; tickMs?: number; maxTicks?: number; onAwaitingApproval?: (run: EngineRun, now: number) => { run: EngineRun; events: TimelineEvent[] } | null } = {},
): SimResult {
  const tickMs = opts.tickMs ?? 250;
  let now = 0;
  const created = createRun('run_sim', plan, now, { deadlineMs: opts.deadlineMs, reuse: opts.reuse });
  let run = created.run;
  const events: TimelineEvent[] = [...created.events];
  const effects: SimResult['effects'] = [];
  const inFlight = new Map<string, { stepId: string; endsAt: number; attempt: ScriptedAttempt }>();
  const attemptsSeen: Record<string, number> = {};
  const spans: SimResult['spans'] = {};
  let peak = 0;
  const pending = [...(script.commands ?? [])].sort((a, b) => a.at - b.at);
  let ticks = 0;
  const maxTicks = opts.maxTicks ?? 10_000;

  while (ticks++ < maxTicks) {
    const results: StepResult[] = [];
    for (const [attemptId, f] of [...inFlight]) {
      if (f.endsAt > now) continue;
      inFlight.delete(attemptId);
      const span = spans[f.stepId]!.find((s) => s.end === null);
      if (span) span.end = now;
      results.push(f.attempt.fail
        ? { stepId: f.stepId, attemptId, ok: false, error: f.attempt.fail.error, retryable: f.attempt.fail.retryable, credits: f.attempt.credits ?? 0 }
        : { stepId: f.stepId, attemptId, ok: true, outputs: f.attempt.outputs ?? [`${f.stepId}/out.txt`], credits: f.attempt.credits ?? 1 });
    }
    const commands: EngineCommand[] = [];
    while (pending.length && pending[0]!.at <= now) commands.push(pending.shift()!.command);

    const out = tick(run, { now, results, commands, sandboxBusyElsewhere: script.sandboxBusyElsewhere?.(now) ?? 0 }, opts);
    run = out.run;
    events.push(...out.events);
    for (const e of out.effects) {
      effects.push({ ...e, at: now });
      if (e.type === 'start') {
        const n = (attemptsSeen[e.stepId] = (attemptsSeen[e.stepId] ?? 0) + 1);
        const list = script.steps?.[e.stepId] ?? [{ ms: 1_000 }];
        const attempt = list[Math.min(n, list.length) - 1]!;
        inFlight.set(e.attemptId, { stepId: e.stepId, endsAt: now + attempt.ms, attempt });
        (spans[e.stepId] ??= []).push({ start: now, end: null });
      } else {
        inFlight.delete(e.attemptId);
        const span = spans[e.stepId]?.find((s) => s.end === null);
        if (span) span.end = now;
      }
    }
    peak = Math.max(peak, inFlight.size);

    if (run.status === 'awaiting_approval' && opts.onAwaitingApproval) {
      const next = opts.onAwaitingApproval(run, now);
      if (next) {
        run = next.run;
        events.push(...next.events);
      }
    }
    if (['completed', 'failed', 'cancelled', 'partially_completed'].includes(run.status) && inFlight.size === 0) break;
    if (run.status === 'awaiting_approval' && !opts.onAwaitingApproval && !pending.length) break;
    now += tickMs;
  }
  return { run, events, effects, peakParallel: peak, spans, ticks };
}
