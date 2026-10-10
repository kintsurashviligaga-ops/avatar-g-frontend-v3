/** @jest-environment node */
/**
 * deductCreditsOnce — a charge that tells its own debit from a replay (gap C5).
 *
 * With 20261002d applied, deduct_credits_once answers {balance, charged} under the balance row lock; before it is
 * applied the RPC is missing and the helper falls back to the ledger read + deduct_credits every replay-checking route
 * used. The database side is proven on a real Postgres in scripts/lease-isolation/ledger-race.sh (section 5).
 */
jest.mock('server-only', () => ({}));
jest.mock('../observability/report-error', () => ({ reportError: () => undefined }));

type Rpc = { data: unknown; error: { message: string; details?: string } | null };
let rpcAnswers: Record<string, Rpc[]> = {};
let rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let ledgerRows: Array<{ user_id: string; delta: number; ref: string }> = [];

const client = {
  rpc: async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    const queue = rpcAnswers[fn] ?? [];
    return queue.length > 1 ? queue.shift()! : queue[0] ?? { data: null, error: { message: `Could not find the function public.${fn}` } };
  },
  from: () => {
    const filters: Array<(r: { user_id: string; delta: number; ref: string }) => boolean> = [];
    const b = {
      select: () => b,
      eq: (col: string, v: unknown) => { filters.push((r) => (col === 'metadata->>ref' ? r.ref : (r as Record<string, unknown>)[col]) === v); return b; },
      lt: (_c: string, v: number) => { filters.push((r) => r.delta < v); return b; },
      limit: () => b,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: ledgerRows.filter((r) => filters.every((f) => f(r))), error: null }).then(resolve),
    };
    return b;
  },
};
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => client }));
const mockEnsure = jest.fn(async () => true);
jest.mock('./ensureProfile', () => ({
  ensureProfileRow: () => mockEnsure(),
  isMissingProfileError: (details?: string | null) => details === 'no profile record',
}));

import { deductCreditsOnce } from './ledger';

beforeEach(() => {
  rpcAnswers = {};
  rpcCalls = [];
  ledgerRows = [];
  mockEnsure.mockClear();
});

describe('with deduct_credits_once provisioned (20261002d applied)', () => {
  it('charged:true → ok with the new balance', async () => {
    rpcAnswers.deduct_credits_once = [{ data: { balance: 70, charged: true }, error: null }];
    expect(await deductCreditsOnce('u', 30, 'r1')).toEqual({ ok: true, balance: 70 });
    expect(rpcCalls).toEqual([{ fn: 'deduct_credits_once', args: { p_user_id: 'u', p_amount: 30, p_ref: 'r1' } }]);
  });

  it('charged:false → replay: refuse, and deduct_credits is never asked', async () => {
    rpcAnswers.deduct_credits_once = [{ data: { balance: 70, charged: false }, error: null }];
    expect(await deductCreditsOnce('u', 30, 'r1')).toEqual({ ok: false, reason: 'replay', balance: 70 });
    expect(rpcCalls.map((c) => c.fn)).toEqual(['deduct_credits_once']);
  });

  it('insufficient credits stays insufficient', async () => {
    rpcAnswers.deduct_credits_once = [{ data: null, error: { message: 'insufficient_credits', details: 'have 5 need 30' } }];
    expect(await deductCreditsOnce('u', 30, 'r1')).toEqual({ ok: false, reason: 'insufficient' });
  });

  it('a missing profile row is created and the charge retried once', async () => {
    rpcAnswers.deduct_credits_once = [
      { data: null, error: { message: 'insufficient_credits', details: 'no profile record' } },
      { data: { balance: 0, charged: true }, error: null },
    ];
    expect(await deductCreditsOnce('u', 30, 'r1')).toEqual({ ok: true, balance: 0 });
    expect(mockEnsure).toHaveBeenCalledTimes(1);
    expect(rpcCalls).toHaveLength(2);
  });

  it('an answer without `charged` is not something to render on', async () => {
    rpcAnswers.deduct_credits_once = [{ data: 70, error: null }];
    expect(await deductCreditsOnce('u', 30, 'r1')).toEqual({ ok: false, reason: 'error' });
  });

  it('a connection failure is an error, never a fallback charge', async () => {
    rpcAnswers.deduct_credits_once = [{ data: null, error: { message: 'fetch failed: ECONNRESET' } }];
    expect(await deductCreditsOnce('u', 30, 'r1')).toEqual({ ok: false, reason: 'error' });
    expect(rpcCalls.map((c) => c.fn)).toEqual(['deduct_credits_once']);
  });
});

describe('before 20261002d (the RPC is missing): the ledger-read fallback', () => {
  it('a ref already debited is a replay; nothing is charged', async () => {
    ledgerRows = [{ user_id: 'u', delta: -30, ref: 'r1' }];
    expect(await deductCreditsOnce('u', 30, 'r1')).toEqual({ ok: false, reason: 'replay' });
    expect(rpcCalls.map((c) => c.fn)).toEqual(['deduct_credits_once']);
  });

  it('a new ref is charged through deduct_credits', async () => {
    ledgerRows = [{ user_id: 'u', delta: -30, ref: 'other' }, { user_id: 'v', delta: -30, ref: 'r1' }];
    rpcAnswers.deduct_credits = [{ data: 70, error: null }];
    expect(await deductCreditsOnce('u', 30, 'r1')).toEqual({ ok: true, balance: 70 });
    expect(rpcCalls.map((c) => c.fn)).toEqual(['deduct_credits_once', 'deduct_credits']);
  });

  it('neither function provisioned → skipped (reserveProduce then refuses in production)', async () => {
    expect(await deductCreditsOnce('u', 30, 'r1')).toEqual({ ok: false, reason: 'skipped' });
  });
});
