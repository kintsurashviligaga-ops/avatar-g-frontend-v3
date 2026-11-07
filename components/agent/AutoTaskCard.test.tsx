/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AutoTaskCard } from './AutoTaskCard';
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
    await waitFor(() => expect(screen.getByTestId('auto-task-end').textContent).toBe('Done'));
    expect(ran).toEqual(['t1', 't2']);
    expect(screen.getAllByTestId('auto-task-round')).toHaveLength(2);
    expect(finish).toHaveBeenCalledWith({ answer: 'Found it.', lastUrl: 'https://example.com/2' });
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });
});
