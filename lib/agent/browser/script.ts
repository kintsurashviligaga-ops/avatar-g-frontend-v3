/**
 * lib/agent/browser/script.ts — the program that drives Chromium INSIDE the throwaway sandbox (./runner writes it in
 * fresh for every task, so a change here needs no new snapshot). Plain ESM for Node, no dependencies but playwright-core,
 * which the snapshot carries (scripts/agent-browser-snapshot.mjs).
 *
 * It reads `task.json` ({steps, limits}) from its folder, performs the steps in ONE page of ONE fresh context, and writes
 * `result.json` plus `shots/<name>.png`. It never throws past its own try: a step that fails is recorded and the task
 * stops there, so the server always gets an answer it can show.
 *
 * Its own rules, on top of the server's (./policy) and the sandbox's network policy:
 *   - every request that is not http(s)/data/blob is aborted (no file:, no chrome:, no ftp:);
 *   - a page that opens another window gets it closed: one page, one task;
 *   - `type` into a password field is refused: no credentials ever go into this browser;
 *   - downloads are refused and service workers blocked;
 *   - each step has its own timeout, and text is cut to the server's limit.
 *
 * PW_CORE and PW_EXECUTABLE exist only for the offline test (./script.test), which runs this exact text on this machine.
 */
export const BROWSER_SCRIPT = String.raw`
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || 'playwright-core');

const task = JSON.parse(await readFile('task.json', 'utf8'));
const L = task.limits;
const out = { steps: [], finalUrl: '', error: null };
const save = () => writeFile('result.json', JSON.stringify(out));
const cut = (s) => (typeof s === 'string' && s.length > L.textMax ? s.slice(0, L.textMax) + '\n…[cut]' : s);
const say = (e) => String((e && e.message) || e).split('\n')[0].slice(0, 300);

let browser;
try {
  await mkdir('shots', { recursive: true });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {}),
    args: ['--no-first-run', '--disable-extensions', '--disable-background-networking', '--disable-sync', '--disable-default-apps'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: false,
    serviceWorkers: 'block',
    locale: L.locale,
    userAgent: L.userAgent,
  });
  await ctx.route('**/*', (route) => {
    let p = '';
    try { p = new URL(route.request().url()).protocol; } catch { /* refused below */ }
    return p === 'http:' || p === 'https:' ? route.continue() : route.abort('blockedbyclient');
  });
  const page = await ctx.newPage();
  ctx.on('page', (p) => { if (p !== page) p.close().catch(() => {}); });
  page.setDefaultTimeout(L.stepMs);
  page.setDefaultNavigationTimeout(L.stepMs);

  for (const s of task.steps) {
    const r = { op: s.op, ok: true };
    try {
      if (s.op === 'goto') {
        await page.goto(s.url, { waitUntil: 'domcontentloaded' });
        r.url = page.url();
        r.title = (await page.title()).slice(0, 200);
      } else if (s.op === 'click') {
        await page.locator(s.selector).first().click();
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        r.url = page.url();
      } else if (s.op === 'type') {
        const el = page.locator(s.selector).first();
        const kind = ((await el.getAttribute('type')) || '').toLowerCase();
        const auto = ((await el.getAttribute('autocomplete')) || '').toLowerCase();
        if (kind === 'password' || /password|cc-|one-time-code/.test(auto)) throw new Error('refused: this browser never types into a password or card field');
        await el.fill(s.text);
      } else if (s.op === 'press') {
        await page.keyboard.press(s.key);
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        r.url = page.url();
      } else if (s.op === 'wait') {
        await page.waitForTimeout(s.ms);
      } else if (s.op === 'text') {
        r.text = cut(s.selector ? await page.locator(s.selector).first().innerText() : await page.locator('body').innerText());
      } else if (s.op === 'screenshot') {
        await page.screenshot({ path: 'shots/' + s.name + '.png' });
        r.shot = s.name;
      } else {
        throw new Error('unknown step');
      }
    } catch (e) {
      r.ok = false;
      r.error = say(e);
    }
    out.steps.push(r);
    out.finalUrl = page.url();
    await save();
    if (!r.ok) break;
  }
} catch (e) {
  out.error = say(e);
} finally {
  await save();
  if (browser) await browser.close().catch(() => {});
}
`;
