/** @jest-environment node */
/**
 * scripts/bog-oauth-check.mjs is what the owner runs on a Mac with the real OPAY pair, so its two promises are pinned
 * here: the secret goes IN blind (checked in a real pseudo-terminal) and nothing of it, or of a token, comes OUT —
 * whatever BOG answers. Runs against a local fake token endpoint; nothing here reaches the network.
 */
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import { OAUTH_HOSTS, classify, describeKeys, oauthTarget, scrubSecrets } from './bog-oauth-check.mjs';

const SCRIPT = path.join(__dirname, 'bog-oauth-check.mjs');
const ID = 'opay-client-7f3a0042';
const SECRET = 'Zx9"q/Lm+Pw=Ke8\\r';
const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJteWF2YXRhciJ9.c2lnbmF0dXJlLXNpZ25hdHVyZQ';
const forms = (s: string) => [s, JSON.stringify(s).slice(1, -1), encodeURIComponent(s), Buffer.from(`${ID}:${s}`).toString('base64')];

describe('pure parts', () => {
  test('production by default, sandbox on BOG_ENV=sandbox; an override may only point at this machine', () => {
    expect(oauthTarget({} as NodeJS.ProcessEnv)).toEqual({ environment: 'production', url: OAUTH_HOSTS.production });
    expect(oauthTarget({ BOG_ENV: 'Sandbox ' } as NodeJS.ProcessEnv)).toEqual({ environment: 'sandbox', url: OAUTH_HOSTS.sandbox });
    expect(oauthTarget({ BOG_OAUTH_URL: 'http://127.0.0.1:9/token' } as NodeJS.ProcessEnv).url).toBe('http://127.0.0.1:9/token');
    for (const bad of ['https://example.com/token', 'https://oauth2.bog.ge.attacker.net/token', 'http://10.0.0.5/token']) {
      expect(() => oauthTarget({ BOG_OAUTH_URL: bad } as NodeJS.ProcessEnv)).toThrow(/this machine/);
    }
  });

  test('every form of the secret is removed, tokens are masked', () => {
    const echoed = JSON.stringify({ got: SECRET, url: `?s=${encodeURIComponent(SECRET)}`, header: `Basic ${Buffer.from(`${ID}:${SECRET}`).toString('base64')}`, access_token: 'abc', jwt: TOKEN });
    const out = scrubSecrets(`${echoed} raw=${SECRET}`, [SECRET, `${ID}:${SECRET}`]);
    for (const f of forms(SECRET)) expect(out).not.toContain(f);
    expect(out).not.toContain(TOKEN);
    expect(out).toContain('"access_token":"[hidden]"');
    expect(out).toContain('[token]');
  });

  test('a 2xx without access_token shows field names only; statuses map to verdicts', () => {
    expect(describeKeys(JSON.stringify({ token: TOKEN, scope: 'x' }))).toBe('JSON keys: token, scope');
    expect(describeKeys('<html>')).toBe('not JSON (6 bytes)');
    expect(classify(200, JSON.stringify({ access_token: TOKEN }), [SECRET])).toEqual({ verdict: 'ok', answer: null });
    expect(classify(200, JSON.stringify({ token: TOKEN }), [SECRET])).toEqual({ verdict: 'malformed_answer', answer: 'JSON keys: token' });
    expect(classify(401, '{"error":"invalid_client"}', [SECRET]).verdict).toBe('credentials_refused');
    expect(classify(400, '', [SECRET])).toEqual({ verdict: 'credentials_refused', answer: null });
    expect(classify(403, '', [SECRET]).verdict).toBe('forbidden');
    expect(classify(404, '', [SECRET]).verdict).toBe('endpoint_not_found');
    expect(classify(502, '', [SECRET]).verdict).toBe('bog_error');
  });
});

