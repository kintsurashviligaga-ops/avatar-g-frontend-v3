/** @jest-environment node */
/**
 * POST /api/billing/subscribe — inert until configured, signed-in only, and the session it builds carries the user
 * on the SUBSCRIPTION (so invoice.paid can always find who to credit).
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string; email?: string } | null = null;
jest.mock('../../../../lib/supabase/auth', () => ({
  requireAuthenticatedUser: async () => {
    if (!mockUser) throw new Error('UNAUTHENTICATED');
    return mockUser;
  },
}));

const mockSessionsCreate = jest.fn();
jest.mock('../../../../lib/billing/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { create: (...a: unknown[]) => mockSessionsCreate(...a) } } }),
}));

/** Service-role client: subscriptions rows (for the resolver and the customer lookup) and the profile's comp tier. */
let mockSubscriptionRows: unknown[] | null = [];
let mockProfileTier: string | null = 'FREE';
jest.mock('../../../../lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.limit = () =>
        Promise.resolve(
          mockSubscriptionRows === null
            ? { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}'` } }
            : { data: mockSubscriptionRows, error: null },
        );
      chain.maybeSingle = () => Promise.resolve({ data: { tier: mockProfileTier }, error: null });
      return chain;
    },
  }),
}));

import { POST } from './route';

const PRICE_ENVS = ['STRIPE_PRICE_STARTER', 'STRIPE_PRICE_CREATOR', 'STRIPE_PRICE_BUSINESS', 'STRIPE_SECRET_KEY'] as const;
const SAVED: Record<string, string | undefined> = {};

function req(body: unknown) {
  return new Request('https://myavatar.ge/api/billing/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as never;
}

async function call(body: unknown) {
  const res = await POST(req(body));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

beforeAll(() => { for (const k of PRICE_ENVS) SAVED[k] = process.env[k]; });
afterAll(() => {
  for (const k of PRICE_ENVS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

let errSpy: jest.SpyInstance;
beforeEach(() => {
  for (const k of PRICE_ENVS) delete process.env[k];
  mockUser = { id: 'user-1', email: 'a@example.com' };
  mockSubscriptionRows = [];
  mockProfileTier = 'FREE';
  mockSessionsCreate.mockReset().mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

const configure = () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_PRICE_STARTER = 'price_s';
  process.env.STRIPE_PRICE_CREATOR = 'price_c';
  process.env.STRIPE_PRICE_BUSINESS = 'price_b';
};

describe('POST /api/billing/subscribe', () => {
  it('401 without a signed-in user, and never touches Stripe', async () => {
    mockUser = null;
    configure();
    expect((await call({ tier: 'creator' })).status).toBe(401);
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it.each([[{}], [{ tier: 'free' }], [{ tier: 'pro' }], [{ tier: 'basic' }], [{ tier: 'CREATOR' }], ['not json']])(
    '400 for a body that names no paid tier: %j',
    async (body) => {
      configure();
      const r = await call(body);
      expect(r.status).toBe(400);
      expect(r.json).toEqual({ error: 'invalid_tier', allowed: ['starter', 'creator', 'business'] });
    },
  );

  it('503 not_configured while the tier’s price env is unset (today’s state)', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    const r = await call({ tier: 'business' });
    expect(r.status).toBe(503);
    expect(r.json.error).toBe('not_configured');
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it('503 not_configured when the price is set but Stripe itself is not', async () => {
    process.env.STRIPE_PRICE_BUSINESS = 'price_b';
    expect((await call({ tier: 'business' })).json.error).toBe('not_configured');
  });

  it('creates a mode:"subscription" session for the tier’s recurring price, user stamped on the subscription', async () => {
    configure();
    const r = await call({ tier: 'creator' });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_1', tier: 'creator' });
    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
    const params = mockSessionsCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(params).toMatchObject({
      mode: 'subscription',
      line_items: [{ price: 'price_c', quantity: 1 }],
      customer_email: 'a@example.com',
      client_reference_id: 'user-1',
      metadata: { kind: 'subscription', user_id: 'user-1', tier: 'creator' },
      subscription_data: { metadata: { user_id: 'user-1', tier: 'creator' } },
      allow_promotion_codes: false,
      success_url: 'https://myavatar.ge/dashboard?subscription=success&tier=creator',
      cancel_url: 'https://myavatar.ge/dashboard?subscription=canceled',
    });
    expect(params).not.toHaveProperty('customer');
  });

  it('ignores a user id smuggled in the body — the session’s user is the signed-in one', async () => {
    configure();
    await call({ tier: 'starter', user_id: 'victim', userId: 'victim' });
    const params = mockSessionsCreate.mock.calls[0]![0] as { metadata: Record<string, string>; subscription_data: { metadata: Record<string, string> } };
    expect(params.metadata.user_id).toBe('user-1');
    expect(params.subscription_data.metadata.user_id).toBe('user-1');
  });

  it('reuses a known Stripe customer instead of creating another', async () => {
    configure();
    mockSubscriptionRows = [{ stripe_customer_id: 'temp_123' }, { stripe_customer_id: 'cus_known' }];
    await call({ tier: 'starter' });
    const params = mockSessionsCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.customer).toBe('cus_known');
    expect(params).not.toHaveProperty('customer_email');
  });

  it('still works while the subscriptions table does not exist (live today)', async () => {
    configure();
    mockSubscriptionRows = null;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await call({ tier: 'starter' })).status).toBe(200);
    warn.mockRestore();
  });

  it('409 when the user already has an entitling subscription — a plan change goes through the portal', async () => {
    configure();
    mockSubscriptionRows = [
      { tier: 'starter', stripe_price_id: 'price_s', status: 'active', current_period_end: new Date(Date.now() + 86_400_000).toISOString(), stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_1' },
    ];
    const r = await call({ tier: 'business' });
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ error: 'already_subscribed', tier: 'starter' });
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it('a COMPED user may still subscribe (a comp is not a subscription)', async () => {
    configure();
    mockProfileTier = 'PRO';
    expect((await call({ tier: 'business' })).status).toBe(200);
  });

  it('502 with no provider text when Stripe refuses', async () => {
    configure();
    mockSessionsCreate.mockRejectedValue(new Error('No such price: price_c; secret detail'));
    const r = await call({ tier: 'creator' });
    expect(r.status).toBe(502);
    expect(r.json).toEqual({ error: 'checkout_failed' });
  });
});
