/** @jest-environment node */
/** Phase 8.1: the founder dashboard maths (revenue, Google cost, profit, margin, user usage, alerts). */
import { marginAlerts, marginByModel } from './alerts';
import { revenueByDay, summarize, userUsage, type CostRow } from './finance';

const cost = (over: Partial<CostRow>): CostRow => ({
  userId: 'u1',
  capability: 'video.omni',
  model: 'gemini-omni-1.2-flash',
  usd: 0.6289,
  creditsCharged: 66,
  createdAt: '2026-11-20T10:00:00Z',
  ...over,
});

describe('summarize', () => {
  test('revenue, cost, profit and margin; estimated until the billing export covers the day', () => {
    const s = summarize(
      [
        { amountGel: 129, kind: 'subscription', createdAt: '2026-11-20T09:00:00Z' },
        { amountGel: 25, kind: 'topup', createdAt: '2026-11-20T12:00:00Z' },
      ],
      [cost({}), cost({ userId: 'u2' })],
    );
    expect(s.revenueGel).toBe(154);
    expect(s.revenueNetGel).toBeCloseTo(149.38, 2); // 3 % card fee
    expect(s.googleCostUsd).toBeCloseTo(1.26, 2);
    expect(s.googleCostGel).toBeCloseTo(3.4, 1);
    expect(s.netProfitGel).toBeCloseTo(149.38 - 1.2578 * 2.7, 1);
    expect(s.marginPct!).toBeGreaterThan(97);
    expect(s.costBasis).toBe('estimated');
    expect(s.paidUsageMarginPct!).toBeGreaterThan(65); // usage priced by the rule
  });

  test('a reconciled day replaces our estimate for that day', () => {
    const s = summarize([], [cost({}), cost({ createdAt: '2026-11-21T10:00:00Z' })], [{ day: '2026-11-20', billedUsd: 2 }]);
    expect(s.googleCostUsd).toBeCloseTo(2 + 0.6289, 2);
    expect(s.costBasis).toBe('mixed');
    expect(s.marginPct).toBeNull(); // no revenue
  });

  test('empty inputs are zeros, never NaN', () => {
    const s = summarize([], []);
    expect(s).toMatchObject({ revenueGel: 0, googleCostUsd: 0, netProfitGel: 0, marginPct: null, paidUsageMarginPct: null, costBasis: 'none' });
  });

  test('revenue by day is sorted and summed', () => {
    expect(
      revenueByDay([
        { amountGel: 10, kind: 'topup', createdAt: '2026-11-21T01:00:00Z' },
        { amountGel: 25, kind: 'topup', createdAt: '2026-11-20T01:00:00Z' },
        { amountGel: 5, kind: 'topup', createdAt: '2026-11-21T09:00:00Z' },
      ]),
    ).toEqual([
      { day: '2026-11-20', gel: 25 },
      { day: '2026-11-21', gel: 15 },
    ]);
  });
});

describe('user usage', () => {
  test('ranks by credits burned and names the costliest capability', () => {
    const rows = userUsage(
      [
        { userId: 'u1', credits: 66, createdAt: '' },
        { userId: 'u2', credits: 500, createdAt: '' },
        { userId: 'u2', credits: -100, createdAt: '' }, // a refund line is not usage
      ],
      [cost({ userId: 'u2', capability: 'live.avatar', usd: 4, creditsCharged: 440 }), cost({ userId: 'u2', capability: 'image', usd: 0.07, creditsCharged: 8 })],
      [{ id: 'u2', email: 'a@b.ge', plan: 'pro' }],
    );
    expect(rows.map((r) => r.userId)).toEqual(['u2', 'u1']);
    expect(rows[0]).toMatchObject({ email: 'a@b.ge', plan: 'pro', creditsSpent: 500, topCapability: 'live.avatar' });
    expect(rows[0]!.marginPct!).toBeGreaterThan(60);
    expect(rows[1]!.marginPct).toBeNull(); // spent credits but no cost rows recorded yet
  });
});

describe('margin alerts', () => {
  test('quiet when every model keeps 65 %', () => {
    expect(marginAlerts([cost({}), cost({})])).toEqual([]);
  });

  test('MARGIN_LOW when Google cost rises past the price (critical under 50 %)', () => {
    const a = marginAlerts([cost({ usd: 1.1 })]);
    expect(a[0]).toMatchObject({ kind: 'MARGIN_LOW', severity: 'critical' });
    const w = marginAlerts([cost({ usd: 0.8 })]);
    expect(w[0]).toMatchObject({ kind: 'MARGIN_LOW', severity: 'warning' });
  });

  test('COST_SPIKE at ≥ 15 % more per call than the previous window, even while margin holds', () => {
    const a = marginAlerts([cost({ usd: 0.5 })], [cost({ usd: 0.4 })]);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: 'COST_SPIKE', severity: 'warning', changePct: 25 });
    expect(marginAlerts([cost({ usd: 0.44 })], [cost({ usd: 0.4 })])).toEqual([]); // +10 %: no alert
  });

  test('UNPRICED when calls cost money but charge nothing', () => {
    const rows = Array.from({ length: 30 }, () => cost({ capability: 'live.avatar', model: 'gemini-3.8-live', usd: 0.42, creditsCharged: 0 }));
    expect(marginAlerts(rows)[0]).toMatchObject({ kind: 'UNPRICED', severity: 'critical', calls: 30 });
    expect(marginAlerts([cost({ usd: 0.5, creditsCharged: 0 })])).toEqual([]); // under $1: noise
  });

  test('marginByModel groups by capability + model', () => {
    const m = marginByModel([cost({}), cost({}), cost({ model: 'veo-3.1-fast-generate', usd: 1.06, creditsCharged: 111 })]);
    expect(m).toHaveLength(2);
    expect(m.find((x) => x.model === 'gemini-omni-1.2-flash')).toMatchObject({ calls: 2, creditsCharged: 132 });
  });
});
