/** @jest-environment node */
import { computeFinancials, type TopupRow, type TraceRow } from './adminMetrics';

const topups = (...amts: (number | string | null)[]): TopupRow[] => amts.map((amount_gel) => ({ amount_gel }));
const trace = (wholesale: number | string | null, retail: number | string | null, worker_kind: string | null, status: string | null = 'succeeded'): TraceRow =>
  ({ cost_wholesale_gel: wholesale, cost_retail_gel: retail, worker_kind, status });

describe('computeFinancials', () => {
  it('computes gross revenue, 2.5% bank fees, raw API cost and net margin', () => {
    const s = computeFinancials({
      topups: topups(100, 50, 10),           // gross 160
      traces: [trace(12, 40, 'replicate'), trace(8, 20, 'elevenlabs')], // raw cost 20
      bankFeeRate: 0.025,
    });
    expect(s.grossRevenueGel).toBe(160);
    expect(s.topupCount).toBe(3);
    expect(s.bankFeeRate).toBe(0.025);
    expect(s.bankFeesGel).toBe(4);           // 160 * 0.025
    expect(s.apiRawCostGel).toBe(20);
    expect(s.retailChargedGel).toBe(60);
    expect(s.netMarginGel).toBe(136);        // 160 - 4 - 20
    expect(s.netMarginPct).toBe(0.85);       // 136 / 160
  });

  it('coerces Postgres NUMERIC strings and treats null as 0', () => {
    const s = computeFinancials({
      topups: topups('100.50', null, '9.50'),          // 110
      traces: [trace('1.2345', null, 'kling'), trace(null, '5', null)],
      bankFeeRate: 0.025,
    });
    expect(s.grossRevenueGel).toBe(110);
    expect(s.apiRawCostGel).toBe(1.2345);              // 4-dp precision retained
    expect(s.retailChargedGel).toBe(5);
    expect(s.bankFeesGel).toBe(2.75);
  });

  it('returns null margin pct (not divide-by-zero) when there is no revenue', () => {
    const s = computeFinancials({ topups: [], traces: [trace(3, 0, 'gemini')], bankFeeRate: 0.025 });
    expect(s.grossRevenueGel).toBe(0);
    expect(s.bankFeesGel).toBe(0);
    expect(s.apiRawCostGel).toBe(3);
    expect(s.netMarginGel).toBe(-3);
    expect(s.netMarginPct).toBeNull();
  });

  it('groups API cost by provider, descending, folding null worker_kind to "unknown"', () => {
    const s = computeFinancials({
      topups: topups(0),
      traces: [trace(2, 0, 'replicate'), trace(5, 0, 'replicate'), trace(1, 0, null)],
    });
    expect(s.costByProvider).toEqual([
      { workerKind: 'replicate', costGel: 7, calls: 2 },
      { workerKind: 'unknown', costGel: 1, calls: 1 },
    ]);
  });

  it('falls back to the default rate on an out-of-range bankFeeRate and never NaNs on junk rows', () => {
    const s = computeFinancials({
      topups: [{ amount_gel: 'not-a-number' }, { amount_gel: 40 }],
      traces: [{ cost_wholesale_gel: undefined as unknown as null, cost_retail_gel: 'x', worker_kind: undefined as unknown as null }],
      bankFeeRate: 5, // invalid → default 0.025
    });
    expect(s.grossRevenueGel).toBe(40);
    expect(s.bankFeeRate).toBe(0.025);
    expect(s.bankFeesGel).toBe(1);
    expect(Number.isNaN(s.apiRawCostGel)).toBe(false);
    expect(s.apiRawCostGel).toBe(0);
  });

  it('counts only SUCCEEDED renders for API cost (matches founder_financial_audit RPC); null status → succeeded', () => {
    const s = computeFinancials({
      topups: topups(100),
      traces: [
        trace(10, 30, 'replicate', 'succeeded'),
        trace(7, 0, 'replicate', 'failed'),      // excluded — provider-billed failure must not sink margin
        trace(4, 0, 'kling', 'timeout'),          // excluded
        trace(3, 9, 'gemini', null),              // null status → treated as succeeded
      ],
    });
    expect(s.apiRawCostGel).toBe(13);             // 10 + 3 only
    expect(s.retailChargedGel).toBe(39);          // 30 + 9 only
    expect(s.netMarginGel).toBe(84.5);            // 100 - 2.5 - 13
    expect(s.costByProvider).toEqual([
      { workerKind: 'replicate', costGel: 10, calls: 1 },
      { workerKind: 'gemini', costGel: 3, calls: 1 },
    ]);
  });

  it('is total on empty input', () => {
    const s = computeFinancials({ topups: [], traces: [] });
    expect(s).toMatchObject({ grossRevenueGel: 0, bankFeesGel: 0, apiRawCostGel: 0, netMarginGel: 0, netMarginPct: null, costByProvider: [] });
  });
});
