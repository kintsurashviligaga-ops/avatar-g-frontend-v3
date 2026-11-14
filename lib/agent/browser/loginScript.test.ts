/** @jest-environment node */
/**
 * The login driver (./loginScript) for real: a real headless Chromium, a login form served from this process. The
 * person's actions arrive as inbox files while the driver runs; Save hands back storageState with the new cookie.
 * Skipped where no Chromium for playwright-core is installed.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { LOGIN_SCRIPT } from './loginScript';
import { BROWSER_SCRIPT } from './script';

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

maybe('login driver on a real Chromium', () => {
  let server: Server;
  let base = '';
  beforeAll(async () => {
    server = createServer((req, res) => {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      if (req.url?.startsWith('/login?')) {
        const q = new URL(req.url, 'http://x').searchParams;
        if (q.get('u') === 'gg' && q.get('pw') === 'hunter2') res.setHeader('set-cookie', 'sid=abc123; Path=/; HttpOnly; Max-Age=3600');
        return res.end('<html><head><title>home</title></head><body>ok</body></html>');
      }
      if (req.url === '/me') return res.end(`<html><head><title>me</title></head><body><p id="who">${/sid=abc123/.test(req.headers.cookie ?? '') ? 'logged-in' : 'guest'}</p></body></html>`);
      res.end('<html><head><title>Log in</title></head><body><form action="/login"><input id="u" name="u" autofocus><input id="pw" name="pw" type="password"><button>go</button></form></body></html>');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }));

  it('takes the person’s keys (a password included), and Save hands back the new cookie, which a task then uses', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agl-'));
    try {
      await writeFile(join(dir, 'login.mjs'), LOGIN_SCRIPT);
      await writeFile(join(dir, 'login.json'), JSON.stringify({ url: base, limits: { maxSec: 60, stepMs: 10_000, locale: 'ka-GE', userAgent: 'test' } }));
      const env = { ...process.env, PW_CORE: require.resolve('playwright-core'), PW_EXECUTABLE: exe };
      const child = spawn(process.execPath, ['login.mjs'], { cwd: dir, env, stdio: 'ignore' });
      const exited = new Promise<void>((r) => child.on('exit', () => r()));
      // Wait for the first picture, then send the actions one by one, as the server would.
      for (let i = 0; i < 100 && !existsSync(join(dir, 'live.jpg')); i++) await sleep(200);
      const actions = [{ op: 'type', text: 'gg' }, { op: 'key', key: 'Tab' }, { op: 'type', text: 'hunter2' }, { op: 'key', key: 'Enter' }];
      let n = 1;
      for (const a of actions) { await writeFile(join(dir, 'inbox', `${n++}.json`), JSON.stringify(a)); await sleep(700); }
      await sleep(800);
      const st = JSON.parse(await readFile(join(dir, 'status.json'), 'utf8'));
      expect(st.title).toBe('home');
      await writeFile(join(dir, 'inbox', `${n++}.json`), JSON.stringify({ op: 'save' }));
      await Promise.race([exited, sleep(20_000)]);
      const state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
      expect(state.cookies.map((c: { name: string; value: string }) => `${c.name}=${c.value}`)).toContain('sid=abc123');
      expect(JSON.parse(await readFile(join(dir, 'status.json'), 'utf8')).done).toBe(true);

      // An Agent G task given that state opens the site logged in.
      await writeFile(join(dir, 'run.mjs'), BROWSER_SCRIPT);
      await writeFile(join(dir, 'task.json'), JSON.stringify({ useState: true, steps: [{ op: 'goto', url: `${base}/me` }, { op: 'text', selector: '#who' }], limits: { textMax: 2000, stepMs: 10_000, locale: 'ka-GE', userAgent: 'test' } }));
      await new Promise<void>((r) => spawn(process.execPath, ['run.mjs'], { cwd: dir, env, stdio: 'ignore' }).on('exit', () => r()));
      const result = JSON.parse(await readFile(join(dir, 'result.json'), 'utf8'));
      expect(result.steps[1].text).toBe('logged-in');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 90_000);
});
