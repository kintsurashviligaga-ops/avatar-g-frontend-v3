import { AUTO_TASK_LIMITS, envelopeUsd, nextGoal, observationOf, runAutoTask, type AutoTaskEvent, type AutoTaskIO, type PlanOut } from './autoTask';

const plan = (n: number) => ({ quote: { worstCaseUsd: 0.04, steps: n }, request: { n }, token: `t${n}` });
const page = (url: string, text = 'Vake flats 120k') => ({ ok: true as const, finalUrl: url, steps: [{ op: 'goto', ok: true, url, title: 'Results' }, { op: 'text', ok: true, text }], workspace: { id: 'ws', written: [{ path: 'browser/a/shot.png', v: 1, bytes: 9 }] } });

function io(plans: PlanOut[], opts: { clock?: number[] } = {}) {
  const ran: unknown[] = [];
  const goals: string[] = [];
  let t = 0;
  const x: AutoTaskIO = {
    async runBrowser(p) { ran.push(p.token); return page(`https://example.com/${ran.length}`); },
    async runCode(p) { ran.push(p.token); return { ok: true, stdout: '42\n', exitCode: 0 }; },
    async plan(g) { goals.push(g); return plans.shift() ?? { ok: true, answer: null }; },
    now: () => (opts.clock ? opts.clock[Math.min(t++, opts.clock.length - 1)]! : 0),
  };
  return { x, ran, goals };
}

async function go(h: ReturnType<typeof io>, signal = new AbortController().signal) {
  const events: AutoTaskEvent[] = [];
  await runAutoTask(h.x, { goal: 'find Vake flats', first: { kind: 'browser', plan: plan(1) } }, signal, (e) => events.push(e));
  return events;
}

describe('runAutoTask (GG 2026-11-07: start once, Agent G goes to the end)', () => {
  test('plan → run → look → next plan runs with no press, from the last page; the answer ends it', async () => {
    const h = io([{ ok: true, answer: null, browser: plan(2) }, { ok: true, answer: 'Found 3 flats: …' }]);
    const ev = await go(h);
    expect(h.ran).toEqual(['t1', 't2']);
    expect(h.goals[0]).toContain('goto https://example.com/1');
    expect(h.goals[0]).toContain('page text: Vake flats 120k');
    expect(h.goals[1]).toContain('Round 2 (browser): ended on https://example.com/2');
    expect(ev.at(-1)).toEqual({ type: 'done', answer: 'Found 3 flats: …', lastUrl: 'https://example.com/2' });
  });

  test('a program run is observed too', async () => {
    const h = io([{ ok: true, answer: null, code: plan(9) }, { ok: true, answer: 'Average 120k' }]);
    const ev = await go(h);
    expect(h.ran).toEqual(['t1', 't9']);
    expect(h.goals[1]).toContain('stdout:\n42');
    expect(ev.some((e) => e.type === 'code_done')).toBe(true);
  });

  test('never more than the rounds the card named; the last ask has no rounds left', async () => {
    const h = io(Array.from({ length: 10 }, (_, i) => ({ ok: true, answer: i >= AUTO_TASK_LIMITS.rounds - 1 ? 'final' : null, browser: plan(i + 2) })));
    const ev = await go(h);
    expect(h.ran).toHaveLength(AUTO_TASK_LIMITS.rounds);
    expect(h.goals.at(-1)).toContain('No more rounds');
    expect(ev.at(-1)).toMatchObject({ type: 'done', answer: 'final' });
  });

  test('Stop ends it before the next run', async () => {
    const ac = new AbortController();
    const h = io([{ ok: true, answer: null, browser: plan(2) }]);
    h.x.plan = async () => { ac.abort(); return { ok: true, answer: null, browser: plan(2) }; };
    const ev = await go(h, ac.signal);
    expect(h.ran).toEqual(['t1']);
    expect(ev.at(-1)).toMatchObject({ type: 'stopped', reason: 'user' });
  });

  test('past the time limit it asks for the answer and stops', async () => {
    const h = io([{ ok: true, answer: 'what I have' }], { clock: [0, AUTO_TASK_LIMITS.wallMs + 1] });
    const ev = await go(h);
    expect(h.goals[0]).toContain('No more rounds');
    expect(ev.at(-1)).toMatchObject({ type: 'done', answer: 'what I have' });
  });

  test('neither a plan nor an answer is a failure, said once', async () => {
    const h = io([{ ok: false, answer: null, message: 'llm_error' }]);
    const ev = await go(h);
    expect(ev.at(-1)).toMatchObject({ type: 'stopped', reason: 'failed', message: 'llm_error' });
  });

  test('envelope and observation helpers', () => {
    expect(envelopeUsd(plan(1))).toBe(0.2);
    expect(observationOf(1, 'browser', { ok: false, message: 'refused' })).toBe('Round 1 (browser) failed: refused');
    expect(nextGoal('g', ['x'.repeat(9000)], undefined, 1)).toContain('…');
  });
});
