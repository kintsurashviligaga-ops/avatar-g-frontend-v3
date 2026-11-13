/** @jest-environment node */
/** EXECUTE (M-8): the parallel DAG scheduler, driven end to end on mocked executors by ./simulate. */
import { RUN_TRANSITIONS, type RunStatus } from '../contracts';
import { parsePlan } from './plan';
import { checkpointsOf, createRun, fnv1a, inputsHashOf, replan, runSummary, stableJson, tick } from './scheduler';
import { simulate } from './simulate';
import { APPROVAL_TIMEOUT_MS, MAX_WORKERS, RETRY_BACKOFF_MS, type Plan, type TimelineEvent } from './types';

function plan(steps: Array<[id: string, tool: string, deps?: string[]]>, title = 'test'): Plan {
  const r = parsePlan({ title, steps: steps.map(([id, tool, deps]) => ({ id, tool, title: id, dependsOn: deps ?? [] })) });
  if (!r.ok) throw new Error(r.error);
  return r.plan;
}

/** Every run.status event is one legal hop from the one before. */
function expectLegalStatuses(events: TimelineEvent[]) {
  let at: RunStatus = 'planned';
  for (const e of events.filter((x) => x.type === 'run.status')) {
    const to = e.data!.status as RunStatus;
    expect(RUN_TRANSITIONS[at]).toContain(to);
    at = to;
  }
}

const status = (r: ReturnType<typeof simulate>, id: string) => r.run.steps.find((s) => s.id === id)!.status;

test('independent steps run side by side, capped at 3 per run; dependents wait for every input', () => {
  const p = plan([['a', 'research'], ['b', 'research'], ['c', 'research'], ['d', 'research'], ['e', 'write', ['a', 'b', 'c', 'd']]]);
  const r = simulate(p, { steps: { a: [{ ms: 2_000 }], b: [{ ms: 2_000 }], c: [{ ms: 2_000 }], d: [{ ms: 1_000 }] } });
  expect(r.run.status).toBe('completed');
  expect(r.peakParallel).toBe(MAX_WORKERS);
  expect(r.spans.d![0]!.start).toBe(2_000); // the 4th waited for a free worker
  expect(r.spans.e![0]!.start).toBeGreaterThanOrEqual(3_000); // after the last input
  expectLegalStatuses(r.events);
  expect(r.events.filter((e) => e.type === 'run.delivered')).toHaveLength(1);
});

test('sandbox steps run one at a time per user, across runs, without holding the others back', () => {
  const p = plan([['c1', 'code'], ['c2', 'code'], ['w', 'write']]);
  const r = simulate(p, { steps: { c1: [{ ms: 2_000 }], c2: [{ ms: 2_000 }], w: [{ ms: 500 }] } });
  expect(r.spans.w![0]!.start).toBe(0);
  expect(r.spans.c2![0]!.start).toBeGreaterThanOrEqual(r.spans.c1![0]!.end!);
  // Another run of this user holds the sandbox for the first 3 s: neither code step starts before that.
  const busy = simulate(p, { sandboxBusyElsewhere: (now) => (now < 3_000 ? 1 : 0) });
  expect(busy.spans.c1![0]!.start).toBe(3_000);
  expect(busy.spans.w![0]!.start).toBe(0);
});

test('a retryable failure is retried once; a second failure fails the step and skips what needs it', () => {
  const p = plan([['a', 'research'], ['b', 'code', ['a']], ['c', 'pdf', ['b']], ['x', 'write']]);
  const once = simulate(p, { steps: { a: [{ ms: 500, fail: { error: 'timeout', retryable: true } }, { ms: 500 }] } });
  expect(once.run.status).toBe('completed');
  expect(once.run.steps.find((s) => s.id === 'a')!.attempts).toBe(2);
  expect(once.events.some((e) => e.type === 'step.retry' && e.stepId === 'a')).toBe(true);

  const twice = simulate(p, { steps: { a: [{ ms: 500, fail: { error: 'timeout', retryable: true } }] } });
  expect([status(twice, 'a'), status(twice, 'b'), status(twice, 'c'), status(twice, 'x')]).toEqual(['failed', 'skipped', 'skipped', 'done']);
  expect(twice.run.status).toBe('partially_completed');
  expectLegalStatuses(twice.events);
});

