/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AutoTaskCard, startsByItself } from './AutoTaskCard';
import type { AutoTaskIO } from '@/lib/agent/task/autoTask';

const plan = (n: number) => ({ quote: { worstCaseUsd: 0.04, hosts: ['example.com'] }, request: { steps: [{ op: 'goto', url: `https://example.com/${n}` }, { op: 'screenshot', name: 'p' }] }, token: `t${n}` });

describe('AutoTaskCard (GG 2026-11-07: start once, Agent G carries on)', () => {
  test('nothing runs before Start; after it every round shows, the next plan runs with no press, and the answer goes to the chat', async () => {
    const ran: string[] = [];
    let plans = 0;
    const io: AutoTaskIO = {
      async runBrowser(p) { ran.push(p.token); return { ok: true, finalUrl: `https://example.com/${ran.length}`, steps: [{ op: 'goto', ok: true }] }; },
      async runCode() { return { ok: false, message: 'no' }; },
      async plan() { plans++; return plans === 1 ? { ok: true, answer: null, browser: plan(2) } : { ok: true, answer: 'Found it.' }; },
      now: () => 0,
    };
    const finish = jest.fn();
    render(<AutoTaskCard goal="find" first={{ kind: 'browser', plan: plan(1) }} locale="en" io={io} onFinish={finish} />);
    expect(screen.getByText(/Up to 5 rounds · 10 min · ≤ \$0\.20/)).toBeTruthy();
    expect(screen.getByTestId('auto-task-first-steps').textContent).toContain('Open example.com');
    expect(ran).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByTestId('auto-task-clock').textContent).toMatch(/^Done in 0:0\d$/));
    expect(ran).toEqual(['t1', 't2']);
    expect(screen.getAllByTestId('auto-task-round')).toHaveLength(2);
    expect(finish).toHaveBeenCalledWith({ answer: 'Found it.', lastUrl: 'https://example.com/2' });
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });

  test('a free plan starts by itself, once, says how long it is working and ticks each step (GG 08:30Z, Manus)', async () => {
    const ran: string[] = [];
    let release: () => void = () => {};
    const io: AutoTaskIO = {
      async runBrowser(p) { ran.push(p.token); await new Promise<void>((r) => { release = r; }); return { ok: true, finalUrl: 'https://example.com/', steps: [{ op: 'goto', ok: true }, { op: 'screenshot', ok: true }] }; },
      async runCode() { return { ok: false, message: 'no' }; },
      async plan() { return { ok: true, answer: 'Opened it.' }; },
      now: () => 0,
    };
    const free = { ...plan(7), quote: { ...plan(7).quote, credits: 0 } };
    expect(startsByItself(free)).toBe(true);
    expect(startsByItself(plan(8))).toBe(false);
    const { unmount } = render(<AutoTaskCard goal="open" first={{ kind: 'browser', plan: free }} locale="ka" io={io} autoStart />);
    await waitFor(() => expect(screen.getByTestId('auto-task-clock').textContent).toMatch(/^მუშაობს 0:0\d$/));
    expect(screen.queryByRole('button', { name: 'დაწყება' })).toBeNull();
    release();
    await waitFor(() => expect(screen.getByTestId('auto-task-clock').textContent).toMatch(/^დასრულდა 0:0\d-ში$/));
    expect(screen.getByTestId('auto-task-steps').querySelectorAll('li')).toHaveLength(2);
    unmount();
    // Mounted again (a re-render, a language switch): it does not run a second time.
    render(<AutoTaskCard goal="open" first={{ kind: 'browser', plan: free }} locale="ka" io={io} autoStart />);
    expect(ran).toEqual(['t7']);
  });

  test('while a round runs it shows the LIVE page and ticks the steps done so far', async () => {
    let live: ((l: { steps: Array<{ op: string; ok: boolean }>; url: string; picture?: string }) => void) | undefined;
    let release: () => void = () => {};
    const io: AutoTaskIO = {
      async runBrowser(_p, _s, onLive) { live = onLive; await new Promise<void>((r) => { release = r; }); return { ok: true, finalUrl: 'https://example.com/', steps: [{ op: 'goto', ok: true }, { op: 'screenshot', ok: true }] }; },
      async runCode() { return { ok: false, message: 'no' }; },
      async plan() { return { ok: true, answer: 'Done.' }; },
      now: () => 0,
    };
    const free = { ...plan(9), quote: { ...plan(9).quote, credits: 0 } };
    render(<AutoTaskCard goal="open" first={{ kind: 'browser', plan: free }} locale="en" io={io} autoStart />);
    await waitFor(() => expect(live).toBeTruthy());
    act(() => live!({ steps: [{ op: 'goto', ok: true }], url: 'https://example.com/9', picture: 'data:image/jpeg;base64,/9j/' }));
    const view = await screen.findByTestId('auto-task-live');
    expect(view.textContent).toContain('LIVE');
    expect(view.textContent).toContain('https://example.com/9');
    expect(view.querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,/9j/');
    release();
    await waitFor(() => expect(screen.queryByTestId('auto-task-live')).toBeNull());
  });
});
