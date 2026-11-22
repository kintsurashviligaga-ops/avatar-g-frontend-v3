/**
 * lib/agent/browserAgent/driver.ts — the program that keeps ONE Chromium page alive inside the throwaway sandbox for the
 * whole Browser Agent run (Phase 8.11, PREPARED, NOT WIRED). Plain ESM for Node; its only dependency is playwright-core,
 * which the browser snapshot already carries (scripts/agent-browser-snapshot.mjs).
 *
 * Today's driver (lib/agent/browser/script) runs a fixed list of steps and exits, so a second batch starts from an empty
 * page: a form half filled, a cookie banner closed, a search typed are all lost between batches. This one stays up and
 * takes one command at a time, the way a person works:
 *
 *   the server writes  cmd-<n>.json   {op, ...}           (n = 1, 2, 3 …; `observe` and `close` are commands too)
 *   the driver writes  res-<n>.json   {result, observation} through a temporary file and a rename, so a reader never
 *                                     sees half of it
 *                      live.jpg       the viewport after every command, WITH the agent's cursor drawn where it is,
 *                                     so the person sees exactly what the agent sees and where it points
 *
 * It moves the mouse to an element before it clicks or hovers (in small steps, like a hand), and types with a short
 * delay between keys, so sites that listen to real key and pointer events behave as they do for a person.
 *
 * Its own rules, as the one-shot driver's: only http(s)/data/blob requests; a popup is closed (one page, one task);
 * typing into a password / card / one-time-code field is refused (also when the field only has the focus); downloads
 * refused, service workers blocked; each command has its own timeout; it exits on `close`, after `idleMs` with no
 * command, or at `wallMs`. Every connection goes through lib/agent/browser/netGuard, which refuses any non-public IPv4
 * or IPv6 address after resolving the name itself (Phase 8.18); if it cannot start, the session does not start.
 *
 * PW_CORE and PW_EXECUTABLE exist only for the offline test (./driver.test), which runs this exact text on this machine.
 */
import { NET_GUARD_JS, netGuardChromiumArgs } from '@/lib/agent/browser/netGuard';

const GUARD_ARGS = JSON.stringify(netGuardChromiumArgs(0)).replace('127.0.0.1:0', '127.0.0.1:" + __guardPort + "');

