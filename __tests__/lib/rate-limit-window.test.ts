/** @jest-environment node */

import { checkSlidingWindow } from '@/lib/platform/rate-limit';

describe('Sliding window rate limiting', () => {
  test('denies requests after limit is exceeded', async () => {
    const key = `user-${Date.now()}`;

    const first = await checkSlidingWindow({
      namespace: 'test-rate',
      key,
      limit: 2,
      windowSeconds: 60,
    });

    const second = await checkSlidingWindow({
      namespace: 'test-rate',
      key,
      limit: 2,
      windowSeconds: 60,
    });

    const third = await checkSlidingWindow({
      namespace: 'test-rate',
      key,
      limit: 2,
      windowSeconds: 60,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
  });
});