test('a non-retryable failure is never retried; a run with nothing delivered fails', () => {
  const p = plan([['a', 'video']]);
  const r = simulate(p, { steps: { a: [{ ms: 500, fail: { error: 'content_rejected', retryable: false } }] } });
  expect(r.run.steps[0]).toMatchObject({ status: 'failed', attempts: 1, error: 'content_rejected' });
  expect(r.run.status).toBe('failed');
  expect(r.events.some((e) => e.type === 'run.delivered')).toBe(false);
});

test('VERIFY: a result that fails its check counts as a failure (and is retried when the check says so)', () => {
  const p = plan([['pdf', 'pdf']]);
  const verify = jest.fn((_s, outputs: string[]) => (outputs.some((o) => o.endsWith('.pdf')) ? { ok: true as const } : { ok: false as const, error: 'no pdf', retryable: true }));
  const r = simulate(p, { steps: { pdf: [{ ms: 500, outputs: ['report.json'] }, { ms: 500, outputs: ['report.pdf'] }] } }, { verify });
  expect(r.run.status).toBe('completed');
  expect(r.run.steps[0]!.attempts).toBe(2);
  expect(r.events.find((e) => e.type === 'step.retry')!.data!.error).toBe('verify: no pdf');
});

test('pause stops new starts while running steps finish; resume carries on', () => {
  const p = plan([['a', 'research'], ['b', 'write', ['a']]]);
  const r = simulate(p, { steps: { a: [{ ms: 1_000 }], b: [{ ms: 1_000 }] }, commands: [{ at: 500, command: 'pause' }, { at: 4_000, command: 'resume' }] });
  expect(r.spans.a![0]).toEqual({ start: 0, end: 1_000 });
  expect(r.spans.b![0]!.start).toBe(4_000);
  expect(r.run.status).toBe('completed');
  expect(r.events.map((e) => e.type)).toEqual(expect.arrayContaining(['run.paused', 'run.resumed']));
});

test('cancel stops the running steps (a stop effect each) and ends the rest; a late answer is ignored', () => {
  const p = plan([['a', 'video'], ['b', 'video'], ['c', 'write', ['a']]]);
  const r = simulate(p, { steps: { a: [{ ms: 5_000 }], b: [{ ms: 5_000 }] }, commands: [{ at: 1_000, command: 'cancel' }] });
  expect(r.run.status).toBe('cancelled');
  expect(r.effects.filter((e) => e.type === 'stop').map((e) => e.stepId).sort()).toEqual(['a', 'b']);
  expect([status(r, 'a'), status(r, 'b'), status(r, 'c')]).toEqual(['cancelled', 'cancelled', 'cancelled']);
  expectLegalStatuses(r.events);

  // A late success from the stopped attempt changes nothing.
  const startA = r.effects.find((e) => e.type === 'start' && e.stepId === 'a')!;
  const late = tick(r.run, { now: 9_000, results: [{ stepId: 'a', attemptId: startA.attemptId, ok: true, outputs: ['x'], credits: 5 }] });
  expect(late.run).toEqual(r.run);
  expect(late.effects).toEqual([]);
});

test('the deadline cancels what is left: partially_completed when something was delivered', () => {
  const p = plan([['fast', 'write'], ['slow', 'video']]);
  const r = simulate(p, { steps: { fast: [{ ms: 500 }], slow: [{ ms: 60_000 }] } }, { deadlineMs: 10_000 });
  expect(r.run.status).toBe('partially_completed');
  expect(r.run.error).toBe('deadline');
  expect(r.run.steps.find((s) => s.id === 'slow')).toMatchObject({ status: 'cancelled', error: 'deadline' });
  expect(r.effects.some((e) => e.type === 'stop' && e.stepId === 'slow' && e.at === 10_000)).toBe(true);
});

