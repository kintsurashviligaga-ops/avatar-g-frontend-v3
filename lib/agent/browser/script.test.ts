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
      if (req.url?.startsWith('/go?')) {
        res.statusCode = 302;
        res.setHeader('location', new URL(req.url, 'http://x').searchParams.get('to') ?? '/');
        return res.end();
      }
      if (req.url?.startsWith('/probe?')) {
        const p = new URL(req.url, 'http://x').searchParams.get('p');
        return res.end(`<html><head><title>probe</title></head><body>
<img src="http://[::1]:${p}/a.png"><img src="http://[fd00::1]:${p}/b.png"><iframe src="http://[::ffff:127.0.0.2]:${p}/"></iframe>
<script>
const t = ['http://127.0.0.2:${p}/f', 'https://[::1]:${p}/s', 'http://[::ffff:7f00:2]:${p}/m'];
Promise.allSettled(t.map((u) => fetch(u, { mode: 'no-cors' }))).then(() => {
  try { new WebSocket('ws://[::1]:${p}/ws'); } catch (e) {}
  setTimeout(() => { const d = document.createElement('p'); d.id = 'done'; d.textContent = 'done'; document.body.appendChild(d); }, 400);
});
</script></body></html>`);
      }
      if (req.url?.startsWith('/search')) return res.end(`<html><head><title>found</title></head><body><p id="r">${new URL(req.url, 'http://x').searchParams.get('q')}</p></body></html>`);
      res.end(PAGE);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  // The offline test has no internet: 127.0.0.1 plays a public website for the network guard (./netGuard), any port.
  const NET = { public: ['127.0.0.1'], anyPort: true } as Record<string, unknown>;
  async function drive(steps: unknown[], net: Record<string, unknown> = NET) {
    const dir = await mkdtemp(join(tmpdir(), 'agb-'));
    try {
      await writeFile(join(dir, 'run.mjs'), BROWSER_SCRIPT);
      await writeFile(join(dir, 'task.json'), JSON.stringify({ steps, limits: { textMax: 2000, stepMs: 10_000, locale: 'ka-GE', userAgent: 'test' } }));
      await new Promise<void>((res, rej) => execFile(process.execPath, ['run.mjs'], {
        cwd: dir, timeout: 60_000, env: { ...process.env, PW_CORE: require.resolve('playwright-core'), PW_EXECUTABLE: exe, PW_TEST_NET: JSON.stringify(net) },
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

  describe('network guard (Phase 8.18): nothing but public addresses, IPv4 or IPv6, whatever the page or DNS says', () => {
    // A "private" service on 127.0.0.2: not on the test's public list, so the guard must never let the browser reach it.
    let inner: Server;
    let innerPort = 0;
    let innerHits = 0;
    beforeAll(async () => {
      inner = createServer((_q, r) => { innerHits++; r.end('<title>SECRET</title>internal'); });
      await new Promise<void>((r) => inner.listen(0, '127.0.0.2', () => r()));
      innerPort = (inner.address() as AddressInfo).port;
    });
    afterAll(() => new Promise<void>((r) => inner.close(() => r())));
    beforeEach(() => { innerHits = 0; });

    const port = () => Number(new URL(base).port);
    const net = () => ({
      ...NET,
      dns: {
        'good.example.com': '127.0.0.1',
        'rebind.example.com': '127.0.0.2',
        'aaaa-loopback.example.com': '::1',
        'aaaa-ula.example.com': 'fd00::1',
        'aaaa-linklocal.example.com': 'fe80::1',
        'aaaa-mapped.example.com': '::ffff:127.0.0.2',
        'metadata.example.com': '169.254.169.254',
      },
    });

    it('opens a public name: the guard, not Chromium, resolves it', async () => {
      const { result } = await drive([{ op: 'goto', url: `http://good.example.com:${port()}/` }, { op: 'text', selector: '#rate' }], net());
      expect(result.error).toBeNull();
      expect(result.steps.map((x: { ok: boolean }) => x.ok)).toEqual([true, true]);
      expect(result.steps[1].text).toBe('USD 2.71');
      expect(result.blocked).toEqual([]);
    }, 90_000);

    it.each([
      ['aaaa-loopback.example.com', '::1'],
      ['aaaa-ula.example.com', 'fd00::1'],
      ['aaaa-linklocal.example.com', 'fe80::1'],
      ['aaaa-mapped.example.com', '::ffff:127.0.0.2'],
      ['rebind.example.com', '127.0.0.2'],
      ['metadata.example.com', '169.254.169.254'],
    ])('refuses a public-looking name whose DNS answer is private: %s -> %s', async (host, ip) => {
      const { result } = await drive([{ op: 'goto', url: `http://${host}:${innerPort}/` }], net());
      expect(result.steps[0]).toMatchObject({ op: 'goto', ok: false });
      expect(result.blocked.join(' ')).toContain(`-> ${ip}`);
      expect(innerHits).toBe(0);
    }, 90_000);

    it.each(['[::1]', '[::ffff:127.0.0.2]', '[::ffff:7f00:2]', '[fd00::1]', '[fe80::1]', '127.0.0.2'])(
      'refuses an address literal the page itself could use: %s', async (h) => {
        const { result } = await drive([{ op: 'goto', url: `http://${h}:${innerPort}/` }], net());
        expect(result.steps[0]).toMatchObject({ op: 'goto', ok: false });
        expect(result.blocked.length).toBeGreaterThan(0);
        expect(innerHits).toBe(0);
      }, 90_000);

    it('blocks a redirect from a public page to a private IPv6 or mapped address', async () => {
      const r = await drive([{ op: 'goto', url: `${base}/go?to=${encodeURIComponent(`http://[::ffff:127.0.0.2]:${innerPort}/`)}` }], net());
      expect(r.result.steps[0].ok).toBe(false);
      expect(r.result.blocked.join(' ')).toContain('::ffff:7f00:2'); // Chromium writes ::ffff:127.0.0.2 this way
      expect(innerHits).toBe(0);
    }, 90_000);

    it("blocks a public page's own requests (img, fetch, iframe, https CONNECT, WebSocket) to private addresses", async () => {
      const { result } = await drive([{ op: 'goto', url: `${base}/probe?p=${innerPort}` }, { op: 'wait', ms: 1500 }, { op: 'text', selector: '#done' }], net());
      expect(result.steps[0].ok).toBe(true);
      expect(innerHits).toBe(0);
      const b = result.blocked.join(' ');
      for (const x of ['[::1]', '[fd00::1]', '[::ffff:7f00:2]', '127.0.0.2:']) expect(b).toContain(x);
      expect(b.split('[::1]').length - 1).toBeGreaterThanOrEqual(3); // img, https CONNECT and the WebSocket
    }, 90_000);

    it('only ports 80 and 443 outside the offline test', async () => {
      const { result } = await drive([{ op: 'goto', url: `${base}/` }], { public: ['127.0.0.1'] });
      expect(result.steps[0].ok).toBe(false);
      expect(result.blocked.join(' ')).toMatch(/port \d+/);
    }, 90_000);
  });
});
