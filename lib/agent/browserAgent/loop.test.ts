/** @jest-environment node */
/**
 * The Browser Agent loop (Phase 4 prep, not wired) over a scripted decider and a fake browser: it reaches a goal, holds
 * every sensitive action for the user, refuses what the browser policy refuses, stops when it repeats itself or runs
 * out of budget, and treats the page as data (cut short before the model sees it).
 */
import type { BrowserStep } from '../browser/policy';
import { AGENT_MAX_ACTIONS, boundObservation, runBrowserAgent, sensitiveReason, type Decider, type Decision, type Observation } from './loop';

const page = (url: string, extra: Partial<Observation> = {}): Observation => ({ url, title: 'Page', text: 'hello', links: [], secretFields: [], ...extra });

function world(decisions: Decision[], pages: Observation[] = [page('https://example.com/')]) {
  const clock = { now: 1_000 };
  const acted: BrowserStep[] = [];
  let pi = 0;
  let di = 0;
  const seen: Observation[] = [];
  const decider: Decider = {
    name: 'planner',
    async decide({ observation }) {
      seen.push(observation);
      clock.now += 1_000;
      return decisions[Math.min(di++, decisions.length - 1)]!;
    },
  };
  const session = {
    async observe() { return pages[Math.min(pi, pages.length - 1)]!; },
    async act(step: BrowserStep) { acted.push(step); pi += 1; return { op: step.op, ok: true }; },
  };
  return { deps: { now: () => clock.now, decider, session }, acted, seen, clock };
}

const go = (signal = new AbortController().signal) => ({ goal: 'find the opening hours', signal });

test('reaches the goal: acts, observes again, answers', async () => {
  const w = world([
    { kind: 'act', step: { op: 'goto', url: 'https://example.com/hours' }, why: 'the hours page' },
    { kind: 'act', step: { op: 'text' }, why: 'read it' },
    { kind: 'done', answer: '09:00–18:00' },
  ]);
  const r = await runBrowserAgent(w.deps, go());
  expect(r).toMatchObject({ stop: 'done', answer: '09:00–18:00', actions: 2 });
  expect(w.acted).toEqual([{ op: 'goto', url: 'https://example.com/hours' }, { op: 'text' }]);
  expect(r.trail).toHaveLength(3);
});

test('the browser policy applies to every action: a private host or a long wait is refused, nothing runs', async () => {
  for (const step of [{ op: 'goto', url: 'http://169.254.169.254/latest' }, { op: 'goto', url: 'http://localhost:3000' }, { op: 'wait', ms: 60_000 }, { op: 'eval', js: 'x' }] as unknown as BrowserStep[]) {
    const w = world([{ kind: 'act', step, why: '' }]);
    const r = await runBrowserAgent(w.deps, go());
    expect(r.stop).toBe('refused');
    expect(w.acted).toEqual([]);
  }
});

test('sensitive actions wait for the user: secret fields, sign-in and payment pages, buy/send/delete clicks', async () => {
  const cases: Array<[BrowserStep, Observation]> = [
    [{ op: 'type', selector: '#pw', text: 'x' }, page('https://example.com/', { secretFields: ['#pw'] })],
    [{ op: 'goto', url: 'https://shop.example.com/checkout' }, page('https://example.com/')],
    [{ op: 'click', selector: 'text=Continue' }, page('https://example.com/login')],
    [{ op: 'click', selector: 'text=Buy now' }, page('https://example.com/item')],
    [{ op: 'click', selector: 'text=გადახდა' }, page('https://example.ge/')],
  ];
  for (const [step, at] of cases) {
    expect(sensitiveReason(step, at)).not.toBeNull();
    const w = world([{ kind: 'act', step, why: '' }], [at]);
    const r = await runBrowserAgent(w.deps, go());
    expect(r).toMatchObject({ stop: 'needs_user', pending: step });
    expect(w.acted).toEqual([]);
  }
  expect(sensitiveReason({ op: 'click', selector: 'text=Opening hours' }, page('https://example.com/'))).toBeNull();
});

test('repeating the same action on the same page without progress stops it', async () => {
  const same = page('https://example.com/');
  const w = world([{ kind: 'act', step: { op: 'click', selector: 'text=More' }, why: 'more' }], [same]);
  // the fake moves to the next page after each act, so give it the same page every time
  w.deps.session.observe = async () => same;
  const r = await runBrowserAgent(w.deps, go());
  expect(r.stop).toBe('repeating');
  expect(w.acted).toHaveLength(2);
});

