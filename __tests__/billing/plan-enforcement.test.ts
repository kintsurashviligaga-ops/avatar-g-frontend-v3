import { getPlan, getPlanRank, isPlanAtLeast, normalizePlan } from '@/lib/billing/plans';

describe('Billing Plan Enforcement', () => {
  test('normalizes incoming plan names', () => {
    expect(normalizePlan('free')).toBe('FREE');
    expect(normalizePlan('pro')).toBe('PRO');
    expect(normalizePlan('premium')).toBe('PREMIUM');
    expect(normalizePlan('enterprise')).toBe('ENTERPRISE');
    expect(normalizePlan('unknown-plan')).toBe('FREE');
  });

  test('supports rank comparisons for gating', () => {
    expect(getPlanRank('FREE')).toBeLessThan(getPlanRank('PRO'));
    expect(getPlanRank('PRO')).toBeLessThan(getPlanRank('PREMIUM'));
    expect(getPlanRank('PREMIUM')).toBeLessThan(getPlanRank('ENTERPRISE'));

    expect(isPlanAtLeast('PRO', 'FREE')).toBe(true);
    expect(isPlanAtLeast('PRO', 'PRO')).toBe(true);
    expect(isPlanAtLeast('PRO', 'PREMIUM')).toBe(false);
  });

  test('reads plan definitions safely', () => {
    expect(getPlan('FREE').monthlyCredits).toBeGreaterThan(0);
    expect(getPlan('PREMIUM').features.length).toBeGreaterThan(0);
  });
});
