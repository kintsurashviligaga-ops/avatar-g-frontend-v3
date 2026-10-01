/** @jest-environment node */
/**
 * The wallet top-up checkout carries the AUTHENTICATED user, so the webhook can credit them (lib/billing/topupPayer).
 * Without it a paid top-up could not be matched to anyone on production (no `subscriptions` table there).
 */
jest.mock('server-only', () => ({}));
const mockCreateSession = jest.fn(async (_p: unknown) => 'https://checkout.stripe.com/c/pay/cs_test');
jest.mock('../../../../lib/billing/stripe', () => ({
  createWalletTopupSession: (p: unknown) => mockCreateSession(p),
  getOrCreateCustomer: jest.fn(async () => 'cus_new'),
}));
jest.mock('../../../../lib/supabase/auth', () => ({
  requireAuthenticatedUser: jest.fn(async () => ({ id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', email: 'u@example.ge', user_metadata: {} })),
}));
jest.mock('../../../../lib/supabase/server', () => ({
  createRouteHandlerClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'relation "subscriptions" does not exist' } }) }) }),
      upsert: async () => ({ error: { message: 'relation "subscriptions" does not exist' } }),
    }),
  }),
}));
jest.mock('../../../../lib/monetization/provider', () => ({
  getBillingProvider: () => ({ kind: 'stripe' }),
  BillingProviderUnavailableError: class extends Error {},
}));
jest.mock('../../../../lib/billing/pricingConfig.db', () => ({ getActiveTiers: async () => [{ gelAmount: 20 }] }));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimit: async () => null, RATE_LIMITS: { WRITE: {} } }));

import { NextRequest } from 'next/server';
import { POST } from './route';

test('the Checkout Session is created FOR the signed-in user (userId → client_reference_id + metadata.user_id)', async () => {
  const res = await POST(new NextRequest('https://myavatar.ge/api/billing/wallet-topup', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://myavatar.ge' }, body: JSON.stringify({ amountGel: 20 }),
  }));
  expect(res.status).toBe(200);
  expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({
    userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7', customerId: 'cus_new', amountGel: 20,
  }));
});