test('replanOnFailure: the run waits for a yes, then a replan keeps what is done and runs the new tail', () => {
  const p = plan([['a', 'research'], ['b', 'code', ['a']], ['c', 'pdf', ['b']]]);
  let replanned = 0;
  const r = simulate(p, { steps: { b: [{ ms: 500, fail: { error: 'bad csv', retryable: false } }] } }, {
    replanOnFailure: true,
    onAwaitingApproval: (run, now) => {
      if (replanned++) return null;
      const next = plan([['a', 'research'], ['b2', 'write', ['a']], ['c', 'pdf', ['b2']]]);
      const out = replan(run, next, now);
      if (!out.ok) throw new Error(out.error);
      return out;
    },
  });
  expect(r.run.status).toBe('completed');
  expect(r.run.replans).toBe(1);
  expect(r.spans.a).toHaveLength(1); // the done step was not run again
  expect(r.run.steps.map((s) => `${s.id}:${s.status}`)).toEqual(['a:done', 'b2:done', 'c:done']);
  expect(r.events.some((e) => e.type === 'step.needs_approval')).toBe(true);
  expectLegalStatuses(r.events);
});

test('replan refuses to change a done step, past the limit, or on a finished run', () => {
  const p = plan([['a', 'research'], ['b', 'write', ['a']]]);
  const half = simulate(p, { steps: { b: [{ ms: 50_000 }] }, commands: [{ at: 1_500, command: 'pause' }] }, { maxTicks: 10 });
  const changed = replan(half.run, plan([['a', 'write'], ['b', 'write', ['a']]]), 3_000);
  expect(changed).toMatchObject({ ok: false, error: expect.stringContaining('"a" is done') });
  const maxed = { ...half.run, replans: 2 };
  expect(replan(maxed, p, 3_000)).toMatchObject({ ok: false, error: 'at most 2 replans' });
  const done = simulate(p).run;
  expect(replan(done, p, 99_000)).toMatchObject({ ok: false, error: 'run is completed' });
});

test('checkpoints: a new run reuses a done step with the same inputs and re-runs one whose inputs changed', () => {
  const p = plan([['a', 'research'], ['b', 'code', ['a']], ['c', 'pdf', ['b']]]);
  const first = simulate(p, { steps: { c: [{ ms: 500, fail: { error: 'font', retryable: false } }] } });
  expect(first.run.status).toBe('partially_completed');
  const again = simulate(p, {}, { reuse: checkpointsOf(first.run) });
  expect(again.run.status).toBe('completed');
  expect(again.run.steps.map((s) => !!s.reused)).toEqual([true, true, false]);
  expect(again.spans.a).toBeUndefined();
  expect(again.run.steps.filter((s) => s.reused).every((s) => s.credits === 0)).toBe(true);

  // Change a's params: a runs again. Its new outputs differ, so b and c run again too.
  const p2 = { ...p, steps: p.steps.map((s) => (s.id === 'a' ? { ...s, params: { q: 'other' } } : s)) };
  const changed = simulate(p2, { steps: { a: [{ ms: 500, outputs: ['a/other.txt'] }] } }, { reuse: checkpointsOf(first.run) });
  expect(changed.run.steps.map((s) => !!s.reused)).toEqual([false, false, false]);
  // Same new params but the SAME outputs as before: b's inputs are identical, so b is reused (nothing changed for it).
  const same = simulate(p2, {}, { reuse: checkpointsOf(first.run) });
  expect(same.run.steps.map((s) => !!s.reused)).toEqual([false, true, false]);
});

test('the same plan and script always give the same events (deterministic)', () => {
  const p = plan([['a', 'research'], ['b', 'research'], ['c', 'code', ['a', 'b']]]);
  const s = { steps: { a: [{ ms: 700 }], b: [{ ms: 300 }] } };
  expect(simulate(p, s).events).toEqual(simulate(p, s).events);
});

test('a finished run never moves again, and every run ends in a final contract status', () => {
  const r = simulate(plan([['a', 'write']]));
  expect(tick(r.run, { now: 1e9, commands: ['resume', 'cancel'] }).run).toEqual(r.run);
  const created = createRun('run_x', plan([['a', 'write']]), 0);
  expect(created.run.status).toBe('queued');
  expect(() => createRun('run_y', { title: 't', steps: [{ id: 'a', tool: 'write', title: 'a', dependsOn: ['a'], params: {}, estimateCredits: 0 }] }, 0)).toThrow(/cycle/);
});

