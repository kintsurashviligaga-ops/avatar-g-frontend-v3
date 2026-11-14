/** @jest-environment node */
import { randomBytes } from 'node:crypto';
import { memorySpendStore } from '@/lib/agent/sandbox/budget';
import { browserLogin, checkLoginAction, loginWorstCaseUsd, type LoginHost } from './login';
import { LOGIN_SCRIPT } from './loginScript';
import { BROWSER_DENY_SUBNETS } from './runner';
import { memoryVaultBlobs, sessionStore } from './sessionStore';

const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';

function setup(opts: { state?: unknown; cap?: number } = {}) {
  const files = new Map<string, string>();
  const log = { created: 0, attached: [] as string[], stopped: 0, spawned: [] as string[][], deny: [] as string[][] };
  const sbx = {
    name: 'sbx_login_1',
    async writeFile(p: string, c: string) {
      files.set(p, c);
      if (p.startsWith('inbox/') && JSON.parse(c).op === 'save' && opts.state !== undefined) files.set('state.json', JSON.stringify(opts.state));
    },
    async readBytes(p: string) { return files.has(p) ? Buffer.from(files.get(p)!) : null; },
    async spawn(cmd: string, args: string[]) { log.spawned.push([cmd, ...args]); },
    async stop() { log.stopped++; },
  };
  const host: LoginHost = {
    async create(spec) { log.created++; log.deny.push([...spec.denySubnets]); return sbx; },
    async attach(name) { log.attached.push(name); if (name !== sbx.name) throw new Error('nope'); return sbx; },
  };
  const spend = memorySpendStore();
  const sessions = sessionStore(memoryVaultBlobs(), randomBytes(32));
  let t = 1_000_000;
  const login = browserLogin({ host, spend, sessions, key: () => 'k'.repeat(32), now: () => t, sleep: async () => undefined, cap: opts.cap });
  return { login, files, log, spend, sessions, advance: (ms: number) => { t += ms; } };
}

describe('checkLoginAction', () => {
  it('accepts only the person’s own small actions', () => {
    expect(checkLoginAction({ op: 'click', x: 10.4, y: 799 })).toEqual({ op: 'click', x: 10, y: 799 });
    expect(checkLoginAction({ op: 'click', x: 1280, y: 0 })).toBeNull();
    expect(checkLoginAction({ op: 'type', text: 'hunter2' })).toEqual({ op: 'type', text: 'hunter2' });
    expect(checkLoginAction({ op: 'type', text: 'x'.repeat(501) })).toBeNull();
    expect(checkLoginAction({ op: 'key', key: 'Enter' })).toEqual({ op: 'key', key: 'Enter' });
    expect(checkLoginAction({ op: 'key', key: 'Control+A' })).toBeNull();
    expect(checkLoginAction({ op: 'save' })).toBeNull();
    expect(checkLoginAction({ op: 'goto', url: 'https://x.com' })).toBeNull();
  });
});

describe('browser login', () => {
  it('refuses non-public addresses before any sandbox or booking exists', async () => {
    const { login, log, spend } = setup();
    for (const url of ['http://127.0.0.1/', 'file:///etc/passwd', 'https://169.254.169.254/', 42]) {
      expect((await login.start(U1, url)).ok).toBe(false);
    }
    expect(log.created).toBe(0);
    expect(await spend.total()).toBe(0);
  });

  it('books the worst case, starts the driver detached, and signs a pass for this user only', async () => {
    const { login, log, files, spend } = setup();
    const r = await login.start(U1, 'https://www.facebook.com/login');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.site).toBe('facebook.com');
    expect(log.deny[0]).toEqual([...BROWSER_DENY_SUBNETS]);
    expect(files.get('login.mjs')).toBe(LOGIN_SCRIPT);
    expect(JSON.parse(files.get('login.json')!).url).toBe('https://www.facebook.com/login');
    expect(log.spawned).toEqual([['node', 'login.mjs']]);
    expect(await spend.total()).toBeCloseTo(loginWorstCaseUsd());
    expect((await login.act(U2, r.pass, { op: 'key', key: 'Enter' })).ok).toBe(false);
    expect((await login.act(U1, `${r.pass}x`, { op: 'key', key: 'Enter' })).ok).toBe(false);
    expect(await login.act(U1, r.pass, { op: 'type', text: 'me@example.com' })).toEqual({ ok: true });
    const inbox = [...files.keys()].filter((k) => k.startsWith('inbox/'));
    expect(inbox).toHaveLength(1);
    expect(JSON.parse(files.get(inbox[0]!)!)).toEqual({ op: 'type', text: 'me@example.com' });
  });

  it('refuses when the $20 ledger is used up', async () => {
    const { login, log } = setup({ cap: 0 });
    expect(await login.start(U1, 'https://example.com')).toMatchObject({ ok: false, error: 'refused' });
    expect(log.created).toBe(0);
  });

  it('reads the live picture and status', async () => {
    const { login, files } = setup();
    const r = await login.start(U1, 'https://example.com');
    if (!r.ok) throw new Error('start');
    files.set('status.json', JSON.stringify({ url: 'https://example.com/login', title: 'Log in', done: false, error: null }));
    files.set('live.jpg', 'JPEG');
    expect(await login.frame(U1, r.pass)).toMatchObject({ ok: true, url: 'https://example.com/login', title: 'Log in', done: false });
  });

  it('saves only this site’s cookies, stops the sandbox and settles the booking', async () => {
    const state = { cookies: [{ name: 'sid', value: 's', domain: '.example.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' }, { name: 't', value: 't', domain: '.ads.net', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' }], origins: [] };
    const { login, log, sessions, spend, advance } = setup({ state });
    const r = await login.start(U1, 'https://example.com');
    if (!r.ok) throw new Error('start');
    advance(60_000);
    expect(await login.save(U1, r.pass)).toEqual({ ok: true, site: 'example.com', cookies: 1 });
    expect(log.stopped).toBe(1);
    expect(await spend.total()).toBeLessThan(loginWorstCaseUsd());
    expect((await sessions.forUrl(U1, 'https://example.com/'))?.state.cookies).toHaveLength(1);
  });

  it('says so when the site set no login, and still stops the sandbox', async () => {
    const { login, log } = setup({ state: { cookies: [], origins: [] } });
    const r = await login.start(U1, 'https://example.com');
    if (!r.ok) throw new Error('start');
    expect(await login.save(U1, r.pass)).toMatchObject({ ok: false, error: 'not_saved' });
    expect(log.stopped).toBe(1);
  });

  it('cancel stops and keeps nothing; an expired pass is refused', async () => {
    const { login, log, sessions, advance } = setup();
    const r = await login.start(U1, 'https://example.com');
    if (!r.ok) throw new Error('start');
    expect(await login.cancel(U1, r.pass)).toEqual({ ok: true });
    expect(log.stopped).toBe(1);
    expect(await sessions.list(U1)).toEqual([]);
    advance(10 * 60_000);
    expect(await login.frame(U1, r.pass)).toMatchObject({ ok: false, error: 'pass_invalid' });
  });

  it('is closed without a key', async () => {
    const login = browserLogin({ host: {} as LoginHost, spend: memorySpendStore(), sessions: sessionStore(memoryVaultBlobs(), randomBytes(32)), key: () => '' });
    expect(await login.start(U1, 'https://example.com')).toMatchObject({ ok: false, error: 'not_configured' });
  });
});
