/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AgentScreenPanel } from './AgentScreenPanel';
import { AutoTaskCard } from './AutoTaskCard';
import { agentScreen } from '@/lib/agent/screen/store';
import type { AutoTaskIO } from '@/lib/agent/task/autoTask';

function setWide(wide: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({ matches: wide && q.includes('min-width'), media: q, addEventListener() {}, removeEventListener() {} }),
  });
}

beforeEach(() => act(() => agentScreen.reset()));

describe('AgentScreenPanel (GG 2026-11-07 09:36Z: the work on the right, like Manus)', () => {
  test('draws nothing until a task starts', () => {
    setWide(true);
    const { container } = render(<AgentScreenPanel locale="en" />);
    expect(container.innerHTML).toBe('');
  });

  test('on a wide screen: beside the page, with the address, the live picture and each step; the page moves left', () => {
    setWide(true);
    render(<AgentScreenPanel locale="en" />);
    act(() => agentScreen.publish({ key: 'a', goal: 'find tupac', url: 'https://www.youtube.com/', picture: 'data:image/jpeg;base64,AA==', steps: [{ label: 'Open youtube.com', state: 'ok' }, { label: 'Read the links', state: 'run' }] }));
    expect(screen.getByTestId('agent-screen')).toBeTruthy();
    expect(screen.getByTestId('agent-screen-url').textContent).toBe('https://www.youtube.com/');
    expect(screen.getByTestId('agent-screen-picture').getAttribute('src')).toBe('data:image/jpeg;base64,AA==');
    expect(screen.getByTestId('agent-screen-steps').textContent).toContain('Read the links');
    expect(screen.getByTestId('agent-screen-status').textContent).toMatch(/^Working 0:0\d$/);
    expect(document.documentElement.classList.contains('agent-screen-open')).toBe(true);
    // Close: the page gets its room back and a button brings the panel back.
    fireEvent.click(screen.getByTestId('agent-screen-close'));
    expect(screen.queryByTestId('agent-screen')).toBeNull();
    expect(document.documentElement.classList.contains('agent-screen-open')).toBe(false);
    fireEvent.click(screen.getByTestId('agent-screen-reopen'));
    expect(screen.getByTestId('agent-screen')).toBeTruthy();
  });

  test('on a phone: a LIVE pill that opens the panel full screen', () => {
    setWide(false);
    render(<AgentScreenPanel locale="en" />);
    act(() => agentScreen.publish({ key: 'a', goal: 'find', steps: [] }));
    expect(screen.queryByTestId('agent-screen')).toBeNull();
    expect(screen.getByTestId('agent-screen-pill').textContent).toMatch(/LIVE/);
    fireEvent.click(screen.getByTestId('agent-screen-pill'));
    expect(screen.getByTestId('agent-screen')).toBeTruthy();
    expect(document.documentElement.classList.contains('agent-screen-open')).toBe(false);
  });

  test('a newer task takes the screen; late updates from the older one are dropped', () => {
    agentScreen.publish({ key: 'a', goal: 'one', steps: [] });
    agentScreen.publish({ key: 'b', goal: 'two', steps: [] });
    agentScreen.publish({ key: 'a', phase: 'done', steps: [{ label: 'x', state: 'ok' }] });
    expect(agentScreen.get()).toMatchObject({ key: 'b', goal: 'two', phase: 'running' });
  });

  test('an Agent G task card fills the panel as it runs and marks it done', async () => {
    setWide(true);
    let release: () => void = () => {};
    const io: AutoTaskIO = {
      async runBrowser(_p, _s, onLive) {
        onLive?.({ steps: [{ op: 'goto', ok: true }], url: 'https://example.com/', picture: 'data:image/jpeg;base64,BB==' });
        await new Promise<void>((r) => { release = r; });
        return { ok: true, finalUrl: 'https://example.com/', steps: [{ op: 'goto', ok: true }, { op: 'screenshot', ok: true }] };
      },
      async runCode() { return { ok: false, message: 'no' }; },
      async plan() { return { ok: true, answer: 'Opened it.' }; },
      now: () => 0,
    };
    const plan = { quote: { credits: 0, worstCaseUsd: 0.04 }, request: { steps: [{ op: 'goto', url: 'https://example.com/' }, { op: 'screenshot', name: 'p' }] }, token: 'panel-1' };
    render(<><AutoTaskCard goal="open example" first={{ kind: 'browser', plan }} locale="en" io={io} autoStart /><AgentScreenPanel locale="en" /></>);
    await waitFor(() => expect(screen.getByTestId('agent-screen-picture').getAttribute('src')).toBe('data:image/jpeg;base64,BB=='));
    expect(screen.getByTestId('agent-screen-url').textContent).toBe('https://example.com/');
    await act(async () => { release(); });
    await waitFor(() => expect(screen.getByTestId('agent-screen-status').textContent).toMatch(/^Done in/));
    expect(screen.getByTestId('agent-screen-steps').textContent).toContain('Open example.com');
  });
});
