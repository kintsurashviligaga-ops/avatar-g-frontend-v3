/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { agentScreen } from '@/lib/agent/screen/store';
import { onSiteTaskResult, SiteAgentHost, startSiteTask, type SiteTaskResult } from './SiteAgentHost';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () { return { x: 10, y: 10, left: 10, top: 10, width: 80, height: 20, right: 90, bottom: 30, toJSON() {} } as DOMRect; };
  Element.prototype.scrollIntoView = function () {};
  (global as unknown as { CSS: { escape: (s: string) => string } }).CSS = { escape: (s: string) => s };
});
beforeEach(() => { agentScreen.reset(); push.mockReset(); document.body.innerHTML = '<main><a href="/ka/library">ბიბლიოთეკა</a><button>შექმნა ✦28</button></main>'; });

function answers(list: unknown[]) {
  const sent: Array<Record<string, unknown>> = [];
  global.fetch = jest.fn(async (_u: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return { ok: true, json: async () => ({ ok: true, action: list.shift() ?? null }) } as Response;
  }) as unknown as typeof fetch;
  return sent;
}

describe('SiteAgentHost (GG 2026-11-07 09:36Z: Agent G works on myavatar.ge itself)', () => {
  test('goes through the site with the cursor, shows each step on its computer and hands the answer to the chat', async () => {
    const sent = answers([{ op: 'go', path: '/ka/library' }, { op: 'done', answer: '1) გავხსენი ბიბლიოთეკა' }]);
    const results: SiteTaskResult[] = [];
    const off = onSiteTaskResult((r) => results.push(r));
    render(<SiteAgentHost locale="ka" />);
    act(() => startSiteTask('გადადი ბიბლიოთეკაში'));
    expect(await screen.findByTestId('site-agent-stop')).toBeTruthy();
    await waitFor(() => expect(results).toHaveLength(1), { timeout: 5000 });
    off();
    expect(push).toHaveBeenCalledWith('/ka/library');
    expect(results[0]).toEqual({ goal: 'გადადი ბიბლიოთეკაში', reason: 'done', answer: '1) გავხსენი ბიბლიოთეკა' });
    expect((sent[0]!.snapshot as { els: Array<{ label: string }> }).els.map((e) => e.label)).toEqual(['ბიბლიოთეკა', 'შექმნა ✦28']);
    expect(agentScreen.get()).toMatchObject({ source: 'site', phase: 'done', note: '1) გავხსენი ბიბლიოთეკა' });
    expect(agentScreen.get()!.steps.map((s) => s.state)).toEqual(['ok']);
    await waitFor(() => expect(screen.queryByTestId('site-agent-stop')).toBeNull());
    expect(document.getElementById('agent-g-cursor')).toBeNull();
  }, 15_000);

  test('a paid click asks first; "No" stops the task and nothing is clicked', async () => {
    answers([{ op: 'click', ref: 2 }]);
    const clicked = jest.fn();
    document.querySelector('button')!.addEventListener('click', clicked);
    const results: SiteTaskResult[] = [];
    const off = onSiteTaskResult((r) => results.push(r));
    render(<SiteAgentHost locale="en" />);
    act(() => startSiteTask('make a video'));
    expect((await screen.findByTestId('site-agent-confirm')).textContent).toContain('Clicked „შექმნა ✦28“');
    fireEvent.click(screen.getByTestId('site-agent-deny'));
    await waitFor(() => expect(results).toHaveLength(1));
    off();
    expect(results[0]!.reason).toBe('user');
    expect(clicked).not.toHaveBeenCalled();
  }, 15_000);
});
