/** @jest-environment node */
/**
 * creditHistory — Settings → History is derived from the server-written credit ledger, never from a
 * client-supplied delta. The mapping only picks a label; the amount is the ledger's own delta.
 */
import { HISTORY_ACTIONS, historyActionFor, ledgerRowsToHistory } from './creditHistory';

const row = (delta: number, ref: string | null, reason = 'commit', created_at = '2026-10-08T10:00:00Z') => ({
  delta, reason, created_at, metadata: ref === null ? null : { ref, source: 'orchestrator' },
});

describe('historyActionFor', () => {
  it.each([
    [row(-10, 'image:abc'), 'image'],
    [row(-25, 'assemble:job1'), 'video'],
    [row(-25, 'film:job1'), 'video'],
    [row(-8, 'music:p'), 'music'],
    [row(-5, 'avatar:p'), 'avatar'],
    [row(-4, 'pipeline-remix:x'), 'remix'],
    [row(-3, 'research:q'), 'research'],
    [row(-2, 'some-new-engine:x'), 'usage'],
    [row(-2, null), 'usage'],
  ])('spend %o → %s', (r, action) => {
    expect(historyActionFor(r)).toBe(action);
  });

  it.each([
    [row(100, 'stripe:cs_test_1', 'purchase'), 'topup'],
    [row(100, 'bog:order_1', 'purchase'), 'topup'],
    [row(500, 'sub:in_1', 'purchase'), 'subscription'],
    [row(10, 'image:abc:refund', 'refund'), 'refund'],
    [row(10, 'image:abc:refund', 'commit'), 'refund'],
    [row(50, 'starter:u1', 'purchase'), 'bonus'],
    [row(7, 'x', 'admin_adjustment'), 'adjustment'],
    [row(9, 'mystery:1', 'commit'), 'credit'],
    [row(9, 'mystery:1', 'purchase'), 'topup'],
  ])('grant %o → %s', (r, action) => {
    expect(historyActionFor(r)).toBe(action);
  });

  it('every label it can return is in HISTORY_ACTIONS (the UI has a label for each)', () => {
    const seen = new Set<string>();
    for (const d of [-1, 1]) for (const reason of ['commit', 'refund', 'purchase', 'admin_adjustment', '']) {
      for (const head of ['image', 'film', 'stripe', 'sub', 'starter', 'zzz', '']) seen.add(historyActionFor(row(d, `${head}:k`, reason)));
    }
    for (const a of seen) expect(HISTORY_ACTIONS).toContain(a);
  });
});

describe('ledgerRowsToHistory', () => {
  it('keeps the ledger’s own delta and timestamp, newest-first order preserved, zero rows dropped', () => {
    expect(ledgerRowsToHistory([
      row(-10, 'image:a', 'commit', '2026-10-08T12:00:00Z'),
      row(0, 'noop:a'),
      row(10, 'image:a:refund', 'refund', '2026-10-08T11:00:00Z'),
      { delta: 'not-a-number', reason: 'commit', metadata: null, created_at: 'x' },
    ])).toEqual([
      { action: 'image', creditsDelta: -10, createdAt: '2026-10-08T12:00:00Z' },
      { action: 'refund', creditsDelta: 10, createdAt: '2026-10-08T11:00:00Z' },
    ]);
  });
});
