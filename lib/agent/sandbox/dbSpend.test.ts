/** @jest-environment node */
jest.mock('server-only', () => ({}));
import { dbSpendStore, type SpendRpcClient } from './dbSpend';

const ID = '11111111-2222-3333-4444-555555555555';

function fake(rpc: SpendRpcClient['rpc'], rows: unknown = []): () => SpendRpcClient {
  return () => ({ rpc, from: () => ({ select: async () => ({ data: rows, error: null }) }) });
}

describe('dbSpendStore', () => {
  it('returns the reservation id the database gives', async () => {
    const calls: unknown[] = [];
    const store = dbSpendStore({ userId: ID, client: fake(async (fn, args) => (calls.push([fn, args]), { data: ID, error: null })) });
    expect(await store.reserve(0.02, 20)).toBe(ID);
    expect(calls[0]).toEqual(['reserve_sandbox_spend', { p_usd: 0.02, p_cap: 20, p_user: ID }]);
  });

  it('fails closed: null when over the cap, on a database error, or when the client throws', async () => {
    expect(await dbSpendStore({ client: fake(async () => ({ data: null, error: null })) }).reserve(1, 20)).toBeNull();
    expect(await dbSpendStore({ client: fake(async () => ({ data: null, error: { code: 'PGRST202' } })) }).reserve(1, 20)).toBeNull();
    expect(
      await dbSpendStore({
        client: () => {
          throw new Error('no env');
        },
      }).reserve(1, 20),
    ).toBeNull();
  });

  it('drops a user id that is not a uuid', async () => {
    let args: Record<string, unknown> = {};
    await dbSpendStore({ userId: 'x', client: fake(async (_f, a) => ((args = a), { data: ID, error: null })) }).reserve(1, 20);
    expect(args.p_user).toBeNull();
  });

  it('settles by id and sums used, or reserved when unsettled', async () => {
    const calls: unknown[] = [];
    const store = dbSpendStore({
      client: fake(async (fn, args) => (calls.push([fn, args]), { data: null, error: null }), [
        { reserved_usd: '0.05', used_usd: '0.01' },
        { reserved_usd: 0.04, used_usd: null },
      ]),
    });
    await store.settle(ID, 0.05, 0.01);
    expect(calls[0]).toEqual(['settle_sandbox_spend', { p_id: ID, p_used: 0.01 }]);
    expect(await store.total()).toBeCloseTo(0.05, 6);
  });
});
