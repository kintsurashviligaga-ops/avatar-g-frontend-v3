/** @jest-environment node */
import { customerIdOf, resolveTopupPayer, type TopupPayerDeps } from './topupPayer';

const U1 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const U2 = '0d2f9a7e-3b1c-4c5d-8e6f-1a2b3c4d5e6f';
const deps = (over: Partial<TopupPayerDeps> = {}): TopupPayerDeps => ({
  userForCustomer: jest.fn(async () => null),
  customerMetadataUserId: jest.fn(async () => null),
  ...over,
});

test('the server-set metadata.user_id wins, without any lookup', async () => {
  const d = deps();
  await expect(resolveTopupPayer({ metadata: { user_id: U1 }, client_reference_id: U2, customer: 'cus_1' }, d)).resolves.toEqual({ userId: U1, via: 'metadata' });
  expect(d.userForCustomer).not.toHaveBeenCalled();
  expect(d.customerMetadataUserId).not.toHaveBeenCalled();
});

test('then client_reference_id, then the subscriptions row, then the Stripe customer metadata', async () => {
  await expect(resolveTopupPayer({ client_reference_id: U2, customer: 'cus_1' }, deps())).resolves.toEqual({ userId: U2, via: 'client_reference_id' });
  await expect(resolveTopupPayer({ customer: 'cus_1' }, deps({ userForCustomer: async () => U1 }))).resolves.toEqual({ userId: U1, via: 'subscriptions' });
  const d = deps({ customerMetadataUserId: async (c) => (c === 'cus_9' ? U2 : null) });
  await expect(resolveTopupPayer({ customer: { id: 'cus_9' } }, d)).resolves.toEqual({ userId: U2, via: 'customer_metadata' });
});

test('anything that is not a user id is ignored, never credited', async () => {
  await expect(resolveTopupPayer({ metadata: { user_id: 'admin' }, client_reference_id: '../x', customer: 'cus_1' }, deps())).resolves.toBeNull();
  await expect(resolveTopupPayer({ metadata: {}, customer: null }, deps())).resolves.toBeNull();
});

test('a failing subscriptions lookup falls through; a failing Stripe lookup propagates (the webhook asks to retry)', async () => {
  await expect(resolveTopupPayer({ customer: 'cus_1' }, deps({ userForCustomer: async () => { throw new Error('db'); }, customerMetadataUserId: async () => U1 })))
    .resolves.toEqual({ userId: U1, via: 'customer_metadata' });
  await expect(resolveTopupPayer({ customer: 'cus_1' }, deps({ customerMetadataUserId: async () => { throw new Error('stripe down'); } }))).rejects.toThrow('stripe down');
});

test('customerIdOf reads a string or an expanded customer', () => {
  expect(customerIdOf({ customer: 'cus_1' })).toBe('cus_1');
  expect(customerIdOf({ customer: { id: 'cus_2' } })).toBe('cus_2');
  expect(customerIdOf({ customer: null })).toBeNull();
});
