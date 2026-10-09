/** @jest-environment node */
/**
 * lib/stripe/subscriptions — the webhook-facing writers and the customer→user lookup run as the SERVICE ROLE (a Stripe
 * webhook has no session cookie, so the cookie client is anon and RLS hid every row); the readers a signed-in user
 * triggers keep the cookie client so RLS still scopes them.
 */
jest.mock('server-only', () => ({}));

type Kind = 'anon' | 'service';
const mockCalls: Array<{ client: Kind; table: string; op: string; payload?: unknown }> = [];
let mockRow: unknown = null;
function mockClient(client: Kind) {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const done = (op: string, payload?: unknown) => {
        mockCalls.push({ client, table, op, payload });
        return Promise.resolve({ data: mockRow, error: null });
      };
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.in = () => chain;
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.single = () => done('select');
      chain.maybeSingle = () => done('select');
      chain.upsert = (payload: unknown) => done('upsert', payload);
      chain.update = (payload: unknown) => {
        const upd: Record<string, unknown> = { eq: () => done('update', payload) };
        return upd;
      };
      return chain;
    },
  };
}
jest.mock('../supabase/server', () => ({
  createRouteHandlerClient: () => mockClient('anon'),
  createServiceRoleClient: () => mockClient('service'),
}));

import type Stripe from 'stripe';
import {
  getUserIdFromCustomerId,
  getUserSubscription,
  storeCustomerMapping,
  updateSubscriptionStatus,
  upsertSubscription,
} from './subscriptions';

beforeEach(() => {
  mockCalls.length = 0;
  mockRow = null;
  jest.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const sub = {
  id: 'sub_1',
  customer: 'cus_1',
  status: 'active',
  cancel_at_period_end: true,
  items: { data: [{ price: { id: 'price_1' }, current_period_start: 1_790_000_000, current_period_end: 1_792_592_000 }] },
} as unknown as Stripe.Subscription;

test('upsertSubscription (cancel/upgrade/downgrade sync) writes through the service role', async () => {
  await upsertSubscription(sub, 'u1');
  expect(mockCalls).toEqual([
    expect.objectContaining({ client: 'service', table: 'subscriptions', op: 'upsert', payload: expect.objectContaining({ user_id: 'u1', stripe_subscription_id: 'sub_1', cancel_at_period_end: true }) }),
  ]);
});

test('updateSubscriptionStatus (customer.subscription.deleted) writes through the service role', async () => {
  await updateSubscriptionStatus('sub_1', 'canceled');
  expect(mockCalls).toEqual([expect.objectContaining({ client: 'service', table: 'subscriptions', op: 'update', payload: expect.objectContaining({ status: 'canceled' }) })]);
});

test('getUserIdFromCustomerId and storeCustomerMapping use the service role', async () => {
  mockRow = { user_id: 'u1' };
  await expect(getUserIdFromCustomerId('cus_1')).resolves.toBe('u1');
  await storeCustomerMapping('u1', 'cus_1');
  expect(mockCalls.map((c) => c.client)).toEqual(['service', 'service']);
});

test('a signed-in user’s own read keeps the cookie client (RLS scopes it)', async () => {
  mockRow = { id: 's', user_id: 'u1', status: 'active' };
  await getUserSubscription('u1');
  expect(mockCalls).toEqual([expect.objectContaining({ client: 'anon', table: 'subscriptions', op: 'select' })]);
});
