/** @jest-environment node */
import { NextRequest } from 'next/server';
import type { RateLimitConfig } from './rate-limit';

// ⚠️ rate-limit.ts starts its in-memory cleanup setInterval (never unref'd) the moment it is imported,
// and that live handle kept Jest running after the suite had passed ("Jest did not exit one second
// after the test run has completed"), which looks exactly like a hung test. Loading the module on the
// fake clock puts that interval on the fake clock, and it is discarded when the real one comes back.
jest.useFakeTimers();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { checkRateLimit, checkRateLimitByKey, refundRateLimitByKey } = require('./rate-limit') as typeof import('./rate-limit');
jest.useRealTimers();

/**
 * These drive the REAL limiter (in-memory path — Upstash env is cleared) with a 1-request window, so
 * "is limited on the second call" is the observable proof that two requests landed in the SAME bucket,
 * and "allowed on the second call" proves they got DIFFERENT buckets. That is exactly the property an
 * attacker exploits: a header that mints a fresh bucket per request is a limit bypass.
 */

const ENV_KEYS = ['TRUST_CF_CONNECTING_IP', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

// The in-memory store is a module singleton — a fresh prefix per test keeps buckets from leaking across.
let n = 0;
function oneShot(): RateLimitConfig {
  n += 1;
  return { maxRequests: 1, windowMs: 60_000, keyPrefix: `rl:test:${n}` };
}

function req(headers: Record<string, string>): NextRequest {
  return new NextRequest('https://myavatar.ge/api/ai/chat', { method: 'POST', headers });
}

async function limited(r: NextRequest, cfg: RateLimitConfig, identity?: string): Promise<boolean> {
  return (await checkRateLimit(r, cfg, identity)) !== null;
}

describe('a spoofed cf-connecting-ip (not behind Cloudflare)', () => {
  it('does not buy a fresh bucket — the second request from the same Vercel IP is still refused', async () => {
    const cfg = oneShot();
    expect(await limited(req({ 'x-vercel-forwarded-for': '203.0.113.7', 'cf-connecting-ip': '198.51.100.1' }), cfg)).toBe(false);
    expect(await limited(req({ 'x-vercel-forwarded-for': '203.0.113.7', 'cf-connecting-ip': '198.51.100.2' }), cfg)).toBe(true);
  });

  it('is ignored even when it is the ONLY header (no fresh bucket per random value)', async () => {
    const cfg = oneShot();
    expect(await limited(req({ 'cf-connecting-ip': '198.51.100.1' }), cfg)).toBe(false);
    expect(await limited(req({ 'cf-connecting-ip': '198.51.100.2' }), cfg)).toBe(true);
  });

  it('a falsy flag value keeps it ignored', async () => {
    process.env.TRUST_CF_CONNECTING_IP = '0';
    const cfg = oneShot();
    expect(await limited(req({ 'x-vercel-forwarded-for': '203.0.113.7', 'cf-connecting-ip': '198.51.100.1' }), cfg)).toBe(false);
    expect(await limited(req({ 'x-vercel-forwarded-for': '203.0.113.7', 'cf-connecting-ip': '198.51.100.2' }), cfg)).toBe(true);
  });
});

describe('the Vercel edge header wins', () => {
  it('over x-real-ip and x-forwarded-for — changing those does not change the bucket', async () => {
    const cfg = oneShot();
    expect(await limited(req({ 'x-vercel-forwarded-for': '203.0.113.7', 'x-forwarded-for': '10.0.0.1' }), cfg)).toBe(false);
    expect(
      await limited(req({ 'x-vercel-forwarded-for': '203.0.113.7', 'x-real-ip': '10.0.0.2', 'x-forwarded-for': '10.0.0.3' }), cfg),
    ).toBe(true);
  });

  it('two different real clients still get their own buckets', async () => {
    const cfg = oneShot();
    expect(await limited(req({ 'x-vercel-forwarded-for': '203.0.113.7' }), cfg)).toBe(false);
    expect(await limited(req({ 'x-vercel-forwarded-for': '203.0.113.8' }), cfg)).toBe(false);
  });

  it('uses only the first entry if the header ever carries a list', async () => {
    const cfg = oneShot();
    expect(await limited(req({ 'x-vercel-forwarded-for': '203.0.113.7, 10.0.0.1' }), cfg)).toBe(false);
    expect(await limited(req({ 'x-vercel-forwarded-for': ' 203.0.113.7 , 10.0.0.9' }), cfg)).toBe(true);
  });
});

describe('fallbacks when the Vercel header is absent', () => {
  it('x-real-ip is trusted before x-forwarded-for', async () => {
    const cfg = oneShot();
    expect(await limited(req({ 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '10.0.0.1' }), cfg)).toBe(false);
    expect(await limited(req({ 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '10.0.0.2' }), cfg)).toBe(true);
  });

  it('then the FIRST x-forwarded-for entry (later proxy hops do not split the bucket)', async () => {
    const cfg = oneShot();
    expect(await limited(req({ 'x-forwarded-for': '203.0.113.10, 10.0.0.1' }), cfg)).toBe(false);
    expect(await limited(req({ 'x-forwarded-for': '203.0.113.10, 10.0.0.2, 10.0.0.3' }), cfg)).toBe(true);
  });

  it('a blank Vercel header falls through instead of keying everyone on ""', async () => {
    const cfg = oneShot();
    expect(await limited(req({ 'x-vercel-forwarded-for': '  ', 'x-real-ip': '203.0.113.11' }), cfg)).toBe(false);
    expect(await limited(req({ 'x-vercel-forwarded-for': '  ', 'x-real-ip': '203.0.113.12' }), cfg)).toBe(false);
  });
});

describe('TRUST_CF_CONNECTING_IP on (really behind Cloudflare)', () => {
  it.each([['1'], ['true'], ['on']])('flag=%p restores cf-connecting-ip as the key, ahead of the Vercel header', async (flag) => {
    process.env.TRUST_CF_CONNECTING_IP = flag;
    const cfg = oneShot();
    // Behind Cloudflare every visitor shares Cloudflare's egress IP in the Vercel header — the real
    // client is cf-connecting-ip, so two visitors must NOT share one bucket…
    expect(await limited(req({ 'x-vercel-forwarded-for': '172.64.0.1', 'cf-connecting-ip': '203.0.113.20' }), cfg)).toBe(false);
    expect(await limited(req({ 'x-vercel-forwarded-for': '172.64.0.1', 'cf-connecting-ip': '203.0.113.21' }), cfg)).toBe(false);
    // …while the same visitor through a different Cloudflare edge is still the same bucket.
    expect(await limited(req({ 'x-vercel-forwarded-for': '172.64.0.2', 'cf-connecting-ip': '203.0.113.20' }), cfg)).toBe(true);
  });

  it('falls back to the Vercel header when cf-connecting-ip is missing', async () => {
    process.env.TRUST_CF_CONNECTING_IP = '1';
    const cfg = oneShot();
    expect(await limited(req({ 'x-vercel-forwarded-for': '203.0.113.30' }), cfg)).toBe(false);
    expect(await limited(req({ 'x-vercel-forwarded-for': '203.0.113.30', 'x-real-ip': '10.0.0.1' }), cfg)).toBe(true);
  });
});

describe('the rest of the limiter is unchanged', () => {
  it('an identity still scopes the bucket to one person on a shared IP', async () => {
    const cfg = oneShot();
    const h = { 'x-vercel-forwarded-for': '203.0.113.40' };
    expect(await limited(req(h), cfg, 'a@example.com')).toBe(false);
    expect(await limited(req(h), cfg, 'b@example.com')).toBe(false);
    expect(await limited(req(h), cfg, ' A@Example.com ')).toBe(true);
  });

  it('a refusal is still a 429 with Retry-After', async () => {
    const cfg = oneShot();
    const h = { 'x-vercel-forwarded-for': '203.0.113.50' };
    expect(await checkRateLimit(req(h), cfg)).toBeNull();
    const res = await checkRateLimit(req(h), cfg);
    expect(res?.status).toBe(429);
    expect(res?.headers.get('Retry-After')).toMatch(/^\d+$/);
    expect((await res!.json()).code).toBe('RATE_LIMIT_EXCEEDED');
  });
});

describe('refundRateLimitByKey (in-memory path — no Upstash env)', () => {
  /** A fresh bucket of `max` per test, keyed by an explicit id. */
  function cap(max: number): RateLimitConfig {
    n += 1;
    return { maxRequests: max, windowMs: 60_000, keyPrefix: `rl:refund:${n}` };
  }
  const allowed = async (id: string, cfg: RateLimitConfig) => (await checkRateLimitByKey(id, cfg)) === null;

  it('gives one request back: the call that would have been refused is allowed, and only that one', async () => {
    const cfg = cap(3);
    for (let i = 0; i < 3; i++) expect(await allowed('user-1', cfg)).toBe(true);
    expect(await allowed('user-1', cfg)).toBe(false); // the 4th is over the cap (and counted)

    // Two refunds: one for the refused 4th, one that gives back a real slot.
    await refundRateLimitByKey('user-1', cfg);
    await refundRateLimitByKey('user-1', cfg);
    expect(await allowed('user-1', cfg)).toBe(true);
    expect(await allowed('user-1', cfg)).toBe(false);
  });

  it('after N allowed calls a refund makes the (N+1)th allowed; the one after is refused again', async () => {
    const cfg = cap(3);
    for (let i = 0; i < 3; i++) expect(await allowed('user-n', cfg)).toBe(true);
    await refundRateLimitByKey('user-n', cfg);
    expect(await allowed('user-n', cfg)).toBe(true);
    expect(await allowed('user-n', cfg)).toBe(false);
  });

  it('a refund right after an up-front charge leaves the allowance as it was', async () => {
    const cfg = cap(2);
    expect(await allowed('pro-user', cfg)).toBe(true);
    await refundRateLimitByKey('pro-user', cfg); // Pro never answered that turn
    expect(await allowed('pro-user', cfg)).toBe(true);
    expect(await allowed('pro-user', cfg)).toBe(true);
    expect(await allowed('pro-user', cfg)).toBe(false);
  });

  it('never goes below zero: extra refunds do not bank requests for later', async () => {
    const cfg = cap(1);
    expect(await allowed('u', cfg)).toBe(true);
    for (let i = 0; i < 5; i++) await refundRateLimitByKey('u', cfg);
    expect(await allowed('u', cfg)).toBe(true);
    expect(await allowed('u', cfg)).toBe(false);
  });

  it('is a no-op on an unknown key: it creates no bucket and does not throw', async () => {
    const cfg = cap(1);
    await expect(refundRateLimitByKey('never-seen', cfg)).resolves.toBeUndefined();
    expect(await allowed('never-seen', cfg)).toBe(true);
    expect(await allowed('never-seen', cfg)).toBe(false);
  });

  it('only touches its own key (same prefix, another id)', async () => {
    const cfg = cap(1);
    expect(await allowed('a', cfg)).toBe(true);
    expect(await allowed('b', cfg)).toBe(true);
    await refundRateLimitByKey('a', cfg);
    expect(await allowed('a', cfg)).toBe(true);
    expect(await allowed('b', cfg)).toBe(false);
  });

  it('uses the same default prefix as checkRateLimitByKey when the config has none', async () => {
    const id = `no-prefix-${Date.now()}-${Math.random()}`;
    const cfg: RateLimitConfig = { maxRequests: 1, windowMs: 60_000 };
    expect(await allowed(id, cfg)).toBe(true);
    expect(await allowed(id, cfg)).toBe(false);
    await refundRateLimitByKey(id, cfg);
    await refundRateLimitByKey(id, cfg);
    expect(await allowed(id, cfg)).toBe(true);
  });

  it('leaves an expired window alone (the next check opens a fresh one)', async () => {
    const cfg = cap(1);
    const t0 = Date.now();
    const now = jest.spyOn(Date, 'now').mockReturnValue(t0);
    try {
      expect(await allowed('late', cfg)).toBe(true);
      now.mockReturnValue(t0 + cfg.windowMs + 1);
      await refundRateLimitByKey('late', cfg); // window is over: nothing to give back
      expect(await allowed('late', cfg)).toBe(true); // fresh window
      expect(await allowed('late', cfg)).toBe(false);
    } finally {
      now.mockRestore();
    }
  });
});

describe('refundRateLimitByKey (Upstash path, fetch mocked)', () => {
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as unknown as Response;
  const commands = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));

  it('DECRs the same key checkRateLimitByKey counts, and stops there when the counter stays ≥ 0', async () => {
    fetchMock.mockResolvedValueOnce(json([{ result: 2 }]));
    await refundRateLimitByKey('user-7', { maxRequests: 5, windowMs: 60_000, keyPrefix: 'chat:pro' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('https://redis.example/pipeline');
    expect(commands()).toEqual([[['DECR', 'chat:pro:user-7']]]);
  });

  it('deletes a key the DECR took below zero (it had expired), so no negative never-expiring counter is left', async () => {
    fetchMock.mockResolvedValueOnce(json([{ result: -1 }])).mockResolvedValueOnce(json([{ result: 1 }]));
    await refundRateLimitByKey('user-8', { maxRequests: 5, windowMs: 60_000 });
    expect(commands()).toEqual([[['DECR', 'rl:key:user-8']], [['DEL', 'rl:key:user-8']]]);
  });

  it('never throws when Redis fails (a network error or a non-OK response)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(refundRateLimitByKey('user-9', { maxRequests: 1, windowMs: 60_000 })).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(json({ error: 'nope' }, false));
    await expect(refundRateLimitByKey('user-9', { maxRequests: 1, windowMs: 60_000 })).resolves.toBeUndefined();
  });
});