test('budgets: the action cap and the deadline end the loop', async () => {
  const pages = Array.from({ length: 40 }, (_, i) => page(`https://example.com/p${i}`));
  const w = world([{ kind: 'act', step: { op: 'text' }, why: '' }], pages);
  expect(await runBrowserAgent(w.deps, { ...go(), maxActions: 4 })).toMatchObject({ stop: 'max_actions', actions: 4 });
  const w2 = world([{ kind: 'act', step: { op: 'text' }, why: '' }], pages);
  expect((await runBrowserAgent(w2.deps, { ...go(), maxActions: 999 })).actions).toBeLessThanOrEqual(AGENT_MAX_ACTIONS);
  const w3 = world([{ kind: 'act', step: { op: 'text' }, why: '' }], pages);
  w3.deps.decider.decide = async () => { w3.clock.now += 120_000; return { kind: 'act', step: { op: 'text' }, why: '' }; };
  expect(await runBrowserAgent(w3.deps, { ...go(), wallMs: 300_000 })).toMatchObject({ stop: 'deadline' });
});

test('a stop by the user, a stuck decider and a browser that throws all end cleanly', async () => {
  const ac = new AbortController();
  const w = world([{ kind: 'act', step: { op: 'text' }, why: '' }]);
  w.deps.decider.decide = async () => { ac.abort(); return { kind: 'act', step: { op: 'text' }, why: '' }; };
  expect(await runBrowserAgent(w.deps, go(ac.signal))).toMatchObject({ stop: 'aborted', actions: 0 });
  expect(await runBrowserAgent(world([{ kind: 'stuck', why: 'no such page' }]).deps, go())).toMatchObject({ stop: 'stuck' });
  const w3 = world([{ kind: 'act', step: { op: 'text' }, why: '' }]);
  w3.deps.session.act = async () => { throw new Error('sandbox gone'); };
  expect(await runBrowserAgent(w3.deps, go())).toMatchObject({ stop: 'error', detail: 'sandbox gone' });
});

test('the decider only ever sees a bounded page', async () => {
  const huge = page('https://example.com/', { text: 'x'.repeat(50_000), links: Array.from({ length: 500 }, (_, i) => ({ text: `l${i}`, href: `https://example.com/${i}` })) });
  const w = world([{ kind: 'done', answer: 'ok' }], [huge]);
  await runBrowserAgent(w.deps, go());
  expect(w.seen[0]!.text.length).toBe(4_000);
  expect(w.seen[0]!.links).toHaveLength(40);
  expect(boundObservation(huge).title).toBe('Page');
});

test('fail closed (GG 2026-11-13): anything ambiguous waits for the user', () => {
  const plain = page('https://example.com/');
  // a field that looks secret even though the page did not report it
  expect(sensitiveReason({ op: 'type', selector: '#card-number', text: '4' }, plain)).not.toBeNull();
  expect(sensitiveReason({ op: 'type', selector: 'input[name=otp]', text: '1' }, plain)).not.toBeNull();
  // a page with a secret field: any click or Enter could submit it
  const form = page('https://example.com/', { secretFields: ['#pw'] });
  expect(sensitiveReason({ op: 'click', selector: 'text=Next' }, form)).not.toBeNull();
  expect(sensitiveReason({ op: 'press', key: 'Enter' } as BrowserStep, form)).not.toBeNull();
  // a submit button that does not say what it does
  expect(sensitiveReason({ op: 'click', selector: 'button[type=submit]' }, plain)).not.toBeNull();
  // an observation that does not list secret fields at all
  const unknown = { ...plain, secretFields: undefined } as unknown as Observation;
  expect(sensitiveReason({ op: 'click', selector: 'text=More' }, unknown)).not.toBeNull();
  // ordinary reading actions still run
  expect(sensitiveReason({ op: 'click', selector: 'text=Opening hours' }, plain)).toBeNull();
  expect(sensitiveReason({ op: 'text' }, unknown)).toBeNull();
});

test('the wall-clock budget holds even when the decider or the browser never answers', async () => {
  const w = world([{ kind: 'done', answer: 'x' }]);
  w.deps.decider.decide = () => new Promise<Decision>(() => {});
  const t0 = Date.now();
  const r = await runBrowserAgent(w.deps, { ...go(), wallMs: 60 });
  expect(r.stop).toBe('deadline');
  expect(Date.now() - t0).toBeLessThan(2_000);

  const w2 = world([{ kind: 'act', step: { op: 'goto', url: 'https://example.org/' }, why: '' }]);
  w2.deps.session.act = () => new Promise(() => {});
  expect((await runBrowserAgent(w2.deps, { ...go(), wallMs: 60 })).stop).toBe('deadline');

  // the user's stop wins over a hung page as well, and is reported as a stop, not a timeout
  const ctl = new AbortController();
  const w3 = world([{ kind: 'done', answer: 'x' }]);
  w3.deps.session.observe = () => new Promise(() => {});
  const pending = runBrowserAgent(w3.deps, go(ctl.signal));
  setTimeout(() => ctl.abort(), 20);
  expect((await pending).stop).toBe('aborted');
});
