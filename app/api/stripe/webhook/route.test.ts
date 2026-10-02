/** @jest-environment node */
/**
 * /api/stripe/webhook — the subscription-allowance grant on invoice.paid, and proof that every pre-existing event
 * path behaves exactly as before.
 *
 * Stripe and Supabase are mocked; lib/billing/subscriptionAllowance runs for real (it is pure), so these tests
 * exercise the actual tier mapping from STRIPE_PRICE_<TIER>.
 */
jest.mock('server-only', () => ({}));

// NB: jest.mock factories may only reference `mock`-prefixed outer vars, and use RELATIVE paths.
let mockEvent: Record<string, unknown> | null = null;
const mockConstructEvent = jest.fn();
const mockSubscriptionsRetrieve = jest.fn();
const mockCustomersRetrieve = jest.fn();
jest.mock('../../../../lib/billing/stripe', () => ({
  getStripe: () => ({
    webhooks: { constructEvent: (...a: unknown[]) => mockConstructEvent(...a) },
    subscriptions: { retrieve: (...a: unknown[]) => mockSubscriptionsRetrieve(...a) },
    customers: { retrieve: (...a: unknown[]) => mockCustomersRetrieve(...a) },
    charges: { retrieve: jest.fn() },
  }),
}));

const mockReportError = jest.fn();
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: (...a: unknown[]) => mockReportError(...a) }));

const mockGetUserIdFromCustomerId = jest.fn();
const mockUpsertSubscription = jest.fn();
jest.mock('../../../../lib/stripe/subscriptions', () => ({
  upsertSubscription: (...a: unknown[]) => mockUpsertSubscription(...a),
  updateSubscriptionStatus: jest.fn(),
  getUserIdFromCustomerId: (...a: unknown[]) => mockGetUserIdFromCustomerId(...a),
  storeCustomerMapping: jest.fn(),
}));
jest.mock('../../../../lib/stripe/connect', () => ({ updateAccountStatus: jest.fn() }));
jest.mock('../../../../lib/stripe/payments', () => ({ updateCommissionStatus: jest.fn() }));

const mockCreditWalletGel = jest.fn();
const mockGrantPurchasedCredits = jest.fn();
const mockGrantSubscriptionAllowance = jest.fn();
const mockFindUserIdForStripeSubscription = jest.fn();
jest.mock('../../../../lib/billing/wallet-ledger', () => ({
  creditWalletGel: (...a: unknown[]) => mockCreditWalletGel(...a),
  grantPurchasedCredits: (...a: unknown[]) => mockGrantPurchasedCredits(...a),
  grantSubscriptionAllowance: (...a: unknown[]) => mockGrantSubscriptionAllowance(...a),
  findUserIdForStripeSubscription: (...a: unknown[]) => mockFindUserIdForStripeSubscription(...a),
}));

const mockCreateNotification = jest.fn();
jest.mock('../../../../lib/notifications/store', () => ({ createNotification: (...a: unknown[]) => mockCreateNotification(...a) }));
const mockRecompute = jest.fn();
jest.mock('../../../../lib/finance/aggregates', () => ({ recomputeFinanceDailyAggregates: (...a: unknown[]) => mockRecompute(...a) }));
jest.mock('../../../../lib/platform/queues', () => ({ enqueueQueueItem: jest.fn().mockResolvedValue(undefined) }));

/**
 * Route-handler (anon, cookie) client — what the pre-existing code uses. Per-table results are configurable;
 * every write is recorded.
 */
const mockDb: {
  rows: Record<string, unknown>;
  writes: Array<{ table: string; op: string; payload: unknown }>;
} = { rows: {}, writes: [] };
function mockTable(table: string) {
  const result = () => Promise.resolve({ data: mockDb.rows[table] ?? null, error: null });
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.limit = () => chain;
  chain.maybeSingle = result;
  chain.single = result;
  chain.upsert = (payload: unknown) => {
    mockDb.writes.push({ table, op: 'upsert', payload });
    return Promise.resolve({ error: null });
  };
  chain.insert = (payload: unknown) => {
    mockDb.writes.push({ table, op: 'insert', payload });
    return Promise.resolve({ error: null });
  };
  return chain;
}
jest.mock('../../../../lib/supabase/server', () => ({
  createRouteHandlerClient: () => ({ from: (t: string) => mockTable(t) }),
  createServiceRoleClient: () => ({ from: (t: string) => mockTable(t) }),
}));

import { POST } from './route';

const USER = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const PERIOD_START = 1_790_000_000;
const PERIOD_END = PERIOD_START + 30 * 86_400;
const PRICE_ENVS = ['STRIPE_PRICE_STARTER', 'STRIPE_PRICE_CREATOR', 'STRIPE_PRICE_BUSINESS'] as const;

