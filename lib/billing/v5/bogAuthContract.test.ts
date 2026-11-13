/** @jest-environment node */
/**
 * v5.1 Phase 5: the LIVE BOG login (lib/billing/bogClient, untouched) held to the bank's authentication document that
 * GG forwarded on 2026-11-13 ("რა დამჭირდება გადახდის API-ს გამოსაყენებლად"). Test-only: this file changes no
 * production code. Every call goes through an injected fetch; no network, no real credentials.
 *
 * What the document says, and the test that holds the code to it:
 *   1. POST https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token          → "endpoint and method"
 *   2. Authorization: "Basic " + base64("<client_id>:<secret_key>")                      → "Basic header"
 *   3. Content-Type: application/x-www-form-urlencoded                                   → "form body"
 *   4. Body grant_type=client_credentials                                                → "form body"
 *   5. Answer { access_token, token_type: "Bearer", expires_in } — expires_in in seconds,
 *      though the document's own example shows an epoch-milliseconds value               → "expires_in readings"
 *   6. The token is the auth for every later call                                        → "token cache"
 *   7. client_secret must never be shared or published                                   → "no credentials in the repo"
 */
jest.mock('server-only', () => ({}));

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bogConfig, getBogAccessToken, resetBogTokenCache, tokenLifetimeMs, type BogConfig } from '../bogClient';

const DOC_TOKEN_URL = 'https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token';
// Fake test values, not credentials.
const ENV = { BOG_CLIENT_ID: 'test-client', BOG_SECRET_KEY: 'test-secret' } as unknown as NodeJS.ProcessEnv;
const cfg = bogConfig(ENV) as BogConfig;

interface Call { url: string; init: RequestInit }
function fakeFetch(answers: Array<{ status: number; body?: unknown }>) {
  const calls: Call[] = [];
  const fn = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const a = answers.shift() ?? { status: 500 };
    return new Response(a.body === undefined ? '' : JSON.stringify(a.body), { status: a.status, headers: { 'content-type': 'application/json' } });
  };
  return { fetch: fn as unknown as typeof fetch, calls };
}
const header = (c: Call, k: string) => (c.init.headers as Record<string, string>)[k];
const ok = (token: string, expires_in: number) => ({ status: 200, body: { access_token: token, token_type: 'Bearer', expires_in } });

beforeEach(() => resetBogTokenCache());