test('hash and summary helpers', () => {
  expect(stableJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  expect(fnv1a('abc')).toMatch(/^[0-9a-f]{8}$/);
  const [s] = plan([['a', 'write']]).steps;
  expect(inputsHashOf(s!, ['x'])).toBe(inputsHashOf({ ...s!, params: {} }, ['x']));
  expect(inputsHashOf(s!, ['x'])).not.toBe(inputsHashOf(s!, ['y']));
  const r = simulate(plan([['a', 'research'], ['b', 'write', ['a']]], 'Brief'), { steps: { a: [{ ms: 500, fail: { error: 'blocked', retryable: false } }] } });
  expect(runSummary(r.run)).toBe('Brief [failed]\n✗ a [research] a (blocked)\n– b [write] b ← a (skipped)');
});

test('a retry waits RETRY_BACKOFF_MS before it starts again', () => {
  const p = plan([['a', 'write']]);
  const r = simulate(p, { steps: { a: [{ ms: 500, fail: { error: '429', retryable: true } }, { ms: 500 }] } });
  expect(r.run.status).toBe('completed');
  expect(r.spans.a![1]!.start - r.spans.a![0]!.end!).toBeGreaterThanOrEqual(RETRY_BACKOFF_MS);
  expect(r.events.find((e) => e.type === 'step.retry')!.data!.at).toBe(r.spans.a![0]!.end! + RETRY_BACKOFF_MS);
});

test('the deadline is held while the run waits for a yes, and the wait is given back on replan', () => {
  const p = plan([['a', 'write'], ['b', 'write', ['a']]]);
  // b fails at ~1.5 s; the yes comes 20 min later, well past the 10 min run deadline.
  const r = simulate(p, { steps: { b: [{ ms: 500, fail: { error: 'bad', retryable: false } }] } }, {
    replanOnFailure: true,
    tickMs: 60_000,
    onAwaitingApproval: (run, now) => {
      if (now < 20 * 60_000) return null;
      const out = replan(run, plan([['a', 'write'], ['b2', 'write', ['a']]]), now);
      return out.ok ? { run: out.run, events: out.events } : null;
    },
  });
  expect(r.run.status).toBe('completed');
  expect(r.run.error).toBeUndefined();
  expect(r.run.steps.map((s) => `${s.id}:${s.status}`)).toEqual(['a:done', 'b2:done']);
  expect(r.run.awaitingSince).toBeUndefined();
});

test('a yes that never comes ends the run after APPROVAL_TIMEOUT_MS, still delivering what was done', () => {
  const p = plan([['a', 'write'], ['b', 'write', ['a']]]);
  const r = simulate(p, { steps: { b: [{ ms: 500, fail: { error: 'bad', retryable: false } }] } }, {
    replanOnFailure: true,
    tickMs: 60_000,
    onAwaitingApproval: () => null,
  });
  expect(r.run.status).toBe('cancelled');
  expect(r.run.error).toBe('approval_timeout');
  expect(r.events.find((e) => e.type === 'run.delivered')!.data).toMatchObject({ steps: 1, reason: 'approval_timeout' });
  expectLegalStatuses(r.events);
  expect(APPROVAL_TIMEOUT_MS).toBe(24 * 60 * 60_000);
});

test('replan refuses a plan that repeats an id or needs a step it does not have', () => {
  const p = plan([['a', 'write'], ['b', 'write', ['a']]]);
  const half = simulate(p, { steps: { b: [{ ms: 500, fail: { error: 'x', retryable: false } }] } }, { replanOnFailure: true });
  const dup: Plan = { title: 't', steps: [half.run.plan.steps[0]!, { ...half.run.plan.steps[0]! }] };
  expect(replan(half.run, dup, 9_000)).toMatchObject({ ok: false, error: 'the new plan repeats a step id' });
  const dangling: Plan = { title: 't', steps: [half.run.plan.steps[0]!, { id: 'c', tool: 'write', title: 'c', dependsOn: ['zzz'], params: {}, estimateCredits: 0 }] };
  expect(replan(half.run, dangling, 9_000)).toMatchObject({ ok: false, error: expect.stringContaining('"c" needs a step') });
});
