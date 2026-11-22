/** @jest-environment node */
/**
 * The Browser Agent's live driver (./driver) on a real headless Chromium, spoken to through ./sandboxSession exactly as
 * the sandbox would be: files in a folder, `node run.mjs` running the whole time. Pages are served from this process.
 * Skipped where no Chromium for playwright-core is installed (the same rule as lib/agent/browser/script.test).
 */
import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { SandboxBrowserSession, type AgentLive, type DriverHandle } from './sandboxSession';

function findChromium(): string {
  try { const own = chromium.executablePath(); if (existsSync(own)) return own; } catch { /* look below */ }
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

const FORM = `<!doctype html><html><head><title>რეგისტრაცია</title></head><body style="margin:0">
<nav><span id="menu" onmouseover="document.getElementById('sub').style.display='block'">მენიუ</span><div id="sub" style="display:none"><a href="/about">ჩვენ შესახებ</a></div></nav>
<form action="/done" method="get" style="margin-top:20px">
<input id="name" name="name" placeholder="სახელი">
<select id="city" name="city"><option value="tbs">თბილისი</option><option value="bat">ბათუმი</option></select>
<label><input id="agree" name="agree" type="checkbox"> ვეთანხმები</label>
<input id="pw" name="pw" type="password" placeholder="პაროლი">
<button id="send" style="position:absolute;left:100px;top:300px;width:200px;height:50px">გაგზავნა</button>
</form><div style="height:3000px"></div><p id="bottom">ბოლო</p></body></html>`;

function localHandle(dir: string): DriverHandle {
  return {
    async writeFile(p, content) { await writeFile(join(dir, p), content); },
    async readBytes(p) { try { return await readFile(join(dir, p)); } catch { return null; } },
    exec(cmd, args, signal) {
      return new Promise((resolve) => {
        const child = execFile(cmd === 'node' ? process.execPath : cmd, args, {
          cwd: dir, timeout: 120_000, env: { ...process.env, PW_CORE: require.resolve('playwright-core'), PW_EXECUTABLE: exe,
            // The offline test has no internet: 127.0.0.1 plays a public website for the network guard, and one name has
            // a private IPv6 answer (Phase 8.18).
            PW_TEST_NET: JSON.stringify({ public: ['127.0.0.1'], anyPort: true, dns: { 'good.example.com': '127.0.0.1', 'aaaa.example.com': 'fd00::1' } }) },
        }, (err, stdout, stderr) => resolve({ exitCode: err ? 1 : 0, stdout, stderr }));
        signal.addEventListener('abort', () => child.kill(), { once: true });
      });
    },
    async stop() { /* the folder is removed by the test */ },
  };
}

maybe('Browser Agent driver on a real Chromium', () => {
  let server: Server;
  let base = '';
  beforeAll(async () => {
    server = createServer((req, res) => {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      if (req.url?.startsWith('/done')) {
        const q = new URL(req.url, 'http://x').searchParams;
        return res.end(`<html><head><title>done</title></head><body><p id="r">${q.get('name')}|${q.get('city')}|${q.get('agree')}</p></body></html>`);
      }
      res.end(FORM);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('keeps one page across commands: hover, fill a form, pick, tick, refuse the password, scroll, click a point', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aga-'));
    const lives: AgentLive[] = [];
    const session = new SandboxBrowserSession(localHandle(dir), { onLive: (l) => lives.push(l), pollMs: 50 });
    const signal = new AbortController().signal;
    try {
      await session.start(signal);
      expect((await session.act({ op: 'goto', url: `${base}/` }, signal)).ok).toBe(true);

      const page = await session.observe(signal);
      expect(page.title).toBe('რეგისტრაცია');
      const pw = page.elements.find((e) => e.secret);
      expect(pw?.label).toBe('პაროლი');
      expect(page.secretFields).toEqual([pw!.selector]);
      const send = page.elements.find((e) => e.label === 'გაგზავნა')!;
      expect(send).toMatchObject({ tag: 'button', x: 100, y: 300, w: 200, h: 50 });

      // Hover opens the menu (a real pointer event), and the cursor is where the menu is.
      const hover = await session.act({ op: 'hover', selector: '#menu' }, signal);
      expect(hover.ok).toBe(true);
      expect(session.lastObservation!.elements.some((e) => e.label === 'ჩვენ შესახებ')).toBe(true);

      const filled = await session.act({ op: 'fill_form', fields: [{ selector: '#name', value: 'ნინო' }, { selector: '#city', value: 'bat' }] }, signal);
      expect(filled).toMatchObject({ ok: true, filled: 2 });
      expect((await session.act({ op: 'check', selector: '#agree', on: true }, signal)).ok).toBe(true);

      // The password is refused, by selector and by focus.
      const refused = await session.act({ op: 'type', selector: '#pw', text: 'secret' }, signal);
      expect(refused).toMatchObject({ ok: false });
      expect(refused.error).toMatch(/never types into a password/);
      await session.act({ op: 'click', selector: '#pw' }, signal);
      const refusedFocus = await session.act({ op: 'type_focused', text: 'secret', enter: false, clear: false }, signal);
      expect(refusedFocus.error).toMatch(/never types into a password/);

      // Scroll down and back up, then click the button by its point, like Computer Use would.
      await session.act({ op: 'scroll', direction: 'down', pixels: 1200 }, signal);
      await session.act({ op: 'scroll', direction: 'up', pixels: 2400 }, signal);
      const click = await session.act({ op: 'click_at', x: send.x + 100, y: send.y + 25 }, signal);
      expect(click.ok).toBe(true);
      expect(click.cursor).toEqual({ x: 200, y: 325 });

      const done = await session.act({ op: 'text', selector: '#r' }, signal);
      expect(done.text).toBe('ნინო|bat|on');
      expect(session.lastObservation!.url).toContain('/done?');

      // Every command handed the person a live picture with the page's address.
      expect(lives.length).toBeGreaterThanOrEqual(10);
      expect(lives.every((l) => l.jpeg && l.jpeg.length > 1000)).toBe(true);
      expect(lives.at(-1)!.url).toContain('/done?');
    } finally {
      await session.close();
      await rm(dir, { recursive: true, force: true });
    }
  }, 90_000);

  it('types into the focused field after a click on its point, and replaces what was there', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aga-'));
    const session = new SandboxBrowserSession(localHandle(dir), { pollMs: 50 });
    const signal = new AbortController().signal;
    try {
      await session.start(signal);
      await session.act({ op: 'goto', url: `${base}/` }, signal);
      const name = (await session.observe(signal)).elements.find((e) => e.label === 'სახელი')!;
      await session.act({ op: 'click_at', x: name.x + 5, y: name.y + 5 }, signal);
      await session.act({ op: 'type_focused', text: 'ძველი', enter: false, clear: false }, signal);
      await session.act({ op: 'type_focused', text: 'ახალი', enter: true, clear: true }, signal);
      const r = await session.act({ op: 'text', selector: '#r' }, signal);
      expect(r.text).toBe('ახალი|tbs|null');
    } finally {
      await session.close();
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('says what went wrong when an element is not there, and keeps the page', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aga-'));
    const session = new SandboxBrowserSession(localHandle(dir), { pollMs: 50 });
    const signal = new AbortController().signal;
    try {
      await session.start(signal);
      await session.act({ op: 'goto', url: `${base}/` }, signal);
      const miss = await session.act({ op: 'click', selector: '#nope' }, signal);
      expect(miss.ok).toBe(false);
      expect(miss.error).toBeTruthy();
      expect((await session.observe(signal)).title).toBe('რეგისტრაცია');
    } finally {
      await session.close();
      await rm(dir, { recursive: true, force: true });
    }
  }, 90_000);
  it('refuses a name whose IPv6 answer is private, and an IPv6 or mapped literal, then still opens a public name (Phase 8.18)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aga-'));
    const session = new SandboxBrowserSession(localHandle(dir), { pollMs: 50 });
    const signal = new AbortController().signal;
    const port = new URL(base).port;
    try {
      await session.start(signal);
      for (const url of [`http://aaaa.example.com:${port}/`, `http://[::1]:${port}/`, `http://[::ffff:127.0.0.2]:${port}/`]) {
        const r = await session.act({ op: 'goto', url }, signal);
        expect(r.ok).toBe(false);
      }
      const ok = await session.act({ op: 'goto', url: `http://good.example.com:${port}/` }, signal);
      expect(ok.ok).toBe(true);
      expect((await session.observe(signal)).title).toBe('რეგისტრაცია');
    } finally {
      await session.close();
      await rm(dir, { recursive: true, force: true });
    }
  }, 90_000);
});

test('the session gives up on a driver that never answers, and on a stop', async () => {
  const handle: DriverHandle = {
    async writeFile() { /* nothing */ },
    async readBytes(p) { return p === 'ready.json' ? Buffer.from('{"ok":true}') : null; },
    exec() { return new Promise(() => { /* never ends */ }); },
    async stop() { /* nothing */ },
  };
  const session = new SandboxBrowserSession(handle, { commandMs: 200, pollMs: 20 });
  await session.start(new AbortController().signal);
  await expect(session.act({ op: 'elements' }, new AbortController().signal)).rejects.toThrow(/did not answer/);
  const stop = new AbortController();
  stop.abort();
  await expect(session.act({ op: 'elements' }, stop.signal)).rejects.toThrow(/aborted/);
});

test('a driver that failed to start says why', async () => {
  const handle: DriverHandle = {
    async writeFile() { /* nothing */ },
    async readBytes(p) { return p === 'fatal.json' ? Buffer.from('{"error":"Chromium could not start"}') : null; },
    exec() { return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' }); },
    async stop() { /* nothing */ },
  };
  await expect(new SandboxBrowserSession(handle, { pollMs: 10 }).start(new AbortController().signal)).rejects.toThrow('Chromium could not start');
});
