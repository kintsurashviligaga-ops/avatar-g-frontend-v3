/** @jest-environment node */
/**
 * BillingGuard's Supabase-backed shell (MASTER TASK v3.1, audit F-05): billing fails closed, and a booking the ledger
 * refuses is kept, counted and written back instead of being forgotten. The pure decision core is pinned in
 * billingGuard.test.ts; this file pins the two failure modes around it.
 *
 *   · budget-store failure: the ledger cannot be read (query error, thrown client, no service-role client), so every
 *     paid call is refused as `guard_unavailable`, and a route or guardedCall never reaches its provider;
 *   · settlement failure: the ledger refuses the row (error answer or throw), so after one retry the row is kept, the
 *     guard counts it as spent, a structured `billing.booking_unrecorded` line is logged, and the next booking that
 *     lands writes it back marked `reconciled`.
 */
jest.mock('server-only', () => ({}));

type LedgerAnswer = { data: unknown; error: unknown } | Error;
let mockLedger: LedgerAnswer = { data: [], error: null };
let mockClientThrows = false;
jest.mock('../../supabase/server', () => ({
  createServiceRoleClient: () => {
    if (mockClientThrows) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
    return {
      from: () => ({
        select: () => ({
          gte: () => ({
            limit: async () => {
              if (mockLedger instanceof Error) throw mockLedger;
              return mockLedger;
            },
          }),
        }),
      }),
    };
  },
}));

const mockRecordTrace = jest.fn();
jest.mock('../../observability/agentTrace', () => ({ recordTrace: (...a: unknown[]) => mockRecordTrace(...a) }));

const mockLog = jest.fn();
jest.mock('../../logger', () => ({ structuredLog: (...a: unknown[]) => mockLog(...a) }));

// eslint-disable-next-line import/first
import {
  canProceed,
  checkThresholds,
  recordUsage,
  resetBillingCache,
  resetUnbookedSpend,
  unbookedSpend,
} from './BillingGuard';
// eslint-disable-next-line import/first
import { guardedCall } from './guardedCall';
// eslint-disable-next-line import/first
import type { CostEstimate } from './costModel';

const USER = '11111111-2222-4333-8444-555555555555';
const GEL_PER_USD = 2.7;
const ENV = { ...process.env };

const est = (estimatedCost: number, service: CostEstimate['service'] = 'chat', model = 'gemini-2.5-flash'): CostEstimate => ({
  service,
  model,
  estimatedCost,
  currency: 'USD',
});
/** A ledger row spent today, in USD. */
const spentToday = (usd: number) => ({ cost_wholesale_gel: usd * GEL_PER_USD, created_at: new Date().toISOString() });

let errorSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;
beforeEach(() => {
  mockLedger = { data: [], error: null };
  mockClientThrows = false;
  mockRecordTrace.mockReset().mockResolvedValue(true);
  mockLog.mockReset();
  resetBillingCache();
  resetUnbookedSpend();
  process.env = { ...ENV, DAILY_COST_LIMIT: '10', MONTHLY_COST_LIMIT: '300' };
  delete process.env.BILLING_GUARD_FAIL_CLOSED;
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
  warnSpy.mockRestore();
  process.env = { ...ENV };
});

