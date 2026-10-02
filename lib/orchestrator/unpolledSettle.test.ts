/** @jest-environment node */
/**
 * The unpolled-job settle sweep — the server-side backstop for paid async jobs whose browser stopped polling.
 * It asks the PROVIDER before it refunds anything, refunds before it fails the row, and never acts on a row it cannot
 * read an owner and a ref from.
 */
import {
  isSettleOwned, readSettle, settleAction, settleParams, settleUnpolled, unpolledSettleEnabled,
  SETTLE_HARD_CAP_MS, SETTLE_STALE_MS,
  type SettleDeps, type SettleRow, type SettleVerdict,
} from './unpolledSettle';

describe('switches', () => {
  test('the sweep is ON unless UNPOLLED_SETTLE is explicitly off', () => {
    expect(unpolledSettleEnabled({} as NodeJS.ProcessEnv)).toBe(true);
    expect(unpolledSettleEnabled({ UNPOLLED_SETTLE: '1' } as NodeJS.ProcessEnv)).toBe(true);
    for (const v of ['0', 'off', 'FALSE', ' no ']) expect(unpolledSettleEnabled({ UNPOLLED_SETTLE: v } as NodeJS.ProcessEnv)).toBe(false);
  });
  test('a row with a readable `_settle` belongs to the sweep (the age-based reaper must leave it alone)', () => {
    expect(isSettleOwned({ params: settleParams({ kind: 'motion', job: 'p', ref: 'r', credits: 15 }) })).toBe(true);
    expect(isSettleOwned({ params: { _reserve: { ref: 'r', credits: 15 } } })).toBe(false);
    expect(isSettleOwned({})).toBe(false);
  });
});

const NOW = Date.parse('2026-10-02T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function row(over: Partial<SettleRow> & { settle?: Record<string, unknown> | null } = {}): SettleRow {
  const settle = over.settle === undefined
    ? settleParams({ kind: 'lipsync', job: 'heygen:vid-1', ref: 'avatar:lipsync:u1:user-1', credits: 20 })
    : over.settle === null ? {} : { _settle: over.settle };
  return { id: over.id ?? 'lipsync:heygen:vid-1', user_id: over.user_id === undefined ? 'user-1' : over.user_id, status: 'processing', created_at: over.created_at ?? ago(45 * 60_000), params: over.params ?? settle };
}

function deps(rows: SettleRow[], verdict: SettleVerdict | ((job: string) => SettleVerdict), over: Partial<SettleDeps> = {}) {
  const calls = { deliver: [] as string[], refund: [] as Array<[string, string, number]>, fail: [] as string[], order: [] as string[] };
  const d: SettleDeps = {
    listStale: jest.fn(async () => rows),
    poll: jest.fn(async (rec) => (typeof verdict === 'function' ? verdict(rec.job) : verdict)),
    deliver: jest.fn(async (r) => { calls.deliver.push(r.id); calls.order.push(`deliver:${r.id}`); return true; }),
    refund: jest.fn(async (uid, rec) => { calls.refund.push([uid, rec.ref, rec.credits]); calls.order.push(`refund:${rec.ref}`); return 'refunded' as const; }),
    fail: jest.fn(async (id) => { calls.fail.push(id); calls.order.push(`fail:${id}`); }),
    now: () => NOW,
    ...over,
  };
  return { d, calls };
}

describe('readSettle — never guesses a ref, an amount or a kind', () => {
  test('reads a well-formed record', () => {
    expect(readSettle(settleParams({ kind: 'model3d', job: 'pred-1', ref: 'model3d:charge:j1', credits: 5 })))
      .toEqual({ v: 1, kind: 'model3d', job: 'pred-1', ref: 'model3d:charge:j1', credits: 5 });
  });
  test.each([
    [null], [[]], [{}], [{ _settle: null }], [{ _settle: { v: 2, kind: 'lipsync', job: 'j', ref: 'r', credits: 1 } }],
    [{ _settle: { v: 1, kind: 'film', job: 'j', ref: 'r', credits: 1 } }],
    [{ _settle: { v: 1, kind: 'lipsync', job: '', ref: 'r', credits: 1 } }],
    [{ _settle: { v: 1, kind: 'lipsync', job: 'j', ref: ' ', credits: 1 } }],
    [{ _settle: { v: 1, kind: 'lipsync', job: 'j', ref: 'r', credits: 0 } }],
    [{ _settle: { v: 1, kind: 'lipsync', job: 'j', ref: 'r', credits: '20' } }],
  ])('rejects %j', (params) => {
    expect(readSettle(params)).toBeNull();
  });
});

describe('settleAction — the provider decides; the clock only ends a job that never finishes', () => {
  test('succeeded → deliver, failed → refund, at any age', () => {
    expect(settleAction({ state: 'succeeded', url: 'u' }, 0)).toBe('deliver');
    expect(settleAction({ state: 'failed', reason: 'x' }, 0)).toBe('refund');
  });
  test('processing → wait, until the hard cap', () => {
    expect(settleAction({ state: 'processing' }, SETTLE_HARD_CAP_MS - 1)).toBe('wait');
    expect(settleAction({ state: 'processing' }, SETTLE_HARD_CAP_MS)).toBe('refund');
    expect(settleAction({ state: 'processing' }, Number.NaN)).toBe('wait');
  });
});

