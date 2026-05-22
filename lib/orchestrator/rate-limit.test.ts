/** @jest-environment node */
jest.mock('@upstash/redis', () => ({ Redis: class {} }));

import { PRODUCE_COST, rateWindowKeys, RATE_PER_MIN, RATE_PER_DAY, type ProduceKind } from './rate-limit';

describe('PRODUCE_COST', () => {
  test('covers all 6 pipelines with positive integer costs', () => {
    const kinds: ProduceKind[] = ['film', 'avatar', 'interior', 'image', 'music', 'voice'];
    expect(Object.keys(PRODUCE_COST).sort()).toEqual([...kinds].sort());
    for (const k of kinds) {
      expect(Number.isInteger(PRODUCE_COST[k])).toBe(true);
      expect(PRODUCE_COST[k]).toBeGreaterThan(0);
    }
  });
  test('heavier pipelines cost more than light ones', () => {
    expect(PRODUCE_COST.film).toBeGreaterThan(PRODUCE_COST.image);
    expect(PRODUCE_COST.avatar).toBeGreaterThan(PRODUCE_COST.voice);
  });
});

describe('rateWindowKeys', () => {
  const t0 = 1_700_000_000_000;
  test('same minute → same minute key', () => {
    expect(rateWindowKeys('u', t0).minKey).toBe(rateWindowKeys('u', t0 + 30_000).minKey);
  });
  test('next minute → different minute key', () => {
    expect(rateWindowKeys('u', t0).minKey).not.toBe(rateWindowKeys('u', t0 + 61_000).minKey);
  });
  test('day key is stable across minutes within a day', () => {
    expect(rateWindowKeys('u', t0).dayKey).toBe(rateWindowKeys('u', t0 + 600_000).dayKey);
  });
  test('keys are user-scoped + namespaced', () => {
    const k = rateWindowKeys('giorgi', t0);
    expect(k.minKey).toContain('rl:min:giorgi:');
    expect(k.dayKey).toContain('rl:day:giorgi:');
  });
});

describe('rate caps', () => {
  test('sane defaults', () => {
    expect(RATE_PER_MIN).toBeGreaterThan(0);
    expect(RATE_PER_DAY).toBeGreaterThanOrEqual(RATE_PER_MIN);
  });
});
