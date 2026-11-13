/** @jest-environment node */
/** Live Agent Workspace state (Phase 7, mocked): events → runs, steps, progress, approvals. */
import { approvalList, parallelGroups, rawPct, reduce, reduceAll, EMPTY, type TimelineEvent } from './model';
import { MOCK_APPROVAL_PAY, MOCK_APPROVAL_PLAN, mockScript } from './mock';
import { answer, cancel, pause, resume, start, tick } from './player';

const T0 = 1_000_000;
const plan: TimelineEvent = { type: 'run.planned', runId: 'r', at: T0, data: { goal: 'g', maxCredits: 10, steps: [
  { id: 'a', title: 'A', tool: 'x' }, { id: 'b', title: 'B', tool: 'x', dependsOn: ['a'] }, { id: 'c', title: 'C', tool: 'x', dependsOn: ['a'] },
] } };

test('a plan, then steps: percent rises, never reaches 100 while running, 100 once delivered', () => {
  let st = reduceAll([plan, { type: 'step.started', runId: 'r', stepId: 'a', at: T0 + 1 }]);
  expect(st.runs.r!.state).toBe('running');
  expect(st.runs.r!.pct).toBe(16); // half of one step of three
  st = reduceAll([
    { type: 'step.done', runId: 'r', stepId: 'a', at: T0 + 2 },
    { type: 'step.started', runId: 'r', stepId: 'b', at: T0 + 3 },
    { type: 'step.done', runId: 'r', stepId: 'b', at: T0 + 4 },
    { type: 'step.started', runId: 'r', stepId: 'c', at: T0 + 5 },
    { type: 'step.progress', runId: 'r', stepId: 'c', at: T0 + 6, data: { pct: 100 } },
  ], st);
  expect(st.runs.r!.pct).toBe(99);
  st = reduceAll([{ type: 'step.done', runId: 'r', stepId: 'c', at: T0 + 7 }, { type: 'run.delivered', runId: 'r', at: T0 + 8 }], st);
  expect(st.runs.r).toMatchObject({ state: 'delivered', pct: 100, endedAt: T0 + 8 });
});

test('progress never goes back, and step percent only rises', () => {
  let st = reduceAll([plan, { type: 'step.started', runId: 'r', stepId: 'a', at: 1 }, { type: 'step.progress', runId: 'r', stepId: 'a', at: 2, data: { pct: 90 } }]);
  const before = st.runs.r!.pct;
  st = reduce(st, { type: 'step.progress', runId: 'r', stepId: 'a', at: 3, data: { pct: 10 } });
  expect(st.runs.r!.steps[0]!.pct).toBe(90);
  expect(st.runs.r!.pct).toBe(before);
});

test('bad, unknown and repeated events are ignored, never thrown', () => {
  const st = reduceAll([plan]);
  for (const ev of [
    { type: 'step.started', runId: 'nope', stepId: 'a', at: 1 },
    { type: 'step.started', runId: 'r', stepId: 'nope', at: 1 },
    { type: 'step.progress', runId: 'r', stepId: 'a', at: 1, data: { pct: NaN } },
    { type: 'who.knows', runId: 'r', at: 1 },
    plan,
  ] as TimelineEvent[]) expect(reduce(st, ev)).toBe(st);
});

test('spend shown never exceeds the reservation and never drops', () => {
  const st = reduceAll([plan, { type: 'run.cost', runId: 'r', at: 1, data: { creditsSpent: 7 } }, { type: 'run.cost', runId: 'r', at: 2, data: { creditsSpent: 3 } }, { type: 'run.cost', runId: 'r', at: 3, data: { creditsSpent: 99 } }]);
  expect(st.runs.r!.creditsSpent).toBe(10);
});

test('a finished run takes no more step events; pending steps show as not reached', () => {
  let st = reduceAll([plan, { type: 'run.delivered', runId: 'r', at: 5, data: { cancelled: true } }]);
  expect(st.runs.r!.state).toBe('cancelled');
  expect(st.runs.r!.steps.map((s) => s.state)).toEqual(['skipped', 'skipped', 'skipped']);
  expect(reduce(st, { type: 'step.started', runId: 'r', stepId: 'a', at: 6 })).toBe(st);
  st = reduce(st, { type: 'run.settled', runId: 'r', at: 7 });
  expect(st.runs.r!.state).toBe('cancelled'); // only a delivered run becomes settled
});

test('parallel steps are marked, and rawPct ignores skipped steps', () => {
  const st = reduceAll([plan]);
  const g = parallelGroups(st.runs.r!.steps);
  expect(g.get('b')).toBe(g.get('c'));
  expect(g.has('a')).toBe(false);
  expect(rawPct([])).toBe(0);
});