describe('budget-store failure: fails closed', () => {
  const unreadable: Array<[string, () => void]> = [
    ['the query answers an error', () => { mockLedger = { data: null, error: { message: 'connection refused' } }; }],
    ['the query throws', () => { mockLedger = new Error('fetch failed'); }],
    ['there is no service-role client', () => { mockClientThrows = true; }],
    ['the answer is not a list', () => { mockLedger = { data: { rows: 1 }, error: null }; }],
  ];

  test.each(unreadable)('%s → refused as guard_unavailable (degraded), never allowed', async (_why, breakIt) => {
    breakIt();
    const d = await canProceed(est(0.001));
    expect(d).toMatchObject({ allowed: false, reason: 'guard_unavailable', degraded: true });
    expect(errorSpy).toHaveBeenCalledWith('[BillingGuard] spend ledger unreadable → refusing chat (fails closed)');
  });

  test('there is no fail-open setting left: BILLING_GUARD_FAIL_CLOSED=0 changes nothing', async () => {
    mockLedger = { data: null, error: { message: 'down' } };
    process.env.BILLING_GUARD_FAIL_CLOSED = '0';
    expect(await canProceed(est(0.001))).toMatchObject({ allowed: false, reason: 'guard_unavailable' });
  });

  test('a readable ledger inside the budget is allowed (the gate is not simply shut)', async () => {
    mockLedger = { data: [spentToday(1)], error: null };
    expect(await canProceed(est(0.001))).toMatchObject({ allowed: true, reason: 'ok', degraded: false });
  });

  test('guardedCall makes zero provider calls while the ledger is unreadable', async () => {
    mockLedger = { data: null, error: { message: 'down' } };
    const provider = jest.fn(async () => 'video');
    await expect(guardedCall({ service: 'video', model: 'veo-3.1', units: 8 }, provider)).rejects.toMatchObject({
      name: 'BudgetExceededError',
      reason: 'guard_unavailable',
    });
    expect(provider).not.toHaveBeenCalled();
    expect(mockRecordTrace).not.toHaveBeenCalled();
  });

  test('the operator alert says the guard is refusing, not running unguarded', async () => {
    mockLedger = new Error('fetch failed');
    const alerts = await checkThresholds();
    expect(alerts).toEqual([
      expect.objectContaining({ level: 'critical', code: 'ledger_unavailable', message: expect.stringMatching(/refusing every paid call.*fails closed/) }),
    ]);
  });
});

