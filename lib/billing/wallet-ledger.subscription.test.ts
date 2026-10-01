/** @jest-environment node */
/**
 * The service-role half of subscription allowances: grantSubscriptionAllowance (→ grant_subscription_allowance RPC)
 * and findUserIdForStripeSubscription (→ subscriptions). Own file so wallet-ledger.test.ts's mock stays untouched.
 */
jest.mock('server-only', () => ({}));

let mockRpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
let mockLookups: Record<string, { data: unknown; error: unknown }>;
let mockThrow = false;
const mockQueries: Array<[string, string, unknown]> = [];

jest.mock('../supabase/server', () => ({
  createServiceRoleClient: () => {
    if (mockThrow) throw new Error('no client');
    return {
      rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args),
      from: (table: string) => ({
        select: () => ({
          eq: (col: string, v: unknown) => {
            mockQueries.push([table, col, v]);
            return { limit: () => ({ maybeSingle: () => Promise.resolve(mockLookups[`${col}=${String(v)}`] ?? { data: null, error: null }) }) };
          },
        }),
      }),
    };
  },
}));

import { findUserIdForStripeSubscription, grantSubscriptionAllowance } from './wallet-ledger';

const GRANT = {
  userId: 'u1',
  invoiceId: 'in_1',
  tier: 'creator',
  credits: 525,
  subscriptionId: 'sub_1',
  customerId: 'cus_1',
  priceId: 'price_c',
  periodStart: '2026-10-01T00:00:00.000Z',
  periodEnd: '2026-11-01T00:00:00.000Z',
};

beforeEach(() => {
  mockThrow = false;
  mockRpc = async () => ({ data: { granted: true, balance: 575, ref: 'sub:in_1' }, error: null });
  mockLookups = {};
  mockQueries.length = 0;
});

describe('grantSubscriptionAllowance', () => {
  it('calls grant_subscription_allowance with every argument the SQL signature declares', async () => {
    let seen: { fn: string; args: Record<string, unknown> } | null = null;
    mockRpc = async (fn, args) => {
      seen = { fn, args };
      return { data: { granted: true, balance: 575 }, error: null };
    };
    expect(await grantSubscriptionAllowance(GRANT)).toEqual({ granted: true, balance: 575 });
    expect(seen).toEqual({
      fn: 'grant_subscription_allowance',
      args: {
        p_user_id: 'u1',
        p_invoice_id: 'in_1',
        p_tier: 'creator',
        p_credits: 525,
        p_subscription_id: 'sub_1',
        p_customer_id: 'cus_1',
        p_price_id: 'price_c',
        p_period_start: '2026-10-01T00:00:00.000Z',
        p_period_end: '2026-11-01T00:00:00.000Z',
      },
    });
  });

  it('a redelivery comes back granted:false — success, not failure', async () => {
    mockRpc = async () => ({ data: { granted: false, balance: 575 }, error: null });
    expect(await grantSubscriptionAllowance(GRANT)).toEqual({ granted: false, balance: 575 });
  });

  it('null (→ the webhook retries) on an RPC error, a throw, a junk payload or no client', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc = async () => ({ data: null, error: { message: 'function grant_subscription_allowance does not exist' } });
    expect(await grantSubscriptionAllowance(GRANT)).toBeNull();
    mockRpc = async () => { throw new Error('network'); };
    expect(await grantSubscriptionAllowance(GRANT)).toBeNull();
    mockRpc = async () => ({ data: 42, error: null });
    expect(await grantSubscriptionAllowance(GRANT)).toBeNull();
    mockThrow = true;
    expect(await grantSubscriptionAllowance(GRANT)).toBeNull();
    err.mockRestore();
  });

  it('refuses nonsense amounts before touching the database', async () => {
    const rpc = jest.fn();
    mockRpc = rpc;
    for (const credits of [0, -5, 1.5, Number.NaN]) expect(await grantSubscriptionAllowance({ ...GRANT, credits })).toBeNull();
    expect(await grantSubscriptionAllowance({ ...GRANT, userId: '' })).toBeNull();
    expect(await grantSubscriptionAllowance({ ...GRANT, invoiceId: '' })).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('findUserIdForStripeSubscription', () => {
  it('finds the user by subscription id first', async () => {
    mockLookups['stripe_subscription_id=sub_1'] = { data: { user_id: 'u-sub' }, error: null };
    mockLookups['stripe_customer_id=cus_1'] = { data: { user_id: 'u-cus' }, error: null };
    expect(await findUserIdForStripeSubscription({ subscriptionId: 'sub_1', customerId: 'cus_1' })).toBe('u-sub');
    expect(mockQueries).toEqual([['subscriptions', 'stripe_subscription_id', 'sub_1']]);
  });

  it('falls back to the customer id', async () => {
    mockLookups['stripe_customer_id=cus_1'] = { data: { user_id: 'u-cus' }, error: null };
    expect(await findUserIdForStripeSubscription({ subscriptionId: 'sub_1', customerId: 'cus_1' })).toBe('u-cus');
  });

  it('null when unknown, unreadable (today: the table does not exist) or no client', async () => {
    expect(await findUserIdForStripeSubscription({ subscriptionId: 'sub_1', customerId: null })).toBeNull();
    mockLookups['stripe_subscription_id=sub_1'] = { data: null, error: { code: 'PGRST205' } };
    expect(await findUserIdForStripeSubscription({ subscriptionId: 'sub_1', customerId: null })).toBeNull();
    mockThrow = true;
    expect(await findUserIdForStripeSubscription({ subscriptionId: 'sub_1', customerId: 'cus_1' })).toBeNull();
  });
});
