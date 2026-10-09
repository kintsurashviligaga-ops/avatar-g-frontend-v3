/** @jest-environment node */
/**
 * lib/platform/upstash — every Upstash client fails fast. The library's default (5 retries, 50 ms · eⁿ) made each call to
 * the dead production host (NXDOMAIN, 2026-10-03) wait ~4.4 s before the caller's fail-open path ran.
 */
jest.mock('@upstash/redis', () => ({ Redis: jest.fn().mockImplementation((cfg: unknown) => ({ cfg })) }));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Redis } from '@upstash/redis';
import { UPSTASH_RETRY, createUpstashRedis } from './upstash';

test('the client is built with one quick retry, not the library default', () => {
  createUpstashRedis('https://example.upstash.io', 'token');
  expect(Redis).toHaveBeenCalledWith({ url: 'https://example.upstash.io', token: 'token', retry: UPSTASH_RETRY });
  expect(UPSTASH_RETRY.retries).toBeLessThanOrEqual(1);
  expect(UPSTASH_RETRY.backoff()).toBeLessThanOrEqual(200);
});

test('no module builds its own client with the slow default', () => {
  const files = [
    'lib/platform/redis.ts', 'lib/platform/cache.ts', 'lib/chat/filmStatusStore.ts', 'lib/orchestrator/idempotency.ts',
    'lib/orchestrator/rate-limit.ts', 'lib/orchestrator/sse-hub.ts', 'app/api/health/route.ts',
  ];
  for (const f of files) {
    const src = readFileSync(join(process.cwd(), f), 'utf8');
    expect({ f, raw: /new Redis\(/.test(src) }).toEqual({ f, raw: false });
    expect(src).toContain('createUpstashRedis(');
  }
});