function fakeReq(body = '{}', headers: Record<string, string> = { 'stripe-signature': 't=1,v1=sig' }) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { text: async () => body, headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null } } as never;
}

async function deliver(event: Record<string, unknown>) {
  mockEvent = event;
  const res = await POST(fakeReq());
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const markedProcessed = () => mockDb.writes.some((w) => w.table === 'webhook_events' && w.op === 'upsert');
const commissionInserts = () => mockDb.writes.filter((w) => w.table === 'affiliate_commission_events' && w.op === 'insert');

// The route keeps an in-memory set of processed event ids for the life of the module, so every delivery in this
// file needs its own event id — exactly as Stripe's would be.
let mockEventSeq = 0;
function invoicePaid(over: Record<string, unknown> = {}, price = 'price_creator_m') {
  mockEventSeq += 1;
  return {
    id: `evt_inv_${mockEventSeq}`,
    type: 'invoice.paid',
    livemode: false,
    created: PERIOD_START,
    data: {
      object: {
        id: 'in_1',
        customer: 'cus_1',
        status: 'paid',
        amount_paid: 3999,
        currency: 'usd',
        billing_reason: 'subscription_cycle',
        parent: { subscription_details: { subscription: 'sub_1', metadata: { user_id: USER, tier: 'creator' } } },
        lines: { data: [{ amount: 3999, period: { start: PERIOD_START, end: PERIOD_END }, pricing: { price_details: { price } } }] },
        ...over,
      },
    },
  };
}

const SAVED: Record<string, string | undefined> = {};
beforeAll(() => {
  SAVED.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  for (const k of PRICE_ENVS) SAVED[k] = process.env[k];
});
afterAll(() => {
  for (const [k, v] of Object.entries(SAVED)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

let logSpies: jest.SpyInstance[] = [];
beforeEach(() => {
  for (const k of PRICE_ENVS) delete process.env[k];
  mockDb.rows = {};
  mockDb.writes.length = 0;
  mockConstructEvent.mockReset().mockImplementation(() => mockEvent);
  mockSubscriptionsRetrieve.mockReset();
  mockReportError.mockReset();
  mockGetUserIdFromCustomerId.mockReset().mockResolvedValue(USER);
  mockUpsertSubscription.mockReset().mockResolvedValue(undefined);
  mockCreditWalletGel.mockReset().mockResolvedValue(100);
  mockGrantPurchasedCredits.mockReset().mockResolvedValue(280);
  mockGrantSubscriptionAllowance.mockReset().mockResolvedValue({ granted: true, balance: 575 });
  mockFindUserIdForStripeSubscription.mockReset().mockResolvedValue(null);
  mockCreateNotification.mockReset().mockResolvedValue(undefined);
  mockRecompute.mockReset().mockResolvedValue(undefined);
  logSpies = [jest.spyOn(console, 'info').mockImplementation(() => {}), jest.spyOn(console, 'error').mockImplementation(() => {})];
});
afterEach(() => logSpies.forEach((s) => s.mockRestore()));

const configureTiers = () => {
  process.env.STRIPE_PRICE_STARTER = 'price_starter_m';
  process.env.STRIPE_PRICE_CREATOR = 'price_creator_m';
  process.env.STRIPE_PRICE_BUSINESS = 'price_business_m';
};

describe('invoice.paid → subscription allowance', () => {
  it('grants the tier’s monthly credits once, under sub:<invoice id>, and answers 200', async () => {
    configureTiers();
    const r = await deliver(invoicePaid());
    expect(r.status).toBe(200);
    expect(mockGrantSubscriptionAllowance).toHaveBeenCalledTimes(1);
    expect(mockGrantSubscriptionAllowance).toHaveBeenCalledWith({
      userId: USER,
      invoiceId: 'in_1',
      tier: 'creator',
      credits: 525,
      subscriptionId: 'sub_1',
      customerId: 'cus_1',
      priceId: 'price_creator_m',
      periodStart: new Date(PERIOD_START * 1000).toISOString(),
      periodEnd: new Date(PERIOD_END * 1000).toISOString(),
    });
    expect(mockFindUserIdForStripeSubscription).not.toHaveBeenCalled();
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.anything(), USER, 'payment', expect.stringContaining('+525'));
    expect(markedProcessed()).toBe(true);
  });

  it('a redelivered invoice (granted:false) is a 200 with no second notification', async () => {
    configureTiers();
    mockGrantSubscriptionAllowance.mockResolvedValue({ granted: false, balance: 575 });
    expect((await deliver(invoicePaid())).status).toBe(200);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('is INERT with no STRIPE_PRICE_<TIER> set — no grant, no lookup, the commission path unchanged', async () => {
    mockDb.rows.affiliate_referrals = { affiliate_id: 'aff_1' };
    mockDb.rows.affiliates = { id: 'aff_1', commission_percent: 10, is_active: true };
    const event = invoicePaid();
    const r = await deliver(event);
    expect(r.status).toBe(200);
    expect(mockGrantSubscriptionAllowance).not.toHaveBeenCalled();
    expect(mockFindUserIdForStripeSubscription).not.toHaveBeenCalled();
    expect(commissionInserts()).toHaveLength(1);
    expect(commissionInserts()[0]!.payload).toMatchObject({ stripe_event_id: event.id, gross_amount_cents: 3999, commission_amount_cents: 400 });
    expect(mockRecompute).toHaveBeenCalledTimes(1);
    expect(markedProcessed()).toBe(true);
  });

  it('skips silently when the price maps to no tier', async () => {
    configureTiers();
    expect((await deliver(invoicePaid({}, 'price_something_else'))).status).toBe(200);
    expect(mockGrantSubscriptionAllowance).not.toHaveBeenCalled();
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it('skips a $0 invoice and a proration', async () => {
    configureTiers();
    await deliver(invoicePaid({ amount_paid: 0 }));
    await deliver(invoicePaid({ billing_reason: 'subscription_update' }));
    expect(mockGrantSubscriptionAllowance).not.toHaveBeenCalled();
  });

  it('a FAILED grant answers 500 so Stripe redelivers — and the event is not marked processed', async () => {
    configureTiers();
    mockGrantSubscriptionAllowance.mockResolvedValue(null);
    mockDb.rows.affiliate_referrals = { affiliate_id: 'aff_1' };
    mockDb.rows.affiliates = { id: 'aff_1', commission_percent: 10, is_active: true };
    const event = invoicePaid();
    const r = await deliver(event);
    expect(r.status).toBe(500);
    expect(markedProcessed()).toBe(false);
    expect(mockReportError).toHaveBeenCalledWith(expect.objectContaining({ name: 'RetryableWebhookError' }), expect.objectContaining({ eventId: event.id }));
    // The commission half still ran (idempotent on stripe_event_id, so the retry cannot double it).
    expect(commissionInserts()).toHaveLength(1);
  });

  it('no resolvable user → 500 (retry), via the metadata-less fallback lookup', async () => {
    configureTiers();
    const r = await deliver(invoicePaid({ parent: { subscription_details: { subscription: 'sub_1', metadata: {} } } }));
    expect(mockFindUserIdForStripeSubscription).toHaveBeenCalledWith({ subscriptionId: 'sub_1', customerId: 'cus_1' });
    expect(r.status).toBe(500);
    expect(mockGrantSubscriptionAllowance).not.toHaveBeenCalled();
  });

  it('the fallback lookup finding the user grants normally', async () => {
    configureTiers();
    mockFindUserIdForStripeSubscription.mockResolvedValue('user-from-db');
    const r = await deliver(invoicePaid({ parent: { subscription_details: { subscription: 'sub_1', metadata: null } } }));
    expect(r.status).toBe(200);
    expect(mockGrantSubscriptionAllowance).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-from-db' }));
  });

  it('a commission failure keeps its old outcome (logged, 200) and does not undo the grant', async () => {
    configureTiers();
    mockRecompute.mockRejectedValue(new Error('aggregates down'));
    mockDb.rows.affiliate_referrals = { affiliate_id: 'aff_1' };
    mockDb.rows.affiliates = { id: 'aff_1', commission_percent: 10, is_active: true };
    const r = await deliver(invoicePaid());
    expect(r.status).toBe(200);
    expect(mockGrantSubscriptionAllowance).toHaveBeenCalledTimes(1);
    expect(mockReportError).toHaveBeenCalledTimes(1);
    expect(markedProcessed()).toBe(false);
  });
});

describe('pre-existing paths are unchanged', () => {
  it('rejects a missing signature (400) and a bad one (401)', async () => {
    expect((await POST(fakeReq('{}', {}))).status).toBe(400);
    mockConstructEvent.mockImplementation(() => { throw new Error('bad sig'); });
    expect((await POST(fakeReq())).status).toBe(401);
  });

  it('checkout.session.completed tier_topup grants the pack via grantPurchasedCredits(stripe:<session>)', async () => {
    const r = await deliver({
      id: 'evt_cs_1',
      type: 'checkout.session.completed',
      livemode: false,
      created: PERIOD_START,
      data: { object: { id: 'cs_1', mode: 'payment', customer: 'cus_1', metadata: { kind: 'tier_topup', user_id: USER, credits: '525', tier_id: 'pro' } } },
    });
    expect(r.status).toBe(200);
    expect(mockGrantPurchasedCredits).toHaveBeenCalledWith(USER, 525, 'stripe:cs_1');
    expect(mockGrantSubscriptionAllowance).not.toHaveBeenCalled();
  });

  it('a failed tier-pack grant answers 500 so Stripe redelivers (was the known bug: 200, never retried)', async () => {
    mockGrantPurchasedCredits.mockResolvedValue(null);
    const r = await deliver({
      id: 'evt_cs_2',
      type: 'checkout.session.completed',
      livemode: false,
      created: PERIOD_START,
      data: { object: { id: 'cs_2', mode: 'payment', customer: 'cus_1', metadata: { kind: 'tier_topup', user_id: USER, credits: '525' } } },
    });
    expect(r.status).toBe(500);
    expect(mockReportError).toHaveBeenCalledTimes(1);
  });

  it('a failed wallet top-up credit answers 500 so Stripe redelivers (the ref keeps it exactly-once)', async () => {
    mockCreditWalletGel.mockResolvedValue(null);
    const r = await deliver(topup({ id: 'cs_9', metadata: { kind: 'wallet_topup', amount_gel: '29', user_id: USER } }));
    expect(r.status).toBe(500);
    expect(mockCreditWalletGel).toHaveBeenCalledWith(USER, 29, 'stripe:cs_9');
  });

  const topup = (object: Record<string, unknown>) => ({
    id: `evt_${String(object.id)}`, type: 'checkout.session.completed', livemode: false, created: PERIOD_START,
    data: { object: { mode: 'payment', customer: 'cus_1', ...object } },
  });

  it('wallet_topup credits the user the SERVER put on the session (metadata.user_id) — no table, no Stripe lookup', async () => {
    const r = await deliver(topup({ id: 'cs_3', metadata: { kind: 'wallet_topup', amount_gel: '29', user_id: USER } }));
    expect(r.status).toBe(200);
    expect(mockCreditWalletGel).toHaveBeenCalledWith(USER, 29, 'stripe:cs_3');
    expect(mockFindUserIdForStripeSubscription).not.toHaveBeenCalled();
    expect(mockCustomersRetrieve).not.toHaveBeenCalled();
  });

  it('wallet_topup from an older session (no user id on it) still credits via the subscriptions row', async () => {
    mockFindUserIdForStripeSubscription.mockResolvedValueOnce(USER);
    const r = await deliver(topup({ id: 'cs_4', metadata: { kind: 'wallet_topup', amount_gel: '29' } }));
    expect(r.status).toBe(200);
    expect(mockFindUserIdForStripeSubscription).toHaveBeenCalledWith({ subscriptionId: '', customerId: 'cus_1' });
    expect(mockCreditWalletGel).toHaveBeenCalledWith(USER, 29, 'stripe:cs_4');
  });

  it('wallet_topup with no subscriptions row (production) credits via the Stripe customer’s own metadata.userId', async () => {
    mockFindUserIdForStripeSubscription.mockResolvedValueOnce(null);
    mockCustomersRetrieve.mockResolvedValueOnce({ id: 'cus_1', metadata: { userId: USER } });
    const r = await deliver(topup({ id: 'cs_5', metadata: { kind: 'wallet_topup', amount_gel: '49' } }));
    expect(r.status).toBe(200);
    expect(mockCreditWalletGel).toHaveBeenCalledWith(USER, 49, 'stripe:cs_5');
  });

  it('a paid top-up nobody can be matched to is an ALERT (Sentry), not a silent log line — and credits no one', async () => {
    mockFindUserIdForStripeSubscription.mockResolvedValueOnce(null);
    mockCustomersRetrieve.mockResolvedValueOnce({ id: 'cus_1', metadata: {} });
    const r = await deliver(topup({ id: 'cs_6', metadata: { kind: 'wallet_topup', amount_gel: '29' } }));
    expect(r.status).toBe(200);
    expect(mockCreditWalletGel).not.toHaveBeenCalled();
    expect(mockReportError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ stage: 'wallet-topup-unresolved', sessionId: 'cs_6', amountGel: 29 }));
  });

  it('Stripe unreachable while resolving a PAID top-up → 500 so Stripe redelivers (the credit is idempotent)', async () => {
    mockFindUserIdForStripeSubscription.mockResolvedValueOnce(null);
    mockCustomersRetrieve.mockRejectedValueOnce(new Error('ECONNRESET'));
    const r = await deliver(topup({ id: 'cs_7', metadata: { kind: 'wallet_topup', amount_gel: '29' } }));
    expect(r.status).toBe(500);
    expect(mockCreditWalletGel).not.toHaveBeenCalled();
  });

  it('invoice.payment_succeeded still only syncs the subscription (no allowance there)', async () => {
    configureTiers();
    mockSubscriptionsRetrieve.mockResolvedValue({ id: 'sub_1', customer: 'cus_1', status: 'active', items: { data: [] } });
    const r = await deliver({ ...invoicePaid(), id: 'evt_ps_1', type: 'invoice.payment_succeeded' });
    expect(r.status).toBe(200);
    expect(mockGrantSubscriptionAllowance).not.toHaveBeenCalled();
  });
});
