/**
 * lib/agent/browser/loginScript.ts — the program that keeps ONE page open in the sandbox while the USER logs in to a site
 * (./login drives it). Unlike ./script, nothing here is decided by the model: every click and every key comes from the
 * person, through the server, as one file per action in `inbox/`. That is why this page may receive a password (the
 * person types it; Agent G's own steps still refuse password fields in ./script).
 *
 * Files: reads `login.json` ({url, limits}); polls `inbox/*.json`, oldest first, deleting each one it has done; writes
 * `live.jpg` and `status.json` ({url, title, n, done, error}) after each action and every couple of seconds; on
 * {op:'save'} writes `state.json` (Playwright storageState) and stops; stops by itself after limits.maxSec.
 *
 * Actions: click {x,y} in the 1280×800 picture, type {text}, key {key} (a short allowlist), scroll {dy}, back, save, quit.
 * The same guards as ./script: http(s) only, one page (a popup's address is opened in the same page instead, so
 * "Log in with Google" windows still work), no downloads, service workers blocked.
 */
export const LOGIN_VIEWPORT = { width: 1280, height: 800 } as const;
export const LOGIN_KEYS = ['Enter', 'Tab', 'Backspace', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'] as const;

export const LOGIN_SCRIPT = String.raw`
import { createRequire } from 'node:module';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || 'playwright-core');

const job = JSON.parse(await readFile('login.json', 'utf8'));
const L = job.limits;
const KEYS = new Set(${JSON.stringify(LOGIN_KEYS)});
const st = { url: '', title: '', n: 0, done: false, error: null };
const say = (e) => String((e && e.message) || e).split('\n')[0].slice(0, 300);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();

let browser, page, ctx;
async function show() {
  try { st.url = page.url(); st.title = (await page.title()).slice(0, 200); } catch {}
  await page.screenshot({ path: 'live.jpg', type: 'jpeg', quality: 55 }).catch(() => {});
  await writeFile('status.json', JSON.stringify(st)).catch(() => {});
}

try {
  await mkdir('inbox', { recursive: true });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {}),
    args: ['--no-first-run', '--disable-extensions', '--disable-background-networking', '--disable-sync', '--disable-default-apps'],
  });
  ctx = await browser.newContext({
    viewport: { width: ${LOGIN_VIEWPORT.width}, height: ${LOGIN_VIEWPORT.height} },
    acceptDownloads: false,
    serviceWorkers: 'block',
    locale: L.locale,
    userAgent: L.userAgent,
  });
  await ctx.route('**/*', (route) => {
    let p = '';
    try { p = new URL(route.request().url()).protocol; } catch {}
    return p === 'http:' || p === 'https:' || p === 'data:' || p === 'blob:' ? route.continue() : route.abort('blockedbyclient');
  });
  page = await ctx.newPage();
  ctx.on('page', async (p) => {
    if (p === page) return;
    // A login popup ("Continue with Google") opens in the one page instead.
    let u = '';
    try { await p.waitForLoadState('domcontentloaded', { timeout: 5000 }); u = p.url(); } catch {}
    await p.close().catch(() => {});
    if (/^https?:/.test(u)) await page.goto(u, { waitUntil: 'domcontentloaded' }).catch(() => {});
  });
  page.setDefaultTimeout(L.stepMs);
  page.setDefaultNavigationTimeout(L.stepMs);
  await page.goto(job.url, { waitUntil: 'domcontentloaded' }).catch((e) => { st.error = say(e); });
  await show();

  let last = Date.now();
  loop: while (Date.now() - t0 < L.maxSec * 1000) {
    let names = [];
    try { names = (await readdir('inbox')).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => Number(a.slice(0, -5)) - Number(b.slice(0, -5))); } catch {}
    for (const f of names) {
      let a = null;
      try { a = JSON.parse(await readFile('inbox/' + f, 'utf8')); } catch {}
      await unlink('inbox/' + f).catch(() => {});
      if (!a || typeof a.op !== 'string') continue;
      st.n += 1;
      st.error = null;
      try {
        if (a.op === 'click') {
          const x = Math.max(0, Math.min(${LOGIN_VIEWPORT.width - 1}, Number(a.x) || 0));
          const y = Math.max(0, Math.min(${LOGIN_VIEWPORT.height - 1}, Number(a.y) || 0));
          await page.mouse.click(x, y);
          await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
        } else if (a.op === 'type') {
          await page.keyboard.type(String(a.text || '').slice(0, 500), { delay: 15 });
        } else if (a.op === 'key') {
          const k = a.key === 'Space' ? ' ' : a.key;
          if (KEYS.has(a.key)) await page.keyboard.press(k);
          await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
        } else if (a.op === 'scroll') {
          await page.mouse.wheel(0, Math.max(-2000, Math.min(2000, Number(a.dy) || 0)));
        } else if (a.op === 'back') {
          await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
        } else if (a.op === 'save') {
          await ctx.storageState({ path: 'state.json' });
          st.done = true;
          await show();
          break loop;
        } else if (a.op === 'quit') {
          st.done = true;
          await show();
          break loop;
        }
      } catch (e) {
        st.error = say(e);
      }
      await sleep(250);
      await show();
      last = Date.now();
    }
    if (Date.now() - last > 2000) { await show(); last = Date.now(); }
    await sleep(200);
  }
  if (!st.done) { st.done = true; st.error = st.error || 'time is up'; }
} catch (e) {
  st.error = say(e);
  st.done = true;
} finally {
  await writeFile('status.json', JSON.stringify(st)).catch(() => {});
  if (browser) await browser.close().catch(() => {});
}
`;