describe('BOG authentication document vs the live client', () => {
  test('endpoint and method: POST to the documented production token URL (BOG_ENV unset = production)', async () => {
    const { fetch, calls } = fakeFetch([ok('t', 300)]);
    await getBogAccessToken(cfg, { fetch });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(DOC_TOKEN_URL);
    expect(calls[0].init.method).toBe('POST');
  });

  test('Basic header: "Basic " + base64("<client_id>:<secret_key>"), taken from env only', async () => {
    const { fetch, calls } = fakeFetch([ok('t', 300)]);
    await getBogAccessToken(cfg, { fetch });
    const auth = header(calls[0], 'Authorization');
    expect(auth).toBe(`Basic ${Buffer.from('test-client:test-secret').toString('base64')}`);
    expect(Buffer.from(auth.slice('Basic '.length), 'base64').toString()).toBe('test-client:test-secret');
  });

  test('form body: application/x-www-form-urlencoded with grant_type=client_credentials', async () => {
    const { fetch, calls } = fakeFetch([ok('t', 300)]);
    await getBogAccessToken(cfg, { fetch });
    expect(header(calls[0], 'Content-Type')).toBe('application/x-www-form-urlencoded');
    expect(calls[0].init.body).toBe('grant_type=client_credentials');
  });

  test('the returned access_token is what the client hands on as the Bearer token', async () => {
    const { fetch } = fakeFetch([ok('jwt-abc', 300)]);
    expect(await getBogAccessToken(cfg, { fetch })).toBe('jwt-abc');
  });

  test('no credentials, no call: missing client_id or secret gives no config at all', () => {
    expect(bogConfig({ BOG_CLIENT_ID: 'x' } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(bogConfig({ BOG_SECRET_KEY: 'y' } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe('expires_in readings', () => {
  const now = 1_763_000_000_000; // a fixed clock (ms)

  test('seconds, as the document describes: 300 s is reused for 4 minutes (refreshed a minute early)', () => {
    expect(tokenLifetimeMs(300, now)).toBe(240_000);
  });

  test('the document\'s own example value (epoch milliseconds) is read as an absolute expiry, never as 1.6 trillion seconds', () => {
    const exampleLike = now + 10 * 60_000; // same shape as the doc's 1634719923245
    expect(tokenLifetimeMs(exampleLike, now)).toBe(9 * 60_000);
    // the literal example lies in the past today: the client must not trust it beyond the 30 s floor
    expect(tokenLifetimeMs(1634719923245, now)).toBe(30_000);
  });

  test('never trusted beyond an hour; junk or missing expires_in gives a short safe default', () => {
    expect(tokenLifetimeMs(86_400, now)).toBe(60 * 60_000);
    expect(tokenLifetimeMs(undefined, now)).toBe(4 * 60_000);
    expect(tokenLifetimeMs('abc', now)).toBe(4 * 60_000);
  });
});

describe('token cache (access_token + expires_in)', () => {
  test('one login is reused until it nears expiry, then exactly one new login', async () => {
    let t = 1_763_000_000_000;
    const { fetch, calls } = fakeFetch([ok('tok-1', 300), ok('tok-2', 300)]);
    const deps = { fetch, now: () => t };
    expect(await getBogAccessToken(cfg, deps)).toBe('tok-1');
    t += 60_000;
    expect(await getBogAccessToken(cfg, deps)).toBe('tok-1');
    t += 170_000; // 3 m 50 s after login: still inside the 4-minute window
    expect(await getBogAccessToken(cfg, deps)).toBe('tok-1');
    expect(calls).toHaveLength(1);
    t += 20_000; // 4 m 10 s: past the window
    expect(await getBogAccessToken(cfg, deps)).toBe('tok-2');
    expect(calls).toHaveLength(2);
  });

  test('a forced refresh (after a 401 on a later call) logs in again even inside the window', async () => {
    const { fetch, calls } = fakeFetch([ok('tok-1', 300), ok('tok-2', 300)]);
    await getBogAccessToken(cfg, { fetch });
    expect(await getBogAccessToken(cfg, { fetch }, true)).toBe('tok-2');
    expect(calls).toHaveLength(2);
  });

  test('a refused login is not cached and gives no token (fail closed)', async () => {
    const { fetch, calls } = fakeFetch([{ status: 401, body: { error: 'invalid_client' } }, ok('tok-1', 300)]);
    expect(await getBogAccessToken(cfg, { fetch })).toBeNull();
    expect(await getBogAccessToken(cfg, { fetch })).toBe('tok-1');
    expect(calls).toHaveLength(2);
  });

  test('an answer without access_token gives no token', async () => {
    const { fetch } = fakeFetch([{ status: 200, body: { token_type: 'Bearer', expires_in: 300 } }]);
    expect(await getBogAccessToken(cfg, { fetch })).toBeNull();
  });

  test('sandbox and production tokens never share a cache entry', async () => {
    const sandbox = bogConfig({ ...ENV, BOG_ENV: 'sandbox' } as unknown as NodeJS.ProcessEnv) as BogConfig;
    const { fetch, calls } = fakeFetch([ok('prod', 300), ok('sbx', 300)]);
    expect(await getBogAccessToken(cfg, { fetch })).toBe('prod');
    expect(await getBogAccessToken(sandbox, { fetch })).toBe('sbx');
    expect(calls.map((c) => c.url)).toEqual([DOC_TOKEN_URL, 'https://oauth2-sandbox.bog.ge/auth/realms/bog/protocol/openid-connect/token']);
  });
});

describe('no credentials in the repo', () => {
  test('the client reads client_id and secret only from env (BOG_CLIENT_ID / BOG_SECRET_KEY)', () => {
    const src = readFileSync(join(__dirname, '..', 'bogClient.ts'), 'utf8');
    expect(src).toMatch(/env\.BOG_CLIENT_ID/);
    expect(src).toMatch(/env\.BOG_SECRET_KEY/);
    expect(src).not.toMatch(/Basic [A-Za-z0-9+/]{16,}={0,2}/); // no baked-in Basic header
  });

  test('no tracked file holds a BOG Basic credential or a client_secret value', () => {
    let files: string[] = [];
    try {
      files = execFileSync('git', ['grep', '-l', '-I', '-E', 'Basic [A-Za-z0-9+/]{24,}={0,2}|BOG_SECRET_KEY\\s*=\\s*["\']?[A-Za-z0-9]{16,}'], { encoding: 'utf8' })
        .split('\n').filter(Boolean);
    } catch { files = []; } // git grep exits 1 when nothing matches
    // this test file only names the pattern; nothing else may match
    expect(files.filter((f) => !f.endsWith('bogAuthContract.test.ts'))).toEqual([]);
  });
});
