/** @jest-environment node */
/**
 * refundDebitByRef / netDebitedForRef / grantCredits — the ledger is the only witness to what was charged.
 *
 * The case that matters most is the first one: generation_jobs is owner-writable, so the render drainer's
 * `_reserve.credits` is a number the USER can write. Before 2026-09-29 the drainer refunded that number.
 */
jest.mock('server-only', () => ({}));
jest.mock('../observability/report-error', () => ({ reportError: () => undefined }));

type Row = { user_id: string; delta: number; reason?: string; metadata: { ref?: string; source?: string } };

let db: ReturnType<typeof makeDb>;
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => db.client }));

import { debitExistsForRef, grantCredits, netDebitedForRef, refundDebitByRef } from './ledger';

/** LIKE pattern → RegExp, honouring backslash escapes the way Postgres does. */
function likeToRegex(pattern: string): RegExp {
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

function makeDb(initial: Row[], opts: { failReads?: boolean } = {}) {
  const rows: Row[] = [...initial];
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const get = (r: Row, col: string): unknown => (col === 'metadata->>ref' ? r.metadata?.ref : (r as Record<string, unknown>)[col]);

  const from = (_table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    const b = {
      select: () => b,
      eq: (col: string, v: unknown) => { filters.push((r) => get(r, col) === v); return b; },
      lt: (col: string, v: number) => { filters.push((r) => Number(get(r, col)) < v); return b; },
      gt: (col: string, v: number) => { filters.push((r) => Number(get(r, col)) > v); return b; },
      like: (col: string, p: string) => { const re = likeToRegex(p); filters.push((r) => re.test(String(get(r, col) ?? ''))); return b; },
      limit: () => b,
      insert: async (row: Row) => {
        if (row.delta > 0 && rows.some((r) => r.user_id === row.user_id && r.delta > 0 && r.metadata?.ref === row.metadata?.ref)) {
          return { error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        }
        rows.push(row);
        return { error: null };
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(
          opts.failReads
            ? { data: null, error: { message: 'fetch failed' } }
            : { data: rows.filter((r) => filters.every((f) => f(r))), error: null },
        ).then(resolve, reject),
    };
    return b;
  };

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    if (fn === 'refund_credits') {
      const exists = rows.some((r) => r.user_id === args.p_user_id && r.delta > 0 && r.metadata?.ref === args.p_ref);
      if (!exists) rows.push({ user_id: String(args.p_user_id), delta: Number(args.p_amount), reason: 'refund', metadata: { ref: String(args.p_ref) } });
    }
    return { data: 0, error: null };
  };

  return { client: { from, rpc }, rows, rpcCalls };
}

const U = 'user-1';

describe('refundDebitByRef — pays back what the LEDGER shows, never what a row claims', () => {
  test('THE EXPLOIT: a job row claims 1,000,000 under a ref that was never charged → nothing is paid', async () => {
    db = makeDb([]);
    const res = await refundDebitByRef(U, 'forged-ref-123', 1_000_000);
    expect(res.ok).toBe(false);
    expect(res.refunded).toBe(0);
    expect(db.rpcCalls).toHaveLength(0);
  });

  test('a claim larger than the debit is capped at the debit', async () => {
    db = makeDb([{ user_id: U, delta: -30, metadata: { ref: 'film:abc' } }]);
    const res = await refundDebitByRef(U, 'film:abc', 1_000_000);
    expect(res).toMatchObject({ ok: true, refunded: 30 });
    expect(db.rpcCalls).toEqual([{ fn: 'refund_credits', args: { p_user_id: U, p_amount: 30, p_ref: 'film:abc:refund' } }]);
  });

  test('a claim smaller than the debit is honoured as the cap', async () => {
    db = makeDb([{ user_id: U, delta: -30, metadata: { ref: 'film:abc' } }]);
    expect((await refundDebitByRef(U, 'film:abc', 10)).refunded).toBe(10);
  });

  test('someone else’s debit under the same ref is not mine to refund', async () => {
    db = makeDb([{ user_id: 'someone-else', delta: -30, metadata: { ref: 'film:abc' } }]);
    expect((await refundDebitByRef(U, 'film:abc', 30)).refunded).toBe(0);
  });

  test('already refunded (the in-route rollback ran) → net is 0, no second refund', async () => {
    db = makeDb([
      { user_id: U, delta: -30, metadata: { ref: 'film:abc' } },
      { user_id: U, delta: 30, metadata: { ref: 'film:abc:refund' } },
    ]);
    const res = await refundDebitByRef(U, 'film:abc', 30);
    expect(res.refunded).toBe(0);
    expect(db.rpcCalls).toHaveLength(0);
  });

  test('a partial settle-back is subtracted', async () => {
    db = makeDb([
      { user_id: U, delta: -30, metadata: { ref: 'music:r1' } },
      { user_id: U, delta: 12, metadata: { ref: 'music:r1:settle' } },
    ]);
    expect(await netDebitedForRef(U, 'music:r1')).toBe(18);
    expect((await refundDebitByRef(U, 'music:r1')).refunded).toBe(18);
  });

  test('LIKE wildcards in a ref cannot pull in another ref’s credit-back', async () => {
    // `_` matches any single character in LIKE; unescaped, 'a_b:%' would match 'axb:refund'.
    db = makeDb([
      { user_id: U, delta: -30, metadata: { ref: 'a_b' } },
      { user_id: U, delta: 30, metadata: { ref: 'axb:refund' } },
    ]);
    expect(await netDebitedForRef(U, 'a_b')).toBe(30);
  });

  test('an unreadable ledger refunds NOTHING rather than guessing', async () => {
    db = makeDb([{ user_id: U, delta: -30, metadata: { ref: 'film:abc' } }], { failReads: true });
    const res = await refundDebitByRef(U, 'film:abc', 30);
    expect(res).toMatchObject({ ok: false, reason: 'error', refunded: 0 });
    expect(db.rpcCalls).toHaveLength(0);
  });
});

describe('grantCredits — bonuses go through the ledger, once per ref', () => {
  test('writes an admin_adjustment ledger row carrying the ref and source', async () => {
    db = makeDb([]);
    expect(await grantCredits(U, 50, 'referral:new:user-1', 'referral_bonus')).toEqual({ ok: true });
    expect(db.rows).toEqual([
      { user_id: U, delta: 50, reason: 'admin_adjustment', metadata: { source: 'referral_bonus', ref: 'referral:new:user-1' } },
    ]);
  });

  test('a repeat under the same ref is a success that writes nothing', async () => {
    db = makeDb([]);
    await grantCredits(U, 50, 'referral:new:user-1', 'referral_bonus');
    expect(await grantCredits(U, 50, 'referral:new:user-1', 'referral_bonus')).toEqual({ ok: true });
    expect(db.rows).toHaveLength(1);
  });

  test('refuses a non-positive amount or a missing ref', async () => {
    db = makeDb([]);
    expect((await grantCredits(U, 0, 'r', 's')).ok).toBe(false);
    expect((await grantCredits(U, 10, '', 's')).ok).toBe(false);
    expect(db.rows).toHaveLength(0);
  });
});

describe('debitExistsForRef — a replayed ref is recognised BEFORE deduct_credits answers it with a silent success', () => {
  test('no debit under the ref → false (a genuine first attempt)', async () => {
    db = makeDb([{ user_id: U, delta: -2, metadata: { ref: 'image:other' } }]);
    expect(await debitExistsForRef(U, 'image:job-1:fp:user-1')).toBe(false);
  });

  test('a debit under the ref → true, even after it was refunded (the replay must still be refused)', async () => {
    db = makeDb([
      { user_id: U, delta: -5, metadata: { ref: 'music:job-1:fp:user-1' } },
      { user_id: U, delta: 5, metadata: { ref: 'music:job-1:fp:user-1:refund' } },
    ]);
    expect(await debitExistsForRef(U, 'music:job-1:fp:user-1')).toBe(true);
  });

  test('a credit-back alone is not a debit, and another user’s debit is not mine', async () => {
    db = makeDb([
      { user_id: U, delta: 5, metadata: { ref: 'r1' } },
      { user_id: 'someone-else', delta: -5, metadata: { ref: 'r1' } },
    ]);
    expect(await debitExistsForRef(U, 'r1')).toBe(false);
  });

  test('an unreadable ledger answers null (unknown), never a guess', async () => {
    db = makeDb([{ user_id: U, delta: -5, metadata: { ref: 'r1' } }], { failReads: true });
    expect(await debitExistsForRef(U, 'r1')).toBeNull();
  });
});