describe('settlement failure: the row is kept, counted and written back', () => {
  test('a refused row is retried once; a retry that lands keeps nothing', async () => {
    mockRecordTrace.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await recordUsage(est(0.02), { userId: USER });
    expect(mockRecordTrace).toHaveBeenCalledTimes(2);
    expect(mockRecordTrace.mock.calls[1]![0]).toEqual(mockRecordTrace.mock.calls[0]![0]);
    expect(unbookedSpend()).toEqual({ rows: 0, usd: 0 });
    expect(mockLog).not.toHaveBeenCalled();
  });

  test.each([
    ['answers false', () => mockRecordTrace.mockResolvedValue(false)],
    ['throws', () => mockRecordTrace.mockRejectedValue(new Error('insert exploded'))],
  ])('a recorder that %s twice: kept, logged as billing.booking_unrecorded, never thrown', async (_how, failIt) => {
    failIt();
    await expect(recordUsage(est(0.05, 'image', 'gemini-image'), { userId: USER })).resolves.toBeUndefined();
    expect(mockRecordTrace).toHaveBeenCalledTimes(2);
    expect(unbookedSpend()).toEqual({ rows: 1, usd: 0.05 });
    expect(mockLog).toHaveBeenCalledWith('error', 'billing.booking_unrecorded', {
      service: 'image',
      model: 'gemini-image',
      usd: 0.05,
      pendingRows: 1,
      pendingUsd: 0.05,
    });
  });

  test('the guard counts kept spend as spent: $9.99 the ledger never saw stops the next call', async () => {
    mockRecordTrace.mockResolvedValue(false);
    await recordUsage(est(9.99, 'video', 'veo-3.1'));
    // The ledger itself shows nothing spent today; only the kept row knows.
    mockLedger = { data: [], error: null };
    expect(await canProceed(est(0.05))).toMatchObject({ allowed: false, reason: 'daily_limit', degraded: false });
    expect((await canProceed(est(0.005))).projectedDaily).toBeCloseTo(9.995, 6);
  });

  test('the next booking that lands writes the kept row back, marked reconciled, then nothing is pending', async () => {
    mockRecordTrace.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    await recordUsage(est(0.3, 'music', 'lyria-3'), { userId: USER });
    expect(unbookedSpend().rows).toBe(1);
    const kept = mockRecordTrace.mock.calls[0]![0] as { agentId: string; costWholesaleGel: number; userId: string };

    mockRecordTrace.mockReset().mockResolvedValue(true);
    mockLog.mockReset();
    await recordUsage(est(0.01));
    expect(mockRecordTrace).toHaveBeenCalledTimes(2);
    const written = mockRecordTrace.mock.calls[1]![0] as { agentId: string; costWholesaleGel: number; userId: string; metadata: Record<string, unknown> };
    expect(written).toMatchObject({ agentId: kept.agentId, userId: USER, costWholesaleGel: kept.costWholesaleGel });
    expect(written.metadata).toMatchObject({ billingGuard: true, service: 'music', model: 'lyria-3', reconciled: true, failedAt: expect.any(String) });
    expect(unbookedSpend()).toEqual({ rows: 0, usd: 0 });
    expect(mockLog).toHaveBeenCalledWith('info', 'billing.booking_reconciled', { usd: 0.3, pendingRows: 0 });
  });

  test('a kept row the ledger still refuses is written without its user reference (the spend outranks attribution)', async () => {
    mockRecordTrace.mockResolvedValue(false);
    await recordUsage(est(0.2), { userId: USER });
    mockRecordTrace.mockReset().mockImplementation(async (row: { userId: string | null }) => row.userId === null);
    await recordUsage(est(0.01));
    const last = mockRecordTrace.mock.calls.at(-1)![0] as { userId: string | null; metadata: Record<string, unknown> };
    expect(last.userId).toBeNull();
    expect(last.metadata).toMatchObject({ reconciled: true, userIdDropped: true });
    expect(unbookedSpend()).toEqual({ rows: 0, usd: 0 });
  });

  test('a kept row that cannot land at all stays kept and counted', async () => {
    mockRecordTrace.mockResolvedValue(false);
    await recordUsage(est(0.4));
    // The fresh booking lands, the kept one (no user) is refused again.
    mockRecordTrace.mockReset().mockImplementation(async (row: { metadata?: { reconciled?: boolean } }) => !row.metadata?.reconciled);
    await recordUsage(est(0.01));
    expect(unbookedSpend()).toEqual({ rows: 1, usd: 0.4 });
  });

  test('past 500 kept rows the oldest fold into one carried amount, never dropped, and it books as one row', async () => {
    mockRecordTrace.mockResolvedValue(false);
    for (let i = 0; i < 503; i += 1) await recordUsage(est(0.01));
    expect(unbookedSpend().rows).toBe(501); // 500 rows + the folded carry
    expect(unbookedSpend().usd).toBeCloseTo(5.03, 6);

    mockRecordTrace.mockReset().mockResolvedValue(true);
    await recordUsage(est(0.01));
    const folded = mockRecordTrace.mock.calls.map((c) => c[0] as { agentId: string; costWholesaleGel: number; metadata: Record<string, unknown> }).find((r) => r.agentId === 'v2-reconcile');
    expect(folded).toBeDefined();
    expect(folded!.costWholesaleGel).toBeCloseTo(0.03 * GEL_PER_USD, 6);
    expect(folded!.metadata).toMatchObject({ reconciled: true, folded: true });
    // One landed booking writes back at most 20 kept rows, so a backlog never holds a reply for long.
    expect(unbookedSpend().rows).toBe(480);
  });

  test('a backlog is reported to the operator', async () => {
    mockRecordTrace.mockResolvedValue(false);
    await recordUsage(est(0.12));
    mockLedger = { data: [], error: null };
    const alerts = await checkThresholds();
    expect(alerts[0]).toMatchObject({ level: 'critical', code: 'booking_unrecorded', message: expect.stringContaining('1 booking(s) worth $0.1200') });
  });
});