export const BROWSER_AGENT_DRIVER = String.raw`
import { createRequire } from 'node:module';
import { readFile, rename, writeFile, access } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || 'playwright-core');

const cfg = JSON.parse(await readFile('session.json', 'utf8'));
const L = cfg.limits;
const started = Date.now();
const say = (e) => String((e && e.message) || e).split('\n')[0].slice(0, 300);
const cut = (s, n) => (typeof s === 'string' && s.length > n ? s.slice(0, n) + '\n…[cut]' : s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (p) => access(p).then(() => true, () => false);
const SECRET_AUTO = /password|cc-|one-time-code/;

async function writeAtomic(name, text) {
  await writeFile(name + '.tmp', text);
  await rename(name + '.tmp', name);
}

let browser;
let page;
let cursor = { x: Math.round(L.width / 2), y: Math.round(L.height / 2) };

async function moveTo(x, y) {
  const d = Math.hypot(x - cursor.x, y - cursor.y);
  await page.mouse.move(x, y, { steps: Math.max(4, Math.min(25, Math.round(d / 40))) });
  cursor = { x: Math.round(x), y: Math.round(y) };
}

async function centerOf(locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const b = await locator.boundingBox();
  if (!b) throw new Error('the element is not visible');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function isSecret(locator) {
  const kind = ((await locator.getAttribute('type')) || '').toLowerCase();
  const auto = ((await locator.getAttribute('autocomplete')) || '').toLowerCase();
  return kind === 'password' || SECRET_AUTO.test(auto);
}

async function typeInto(locator, text) {
  if (await isSecret(locator)) throw new Error('refused: this browser never types into a password or card field');
  const c = await centerOf(locator);
  await moveTo(c.x, c.y);
  await locator.click();
  await locator.fill('');
  await page.keyboard.type(text, { delay: L.typeDelayMs });
}

async function focusedIsSecret() {
  return page.evaluate((re) => {
    const el = document.activeElement;
    if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable)) return 'none';
    const t = (el.getAttribute('type') || '').toLowerCase();
    const a = (el.getAttribute('autocomplete') || '').toLowerCase();
    return t === 'password' || new RegExp(re).test(a) ? 'secret' : 'field';
  }, SECRET_AUTO.source);
}

// The page as the agent reads it: address, title, visible text, links, which fields are secret, and every visible
// control with its own selector ([data-agent-id="n"]) and box, so a decider never has to guess a CSS selector.
async function observe() {
  const data = await page.evaluate((max) => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    let n = 0;
    const tag = (el) => {
      if (!el.hasAttribute('data-agent-id')) el.setAttribute('data-agent-id', String(++n + (window.__agentIds || 0)));
      return '[data-agent-id="' + el.getAttribute('data-agent-id') + '"]';
    };
    const secretRe = /password|cc-|one-time-code/;
    const secret = (el) => (el.getAttribute('type') || '').toLowerCase() === 'password' || secretRe.test((el.getAttribute('autocomplete') || '').toLowerCase());
    const controls = Array.from(document.querySelectorAll('a[href],button,input,select,textarea,[role=button],[role=link],[role=checkbox],[role=menuitem],[contenteditable=true]'));
    const elements = [];
    const secretFields = [];
    for (const el of controls) {
      if (el.type === 'hidden') continue;
      if (secret(el)) secretFields.push(tag(el));
      if (!vis(el) || elements.length >= max) continue;
      const r = el.getBoundingClientRect();
      const label = String(el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || '')
        .replace(/\s+/g, ' ').trim().slice(0, 120);
      elements.push({
        selector: tag(el),
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || '',
        type: (el.getAttribute('type') || '').toLowerCase(),
        label,
        secret: secret(el),
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      });
    }
    window.__agentIds = (window.__agentIds || 0) + n;
    const links = [];
    for (const a of Array.from(document.querySelectorAll('a[href]'))) {
      const t = String(a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (t && /^https?:/.test(a.href) && links.length < 40) links.push({ text: t, href: String(a.href).slice(0, 500) });
    }
    return { text: document.body ? document.body.innerText : '', links, elements, secretFields };
  }, L.elementsMax);
  return { url: page.url(), title: (await page.title()).slice(0, 300), text: cut(data.text, L.textMax), links: data.links, elements: data.elements, secretFields: data.secretFields, cursor };
}

// The live picture with the cursor drawn in, then taken away again (pointer-events: none, never part of the page's work).
async function live() {
  await page.evaluate((c) => {
    const d = document.createElement('div');
    d.id = '__agent_cursor';
    d.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;left:' + (c.x - 2) + 'px;top:' + (c.y - 2) + 'px;width:22px;height:22px';
    d.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M2 2 L2 18 L7 13 L11 21 L14 19.5 L10 12 L17 12 Z" fill="#111" stroke="#fff" stroke-width="1.5"/></svg>';
    document.documentElement.appendChild(d);
  }, cursor).catch(() => {});
  await page.screenshot({ path: 'live.jpg', type: 'jpeg', quality: 50 }).catch(() => {});
  await page.evaluate(() => { const d = document.getElementById('__agent_cursor'); if (d) d.remove(); }).catch(() => {});
}

async function act(s) {
  const r = { op: s.op, ok: true };
  // A click or Enter may start a navigation a moment later: watch for it from before the action, give it a short
  // window to begin, then wait for the new page. Without this the next command can read the page being left.
  let nav = null;
  const expectNav = () => { nav = page.waitForEvent('framenavigated', { timeout: 1_200, predicate: (f) => f === page.mainFrame() }).catch(() => null); };
  const settle = async () => {
    if (nav) await nav;
    await page.waitForLoadState('domcontentloaded', { timeout: L.stepMs }).catch(() => {});
  };
  if (s.op === 'goto') {
    const resp = await page.goto(s.url, { waitUntil: 'domcontentloaded' });
    if (resp && resp.headers()['x-agent-g-guard'] === 'blocked') throw new Error('blocked: that address is not a public website');
  } else if (s.op === 'click') {
    const el = page.locator(s.selector).first();
    const c = await centerOf(el);
    await moveTo(c.x, c.y);
    expectNav();
    await page.mouse.click(c.x, c.y);
    await settle();
  } else if (s.op === 'click_at') {
    await moveTo(s.x, s.y);
    expectNav();
    await page.mouse.click(s.x, s.y);
    await settle();
  } else if (s.op === 'move_to') {
    await moveTo(s.x, s.y);
  } else if (s.op === 'hover') {
    const c = await centerOf(page.locator(s.selector).first());
    await moveTo(c.x, c.y);
  } else if (s.op === 'type') {
    await typeInto(page.locator(s.selector).first(), s.text);
  } else if (s.op === 'type_focused') {
    const f = await focusedIsSecret();
    if (f === 'secret') throw new Error('refused: this browser never types into a password or card field');
    if (f === 'none') throw new Error('no field has the focus: click the field first');
    if (s.clear) await page.evaluate(() => { const el = document.activeElement; if (el && 'select' in el) el.select(); else document.execCommand('selectAll'); });
    await page.keyboard.type(s.text, { delay: L.typeDelayMs });
    if (s.enter) { expectNav(); await page.keyboard.press('Enter'); await settle(); }
  } else if (s.op === 'fill_form') {
    r.filled = 0;
    for (const f of s.fields) {
      const el = page.locator(f.selector).first();
      const tagName = await el.evaluate((e) => e.tagName.toLowerCase());
      if (tagName === 'select') await el.selectOption([{ value: f.value }]).catch(() => el.selectOption([{ label: f.value }]));
      else await typeInto(el, f.value);
      r.filled += 1;
    }
  } else if (s.op === 'select') {
    const el = page.locator(s.selector).first();
    const c = await centerOf(el);
    await moveTo(c.x, c.y);
    await el.selectOption([{ value: s.value }]).catch(() => el.selectOption([{ label: s.value }]));
  } else if (s.op === 'check') {
    const el = page.locator(s.selector).first();
    const c = await centerOf(el);
    await moveTo(c.x, c.y);
    if (s.on) await el.check(); else await el.uncheck();
  } else if (s.op === 'scroll') {
    if (s.selector) {
      await page.locator(s.selector).first().scrollIntoViewIfNeeded();
    } else {
      await page.mouse.wheel(0, s.direction === 'up' ? -s.pixels : s.pixels);
      await sleep(250);
    }
  } else if (s.op === 'press') {
    if (s.key === 'Enter') expectNav();
    await page.keyboard.press(s.key);
    await settle();
  } else if (s.op === 'wait') {
    await sleep(Math.min(s.ms, L.waitMaxMs));
  } else if (s.op === 'back') {
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  } else if (s.op === 'text') {
    r.text = cut(s.selector ? await page.locator(s.selector).first().innerText() : await page.locator('body').innerText(), L.textMax);
  } else if (s.op === 'screenshot') {
    await page.screenshot({ path: 'shot-' + s.name + '.png' });
    r.shot = s.name;
  } else if (s.op !== 'elements' && s.op !== 'links' && s.op !== 'observe') {
    throw new Error('unknown action');
  }
  r.url = page.url();
  r.cursor = cursor;
  return r;
}

${NET_GUARD_JS}
const blocked = [];
try {
  const __guardPort = await startNetGuard((what, why) => { if (blocked.length < 20) blocked.push(what + ' (' + why + ')'); });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {}),
    args: ['--no-first-run', '--disable-extensions', '--disable-background-networking', '--disable-sync', '--disable-default-apps',
      ...${GUARD_ARGS}],
  });
  const ctx = await browser.newContext({
    viewport: { width: L.width, height: L.height }, acceptDownloads: false, serviceWorkers: 'block', locale: L.locale, userAgent: L.userAgent,
  });
  await ctx.route('**/*', (route) => {
    let p = '';
    try { p = new URL(route.request().url()).protocol; } catch { /* refused below */ }
    return p === 'http:' || p === 'https:' || p === 'data:' || p === 'blob:' ? route.continue() : route.abort('blockedbyclient');
  });
  page = await ctx.newPage();
  ctx.on('page', (p) => { if (p !== page) p.close().catch(() => {}); });
  // Playwright's mouse starts at (0, 0); park it where the agent's cursor is drawn, so the first glide does not cross
  // (and open) a menu in the page's corner that the agent never meant to touch.
  await page.mouse.move(cursor.x, cursor.y);
  page.setDefaultTimeout(L.stepMs);
  page.setDefaultNavigationTimeout(L.stepMs);
  await writeAtomic('ready.json', JSON.stringify({ ok: true }));

  let n = 1;
  let lastCmd = Date.now();
  for (;;) {
    if (Date.now() - started > L.wallMs || Date.now() - lastCmd > L.idleMs) break;
    const name = 'cmd-' + n + '.json';
    if (!(await exists(name))) { await sleep(L.pollMs); continue; }
    let cmd;
    try { cmd = JSON.parse(await readFile(name, 'utf8')); } catch { await sleep(L.pollMs); continue; } // still being written
    lastCmd = Date.now();
    if (cmd.op === 'close') { await writeAtomic('res-' + n + '.json', JSON.stringify({ result: { op: 'close', ok: true } })); break; }
    let result;
    try { result = await act(cmd); } catch (e) { result = { op: cmd.op, ok: false, error: say(e), url: page.url(), cursor }; }
    let observation = null;
    try { observation = await observe(); } catch (e) { observation = null; }
    await live();
    await writeAtomic('res-' + n + '.json', JSON.stringify({ result, observation }));
    n += 1;
  }
} catch (e) {
  await writeAtomic('fatal.json', JSON.stringify({ error: say(e) })).catch(() => {});
} finally {
  if (browser) await browser.close().catch(() => {});
  // The network guard's server and its tunnels would keep Node alive: the session is over, so end it.
  process.exit(0);
}
`;

/** The driver's limits, the same for every run (the server writes them into session.json). */
export const DRIVER_LIMITS = {
  width: 1280,
  height: 800,
  textMax: 4_000,
  elementsMax: 80,
  stepMs: 15_000,
  waitMaxMs: 5_000,
  typeDelayMs: 25,
  pollMs: 100,
  idleMs: 90_000,
  wallMs: 6 * 60_000,
} as const;
