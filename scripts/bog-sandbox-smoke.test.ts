/** @jest-environment node */
/**
 * scripts/bog-sandbox-smoke.mjs must never point a sandbox order at production: myavatar.ge and every *.vercel.app
 * Preview write to the Production database. The pure checks are pinned directly; then the script is run for real
 * against a local fake BOG, and the order it sends is inspected byte for byte. Nothing here reaches the network.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

jest.mock('server-only', () => ({}));
// Only isBogOrderId is used; the money module behind settlement is never called.
jest.mock('../lib/billing/wallet-ledger', () => ({}));

import {
  DEFAULT_RETURN_BASE,
  SANDBOX_API_URL,
  SANDBOX_OAUTH_URL,
  isProductionHost,
  newSandboxOrderId,
  sandboxOrderBody,
  sandboxTargets,
} from './bog-sandbox-smoke.mjs';
import { isBogOrderId } from '../lib/billing/bogSettlement';

const SCRIPT = path.join(__dirname, 'bog-sandbox-smoke.mjs');
const SECRET = 'sbx-secret-Zq9"x/+=';

describe('what a sandbox order may point at', () => {
  const sandbox = { BOG_ENV: 'sandbox' } as NodeJS.ProcessEnv;

  test('refuses to run outside BOG_ENV=sandbox', () => {
    expect(() => sandboxTargets({} as NodeJS.ProcessEnv)).toThrow(/BOG_ENV=sandbox/);
    expect(() => sandboxTargets({ BOG_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/BOG_ENV=sandbox/);
  });

  test('by default it talks to the sandbox hosts and points callbacks at a name that never resolves', () => {
    expect(sandboxTargets(sandbox)).toEqual({ oauthUrl: SANDBOX_OAUTH_URL, apiUrl: SANDBOX_API_URL, returnBase: DEFAULT_RETURN_BASE });
    expect(new URL(DEFAULT_RETURN_BASE).hostname.endsWith('.invalid')).toBe(true);
  });

  test.each([
    'https://myavatar.ge',
    'https://www.myavatar.ge',
    'https://MyAvatar.GE.',
    'https://avatar-g-frontend-v3-git-450092-kintsurashviligaga-ops-projects.vercel.app',
    'https://avatar-g-frontend-v3.vercel.app/some/path',
  ])('refuses a return base on a Production-database host: %s', (base) => {
    expect(() => sandboxTargets({ ...sandbox, BOG_SANDBOX_RETURN_BASE: base })).toThrow(/Production database/);
  });

  test('refuses the host the environment names as our site, and plain http off this machine', () => {
    const env = { ...sandbox, NEXT_PUBLIC_SITE_URL: 'https://staging.example.org/' };
    expect(() => sandboxTargets({ ...env, BOG_SANDBOX_RETURN_BASE: 'https://staging.example.org' })).toThrow(/Production database/);
    expect(() => sandboxTargets({ ...sandbox, BOG_SANDBOX_RETURN_BASE: 'http://tunnel.example.org' })).toThrow(/https/);
    expect(sandboxTargets({ ...sandbox, BOG_SANDBOX_RETURN_BASE: 'http://localhost:3000/x' }).returnBase).toBe('http://localhost:3000');
    expect(sandboxTargets({ ...sandbox, BOG_SANDBOX_RETURN_BASE: 'https://abc.ngrok.app' }).returnBase).toBe('https://abc.ngrok.app');
  });

  test('the host overrides are loopback-only, so they can never aim the script at the live BOG API', () => {
    expect(() => sandboxTargets({ ...sandbox, BOG_SANDBOX_API_URL: 'https://api.bog.ge/payments/v1' })).toThrow(/this machine/);
    expect(() => sandboxTargets({ ...sandbox, BOG_SANDBOX_OAUTH_URL: 'https://oauth2.bog.ge/x' })).toThrow(/this machine/);
    expect(sandboxTargets({ ...sandbox, BOG_SANDBOX_API_URL: 'http://127.0.0.1:9/' }).apiUrl).toBe('http://127.0.0.1:9');
  });

  test('a sandbox order id is never one of ours', () => {
    const id = newSandboxOrderId();
    expect(id).toMatch(/^sandbox-smoke-[0-9a-f]+$/);
    expect(isBogOrderId(id)).toBe(false);
  });

  test('the order body re-checks every link it carries', () => {
    const body = sandboxOrderBody(DEFAULT_RETURN_BASE, newSandboxOrderId(), sandbox);
    for (const link of [body.callback_url, body.redirect_urls.success, body.redirect_urls.fail]) {
      expect(isProductionHost(new URL(link).hostname, sandbox)).toBe(false);
    }
    expect(() => sandboxOrderBody('https://myavatar.ge', newSandboxOrderId(), sandbox)).toThrow(/points at production/);
    expect(() => sandboxOrderBody(DEFAULT_RETURN_BASE, 'myavatar-topup-0123456789abcdef', sandbox)).toThrow(/sandbox-smoke-/);
  });
});

describe('the script, run for real against a local fake BOG', () => {
  let server: http.Server;
  let base = '';
  let requests: Array<{ method: string; url: string; body: string }> = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        requests.push({ method: req.method ?? '', url: req.url ?? '', body });
        res.setHeader('content-type', 'application/json');
        if (req.url === '/token') return res.end(JSON.stringify({ access_token: 'tok-sandbox-123', expires_in: 300 }));
        if (req.url === '/echo') {
          // A hostile or buggy answer that echoes the credentials back: verbatim inside JSON (so escaped), and as the
          // raw Basic header.
          const header = String(req.headers.authorization ?? '');
          const pair = Buffer.from(header.replace(/^Basic /, ''), 'base64').toString();
          res.statusCode = 401;
          return res.end(JSON.stringify({ error: 'invalid_client', got: pair, header }));
        }
        if (req.url === '/ecommerce/orders') {
          return res.end(JSON.stringify({ id: 'bog-sbx-1', _links: { redirect: { href: 'https://payment-sandbox.bog.ge/?order_id=bog-sbx-1' } } }));
        }
        res.statusCode = 404;
        res.end('{}');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => {
    requests = [];
  });

  function run(args: string[], env: Record<string, string>): Promise<{ code: number | null; out: string }> {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [SCRIPT, ...args], {
        // A clean environment: no real BOG_* or proxy variables leak in.
        env: { PATH: process.env.PATH ?? '', BOG_SANDBOX_OAUTH_URL: `${base}/token`, BOG_SANDBOX_API_URL: base, ...env },
      });
      let out = '';
      child.stdout.on('data', (c) => (out += c));
      child.stderr.on('data', (c) => (out += c));
      child.on('close', (code) => resolve({ code, out }));
    });
  }
  const creds = { BOG_ENV: 'sandbox', BOG_CLIENT_ID: 'sbx-client-0042', BOG_SECRET_KEY: SECRET };

  test('`order` sends nothing that points at production, even with the live site configured', async () => {
    const { code, out } = await run(['order'], { ...creds, NEXT_PUBLIC_SITE_URL: 'https://myavatar.ge' });
    expect(code).toBe(0);
    const order = requests.find((r) => r.url === '/ecommerce/orders');
    expect(order).toBeDefined();
    const body = JSON.parse(order!.body);
    expect(new URL(body.callback_url).hostname).toBe('bog-sandbox-smoke.invalid');
    expect(new URL(body.redirect_urls.success).hostname).toBe('bog-sandbox-smoke.invalid');
    expect(new URL(body.redirect_urls.fail).hostname).toBe('bog-sandbox-smoke.invalid');
    expect(order!.body).not.toMatch(/myavatar\.ge|vercel\.app/i);
    expect(body.external_order_id).toMatch(/^sandbox-smoke-/);
    expect(isBogOrderId(body.external_order_id)).toBe(false);
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain('tok-sandbox-123');
  });

  test.each([
    ['a Production return base', { BOG_SANDBOX_RETURN_BASE: 'https://myavatar.ge' }],
    ['a Preview return base', { BOG_SANDBOX_RETURN_BASE: 'https://avatar-g-frontend-v3-git-abc-kintsurashviligaga-ops-projects.vercel.app' }],
    ['the live BOG API', { BOG_SANDBOX_API_URL: 'https://api.bog.ge/payments/v1' }],
    ['no BOG_ENV=sandbox', { BOG_ENV: 'production' }],
  ])('refuses %s with exit 2 before a single request', async (_label, extra) => {
    const { code, out } = await run(['order'], { ...creds, ...(extra as Record<string, string>) });
    expect(code).toBe(2);
    expect(requests).toHaveLength(0);
    expect(out).not.toContain(SECRET);
  });

  test('a refused OAuth answer that echoes the credentials prints none of them', async () => {
    const { code, out } = await run(['oauth'], { ...creds, BOG_SANDBOX_OAUTH_URL: `${base}/echo` });
    expect(code).toBe(1);
    expect(out).toMatch(/OAuth refused: HTTP 401/);
    expect(out).toContain('[redacted]');
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain(JSON.stringify(SECRET).slice(1, -1));
    expect(out).not.toContain(Buffer.from(`sbx-client-0042:${SECRET}`).toString('base64'));
  });
});
