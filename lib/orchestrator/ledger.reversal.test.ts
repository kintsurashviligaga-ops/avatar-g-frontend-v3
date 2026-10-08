/** @jest-environment node */
/**
 * grantedForRef / debitedUnderPrefix / creditsBalanceOf — the ledger reads behind the Stripe refund / dispute
 * credit reversal (lib/billing/stripeReversal).
 */
jest.mock('server-only', () => ({}));
const mockReport = jest.fn();
jest.mock('../observability/report-error', () => ({ reportError: (...a: unknown[]) => mockReport(...a) }));

type Row = { user_id: string; delta: number; metadata: { ref?: string } | null };
const mockState: { rows: Row[]; profiles: Array<{ id: string; credits_balance: number }>; fail: boolean } = { rows: [], profiles: [], fail: false };

function mockLikeToRegex(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === '\\' && i + 1 < pattern.length) { out += pattern[++i]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
    if (c === '%') { out += '.*'; continue; }
    if (c === '_') { out += '.'; continue; }
    out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

jest.mock('../supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
      const get = (r: Record<string, unknown>, col: string): unknown =>
        col === 'metadata->>ref' ? (r.metadata as { ref?: string } | null)?.ref : r[col];
      const source = () => (table === 'profiles' ? mockState.profiles : mockState.rows) as unknown as Array<Record<string, unknown>>;
      const result = () => (mockState.fail ? { data: null, error: { message: 'fetch failed' } } : { data: source().filter((r) => filters.every((f) => f(r))), error: null });
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (col: string, v: unknown) => { filters.push((r) => get(r, col) === v); return b; },
        lt: (col: string, v: number) => { filters.push((r) => Number(get(r, col)) < v); return b; },
        gt: (col: string, v: number) => { filters.push((r) => Number(get(r, col)) > v); return b; },
        like: (col: string, p: string) => { const re = mockLikeToRegex(p); filters.push((r) => re.test(String(get(r, col) ?? ''))); return b; },
        maybeSingle: async () => { const r = result(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : null, error: r.error }; },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
      };
      return b;
    },
  }),
}));

import { creditsBalanceOf, debitedUnderPrefix, grantedForRef } from './ledger';

beforeEach(() => {
  mockState.rows = [];
  mockState.profiles = [];
  mockState.fail = false;
  mockReport.mockReset();
});

describe('grantedForRef', () => {
  it('sums the positive rows of exactly that payment ref and names the payer', async () => {
    mockState.rows = [
      { user_id: 'u1', delta: 525, metadata: { ref: 'stripe:cs_1' } },
      { user_id: 'u1', delta: -10, metadata: { ref: 'stripe:cs_1' } },
      { user_id: 'u1', delta: 99, metadata: { ref: 'stripe:cs_10' } },
    ];
    expect(await grantedForRef('stripe:cs_1')).toEqual({ ok: true, grant: { userId: 'u1', credits: 525 } });
  });

  it('no grant → { ok, grant:null }; unreadable → { ok:false }', async () => {
    expect(await grantedForRef('stripe:none')).toEqual({ ok: true, grant: null });
    mockState.fail = true;
    expect(await grantedForRef('stripe:cs_1')).toEqual({ ok: false });
  });

  it('two users under one payment ref is refused (and reported), never guessed', async () => {
    mockState.rows = [
      { user_id: 'u1', delta: 5, metadata: { ref: 'sub:in_1' } },
      { user_id: 'u2', delta: 5, metadata: { ref: 'sub:in_1' } },
    ];
    expect(await grantedForRef('sub:in_1')).toEqual({ ok: false });
    expect(mockReport).toHaveBeenCalledTimes(1);
  });
});

describe('debitedUnderPrefix', () => {
  it('sums the user’s debits under the prefix — underscores are literal, not wildcards', async () => {
    mockState.rows = [
      { user_id: 'u1', delta: -100, metadata: { ref: 'reversal:ch_1:refund:1000' } },
      { user_id: 'u1', delta: -50, metadata: { ref: 'reversal:ch_1:dispute:dp_1' } },
      { user_id: 'u1', delta: -7, metadata: { ref: 'reversal:chX1:refund:1000' } },
      { user_id: 'u2', delta: -9, metadata: { ref: 'reversal:ch_1:refund:1000' } },
      { user_id: 'u1', delta: 3, metadata: { ref: 'reversal:ch_1:refund:1000:refund' } },
    ];
    expect(await debitedUnderPrefix('u1', 'reversal:ch_1:')).toBe(150);
    expect(await debitedUnderPrefix('u1', 'reversal:ch_1:refund:')).toBe(100);
    mockState.fail = true;
    expect(await debitedUnderPrefix('u1', 'reversal:ch_1:')).toBeNull();
  });
});

describe('creditsBalanceOf', () => {
  it('reads profiles.credits_balance; null when missing or unreadable', async () => {
    mockState.profiles = [{ id: 'u1', credits_balance: 42 }];
    expect(await creditsBalanceOf('u1')).toBe(42);
    expect(await creditsBalanceOf('nobody')).toBeNull();
    mockState.fail = true;
    expect(await creditsBalanceOf('u1')).toBeNull();
  });
});
