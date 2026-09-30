/** @jest-environment node */
import { NextRequest } from 'next/server';
import type { RateLimitConfig } from './rate-limit';

// ⚠️ rate-limit.ts starts its in-memory cleanup setInterval (never unref'd) the moment it is imported,
// and that live handle kept Jest running after the suite had passed ("Jest did not exit one second
// after the test run has completed"), which looks exactly like a hung test. Loading the module on the
// fake clock puts that interval on the fake clock, and it is discarded when the real one comes back.
jest.useFakeTimers();
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { checkRateLimit } = require('./rate-limit') as typeof import('./rate-limit');
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
