/** @jest-environment node */
import { percentile, summarize } from './stats';

test('nearest-rank percentiles', () => {
  const thirty = Array.from({ length: 30 }, (_, i) => i + 1); // 1..30
  expect(percentile(thirty, 50)).toBe(15);
  expect(percentile(thirty, 95)).toBe(29);
  expect(percentile([7], 95)).toBe(7);
  expect(percentile([3, 1, 2], 50)).toBe(2);
  expect(percentile([], 50)).toBeNaN();
});

test('a summary carries the sample count beside p50/p95, and span medians', () => {
  const r = summarize(
    { interaction: 'x', environment: 'mock', commit: 'abc12345', payload: 'p', network: 'loopback', cache: 'warm', unit: 'ms' },
    [10, 20, 30, 40],
    [{ db: 4, sign: 1 }, { db: 6 }, { db: 5, sign: 3 }],
  );
  expect(r).toEqual({
    interaction: 'x', environment: 'mock', commit: 'abc12345', payload: 'p', network: 'loopback', cache: 'warm', unit: 'ms',
    samples: 4, p50: 20, p95: 40, spans: { db: 5, sign: 1 },
  });
});