describe('settleUnpolled', () => {
  test('a provider-FAILED unpolled job is refunded (owner, ref, cap from the record) and only THEN failed', async () => {
    const { d, calls } = deps([row()], { state: 'failed', reason: 'render failed' });
    const rep = await settleUnpolled(d);
    expect(calls.refund).toEqual([['user-1', 'avatar:lipsync:u1:user-1', 20]]);
    expect(calls.order).toEqual(['refund:avatar:lipsync:u1:user-1', 'fail:lipsync:heygen:vid-1']);
    expect(rep).toMatchObject({ examined: 1, refunded: 1, delivered: 0 });
  });

  test('a provider-SUCCEEDED unpolled job is delivered and NEVER refunded', async () => {
    const { d, calls } = deps([row()], { state: 'succeeded', url: 'https://cdn/x.mp4' });
    const rep = await settleUnpolled(d);
    expect(calls.deliver).toEqual(['lipsync:heygen:vid-1']);
    expect(calls.refund).toEqual([]);
    expect(calls.fail).toEqual([]);
    expect(rep.delivered).toBe(1);
  });

  test('a success that cannot be delivered yet is retried next tick — refunded only past the hard cap', async () => {
    const young = deps([row()], { state: 'succeeded', url: 'u' }, { deliver: jest.fn(async () => false) });
    expect(await settleUnpolled(young.d)).toMatchObject({ waiting: 1, refunded: 0 });
    expect(young.calls.refund).toEqual([]);
    const old = deps([row({ created_at: ago(SETTLE_HARD_CAP_MS + 1) })], { state: 'succeeded', url: 'u' }, { deliver: jest.fn(async () => false) });
    expect(await settleUnpolled(old.d)).toMatchObject({ refunded: 1 });
    expect(old.calls.fail).toEqual(['lipsync:heygen:vid-1']);
  });

  test('still processing → left alone; past the hard cap → refunded and failed', async () => {
    const young = deps([row()], { state: 'processing' });
    expect(await settleUnpolled(young.d)).toMatchObject({ waiting: 1 });
    expect(young.calls.refund).toEqual([]);
    expect(young.calls.fail).toEqual([]);
    const old = deps([row({ created_at: ago(SETTLE_HARD_CAP_MS + 60_000) })], { state: 'processing' });
    await settleUnpolled(old.d);
    expect(old.calls.order).toEqual(['refund:avatar:lipsync:u1:user-1', 'fail:lipsync:heygen:vid-1']);
  });

  test('a refund that errors leaves the row LIVE (not failed) so the next tick retries it', async () => {
    const { d, calls } = deps([row()], { state: 'failed', reason: 'x' }, { refund: jest.fn(async () => 'error' as const) });
    const rep = await settleUnpolled(d);
    expect(calls.fail).toEqual([]);
    expect(rep.errors).toBe(1);
  });

  test('nothing left to refund (the client poll already did) still closes the row', async () => {
    const { d, calls } = deps([row()], { state: 'failed', reason: 'x' }, { refund: jest.fn(async () => 'nothing' as const) });
    const rep = await settleUnpolled(d);
    expect(calls.fail).toEqual(['lipsync:heygen:vid-1']);
    expect(rep.refunded).toBe(0);
  });

  test('a row without an owner or a readable record is never touched', async () => {
    const { d, calls } = deps([row({ user_id: null }), row({ id: 'r2', settle: null })], { state: 'failed', reason: 'x' });
    const rep = await settleUnpolled(d);
    expect(d.poll).not.toHaveBeenCalled();
    expect(calls.refund).toEqual([]);
    expect(rep.examined).toBe(0);
  });

  test('a poll that THROWS is treated as still processing, never as a failure', async () => {
    const { d, calls } = deps([row()], { state: 'processing' }, { poll: jest.fn(async () => { throw new Error('provider down'); }) });
    expect(await settleUnpolled(d)).toMatchObject({ waiting: 1 });
    expect(calls.refund).toEqual([]);
  });

  test('asks only for rows older than the stale threshold', async () => {
    const { d } = deps([], { state: 'processing' });
    await settleUnpolled(d, { limit: 7 });
    expect(d.listStale).toHaveBeenCalledWith(new Date(NOW - SETTLE_STALE_MS).toISOString(), 7);
  });

  test('stops at its time budget — unvisited rows wait for the next tick', async () => {
    let t = NOW;
    const rows = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })];
    const { d } = deps(rows, { state: 'processing' }, { now: () => t, poll: jest.fn(async () => { t += 30_000; return { state: 'processing' } as const; }) });
    const rep = await settleUnpolled(d, { budgetMs: 45_000 });
    expect(rep.examined).toBe(2);
  });

  test('a listing that fails reports an error and settles nothing', async () => {
    const { d } = deps([], { state: 'failed', reason: 'x' }, { listStale: jest.fn(async () => { throw new Error('db down'); }) });
    expect(await settleUnpolled(d)).toMatchObject({ errors: 1, examined: 0 });
  });
});
