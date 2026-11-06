/**
 * lib/agent/browser/policy.ts — what a browser task Agent G plans may do (GG's 2026-11-06 audit, ACTION 3). Pure.
 *
 * A task is a short list of steps a headless Chromium performs in its OWN throwaway Vercel Sandbox (./runner):
 *
 *   goto        {url}                 open a public http(s) page
 *   click       {selector}            click an element (CSS or text= selector)
 *   type        {selector, text}      type into a field (never a password: see below)
 *   press       {key}                 one key (Enter, Tab, …)
 *   wait        {ms}                  wait at most 5 s
 *   text        {selector?}           read the page's (or an element's) visible text
 *   screenshot  {name?}               a PNG of the viewport, saved to the user's workspace
 *
 * Rules, fixed here so the host cannot loosen them:
 *   - only http/https URLs on a public host name: no IP literals, no localhost, no internal names, no user:pass@;
 *     the sandbox's network policy also denies every private and metadata range (runner BROWSER_DENY_SUBNETS);
 *   - no credentials: a `type` into a password field is refused by the script, and nothing of the user's (cookies,
 *     sessions, keys) is ever put into the browser. Every task starts from an empty profile and the VM is destroyed;
 *   - at most BROWSER_MAX_STEPS steps, BROWSER_MAX_SHOTS screenshots, BROWSER_WALL_SEC seconds, BROWSER_TEXT_MAX
 *     characters of text per read.
 */

export const BROWSER_MAX_STEPS = 20;
export const BROWSER_MAX_SHOTS = 5;
export const BROWSER_WALL_SEC = 120;
export const BROWSER_TEXT_MAX = 20_000;
export const BROWSER_WAIT_MAX_MS = 5_000;
const SELECTOR_MAX = 300;
const TYPE_MAX = 500;

export type BrowserStep =
  | { op: 'goto'; url: string }
  | { op: 'click'; selector: string }
  | { op: 'type'; selector: string; text: string }
  | { op: 'press'; key: string }
  | { op: 'wait'; ms: number }
  | { op: 'text'; selector?: string }
  | { op: 'screenshot'; name: string };

export interface BrowserPlan {
  steps: BrowserStep[];
  wallSec: number;
  /** Hosts the plan names, for the user's card ("opens: example.com, …"). */
  hosts: string[];
}

export type BrowserCheck = { ok: true; plan: BrowserPlan } | { ok: false; error: string };

const KEYS = new Set(['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp', 'Home', 'End', 'Backspace', 'Space']);

/** A host name a public site can have: letters, digits, dots, dashes, a dotted TLD of letters. Never an IP. */
export function isPublicHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9.-]+$/.test(h) || h.length > 253) return false;
  if (/^[\d.]+$/.test(h)) return false; // IPv4 literal (or a bare number)
  if (!/\.[a-z]{2,63}$/.test(h)) return false; // needs a real TLD: rules out localhost, intranet names, *.internal-less
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/.test(h)) return false;
  if (h === 'metadata.google.internal' || h.endsWith('.internal')) return false;
  return h.split('.').every((p) => p.length > 0 && p.length <= 63 && !p.startsWith('-') && !p.endsWith('-'));
}

/** A URL the browser may open, normalized; null when it may not. */
export function publicUrl(v: unknown): URL | null {
  if (typeof v !== 'string' || v.length > 2000) return null;
  let u: URL;
  try { u = new URL(v.trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== '80' && u.port !== '443') return null;
  if (u.hostname.startsWith('[')) return null; // IPv6 literal
  return isPublicHost(u.hostname) ? u : null;
}

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() && v.length <= max ? v : null);

export function checkBrowserTask(task: unknown): BrowserCheck {
  const raw = (task as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'steps: a non-empty list' };
  if (raw.length > BROWSER_MAX_STEPS) return { ok: false, error: `steps: at most ${BROWSER_MAX_STEPS}` };
  const steps: BrowserStep[] = [];
  const hosts = new Set<string>();
  let shots = 0;
  for (const [i, s] of raw.entries()) {
    const at = `step ${i + 1}`;
    const r = (s ?? {}) as Record<string, unknown>;
    switch (r.op) {
      case 'goto': {
        const u = publicUrl(r.url);
        if (!u) return { ok: false, error: `${at}: only a public http(s) address` };
        hosts.add(u.hostname.toLowerCase());
        steps.push({ op: 'goto', url: u.toString() });
        break;
      }
      case 'click': {
        const sel = str(r.selector, SELECTOR_MAX);
        if (!sel) return { ok: false, error: `${at}: selector` };
        steps.push({ op: 'click', selector: sel });
        break;
      }
      case 'type': {
        const sel = str(r.selector, SELECTOR_MAX);
        if (!sel || typeof r.text !== 'string' || r.text.length > TYPE_MAX) return { ok: false, error: `${at}: selector and text (≤ ${TYPE_MAX})` };
        steps.push({ op: 'type', selector: sel, text: r.text });
        break;
      }
      case 'press': {
        if (typeof r.key !== 'string' || !KEYS.has(r.key)) return { ok: false, error: `${at}: key` };
        steps.push({ op: 'press', key: r.key });
        break;
      }
      case 'wait': {
        const ms = Number(r.ms);
        if (!Number.isFinite(ms) || ms <= 0 || ms > BROWSER_WAIT_MAX_MS) return { ok: false, error: `${at}: ms (≤ ${BROWSER_WAIT_MAX_MS})` };
        steps.push({ op: 'wait', ms: Math.round(ms) });
        break;
      }
      case 'text': {
        if (r.selector !== undefined && !str(r.selector, SELECTOR_MAX)) return { ok: false, error: `${at}: selector` };
        steps.push(r.selector ? { op: 'text', selector: r.selector as string } : { op: 'text' });
        break;
      }
      case 'screenshot': {
        if (++shots > BROWSER_MAX_SHOTS) return { ok: false, error: `at most ${BROWSER_MAX_SHOTS} screenshots` };
        const name = typeof r.name === 'string' && /^[a-z0-9_-]{1,40}$/i.test(r.name) ? r.name : `shot-${shots}`;
        steps.push({ op: 'screenshot', name });
        break;
      }
      default:
        return { ok: false, error: `${at}: op must be goto, click, type, press, wait, text or screenshot` };
    }
  }
  if (steps[0]!.op !== 'goto') return { ok: false, error: 'the first step opens a page (goto)' };
  return { ok: true, plan: { steps, wallSec: BROWSER_WALL_SEC, hosts: [...hosts] } };
}

/** What one task gives back. */
export interface BrowserStepResult { op: BrowserStep['op']; ok: boolean; url?: string; title?: string; text?: string; shot?: string; error?: string }
export type BrowserResult =
  | { ok: true; steps: BrowserStepResult[]; shots: Array<{ name: string; bytes: Buffer }>; finalUrl: string; wallMs: number }
  | { ok: false; error: 'browser_disabled' | 'refused' | 'timeout' | 'cancelled' | 'runner_failed'; message: string };
