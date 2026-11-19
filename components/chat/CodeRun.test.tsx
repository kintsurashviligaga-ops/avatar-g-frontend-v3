/** @jest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { __resetCodeRunForTests, codeRunErrorText, errorOf, sandboxLanguageOf, useCodeRun, useCodeRunEnabled, type SandboxLang } from './CodeRun';

function Block({ lang, code = 'print(2+2)' }: { lang: SandboxLang | null; code?: string }) {
  const open = useCodeRunEnabled(lang !== null);
  const run = useCodeRun(open ? lang : null, () => code, 'en');
  return <div>{run.button}{run.card}</div>;
}

const json = (status: number, body: unknown) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);

describe('CodeRun', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; __resetCodeRunForTests(); });

  it('maps fence labels to the three sandbox languages only', () => {
    expect(sandboxLanguageOf('Python')).toBe('python');
    expect(sandboxLanguageOf('js')).toBe('node');
    expect(sandboxLanguageOf('bash')).toBe('shell');
    expect(sandboxLanguageOf('ruby')).toBeNull();
    expect(sandboxLanguageOf('')).toBeNull();
  });

  it('shows nothing when the server says the user may not run code', async () => {
    const f = jest.fn(() => json(200, { enabled: false }));
    global.fetch = f as unknown as typeof fetch;
    render(<Block lang="python" />);
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
  });

  it('Run quotes, Start runs the signed plan once, and the output is shown as text', async () => {
    __resetCodeRunForTests(true);
    const calls: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn((_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      calls.push(body);
      if (body.action === 'quote') {
        return json(200, { ok: true, quote: { language: 'python', wallSec: 60, credits: 0 }, request: { language: 'python', code: 'print(2+2)' }, token: 'tok' });
      }
      return json(200, { ok: true, exitCode: 0, stdout: '<b>4</b>\n', stderr: '', wallMs: 1200, filed: true });
    }) as unknown as typeof fetch;
    render(<Block lang="python" />);
    // The workspace is on by default; this run is a plain one.
    fireEvent.click(screen.getByRole('button', { name: 'In workspace' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Run' })); });
    expect(await screen.findByText(/Python · at most 60 s · no internet · free/)).toBeTruthy();
    expect(calls).toEqual([{ action: 'quote', request: { language: 'python', code: 'print(2+2)' } }]);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Start/ })); });
    expect(calls[1]).toEqual({ action: 'run', request: { language: 'python', code: 'print(2+2)' }, token: 'tok', locale: 'en' });
    const out = await screen.findByText('<b>4</b>', { exact: false });
    expect(out.tagName).toBe('PRE');
    expect(screen.getByText(/exit code 0 · 1.2 s/)).toBeTruthy();
    expect(screen.getByText('Saved in the Library (Docs).')).toBeTruthy();
  });

  it('a workspace run asks for the workspace and lists the files it saved, each with a download', async () => {
    __resetCodeRunForTests(true);
    const calls: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn((_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      calls.push(body);
      if (body.action === 'quote') {
        return json(200, { ok: true, quote: { language: 'shell', wallSec: 60, credits: 0, workspaceId: 'ws_abcdef12' }, request: { language: 'shell', code: 'ls', workspaceId: 'ws_abcdef12' }, token: 'tok' });
      }
      return json(200, {
        ok: true, exitCode: 0, stdout: 'ok\n', stderr: '', wallMs: 900,
        workspace: { id: 'ws_abcdef12', written: [{ path: 'out/chart.png', bytes: 2048, v: 2 }], skipped: ['big.bin (over 10 MB)'] },
      });
    }) as unknown as typeof fetch;
    render(<Block lang="shell" code="ls" />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Run' })); });
    expect(calls[0]).toEqual({ action: 'quote', request: { language: 'shell', code: 'ls', workspace: true } });
    expect(await screen.findByText(/Shell · at most 60 s .* files: workspace/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Start/ })); });
    expect(await screen.findByText('out/chart.png', { exact: false })).toBeTruthy();
    expect(screen.getByText(/v2 · 2 KB/)).toBeTruthy();
    expect(screen.getByText(/Not saved: big.bin/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download out/chart.png' })).toBeTruthy();
  });

  it('a refusal is said in words', async () => {
    __resetCodeRunForTests(true);
    global.fetch = jest.fn(() => json(409, { ok: false, error: 'quote_used' })) as unknown as typeof fetch;
    render(<Block lang="node" />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Run' })); });
    expect(await screen.findByText(codeRunErrorText('quote_used', 'en'))).toBeTruthy();
    expect(codeRunErrorText('nonsense', 'ka')).toBe('გაშვება ვერ მოხერხდა.');
  });
});

test('a per-minute 429 is "too fast", only a wait past an hour is the daily cap', () => {
  expect(errorOf(429, { retryAfter: 42 })).toBe('too_fast');
  expect(errorOf(429, {})).toBe('too_fast');
  expect(errorOf(429, { retryAfter: 80_000 })).toBe('rate_limited');
  expect(errorOf(409, { error: 'quote_used' })).toBe('quote_used');
  expect(codeRunErrorText('too_fast', 'ka')).toBe('ძალიან სწრაფად, ცადე ერთ წუთში.');
});
