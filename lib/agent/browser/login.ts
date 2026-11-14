/**
 * lib/agent/browser/login.ts — "log in inside Agent G's browser" (GG 2026-11-07 08:02Z, "both"). The person opens a
 * site in a cloud browser, sees it live, taps and types to log in, and presses Save; the site's cookies are then sealed
 * in their vault (./sessionStore) and loaded into later Agent G tasks that start on that site.
 *
 * Several requests share one sandbox, so the sandbox's name travels in a SIGNED pass (HMAC, this user, this site, 6 min):
 *   start(url)        checks the URL (public http(s) only), books the worst case in the shared $20 sandbox ledger,
 *                     starts the sandbox from the Chromium snapshot and runs ./loginScript detached → { pass }
 *   act(pass, action) writes one action file into the sandbox's inbox (click / type / key / scroll / back)
 *   frame(pass)       the live picture and the page's address
 *   save(pass)        asks for storageState, seals only that site's part, stops the sandbox, settles the booking
 *   cancel(pass)      stops the sandbox and settles
 * A sandbox nobody saves or cancels stops at its own timeout; its booking stays at the worst case (fails closed).
 *
 * What is never kept: the password (typed straight into the page, never written anywhere by us), the pictures, and any
 * other site's cookies. The sandbox has no env and the same network deny-list as every browser task.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SANDBOX_CAP_USD, usedUsd, worstCaseUsd, type SandboxSpendStore } from '@/lib/agent/sandbox/budget';
import { publicUrl } from './policy';
import { BROWSER_DENY_SUBNETS, BROWSER_LIMITS, BROWSER_STEP_MS } from './runner';
import { LOGIN_KEYS, LOGIN_SCRIPT, LOGIN_VIEWPORT } from './loginScript';
import { siteOf } from './sessionVault';
import type { SessionStore } from './sessionStore';

/** How long one login may stay open. */
export const LOGIN_MAX_SEC = 300;
const PASS_TTL_MS = (LOGIN_MAX_SEC + 60) * 1000;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0 Safari/537.36';

export interface LoginSandbox {
  name: string;
  writeFile(path: string, content: string): Promise<void>;
  readBytes(path: string): Promise<Buffer | null>;
  /** Start a command and return without waiting for it. */
  spawn(cmd: string, args: string[]): Promise<void>;
  stop(): Promise<void>;
}
export interface LoginHost {
  create(spec: { vcpus: number; timeoutMs: number; denySubnets: readonly string[] }): Promise<LoginSandbox>;
  attach(name: string): Promise<LoginSandbox>;
}

export interface LoginDeps {
  host: LoginHost;
  spend: SandboxSpendStore;
  sessions: SessionStore;
  /** HMAC key for the pass; '' = closed. */
  key: () => string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  cap?: number;
}

export type LoginAction =
  | { op: 'click'; x: number; y: number }
  | { op: 'type'; text: string }
  | { op: 'key'; key: (typeof LOGIN_KEYS)[number] }
  | { op: 'scroll'; dy: number }
  | { op: 'back' };

export type LoginError = 'bad_input' | 'not_configured' | 'pass_invalid' | 'refused' | 'runner_failed' | 'not_saved';
export type LoginFail = { ok: false; error: LoginError; message: string };

interface Pass { s: string; u: string; site: string; t: string; r: number; at: number; exp: number }

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
function sign(key: string, p: Pass): string {
  const body = b64(JSON.stringify(p));
  return `${body}.${b64(createHmac('sha256', key).update(`login|${body}`).digest())}`;
}
function verify(key: string, token: unknown, userId: string, now: number): Pass | null {
  if (!key || typeof token !== 'string' || token.length > 2000) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const want = createHmac('sha256', key).update(`login|${body}`).digest();
  const got = Buffer.from(mac, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Pass;
    return p.u === userId && typeof p.s === 'string' && p.exp > now ? p : null;
  } catch {
    return null;
  }
}

