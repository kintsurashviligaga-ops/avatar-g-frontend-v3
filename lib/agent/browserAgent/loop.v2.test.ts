/** @jest-environment node */
/**
 * Phase 8.11: the loop with the new actions (scroll, select, check, click_at, fill_form, …). Each one goes through the
 * same checks, and each sensitive one waits for the user: a secret field in a form, a click on a point that buys or
 * sends, a box that agrees to pay, typing into whatever has the focus on a page with a password field.
 */
import type { AgentAction } from './actions';
import { runBrowserAgent, sensitiveReason, type Decision, type Observation } from './loop';

const btn = (label: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({ selector: `[data-agent-id="${x}"]`, label, type: '', tag: 'button', secret: false, x, y, w: 100, h: 40, ...extra });
const page = (url: string, extra: Partial<Observation> = {}): Observation => ({ url, title: 'Page', text: 'hello', links: [], secretFields: [], elements: [], ...extra });

describe('sensitiveReason for the new actions', () => {
  const shop = page('https://shop.example.ge/item/1', { elements: [btn('ყიდვა', 100, 100), btn('დეტალები', 300, 100), btn('', 500, 100, { type: 'submit' })] });

  it('lets reading, scrolling, moving and harmless clicks run', () => {
    const ok: AgentAction[] = [
      { op: 'scroll', direction: 'down', pixels: 600 },
      { op: 'move_to', x: 120, y: 120 },
      { op: 'elements' },
      { op: 'click_at', x: 320, y: 110 },
      { op: 'click_at', x: 900, y: 700 },
      { op: 'select', selector: '#size', value: 'M' },
      { op: 'check', selector: '#gift-wrap', on: true },
      { op: 'fill_form', fields: [{ selector: '#name', value: 'ნინო' }, { selector: '#city', value: 'ბათუმი' }] },
    ];
    for (const a of ok) expect([a.op, sensitiveReason(a, shop)]).toEqual([a.op, null]);
  });

  it('holds a click on a point that buys, or on a submit button with no label', () => {
    expect(sensitiveReason({ op: 'click_at', x: 150, y: 120 }, shop)).toMatch(/buys, sends or deletes/);
    expect(sensitiveReason({ op: 'click_at', x: 520, y: 120 }, shop)).toMatch(/submit button/);
  });

  it('holds a click on a point when the page did not describe its controls', () => {
    const { elements: _e, ...bare } = shop;
    expect(sensitiveReason({ op: 'click_at', x: 900, y: 700 }, bare as Observation)).toMatch(/did not describe/);
  });

  it('holds a form or a list that writes into a secret field', () => {
    const login = page('https://forum.example.ge/register', { secretFields: ['[data-agent-id="7"]'] });
    expect(sensitiveReason({ op: 'fill_form', fields: [{ selector: '#nick', value: 'gg' }, { selector: '[data-agent-id="7"]', value: 'x' }] }, login)).toMatch(/password or payment/);
    expect(sensitiveReason({ op: 'fill_form', fields: [{ selector: '#card-number', value: '4111' }] }, page('https://x.ge/'))).toMatch(/password or payment/);
    expect(sensitiveReason({ op: 'type_focused', text: 'abc', enter: false, clear: false }, login)).toMatch(/password or payment field/);
    expect(sensitiveReason({ op: 'click_at', x: 1, y: 1 }, login)).toMatch(/password or payment field/);
  });

  it('holds every touching action on a sign-in or payment page, and when secrets are unknown', () => {
    const pay = page('https://pay.example.ge/checkout');
    expect(sensitiveReason({ op: 'check', selector: '#terms', on: true }, pay)).toMatch(/sign-in or payment/);
    expect(sensitiveReason({ op: 'select', selector: '#qty', value: '2' }, pay)).toMatch(/sign-in or payment/);
    const unknown = { ...page('https://x.ge/'), secretFields: undefined as unknown as string[] };
    expect(sensitiveReason({ op: 'check', selector: '#a', on: true }, unknown)).toMatch(/did not say/);
    expect(sensitiveReason({ op: 'scroll', direction: 'down', pixels: 100 }, unknown)).toBeNull();
  });

  it('holds a box whose name agrees to pay or send', () => {
    expect(sensitiveReason({ op: 'check', selector: 'text=Subscribe to the newsletter', on: true }, page('https://x.ge/'))).toMatch(/buy, send or delete/);
  });
});

test('a whole run with the new actions: fill a form, pick from a list, tick a box, scroll, answer', async () => {
  const decisions: Decision[] = [
    { kind: 'act', step: { op: 'goto', url: 'https://library.example.ge/search' }, why: 'the search page' },
    { kind: 'act', step: { op: 'fill_form', fields: [{ selector: '#title', value: 'ვეფხისტყაოსანი' }, { selector: '#author', value: 'რუსთაველი' }] }, why: 'fill the search' },
    { kind: 'act', step: { op: 'select', selector: '#lang', value: 'ka' }, why: 'Georgian editions' },
    { kind: 'act', step: { op: 'check', selector: '#available', on: true }, why: 'only available' },
    { kind: 'act', step: { op: 'press', key: 'Enter' }, why: 'search' },
    { kind: 'act', step: { op: 'scroll', direction: 'down', pixels: 800 }, why: 'see more results' },
    { kind: 'done', answer: '3 გამოცემაა ხელმისაწვდომი.' },
  ];
  const acted: AgentAction[] = [];
  let di = 0;
  let t = 0;
  const r = await runBrowserAgent({
    now: () => (t += 10),
    decider: { name: 'planner', async decide() { return decisions[di++]!; } },
    session: { async observe() { return page('https://library.example.ge/search'); }, async act(a) { acted.push(a as AgentAction); return { op: a.op, ok: true }; } },
  }, { goal: 'find a Georgian edition', signal: new AbortController().signal });
  expect(r).toMatchObject({ stop: 'done', actions: 6, answer: '3 გამოცემაა ხელმისაწვდომი.' });
  expect(acted.map((a) => a.op)).toEqual(['goto', 'fill_form', 'select', 'check', 'press', 'scroll']);
});

test('a malformed new action is refused before it reaches the browser', async () => {
  const acted: unknown[] = [];
  const r = await runBrowserAgent({
    now: () => 0,
    decider: { name: 'computer-use', async decide() { return { kind: 'act', step: { op: 'click_at', x: 5000, y: 1 } as unknown as AgentAction, why: 'off screen' }; } },
    session: { async observe() { return page('https://x.ge/'); }, async act(a) { acted.push(a); return { op: a.op, ok: true }; } },
  }, { goal: 'x', signal: new AbortController().signal });
  expect(r.stop).toBe('refused');
  expect(r.detail).toMatch(/click_at: x/);
  expect(acted).toEqual([]);
});
