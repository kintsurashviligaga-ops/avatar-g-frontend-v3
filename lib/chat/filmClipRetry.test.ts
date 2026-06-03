/** @jest-environment node */
import {
  MAX_CLIP_DISPATCH_ATTEMPTS,
  CLIP_DISPATCH_STAGGER_MS,
  CLIP_RETRY_BASE_MS,
  CLIP_RETRY_JITTER_MS,
  CLIP_RETRY_ORDINAL_SPREAD_MS,
  clipDispatchStaggerMs,
  clipRetryBackoffMs,
} from './filmClipRetry';

describe('clipDispatchStaggerMs — smears the initial fan-out', () => {
  test('clip 1 fires immediately', () => {
    expect(clipDispatchStaggerMs(1)).toBe(0);
  });

  test('later clips are spaced linearly by ordinal', () => {
    expect(clipDispatchStaggerMs(2)).toBe(CLIP_DISPATCH_STAGGER_MS);
    expect(clipDispatchStaggerMs(5)).toBe(4 * CLIP_DISPATCH_STAGGER_MS);
  });

  test('monotonic non-decreasing across the planned scene range', () => {
    const vals = [1, 2, 3, 4, 5].map(clipDispatchStaggerMs);
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1]);
    }
  });

  test('non-finite / non-positive ordinals collapse to 0 (never negative)', () => {
    expect(clipDispatchStaggerMs(0)).toBe(0);
    expect(clipDispatchStaggerMs(-3)).toBe(0);
    expect(clipDispatchStaggerMs(Number.NaN)).toBe(0);
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

  test('the full attempt budget keeps the last clip inside a sane total wait', () => {
    // Worst case (max jitter) for the last-dispatched clip across every retry it
    // can make — a guardrail so a future budget bump can never silently blow out
    // into a multi-minute hang.
    let total = 0;
    for (let attempt = 1; attempt <= MAX_CLIP_DISPATCH_ATTEMPTS; attempt++) {
      total += clipRetryBackoffMs(attempt, 5, () => 1);
    }
    expect(MAX_CLIP_DISPATCH_ATTEMPTS).toBe(3);
    expect(total).toBeLessThanOrEqual(10_000);
  });
});