/** Check one action from the client; anything else is refused. */
export function checkLoginAction(a: unknown): LoginAction | null {
  const o = (a ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  switch (o.op) {
    case 'click': {
      const x = n(o.x), y = n(o.y);
      return x >= 0 && x < LOGIN_VIEWPORT.width && y >= 0 && y < LOGIN_VIEWPORT.height ? { op: 'click', x: Math.round(x), y: Math.round(y) } : null;
    }
    case 'type':
      return typeof o.text === 'string' && o.text.length > 0 && o.text.length <= 500 ? { op: 'type', text: o.text } : null;
    case 'key':
      return (LOGIN_KEYS as readonly string[]).includes(o.key as string) ? { op: 'key', key: o.key as (typeof LOGIN_KEYS)[number] } : null;
    case 'scroll': {
      const dy = n(o.dy);
      return Math.abs(dy) <= 2000 ? { op: 'scroll', dy: Math.round(dy) } : null;
    }
    case 'back':
      return { op: 'back' };
    default:
      return null;
  }
}

const wall = LOGIN_MAX_SEC + BROWSER_LIMITS.startSec;
const limits = { cpus: BROWSER_LIMITS.cpus, memoryMb: BROWSER_LIMITS.memoryMb };
export const loginWorstCaseUsd = () => worstCaseUsd({ ...limits, wallSec: wall });

export function browserLogin(deps: LoginDeps) {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const cap = deps.cap ?? SANDBOX_CAP_USD;
  let seq = 0;
  const pass = (token: unknown, userId: string): Pass | LoginFail =>
    verify(deps.key(), token, userId, now()) ?? { ok: false, error: 'pass_invalid', message: 'This login window has expired. Start again.' };
  const isFail = (p: Pass | LoginFail): p is LoginFail => (p as LoginFail).ok === false;
  const settle = async (p: Pass) => {
    const used = Math.min(p.r, usedUsd(limits, now() - p.at));
    await deps.spend.settle(p.t, p.r, used).catch(() => undefined);
  };
  const stop = async (p: Pass) => {
    await deps.host.attach(p.s).then((s) => s.stop()).catch(() => undefined);
    await settle(p);
  };

  return {
    async start(userId: string, url: unknown): Promise<{ ok: true; pass: string; site: string } | LoginFail> {
      const key = deps.key();
      if (!key) return { ok: false, error: 'not_configured', message: 'Logins are not set up on this server.' };
      const u = publicUrl(url);
      const site = u ? siteOf(u.href) : null;
      if (!u || !site) return { ok: false, error: 'bad_input', message: 'Give the address of a public website (https://…).' };
      const reserved = loginWorstCaseUsd();
      const ticket = await deps.spend.reserve(reserved, cap).catch(() => null);
      if (!ticket) return { ok: false, error: 'refused', message: `Sandbox budget of $${cap} is used up.` };
      const at = now();
      let sbx: LoginSandbox | null = null;
      try {
        sbx = await deps.host.create({ vcpus: BROWSER_LIMITS.cpus, timeoutMs: (wall + 30) * 1000, denySubnets: BROWSER_DENY_SUBNETS });
        await sbx.writeFile('login.json', JSON.stringify({ url: u.href, limits: { maxSec: LOGIN_MAX_SEC, stepMs: BROWSER_STEP_MS, locale: 'ka-GE', userAgent: UA } }));
        await sbx.writeFile('login.mjs', LOGIN_SCRIPT);
        await sbx.spawn('node', ['login.mjs']);
        return { ok: true, site, pass: sign(key, { s: sbx.name, u: userId, site, t: ticket, r: reserved, at, exp: at + PASS_TTL_MS }) };
      } catch (err) {
        if (sbx) await sbx.stop().catch(() => undefined);
        const used = sbx ? Math.min(reserved, usedUsd(limits, now() - at)) : 0;
        await deps.spend.settle(ticket, reserved, used).catch(() => undefined);
        return { ok: false, error: 'runner_failed', message: err instanceof Error ? err.message.slice(0, 300) : 'The browser did not start.' };
      }
    },

    async act(userId: string, token: unknown, action: unknown): Promise<{ ok: true } | LoginFail> {
      const p = pass(token, userId);
      if (isFail(p)) return p;
      const a = checkLoginAction(action);
      if (!a) return { ok: false, error: 'bad_input', message: 'Unknown action.' };
      try {
        const s = await deps.host.attach(p.s);
        // File names sort in the order they were sent; the script deletes each one once done.
        await s.writeFile(`inbox/${now() * 1000 + (seq++ % 1000)}.json`, JSON.stringify(a));
        return { ok: true };
      } catch {
        return { ok: false, error: 'runner_failed', message: 'The browser is not answering.' };
      }
    },

    async frame(userId: string, token: unknown): Promise<{ ok: true; url: string; title: string; done: boolean; error: string | null; jpeg: Buffer | null } | LoginFail> {
      const p = pass(token, userId);
      if (isFail(p)) return p;
      try {
        const s = await deps.host.attach(p.s);
        const [st, jpeg] = await Promise.all([s.readBytes('status.json'), s.readBytes('live.jpg')]);
        let j: { url?: unknown; title?: unknown; done?: unknown; error?: unknown } = {};
        try { j = st ? JSON.parse(st.toString('utf8')) : {}; } catch { j = {}; }
        return {
          ok: true,
          url: typeof j.url === 'string' ? j.url.slice(0, 2000) : '',
          title: typeof j.title === 'string' ? j.title.slice(0, 200) : '',
          done: j.done === true,
          error: typeof j.error === 'string' ? j.error.slice(0, 300) : null,
          jpeg: jpeg && jpeg.length < 600_000 ? jpeg : null,
        };
      } catch {
        return { ok: false, error: 'runner_failed', message: 'The browser is not answering.' };
      }
    },

    async save(userId: string, token: unknown): Promise<{ ok: true; site: string; cookies: number } | LoginFail> {
      const p = pass(token, userId);
      if (isFail(p)) return p;
      try {
        const s = await deps.host.attach(p.s);
        await s.writeFile(`inbox/${now() * 1000 + 999}.json`, JSON.stringify({ op: 'save' }));
        let raw: Buffer | null = null;
        for (let i = 0; i < 20 && !raw; i++) {
          await sleep(500);
          raw = await s.readBytes('state.json').catch(() => null);
        }
        if (!raw) return { ok: false, error: 'not_saved', message: 'The browser did not hand over the login. Try Save again.' };
        let state: unknown = null;
        try { state = JSON.parse(raw.toString('utf8')); } catch { state = null; }
        const r = await deps.sessions.save(userId, p.site, state);
        if (!r.ok) return { ok: false, error: 'not_saved', message: r.error };
        return { ok: true, site: p.site, cookies: r.cookies };
      } catch {
        return { ok: false, error: 'runner_failed', message: 'The browser is not answering.' };
      } finally {
        await stop(p);
      }
    },

    async cancel(userId: string, token: unknown): Promise<{ ok: true } | LoginFail> {
      const p = pass(token, userId);
      if (isFail(p)) return p;
      await stop(p);
      return { ok: true };
    },
  };
}
export type BrowserLogin = ReturnType<typeof browserLogin>;