test('approvals: listed soonest-expiring first, expire on time, answered once', () => {
  const ask = (id: string, exp: number): TimelineEvent => ({ type: 'step.needs_approval', runId: 'r', stepId: id === 'p1' ? 'b' : 'c', at: 1, data: { id, kind: 'spend', title: id, scope: 's', credits: 3, reason: 'r', expiresAt: exp } });
  let st = reduceAll([plan, ask('p1', 500), ask('p2', 200)]);
  expect(st.runs.r!.state).toBe('awaiting_approval');
  expect(approvalList(st, 100).map((a) => a.id)).toEqual(['p2', 'p1']);
  expect(approvalList(st, 300).map((a) => [a.id, a.state])).toEqual([['p1', 'pending'], ['p2', 'expired']]);
  st = reduce(st, { type: 'approval.answered', runId: 'r', at: 2, data: { approvalId: 'p1', answer: 'declined' } });
  expect(st.approvals.p1!.state).toBe('declined');
  expect(st.runs.r!.steps.find((s) => s.id === 'b')!.state).toBe('skipped');
  expect(reduce(st, { type: 'approval.answered', runId: 'r', at: 3, data: { approvalId: 'p1', answer: 'approved' } })).toBe(st);
});

describe('the mock replay', () => {
  const run = (lang: 'ka' | 'en') => start(mockScript(lang, T0), T0);

  test('nothing past the plan runs before the yes; after it, both runs finish', () => {
    let p = tick(run('en'), T0 + 60_000);
    expect(p.state.runs.run_wine!.steps.find((s) => s.id === 's1')!.state).toBe('waiting');
    expect(p.state.runs.run_wine!.steps.find((s) => s.id === 's2')!.state).toBe('pending');
    expect(p.state.runs.run_train!.steps.find((s) => s.id === 'pay')!.state).toBe('waiting');
    expect(approvalList(p.state, T0 + 60_000).map((a) => a.id).sort()).toEqual([MOCK_APPROVAL_PAY, MOCK_APPROVAL_PLAN].sort());
    p = answer(p, MOCK_APPROVAL_PLAN, 'approved', T0 + 60_000);
    p = tick(p, T0 + 60_000 + 3000);
    const steps = p.state.runs.run_wine!.steps;
    expect(steps.find((s) => s.id === 's1')!.state).toBe('active');
    expect(steps.find((s) => s.id === 's2')!.state).toBe('active'); // in parallel
    p = tick(answer(p, MOCK_APPROVAL_PAY, 'approved', T0 + 63_000), T0 + 120_000);
    expect(p.state.runs.run_wine).toMatchObject({ state: 'settled', pct: 100, creditsSpent: 14 });
    expect(p.state.runs.run_train).toMatchObject({ state: 'delivered', pct: 100 });
    expect(p.queue).toHaveLength(0);
  });

  test('a decline on the sensitive step ends that run with nothing done behind it', () => {
    let p = tick(run('ka'), T0 + 60_000);
    p = tick(answer(p, MOCK_APPROVAL_PAY, 'declined', T0 + 60_000), T0 + 200_000);
    expect(p.state.runs.run_train).toMatchObject({ state: 'cancelled' });
    expect(p.state.runs.run_train!.steps.find((s) => s.id === 'pay')!.state).toBe('skipped');
  });

  test('pause holds a run, resume continues it, cancel ends it', () => {
    let p = answer(tick(run('en'), T0 + 2000), MOCK_APPROVAL_PLAN, 'approved', T0 + 2000);
    p = tick(p, T0 + 2500);
    p = pause(p, 'run_wine', T0 + 2500);
    expect(p.state.runs.run_wine!.state).toBe('paused');
    const held = tick(p, T0 + 30_000);
    expect(held.state.runs.run_wine!.steps.find((s) => s.id === 'csv')!.state).toBe('pending');
    p = resume(held, 'run_wine', T0 + 30_000);
    expect(p.state.runs.run_wine!.state).toBe('running');
    p = cancel(tick(p, T0 + 31_000), 'run_wine', T0 + 31_000);
    expect(p.state.runs.run_wine!.state).toBe('cancelled');
    expect(p.queue.some((h) => h.line.ev.runId === 'run_wine')).toBe(false);
  });
});

test('EMPTY is empty', () => expect(EMPTY).toEqual({ runs: {}, order: [], approvals: {} }));

test('an approval past its time cannot be answered', () => {
  let p = start(mockScript('en', T0), T0);
  p = tick(p, T0 + 6_000);
  expect(p.state.approvals[MOCK_APPROVAL_PAY]?.state).toBe('pending');
  const late = answer(p, MOCK_APPROVAL_PAY, 'approved', T0 + 5 * 60_000);
  expect(late).toBe(p);
  expect(answer(p, MOCK_APPROVAL_PAY, 'approved', T0 + 5 * 60_000 - 1).state.approvals[MOCK_APPROVAL_PAY]?.state).toBe('approved');
});
