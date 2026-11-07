/** @jest-environment node */
/**
 * The driver (./script) run for real on this machine: the same text the sandbox gets, a real headless Chromium, a page
 * served from this process. Skipped where no Chromium for playwright-core is installed.
 */
import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { BROWSER_SCRIPT } from './script';

// playwright-core's own Chromium, or any Chromium this machine has under PLAYWRIGHT_BROWSERS_PATH (a newer build is fine).
function findChromium(): string {
  try {
    const own = chromium.executablePath();
    if (existsSync(own)) return own;
  } catch { /* look below */ }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return '';
  for (const d of readdirSync(root).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
    const p = join(root, d, 'chrome-linux64', 'chrome');
    if (existsSync(p)) return p;
  }
  return '';
}
const exe = findChromium();
const maybe = exe && existsSync(exe) ? describe : describe.skip;

const PAGE = `<!doctype html><html><head><title>ტესტი</title></head><body>
<main><h1>კურსი</h1><p id="rate">USD 2.71</p>
<ul id="res"><li><a href="/watch?v=1">2Pac - All Eyez On Me</a></li><li><a href="/watch?v=1">2Pac - All Eyez On Me</a></li><li><a href="/watch?v=2" aria-label="Remix"></a></li><li><a href="javascript:void 0">x</a></li></ul>
<form action="/search"><input id="q" name="q"><input id="pw" type="password"><button id="go">go</button></form></main></body></html>`;

maybe('browser driver on a real Chromium', () => {
  let server: Server;
  let base = '';
  beforeAll(async () => {
    server = createServer((req, res) => {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      if (req.url?.startsWith('/search')) return res.end(`<html><head><title>found</title></head><body><p id="r">${new URL(req.url, 'http://x').searchParams.get('q')}</p></body></html>`);
      res.end(PAGE);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  async function drive(steps: unknown[]) {
    const dir = await mkdtemp(join(tmpdir(), 'agb-'));
    try {
      await writeFile(join(dir, 'run.mjs'), BROWSER_SCRIPT);
      await writeFile(join(dir, 'task.json'), JSON.stringify({ steps, limits: { textMax: 2000, stepMs: 10_000, locale: 'ka-GE', userAgent: 'test' } }));
      await new Promise<void>((res, rej) => execFile(process.execPath, ['run.mjs'], {
        cwd: dir, timeout: 60_000, env: { ...process.env, PW_CORE: require.resolve('playwright-core'), PW_EXECUTABLE: exe },
      }, (err) => (err ? rej(err) : res())));
      const result = JSON.parse(await readFile(join(dir, 'result.json'), 'utf8'));
      const shot = existsSync(join(dir, 'shots', 'page.png')) ? await readFile(join(dir, 'shots', 'page.png')) : null;
      return { result, shot };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it('opens a page, reads Georgian text, types, presses Enter, follows the form and takes a screenshot', async () => {
    const { result, shot } = await drive([
      { op: 'goto', url: `${base}/` },
      { op: 'text', selector: '#rate' },
      { op: 'type', selector: '#q', text: 'ლარი' },
      { op: 'press', key: 'Enter' },
      { op: 'wait', ms: 300 },
      { op: 'text', selector: '#r' },
      { op: 'screenshot', name: 'page' },
    ]);
    expect(result.error).toBeNull();
    expect(result.steps.map((s: { ok: boolean }) => s.ok)).toEqual([true, true, true, true, true, true, true]);
    expect(result.steps[0].title).toBe('ტესტი');
    expect(result.steps[1].text).toBe('USD 2.71');
    expect(result.steps[5].text).toBe('ლარი');
    expect(result.finalUrl).toContain('/search?q=');
    expect(shot?.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  }, 90_000);

  it('reads the links as „text — address“ lines: absolute, each once, named by text or label (GG 08:35Z)', async () => {
    const { result } = await drive([{ op: 'goto', url: `${base}/` }, { op: 'links', selector: '#res' }]);
    expect(result.steps[1]).toMatchObject({ op: 'links', ok: true });
    expect(result.steps[1].text).toBe(`2Pac - All Eyez On Me — ${base}/watch?v=1\nRemix — ${base}/watch?v=2`);
  }, 90_000);

  it('refuses to type into a password field and stops there', async () => {
    const { result } = await drive([
      { op: 'goto', url: `${base}/` },
      { op: 'type', selector: '#pw', text: 'secret' },
      { op: 'text' },
    ]);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[1]).toMatchObject({ op: 'type', ok: false });
    expect(result.steps[1].error).toMatch(/password/);
  }, 90_000);

  it('a missing element fails that step with a reason, and the result is still written', async () => {
    const { result } = await drive([{ op: 'goto', url: `${base}/` }, { op: 'click', selector: '#nope' }]);
    expect(result.steps[1]).toMatchObject({ op: 'click', ok: false });
  }, 90_000);
});
