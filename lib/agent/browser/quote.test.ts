/** @jest-environment node */
import { memoryBlobs, workspaceStore } from '@/lib/agent/workspace/store';
import type { BrowserPlan, BrowserResult } from './policy';
import { browserFolderOf, quoteBrowserTask, runBrowserQuote, type BrowserDeps } from './quote';
import type { BrowserRunner } from './runner';

const U = '11111111-2222-3333-4444-555555555555';
const STEPS = [
  { op: 'goto', url: 'https://example.com/rates' },
  { op: 'text', selector: 'table' },
  { op: 'screenshot', name: 'rates' },
];
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

async function setup(over: Partial<BrowserDeps> = {}, result?: BrowserResult) {
  const store = workspaceStore(memoryBlobs());
  const ws = await store.ensure(U, 'Agent G');
  if (!ws.ok) throw new Error(ws.message);
  const runs: BrowserPlan[] = [];
  const claimed = new Set<string>();
  const t = 1_000_000;
  const runner: BrowserRunner = {
    async run(plan) {
      runs.push(plan);
      return result ?? {
        ok: true,
        steps: [
          { op: 'goto', ok: true, url: 'https://example.com/rates', title: 'Rates' },
          { op: 'text', ok: true, text: 'USD\t2.71\nEUR\t3.02' },
          { op: 'screenshot', ok: true, shot: 'rates' },
        ],
        shots: [{ name: 'rates', bytes: PNG }],
        finalUrl: 'https://example.com/rates',
        wallMs: 4200,
      };
    },
  };
  const d: BrowserDeps = {
    key: () => 'k', now: () => t, newId: () => 'abcdef12-3456-7890-aaaa-bbbbccccdddd',
    claim: async (_o, key) => (claimed.has(key) ? 'held' : (claimed.add(key), 'claimed')),
    enabled: () => true, runner: () => runner, workspace: () => store, ...over,
  };
  return { d, store, ws: ws.workspace.id, runs };
}
const sig = new AbortController().signal;

describe('browser quote', () => {
  it('quotes the sites it opens, free, and signs the workspace in', async () => {
    const { d, ws } = await setup();
    const q = quoteBrowserTask(d, { userId: U, request: { steps: STEPS, workspaceId: ws } });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.quote).toMatchObject({ hosts: ['example.com'], steps: 3, screenshots: 1, credits: 0, network: 'public-sites', workspaceId: ws });
    expect(q.quote.folder).toBe(browserFolderOf(q.quote.jobId));
    expect(q.quote.worstCaseUsd).toBeLessThan(0.05);
  });

  it('refuses a private address or no workspace at quote time', async () => {
    const { d, ws } = await setup();
    expect(quoteBrowserTask(d, { userId: U, request: { steps: [{ op: 'goto', url: 'http://169.254.169.254/' }], workspaceId: ws } })).toMatchObject({ ok: false, error: 'bad_input' });
    expect(quoteBrowserTask(d, { userId: U, request: { steps: STEPS } })).toMatchObject({ ok: false, error: 'bad_input' });
  });

  it('runs once on Start and saves the screenshot, the text and the step log in the workspace', async () => {
    const { d, store, ws, runs } = await setup();
    const q = quoteBrowserTask(d, { userId: U, request: { steps: STEPS, workspaceId: ws } });
    if (!q.ok) throw new Error(q.message);
    const r = await runBrowserQuote(d, { userId: U, request: q.request, token: q.token }, sig);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(runs).toHaveLength(1);
    const folder = q.quote.folder;
    expect(r.workspace.written.map((f) => f.path).sort()).toEqual([`${folder}/rates.png`, `${folder}/steps.json`, `${folder}/text-1.txt`]);
    const text = await store.read(U, ws, `${folder}/text-1.txt`);
    expect(text.ok && text.bytes.toString('utf8')).toBe('https://example.com/rates\n\nUSD\t2.71\nEUR\t3.02');
    const png = await store.read(U, ws, `${folder}/rates.png`);
    expect(png.ok && png.bytes.equals(PNG)).toBe(true);
    // A second tap, a retry or a replayed token runs nothing.
    expect(await runBrowserQuote(d, { userId: U, request: q.request, token: q.token }, sig)).toMatchObject({ ok: false, error: 'quote_used' });
    expect(runs).toHaveLength(1);
  });

  it('a changed step, a switched-off browser or an unreadable guard runs nothing', async () => {
    const { d, ws, runs } = await setup();
    const q = quoteBrowserTask(d, { userId: U, request: { steps: STEPS, workspaceId: ws } });
    if (!q.ok) throw new Error(q.message);
    const changed = { ...q.request, steps: [{ op: 'goto', url: 'https://evil.example.org/' }, ...q.request.steps.slice(1)] };
    expect(await runBrowserQuote(d, { userId: U, request: changed, token: q.token }, sig)).toMatchObject({ ok: false, error: 'quote_changed' });
    expect(await runBrowserQuote(d, { userId: 'someone-else', request: q.request, token: q.token }, sig)).toMatchObject({ ok: false });
    expect(await runBrowserQuote({ ...d, enabled: () => false }, { userId: U, request: q.request, token: q.token }, sig)).toMatchObject({ ok: false, error: 'browser_disabled' });
    expect(await runBrowserQuote({ ...d, claim: async () => 'unavailable' }, { userId: U, request: q.request, token: q.token }, sig)).toMatchObject({ ok: false, error: 'guard_unavailable' });
    expect(runs).toHaveLength(0);
  });

  it('passes a runner failure through and saves nothing', async () => {
    const { d, store, ws } = await setup({}, { ok: false, error: 'timeout', message: 'Stopped after 150 s.' });
    const q = quoteBrowserTask(d, { userId: U, request: { steps: STEPS, workspaceId: ws } });
    if (!q.ok) throw new Error(q.message);
    expect(await runBrowserQuote(d, { userId: U, request: q.request, token: q.token }, sig)).toMatchObject({ ok: false, error: 'timeout' });
    const files = await store.files(U, ws);
    expect(files.ok && files.files).toEqual([]);
  });
});
