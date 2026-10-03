/**
 * lib/platform/upstash.ts — the one way this app builds an Upstash Redis client.
 *
 * ⚠️ FAIL FAST. @upstash/redis retries a failed request 5 times with an exponential backoff (50 ms · eⁿ): a call to an
 * unreachable host gives up only after ~4.4 s. On 2026-10-03 the production database's host went NXDOMAIN
 * (`getaddrinfo ENOTFOUND …upstash.io`) and every Redis call in a request — the image route's mutex and breaker, the
 * music route's lock, the film status store, the studio semaphore — paid those seconds before its fail-open path ran.
 * Every caller here is fail-open (a lost lock or counter, never lost money), so one quick retry is enough.
 */
import { Redis } from '@upstash/redis';

export const UPSTASH_RETRY = { retries: 1, backoff: () => 100 } as const;

export function createUpstashRedis(url: string, token: string): Redis {
  return new Redis({ url, token, retry: UPSTASH_RETRY });
}
