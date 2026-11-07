/** @jest-environment node */
import { runSiteTask, type SiteEvent, type SiteIO } from './loop';
import type { SiteAction, SiteSnapshot } from './actions';

const snap: SiteSnapshot = { url: '/ka', title: 'MyAvatar', text: '', els: [{ ref: 1, kind: 'link', label: 'ბიბლიოთეკა' }, { ref: 2, kind: 'button', label: 'შექმნა ✦28' }] };

function io(answers: unknown[], opts: { confirm?: boolean } = {}) {
  const acted: SiteAction[] = [];
  const asked: string[] = [];
  const histories: string[][] = [];
  const x: SiteIO = {
    snapshot: () => snap,
    async next(_g, h) { histories.push([...h]); return answers.shift() ?? null; },
    async act(a) { acted.push(a); return true; },
    async confirm(l) { asked.push(l); return opts.confirm ?? false; },
    async sleep() {},
    now: () => 0,
  };
  return { x, acted, asked, histories };
}

const run = async (i: SiteIO, ac = new AbortController()) => { const ev: SiteEvent[] = []; await runSiteTask(i, 'goal', 'ka', ac.signal, (e) => ev.push(e)); return ev; };

describe('runSiteTask', () => {
  test('acts step by step, tells the model what it did, and ends with its answer', async () => {
    const { x, acted, histories } = io([{ op: 'click', ref: 1, why: 'open' }, { op: 'done', answer: '1) გავხსენი ბიბლიოთეკა' }]);
    const ev = await run(x);
    expect(acted).toEqual([{ op: 'click', ref: 1, why: 'open' }]);
    expect(histories[1]![0]).toContain('დააკლიკა „ბიბლიოთეკა“');
    expect(ev.filter((e) => e.type === 'step')).toEqual([{ type: 'step', label: 'დააკლიკა „ბიბლიოთეკა“', state: 'run' }, { type: 'step', label: 'დააკლიკა „ბიბლიოთეკა“', state: 'ok' }]);
    expect(ev[ev.length - 1]).toEqual({ type: 'end', reason: 'done', answer: '1) გავხსენი ბიბლიოთეკა' });
  });

  test('a paid click waits for the user; "No" stops it and nothing is clicked', async () => {
    const { x, acted, asked } = io([{ op: 'click', ref: 2 }]);
    const ev = await run(x);
    expect(asked).toEqual(['დააკლიკოს „შექმნა ✦28“']);
    expect(acted).toEqual([]);
    expect(ev[ev.length - 1]).toEqual({ type: 'end', reason: 'user' });
  });

  test('"Allow" lets it click', async () => {
    const { x, acted } = io([{ op: 'click', ref: 2 }, { op: 'done', answer: 'ok' }], { confirm: true });
    await run(x);
    expect(acted).toEqual([{ op: 'click', ref: 2 }]);
  });

  test('an action it may not take is never done; two in a row end the task', async () => {
    const { x, acted } = io([{ op: 'go', path: 'https://evil.com' }, { op: 'click', ref: 42 }]);
    const ev = await run(x);
    expect(acted).toEqual([]);
    expect(ev[ev.length - 1]).toEqual({ type: 'end', reason: 'failed' });
  });

  test('stops at the step limit', async () => {
    const { x } = io(Array.from({ length: 40 }, () => ({ op: 'scroll', dir: 'down' })));
    const ev = await run(x);
    expect(ev[ev.length - 1]).toEqual({ type: 'end', reason: 'steps' });
  });

  test('Stop ends it before the next step', async () => {
    const ac = new AbortController();
    const { x, acted } = io([{ op: 'click', ref: 1 }, { op: 'click', ref: 1 }]);
    const orig = x.act;
    x.act = async (a, s) => { const r = await orig(a, s); ac.abort(); return r; };
    const ev = await run(x, ac);
    expect(acted).toHaveLength(1);
    expect(ev[ev.length - 1]).toEqual({ type: 'end', reason: 'user' });
  });
});