describe('the script, run for real against a local fake token endpoint', () => {
  let server: http.Server;
  let base = '';
  let hits: Array<{ url: string; auth: string; body: string }> = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const auth = String(req.headers.authorization ?? '');
        hits.push({ url: req.url ?? '', auth, body });
        res.setHeader('content-type', 'application/json');
        const pair = Buffer.from(auth.replace(/^Basic /, ''), 'base64').toString();
        if (req.url === '/ok') {
          if (pair !== `${ID}:${SECRET}`) {
            res.statusCode = 401;
            return res.end('{"error":"invalid_client"}');
          }
          return res.end(JSON.stringify({ access_token: TOKEN, expires_in: 300, token_type: 'Bearer' }));
        }
        if (req.url === '/echo') {
          res.statusCode = 401;
          return res.end(JSON.stringify({ error: 'invalid_client', got: pair, header: auth, access_token: TOKEN }));
        }
        if (req.url === '/malformed') return res.end(JSON.stringify({ token: TOKEN, secret_echo: SECRET }));
        res.statusCode = 404;
        res.end('{}');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => {
    hits = [];
  });

  function run(env: Record<string, string>): Promise<{ code: number | null; out: string }> {
    return new Promise((resolve) => {
      // stdin is not a terminal here, and the environment is clean: no real BOG_* or proxy variables leak in.
      const child = spawn(process.execPath, [SCRIPT], { env: { PATH: process.env.PATH ?? '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      child.stdout.on('data', (c) => (out += c));
      child.stderr.on('data', (c) => (out += c));
      child.on('close', (code) => resolve({ code, out }));
    });
  }
  const creds = { BOG_CLIENT_ID: ID, BOG_SECRET_KEY: SECRET };
  const expectClean = (out: string) => {
    for (const f of forms(SECRET)) expect(out).not.toContain(f);
    expect(out).not.toContain(TOKEN);
  };

  test('accepted → one POST (Basic, client_credentials), a one-line verdict with the last 4 of the id, exit 0', async () => {
    const { code, out } = await run({ ...creds, BOG_OAUTH_URL: `${base}/ok` });
    expect(code).toBe(0);
    expect(out).toMatch(/✓ ok · HTTP 200 · production · client …0042 · \d+ ms/);
    expect(hits).toEqual([{ url: '/ok', auth: `Basic ${Buffer.from(`${ID}:${SECRET}`).toString('base64')}`, body: 'grant_type=client_credentials' }]);
    expect(out).not.toContain(ID);
    expectClean(out);
  });

  test('a refusal that echoes the pair, the Basic header and a token prints none of them, exit 1', async () => {
    const { code, out } = await run({ ...creds, BOG_OAUTH_URL: `${base}/echo` });
    expect(code).toBe(1);
    expect(out).toMatch(/✗ credentials_refused · HTTP 401/);
    expect(out).toContain('[redacted]');
    expectClean(out);
  });

  test('a 2xx without access_token shows field names only', async () => {
    const { code, out } = await run({ ...creds, BOG_OAUTH_URL: `${base}/malformed` });
    expect(code).toBe(1);
    expect(out).toContain('BOG: JSON keys: token, secret_echo');
    expectClean(out);
  });

  test('an override off this machine is refused before any request; no pair and no terminal → usage', async () => {
    const bad = await run({ ...creds, BOG_OAUTH_URL: 'https://example.com/token' });
    expect(bad.code).toBe(2);
    expect(bad.out).toMatch(/this machine/);
    const noTty = await run({ BOG_OAUTH_URL: `${base}/ok` });
    expect(noTty.code).toBe(2);
    expect(noTty.out).toMatch(/Run this in a terminal/);
    expect(hits).toHaveLength(0);
  });

  // ── a real pseudo-terminal: what the owner sees on the Mac ──
  const hasPty = spawnSync('python3', ['-c', 'import pty'], { stdio: 'ignore' }).status === 0;
  const PTY_DRIVER = `
import os, pty, select, sys, time
node, script, ident, secret, mode = sys.argv[1:6]
pid, fd = pty.fork()
if pid == 0:
    os.execve(node, [node, script], {k: v for k, v in os.environ.items() if k in ('PATH', 'BOG_OAUTH_URL')})
out = b''
def until(pat, t=10):
    global out
    end = time.time() + t
    while pat.encode() not in out and time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.2)
        if r:
            try: out += os.read(fd, 4096)
            except OSError: return
until('Client ID: '); os.write(fd, (ident + '\\r').encode())
until('Secret Key: ')
if mode == 'interrupt':
    os.write(fd, secret[:5].encode()); time.sleep(0.2); os.write(fd, b'\\x03')
else:
    os.write(fd, (secret + '\\r').encode())
end = time.time() + 15
while time.time() < end:
    r, _, _ = select.select([fd], [], [], 0.2)
    if r:
        try:
            chunk = os.read(fd, 4096)
        except OSError:
            break
        if not chunk: break
        out += chunk
_, st = os.waitpid(pid, 0)
sys.stdout.write(out.decode('utf-8', 'replace'))
sys.stdout.write('\\n@@EXIT=%d' % (os.WEXITSTATUS(st) if os.WIFEXITED(st) else -1))
`;
  const viaPty = (mode: 'answer' | 'interrupt') =>
    new Promise<{ out: string; code: number }>((resolve) => {
      const child = spawn('python3', ['-c', PTY_DRIVER, process.execPath, SCRIPT, ID, SECRET, mode], {
        env: { PATH: process.env.PATH ?? '', BOG_OAUTH_URL: `${base}/ok` },
      });
      let all = '';
      child.stdout.on('data', (c) => (all += c));
      child.on('close', () => {
        const m = all.match(/@@EXIT=(-?\d+)\s*$/);
        resolve({ out: all.replace(/@@EXIT=-?\d+\s*$/, ''), code: m ? Number(m[1]) : -99 });
      });
    });

  (hasPty ? test : test.skip)('in a terminal: the id is echoed, the secret is not — not even partly — and the pair is accepted', async () => {
    const { out, code } = await viaPty('answer');
    expect(code).toBe(0);
    expect(out).toContain('OPAY Client ID: ');
    expect(out).toContain(ID); // the id is typed visibly
    expect(out).toContain('OPAY Secret Key: ');
    expect(out).toMatch(/✓ ok · HTTP 200/);
    expect(out).not.toContain(SECRET.slice(0, 4));
    expectClean(out);
  }, 30_000);

  (hasPty ? test : test.skip)('Ctrl+C at the secret prompt quits (exit 130) without sending anything or echoing what was typed', async () => {
    const { out, code } = await viaPty('interrupt');
    expect(code).toBe(130);
    expect(out).not.toContain(SECRET.slice(0, 4));
    expect(hits).toHaveLength(0);
  }, 30_000);
});
