/** @jest-environment node */
import { isSoldCredit, summarizeDashboard } from './dashboard';

const row = (delta: number, reason: string, ref?: string, user_id = 'u1', created_at = '2026-10-18T10:00:00Z') =>
  ({ user_id, delta, reason, metadata: ref ? { ref } : {}, created_at });

describe('isSoldCredit', () => {
  it('counts paid top-ups and paid subscription months', () => {
    expect(isSoldCredit(row(100, 'purchase', 'bog:ord1'))).toBe(true);
    expect(isSoldCredit(row(500, 'purchase', 'sub:inv_1'))).toBe(true);
  });
  it('never counts a sign-up bonus, a trial, an admin comp, a refund or a spend', () => {
    expect(isSoldCredit(row(50, 'purchase', 'signup:u1'))).toBe(false);
    expect(isSoldCredit(row(50, 'purchase', 'trial:u1'))).toBe(false);
    expect(isSoldCredit(row(500, 'purchase', 'sub:admin:123'))).toBe(false);
    expect(isSoldCredit(row(500, 'purchase', 'admin:abc'))).toBe(false);
    expect(isSoldCredit(row(40, 'admin_adjustment', 'admin:adjust:1'))).toBe(false);
    expect(isSoldCredit(row(25, 'refund', 'video:j1:refund'))).toBe(false);
    expect(isSoldCredit(row(-25, 'commit', 'video:j1'))).toBe(false);
  });
});

describe('summarizeDashboard', () => {
  const until = new Date('2026-10-18T12:00:00Z');
  const since = new Date('2026-10-16T12:00:00Z');

  const s = summarizeDashboard({
    days: 2,
    since,
    until,
    bankFeeRate: 0.02,
    revenue: [
      { amount_gel: 10, created_at: '2026-10-17T09:00:00Z' },
      { amount_gel: '20', created_at: '2026-10-18T09:00:00Z' },
    ],
    costs: [
      { cost_wholesale_gel: 3, worker_kind: 'veo', status: 'succeeded', created_at: '2026-10-18T09:00:00Z' },
      { cost_wholesale_gel: 2, worker_kind: 'imagen', created_at: '2026-10-17T09:00:00Z' },
      { cost_wholesale_gel: 99, worker_kind: 'veo', status: 'failed', created_at: '2026-10-18T09:00:00Z' },
    ],
    ledger: [
      row(100, 'purchase', 'bog:o1', 'u1', '2026-10-17T09:00:00Z'),
      row(50, 'purchase', 'signup:u2', 'u2'),
      row(-25, 'commit', 'video:j1', 'u1'),
      row(25, 'refund', 'video:j1:refund', 'u1'),
      row(30, 'admin_adjustment', 'admin:adjust:1', 'u3'),
      row(-10, 'commit', 'image:j2', 'u4', '2026-10-17T09:00:00Z'),
    ],
    activity: [{ user_id: 'u5', created_at: '2026-10-18T08:00:00Z' }],
    newSignups: 2,
  });

  it('adds money in, takes out the bank fee and the succeeded provider cost', () => {
    expect(s.revenueGel).toBe(30);
    expect(s.payments).toBe(2);
    expect(s.bankFeesGel).toBe(0.6);
    expect(s.apiCostGel).toBe(5);
    expect(s.grossProfitGel).toBe(24.4);
    expect(s.markup).toBeCloseTo(24.4 / 5.6, 3);
  });

  it('splits credits into sold, spent, refunded and comped', () => {
    expect(s.creditsSold).toBe(100);
    expect(s.creditsSpent).toBe(35);
    expect(s.creditsRefunded).toBe(25);
    expect(s.creditsComped).toBe(30);
    expect(s.payingUsers).toBe(1);
  });

  it('counts active users from spends and jobs, today separately', () => {
    expect(s.activeUsers).toBe(3); // u1, u4, u5
    expect(s.activeToday).toBe(2); // u1, u5
    expect(s.newSignups).toBe(2);
  });

  it('ranks providers by cost and fills one point per day', () => {
    expect(s.costByProvider).toEqual([
      { kind: 'Google Vertex AI (Veo)', costGel: 3, calls: 1 },
      { kind: 'imagen', costGel: 2, calls: 1 },
    ]);
    expect(s.series.map((p) => p.day)).toEqual(['2026-10-16', '2026-10-17', '2026-10-18']);
    const d18 = s.series[2];
    expect(d18).toMatchObject({ revenueGel: 20, apiCostGel: 3, creditsSpent: 25, activeUsers: 2 });
  });

  it('has no markup with no cost', () => {
    const empty = summarizeDashboard({ days: 1, since, until, revenue: [], costs: [], ledger: [], activity: [], newSignups: 0 });
    expect(empty.markup).toBeNull();
    expect(empty.degraded).toEqual([]);
  });

  it('groups Veo worker aliases under one provider without changing total cost or counting failed jobs', () => {
    const grouped = summarizeDashboard({
      days: 2, since, until, revenue: [], ledger: [], activity: [], newSignups: 0,
      costs: [
        { cost_wholesale_gel: 1.25, worker_kind: 'veo', status: 'succeeded', created_at: '2026-10-18T09:00:00Z' },
        { cost_wholesale_gel: 2.5, worker_kind: 'vertex-veo', status: 'succeeded', created_at: '2026-10-18T09:00:00Z' },
        { cost_wholesale_gel: 99, worker_kind: 'veo', status: 'failed', created_at: '2026-10-18T09:00:00Z' },
        { cost_wholesale_gel: 0.5, worker_kind: 'custom-worker', created_at: '2026-10-17T09:00:00Z' },
      ],
    });
    expect(grouped.costByProvider).toEqual([
      { kind: 'Google Vertex AI (Veo)', costGel: 3.75, calls: 2 },
      { kind: 'custom-worker', costGel: 0.5, calls: 1 },
    ]);
    expect(grouped.apiCostGel).toBe(4.25);
    expect(grouped.series.reduce((sum, point) => sum + point.apiCostGel, 0)).toBe(4.25);
  });
});
