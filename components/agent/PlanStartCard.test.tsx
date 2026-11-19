/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PlanStartCard } from './PlanStartCard';

const json = (status: number, body: unknown) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
const plan = {
  quote: { hosts: ['example.com'], steps: 3, screenshots: 1, wallSec: 150 },
  request: { steps: [{ op: 'goto', url: 'https://example.com' }], workspaceId: 'ws_abcdefgh12' },
  token: 'tok',
};

describe('PlanStartCard', () => {
  afterEach(() => { (global as { fetch?: unknown }).fetch = undefined; });

  it('runs nothing until Start, then posts the signed plan once and lists the saved files', async () => {
    const fetchMock = jest.fn((_u: string, _i?: RequestInit) => json(200, {
      ok: true,
      steps: [{ op: 'goto', ok: true, url: 'https://example.com/', title: 'Example' }, { op: 'text', ok: true, text: 'Hello' }],
      workspace: { id: 'ws_abcdefgh12', folder: 'browser/abc', written: [{ path: 'browser/abc/text-1.txt', v: 1, bytes: 30 }] },
    }));
    (global as { fetch?: unknown }).fetch = fetchMock;
    render(<PlanStartCard kind="browser" plan={plan} locale="en" />);
    expect(screen.getByText('example.com')).toBeTruthy();
    // GG 2026-11-07 07:47Z: the planned steps are shown before Start, in words.
    expect(screen.getByTestId('browser-planned-steps').textContent).toContain('Open example.com');
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByText(/browser\/abc\/text-1\.txt/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/agent/browser/run');
    expect(JSON.parse(String(init?.body))).toMatchObject({ action: 'run', request: plan.request, token: 'tok' });
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });

  it('while it runs it says so with a clock; done, it shows the screenshots and tells the chat where it ended', async () => {
    let finish: (v: Response) => void = () => {};
    const fetchMock = jest.fn((u: string) => (u === '/api/agent/browser/run'
      ? new Promise<Response>((r) => { finish = r; })
      : json(200, { ok: true, url: 'https://x.supabase.co/shot.png' })));
    (global as { fetch?: unknown }).fetch = fetchMock;
    const done = jest.fn();
    render(<PlanStartCard kind="browser" plan={plan} locale="en" onDone={done} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByTestId('plan-running').textContent).toMatch(/Running… 0:0\d/);
    finish(await json(200, {
      ok: true, finalUrl: 'https://example.com/next',
      steps: [{ op: 'goto', ok: true, url: 'https://example.com/', title: 'Example' }, { op: 'screenshot', ok: true }],
      workspace: { id: 'ws_abcdefgh12', folder: 'browser/abc', written: [{ path: 'browser/abc/home.png', v: 1, bytes: 3000 }] },
    }));
    await waitFor(() => expect(screen.getByTestId('browser-shot')).toBeTruthy());
    expect(done).toHaveBeenCalledWith({ finalUrl: 'https://example.com/next', title: 'Example' });
    expect(JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body))).toEqual({ action: 'link', workspaceId: 'ws_abcdefgh12', path: 'browser/abc/home.png' });
  });

  it('shows the server\'s reason when the run is refused', async () => {
    (global as { fetch?: unknown }).fetch = jest.fn(() => json(503, { ok: false, error: 'browser_disabled', message: 'The browser is switched off on this server.' }));
    render(<PlanStartCard kind="browser" plan={plan} locale="en" />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByText(/switched off/)).toBeTruthy());
  });

  it('a program plan posts to the sandbox route and shows what it printed', async () => {
    const fetchMock = jest.fn((_u: string, _i?: RequestInit) => json(200, { ok: true, exitCode: 0, stdout: '4\n', stderr: '', wallMs: 900 }));
    (global as { fetch?: unknown }).fetch = fetchMock;
    render(<PlanStartCard kind="code" plan={{ quote: { language: 'python', wallSec: 60 }, request: { language: 'python', code: 'print(2+2)' }, token: 't' }} locale="ka" />);
    expect(screen.getByText('print(2+2)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'დაწყება' }));
    await waitFor(() => expect(screen.getByText(/დასრულდა კოდით 0/)).toBeTruthy());
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/agent/sandbox/run');
  });
});
