/** @jest-environment node */
/**
 * scripts/bog-production-smoke.mjs runs against the live site after a deploy, so what it may send is pinned here:
 * anonymous requests only (no cookie, no authorization, no callback signature), an empty checkout body, and only to
 * myavatar.ge / *.vercel.app. Runs against a local fake site; nothing here reaches the network.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import { CHECKS, parseArgs, runSmoke, smokeBase } from './bog-production-smoke.mjs';

const SCRIPT = path.join(__dirname, 'bog-production-smoke.mjs');

describe('pure parts', () => {
  test('only https on myavatar.ge / *.vercel.app, or http on this machine', () => {
    expect(smokeBase()).toBe('https://myavatar.ge');
    expect(smokeBase('https://myavatar.ge/ka?x=1')).toBe('https://myavatar.ge');
    expect(smokeBase('https://avatar-g-frontend-v3-abc123-team.vercel.app')).toBe('https://avatar-g-frontend-v3-abc123-team.vercel.app');
    expect(smokeBase('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
    for (const bad of ['http://myavatar.ge', 'https://myavatar.ge.attacker.net', 'https://example.com', 'https://a.b.vercel.app', 'https://u:p@myavatar.ge', 'http://10.0.0.5', 'nope']) {
      expect(() => smokeBase(bad)).toThrow();
    }
  });

  test('arguments: base and --expect-bog, nothing else', () => {
    expect(parseArgs([])).toEqual({ base: 'https://myavatar.ge', expectBog: false });
    expect(parseArgs(['https://www.myavatar.ge', '--expect-bog=true'])).toEqual({ base: 'https://www.myavatar.ge', expectBog: true });
    expect(() => parseArgs(['--expect-bog=maybe'])).toThrow(/true or false/);
    expect(() => parseArgs(['--write'])).toThrow(/unknown option/);
  });

  test('the checkout check sends an empty body; no check can carry headers of its own', () => {
    expect(CHECKS.find((c) => c.path === '/api/billing/bog/checkout')?.body).toBe('{}');
    for (const c of CHECKS) for (const k of Object.keys(c)) expect(['name', 'method', 'path', 'body', 'expect', 'verify']).toContain(k);
  });
});

describe('against a local fake site', () => {
  let server: http.Server;
  let base = '';
  let hits: Array<{ method: string; url: string; headers: http.IncomingHttpHeaders; body: string }> = [];
  // What Production answers once PR #59 is live with BOG_CHECKOUT_MODE=admin; individual tests override entries.
  let answers: Record<string, [number, string]> = {};
  const healthy = (): Record<string, [number, string]> => ({
    'GET /ka': [200, '<html>ka</html>'],
    'GET /en': [200, '<html>en</html>'],
    'GET /ru': [200, '<html>ru</html>'],
    'GET /api/checkout/capabilities': [200, '{"stripe":true,"bog":false}'],
    'POST /api/billing/bog/checkout': [401, '{"error":"Unauthorized","error_code":"AUTH_REQUIRED"}'],
    'POST /api/billing/bog/webhook': [401, '{"error":"unauthorized_callback","reason":"signature"}'],
    'GET /api/billing/bog/orders/00000000-0000-0000-0000-000000000000': [401, '{"error":"Unauthorized"}'],
    'GET /api/admin/billing/bog': [403, '{"error":"forbidden"}'],
    'GET /api/cron/bog-billing': [403, '{"error":"Forbidden"}'],
  });

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        hits.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
        const [status, text] = answers[`${req.method} ${req.url}`] ?? [404, '{}'];
        res.statusCode = status;
        res.setHeader('content-type', text.startsWith('<') ? 'text/html; charset=utf-8' : 'application/json');
        res.end(text);
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => {
    hits = [];
    answers = healthy();
  });

  test('a healthy admin-mode release passes every check, and every request is anonymous', async () => {
    const results = await runSmoke(base, { expectBog: false });
    expect(results.filter((r) => !r.ok)).toEqual([]);
    expect(results).toHaveLength(CHECKS.length);
    expect(hits).toHaveLength(CHECKS.length);
    for (const h of hits) {
      expect(h.headers.cookie).toBeUndefined();
      expect(h.headers.authorization).toBeUndefined();
      expect(h.headers['callback-signature']).toBeUndefined();
      expect(h.headers['x-cron-token']).toBeUndefined();
    }
    expect(hits.filter((h) => h.method === 'POST').map((h) => h.body)).toEqual(['{}', '{}']);
  });

  test('BOG visible to an anonymous visitor fails; so does a deployment without BOG credentials', async () => {
    answers['GET /api/checkout/capabilities'] = [200, '{"stripe":true,"bog":true}'];
    answers['POST /api/billing/bog/webhook'] = [503, '{"error":"BOG gateway unconfigured","error_code":"BOG_UNCONFIGURED"}'];
    const results = await runSmoke(base, { expectBog: false });
    const failed = results.filter((r) => !r.ok);
    expect(failed.map((r) => r.path)).toEqual(['/api/checkout/capabilities', '/api/billing/bog/webhook']);
    expect(failed[0].problem).toBe('bog is true, expected false');
    expect(failed[1].problem).toBe('HTTP 503, expected 401');
    expect(failed[1].detail).toContain('BOG_UNCONFIGURED');
  });

  test('--expect-bog=true is for after BOG goes public', async () => {
    const results = await runSmoke(base, { expectBog: true });
    expect(results.find((r) => r.path === '/api/checkout/capabilities')?.problem).toBe('bog is false, expected true');
  });

  function run(args: string[]): Promise<{ code: number | null; out: string }> {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [SCRIPT, ...args], { env: { PATH: process.env.PATH ?? '' }, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      child.stdout.on('data', (c) => (out += c));
      child.stderr.on('data', (c) => (out += c));
      child.on('close', (code) => resolve({ code, out }));
    });
  }

  test('the script itself: exit 0 when healthy, 1 on a failed check, 2 on a refused base (no request sent)', async () => {
    const ok = await run([base]);
    expect(ok.code).toBe(0);
    expect(ok.out).toContain(`all ${CHECKS.length} checks passed`);
    expect(ok.out).toMatch(/PASS {2}GET {2}\/api\/checkout\/capabilities {2}200 {2}\{"stripe":true,"bog":false\}/);
    expect(ok.out).toMatch(/PASS {2}GET {2}\/ka {2}200 {2}text\/html \(15 bytes\)/);

    answers['GET /api/cron/bog-billing'] = [200, '{"ok":true}'];
    const bad = await run([base]);
    expect(bad.code).toBe(1);
    expect(bad.out).toMatch(/FAIL {2}GET {2}\/api\/cron\/bog-billing {2}200 {2}HTTP 200, expected 401 or 403/);

    hits = [];
    const refused = await run(['https://example.com']);
    expect(refused.code).toBe(2);
    expect(refused.out).toMatch(/refused base/);
    expect(hits).toHaveLength(0);
  });
});
