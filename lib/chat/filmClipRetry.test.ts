/** @jest-environment node */
import {
  MAX_CLIP_DISPATCH_ATTEMPTS,
  CLIP_DISPATCH_CONCURRENCY,
  CLIP_DISPATCH_JITTER_MS,
  CLIP_RETRY_BASE_MS,
  CLIP_RETRY_JITTER_MS,
  CLIP_RETRY_ORDINAL_SPREAD_MS,
  clipDispatchJitterMs,
  clipRetryBackoffMs,
  mapWithConcurrency,
} from './filmClipRetry';

describe('clipDispatchJitterMs — de-syncs a wave of concurrent dispatches', () => {
  test('stays within [0, CLIP_DISPATCH_JITTER_MS]', () => {
    expect(clipDispatchJitterMs(() => 0)).toBe(0);
    expect(clipDispatchJitterMs(() => 1)).toBe(CLIP_DISPATCH_JITTER_MS);
    expect(clipDispatchJitterMs(() => 0.5)).toBe(Math.round(CLIP_DISPATCH_JITTER_MS / 2));
  });

  test('a misbehaving rand() can never go negative or runaway', () => {
    expect(clipDispatchJitterMs(() => -9)).toBe(0);
    expect(clipDispatchJitterMs(() => 99)).toBe(CLIP_DISPATCH_JITTER_MS);
    expect(clipDispatchJitterMs(() => Number.NaN)).toBe(0);
  });
});

describe('clipRetryBackoffMs — spaced, jittered, exponential retry windows', () => {
  test('the first attempt never waits (back-off only applies from attempt 2)', () => {
    expect(clipRetryBackoffMs(1, 1, () => 0)).toBe(0);
    expect(clipRetryBackoffMs(1, 5, () => 1)).toBe(0);
  });

  test('grows exponentially with the retry number (zero jitter, ordinal 1)', () => {
    const zero = () => 0;
    expect(clipRetryBackoffMs(2, 1, zero)).toBe(CLIP_RETRY_BASE_MS); // 800
    expect(clipRetryBackoffMs(3, 1, zero)).toBe(CLIP_RETRY_BASE_MS * 2); // 1600
    expect(clipRetryBackoffMs(4, 1, zero)).toBe(CLIP_RETRY_BASE_MS * 4); // 3200
  });

  test('jitter adds 0..CLIP_RETRY_JITTER_MS on top of the base window', () => {
    expect(clipRetryBackoffMs(2, 1, () => 0)).toBe(CLIP_RETRY_BASE_MS);
    expect(clipRetryBackoffMs(2, 1, () => 1)).toBe(CLIP_RETRY_BASE_MS + CLIP_RETRY_JITTER_MS);
    expect(clipRetryBackoffMs(2, 1, () => 0.5)).toBe(CLIP_RETRY_BASE_MS + CLIP_RETRY_JITTER_MS / 2);
  });

  test('later ordinals back off slightly more so concurrent retries de-collide', () => {
    const zero = () => 0;
    const c1 = clipRetryBackoffMs(2, 1, zero);
    const c5 = clipRetryBackoffMs(2, 5, zero);
    expect(c5 - c1).toBe(4 * CLIP_RETRY_ORDINAL_SPREAD_MS);
    expect(c5).toBeGreaterThan(c1);
  });

  test('a misbehaving rand() can never produce a negative or runaway delay', () => {
    expect(clipRetryBackoffMs(2, 1, () => -5)).toBe(CLIP_RETRY_BASE_MS); // clamped to 0 jitter
    expect(clipRetryBackoffMs(2, 1, () => 99)).toBe(CLIP_RETRY_BASE_MS + CLIP_RETRY_JITTER_MS); // clamped to 1
    expect(clipRetryBackoffMs(2, 1, () => Number.NaN)).toBe(CLIP_RETRY_BASE_MS);
  });

  test('the full attempt budget is recoverable yet bounded under the gateway limit', () => {
    let total = 0;
    for (let attempt = 1; attempt <= MAX_CLIP_DISPATCH_ATTEMPTS; attempt++) {
      total += clipRetryBackoffMs(attempt, 5, () => 1);
    }
    expect(MAX_CLIP_DISPATCH_ATTEMPTS).toBe(4);
    // PHASE 61 — the throttle-era 11s base is gone. The retry budget must still
    // ride out a transient create failure (a few seconds) but stay far under the
    // 300s gateway limit so a parallel fan-out never 504s.
    expect(total).toBeGreaterThanOrEqual(5_000);
    expect(total).toBeLessThanOrEqual(60_000);
  });
});

describe('mapWithConcurrency — caps the dispatch burst, preserves order', () => {
  test('returns results in input order regardless of completion order', async () => {
    const out = await mapWithConcurrency([10, 20, 30, 40, 50], CLIP_DISPATCH_CONCURRENCY, async (n) => {
      // Reverse the settle order: bigger numbers resolve first.
      await new Promise((r) => setTimeout(r, 60 - n));
      return n * 2;
    });
    expect(out).toEqual([20, 40, 60, 80, 100]);
  });

  test('never exceeds the concurrency limit of in-flight calls', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return null;
    });
    expect(peak).toBeLessThanOrEqual(2);
    // PHASE 61 — default fans all 5 clips out in one wave (throttle lifted).
    expect(CLIP_DISPATCH_CONCURRENCY).toBe(5);
  });

  test('processes every item exactly once', async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      seen.push(n);
      return n;
    });
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  test('an empty input resolves to an empty array without spawning workers', async () => {
    const fn = jest.fn(async (n: number) => n);
    const out = await mapWithConcurrency([] as number[], 2, fn);
    expect(out).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  test('a degenerate limit (0 / NaN) is clamped up to a single worker', async () => {
    const out = await mapWithConcurrency([1, 2, 3], 0, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30]);
  });
});
