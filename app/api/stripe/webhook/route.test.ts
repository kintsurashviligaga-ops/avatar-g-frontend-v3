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
const mockChargesRetrieve = jest.fn();
const mockSessionsList = jest.fn();
const mockInvoicePaymentsList = jest.fn();
jest.mock('../../../../lib/billing/stripe', () => ({
  getStripe: () => ({
    webhooks: { constructEvent: (...a: unknown[]) => mockConstructEvent(...a) },
    subscriptions: { retrieve: (...a: unknown[]) => mockSubscriptionsRetrieve(...a) },
    customers: { retrieve: (...a: unknown[]) => mockCustomersRetrieve(...a) },
    charges: { retrieve: (...a: unknown[]) => mockChargesRetrieve(...a) },
    checkout: { sessions: { list: (...a: unknown[]) => mockSessionsList(...a) } },
    invoicePayments: { list: (...a: unknown[]) => mockInvoicePaymentsList(...a) },
  }),
}));

// The credit ledger, as the refund / dispute reversal sees it: a grant per payment ref, the debits taken so far.
const mockLedger: { grants: Record<string, { userId: string; credits: number }>; debits: Array<{ userId: string; amount: number; ref: string }>; balance: number } = { grants: {}, debits: [], balance: 0 };
const mockDeduct = jest.fn();
jest.mock('../../../../lib/orchestrator/ledger', () => ({
  grantedForRef: async (ref: string) => ({ ok: true, grant: mockLedger.grants[ref] ?? null }),
  debitExistsForRef: async (userId: string, ref: string) => mockLedger.debits.some((d) => d.userId === userId && d.ref === ref),
  debitedUnderPrefix: async (userId: string, prefix: string) =>
    mockLedger.debits.filter((d) => d.userId === userId && d.ref.startsWith(prefix)).reduce((s, d) => s + d.amount, 0),
  creditsBalanceOf: async () => mockLedger.balance,
  deductCredits: (...a: unknown[]) => mockDeduct(...a),
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
 * Both Supabase clients, told apart: every read and write records WHICH client made it, so a test can prove the
 * webhook (no session cookie → the route-handler client is anon) never goes through the anon client.
 * Per-table results are configurable.
 */
type MockClientKind = 'anon' | 'service';
const mockDb: {
  rows: Record<string, unknown>;
  writes: Array<{ table: string; op: string; payload: unknown; client: MockClientKind }>;
  reads: Array<{ table: string; client: MockClientKind }>;
} = { rows: {}, writes: [], reads: [] };
function mockTable(table: string, client: MockClientKind) {
  const result = () => {
    mockDb.reads.push({ table, client });
    return Promise.resolve({ data: mockDb.rows[table] ?? null, error: null });
  };
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.limit = () => chain;
  chain.maybeSingle = result;
  chain.single = result;
  chain.upsert = (payload: unknown) => {
    mockDb.writes.push({ table, op: 'upsert', payload, client });
    return Promise.resolve({ error: null });
  };
  chain.insert = (payload: unknown) => {
    mockDb.writes.push({ table, op: 'insert', payload, client });
    return Promise.resolve({ error: null });
  };
  return chain;
}
jest.mock('../../../../lib/supabase/server', () => ({
  createRouteHandlerClient: () => ({ from: (t: string) => mockTable(t, 'anon') }),
  createServiceRoleClient: () => ({ from: (t: string) => mockTable(t, 'service') }),
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
  mockDb.reads.length = 0;
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
  mockChargesRetrieve.mockReset();
  mockSessionsList.mockReset().mockResolvedValue({ data: [] });
  mockInvoicePaymentsList.mockReset().mockResolvedValue({ data: [] });
  mockLedger.grants = {};
  mockLedger.debits = [];
  mockLedger.balance = 0;
  mockDeduct.mockReset().mockImplementation(async (userId: string, amount: number, ref: string) => {
    if (mockLedger.debits.some((d) => d.userId === userId && d.ref === ref)) return { ok: true, balance: mockLedger.balance };
    if (mockLedger.balance < amount) return { ok: false, reason: 'insufficient' };
    mockLedger.balance -= amount;
    mockLedger.debits.push({ userId, amount, ref });
    return { ok: true, balance: mockLedger.balance };
  });
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

describe('the webhook has no session — every database call is service role', () => {
  it('the webhook_events dedupe is read and written through the service role, never the anon client', async () => {
    const r = await deliver({ id: 'evt_dedupe_1', type: 'payment_intent.payment_failed', livemode: false, created: PERIOD_START, data: { object: { id: 'pi_1' } } });
    expect(r.status).toBe(200);
    expect(mockDb.reads).toContainEqual({ table: 'webhook_events', client: 'service' });
    expect(mockDb.writes).toContainEqual(expect.objectContaining({ table: 'webhook_events', op: 'upsert', client: 'service' }));
  });

  it('a stored event id short-circuits the redelivery (the dedupe can now actually see the row)', async () => {
    mockDb.rows.webhook_events = { id: 'row_1' };
    const r = await deliver({ id: 'evt_dedupe_2', type: 'invoice.paid', livemode: false, created: PERIOD_START, data: { object: { id: 'in_x' } } });
    expect(r.json).toEqual({ received: true, cached: true });
    expect(mockGrantSubscriptionAllowance).not.toHaveBeenCalled();
  });

  it('a refund (credit reversal + affiliate reversal) touches only the service role', async () => {
    mockSessionsList.mockResolvedValue({ data: [{ id: 'cs_r' }] });
    mockLedger.grants['stripe:cs_r'] = { userId: USER, credits: 100 };
    mockLedger.balance = 100;
    mockDb.rows.affiliate_referrals = { affiliate_id: 'aff_1' };
    mockDb.rows.affiliates = { id: 'aff_1', commission_percent: 10, is_active: true };
    expect((await deliver(refunded({ id: 'ch_svc', amount: 1000, amount_refunded: 1000 }))).status).toBe(200);
    expect(commissionInserts()).toHaveLength(1);
    expect([...mockDb.reads, ...mockDb.writes].filter((x) => x.client === 'anon')).toEqual([]);
  });

  it('no path in a full invoice.paid + affiliate run touches the anon client', async () => {
    configureTiers();
    mockDb.rows.affiliate_referrals = { affiliate_id: 'aff_1' };
    mockDb.rows.affiliates = { id: 'aff_1', commission_percent: 10, is_active: true };
    expect((await deliver(invoicePaid())).status).toBe(200);
    expect(commissionInserts()).toHaveLength(1);
    expect([...mockDb.reads, ...mockDb.writes].filter((x) => x.client === 'anon')).toEqual([]);
  });
});

function refunded(charge: Record<string, unknown>) {
  mockEventSeq += 1;
  return {
    id: `evt_refund_${mockEventSeq}`, type: 'charge.refunded', livemode: false, created: PERIOD_START,
    data: { object: { customer: 'cus_1', currency: 'usd', payment_intent: 'pi_1', refunded: true, ...charge } },
  };
}
function disputed(dispute: Record<string, unknown>) {
  mockEventSeq += 1;
  return {
    id: `evt_dispute_${mockEventSeq}`, type: 'charge.dispute.created', livemode: false, created: PERIOD_START,
    data: { object: { reason: 'fraudulent', payment_intent: 'pi_1', ...dispute } },
  };
}

describe('refunds and disputes take back the credits the payment bought', () => {
  it('a full refund of a tier pack debits the whole grant once (redelivery is a no-op)', async () => {
    mockSessionsList.mockResolvedValue({ data: [{ id: 'cs_pack' }] });
    mockLedger.grants['stripe:cs_pack'] = { userId: USER, credits: 525 };
    mockLedger.balance = 600;
    const ev = refunded({ id: 'ch_1', amount: 2900, amount_refunded: 2900 });
    expect((await deliver(ev)).status).toBe(200);
    expect(mockSessionsList).toHaveBeenCalledWith({ payment_intent: 'pi_1', limit: 1 });
    expect(mockLedger.debits).toEqual([{ userId: USER, amount: 525, ref: 'reversal:ch_1:refund:2900' }]);
    expect(mockLedger.balance).toBe(75);
    // Stripe redelivers the same event under a new id (the in-memory dedupe would otherwise short-circuit).
    expect((await deliver({ ...ev, id: 'evt_refund_again' })).status).toBe(200);
    expect(mockLedger.debits).toHaveLength(1);
  });

  it('partial refunds reverse proportionally and the second one takes only the difference', async () => {
    mockSessionsList.mockResolvedValue({ data: [{ id: 'cs_w' }] });
    mockLedger.grants['stripe:cs_w'] = { userId: USER, credits: 290 };
    mockLedger.balance = 1000;
    await deliver(refunded({ id: 'ch_2', amount: 2900, amount_refunded: 1000 }));
    await deliver(refunded({ id: 'ch_2', amount: 2900, amount_refunded: 2900 }));
    expect(mockLedger.debits).toEqual([
      { userId: USER, amount: 100, ref: 'reversal:ch_2:refund:1000' },
      { userId: USER, amount: 190, ref: 'reversal:ch_2:refund:2900' },
    ]);
  });

  it('a refunded subscription month is found through its invoice (sub:<invoice>)', async () => {
    mockInvoicePaymentsList.mockResolvedValue({ data: [{ invoice: 'in_9' }] });
    mockLedger.grants['sub:in_9'] = { userId: USER, credits: 575 };
    mockLedger.balance = 575;
    expect((await deliver(refunded({ id: 'ch_3', amount: 3999, amount_refunded: 3999 }))).status).toBe(200);
    expect(mockInvoicePaymentsList).toHaveBeenCalledWith({ payment: { type: 'payment_intent', payment_intent: 'pi_1' }, limit: 1 });
    expect(mockLedger.debits).toEqual([{ userId: USER, amount: 575, ref: 'reversal:ch_3:refund:3999' }]);
  });

  it('credits already spent: takes what is left and ALERTS the shortfall', async () => {
    mockSessionsList.mockResolvedValue({ data: [{ id: 'cs_s' }] });
    mockLedger.grants['stripe:cs_s'] = { userId: USER, credits: 525 };
    mockLedger.balance = 200;
    expect((await deliver(refunded({ id: 'ch_4', amount: 2900, amount_refunded: 2900 }))).status).toBe(200);
    expect(mockLedger.debits).toEqual([{ userId: USER, amount: 200, ref: 'reversal:ch_4:refund:2900' }]);
    expect(mockReportError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ stage: 'refund-reversal-shortfall', shortfall: 325, reversed: 200 }));
  });

  it('a refund of a payment that bought no credits changes nothing and still reverses the affiliate commission', async () => {
    mockDb.rows.affiliate_referrals = { affiliate_id: 'aff_1' };
    mockDb.rows.affiliates = { id: 'aff_1', commission_percent: 10, is_active: true };
    expect((await deliver(refunded({ id: 'ch_5', amount: 5000, amount_refunded: 5000 }))).status).toBe(200);
    expect(mockDeduct).not.toHaveBeenCalled();
    expect(commissionInserts()).toEqual([expect.objectContaining({ payload: expect.objectContaining({ status: 'reversed', gross_amount_cents: -5000 }) })]);
  });

  it('Stripe unreachable during the lookup → 500 so Stripe redelivers, and the affiliate reversal still ran', async () => {
    mockSessionsList.mockRejectedValue(new Error('ECONNRESET'));
    mockDb.rows.affiliate_referrals = { affiliate_id: 'aff_1' };
    mockDb.rows.affiliates = { id: 'aff_1', commission_percent: 10, is_active: true };
    const r = await deliver(refunded({ id: 'ch_6', amount: 2900, amount_refunded: 2900 }));
    expect(r.status).toBe(500);
    expect(commissionInserts()).toHaveLength(1);
    expect(markedProcessed()).toBe(false);
  });

  it('charge.dispute.created reverses the disputed amount (charge looked up when only its id is on the dispute)', async () => {
    mockChargesRetrieve.mockResolvedValue({ id: 'ch_7', amount: 2900, payment_intent: 'pi_1' });
    mockSessionsList.mockResolvedValue({ data: [{ id: 'cs_d' }] });
    mockLedger.grants['stripe:cs_d'] = { userId: USER, credits: 525 };
    mockLedger.balance = 525;
    const ev = disputed({ id: 'dp_1', charge: 'ch_7', amount: 2900 });
    expect((await deliver(ev)).status).toBe(200);
    expect(mockChargesRetrieve).toHaveBeenCalledWith('ch_7');
    expect(mockLedger.debits).toEqual([{ userId: USER, amount: 525, ref: 'reversal:ch_7:dispute:dp_1' }]);
    expect((await deliver({ ...ev, id: 'evt_dispute_again' })).status).toBe(200);
    expect(mockLedger.debits).toHaveLength(1);
  });

  it('a dispute after a partial refund never reverses more than was granted', async () => {
    mockSessionsList.mockResolvedValue({ data: [{ id: 'cs_pd' }] });
    mockLedger.grants['stripe:cs_pd'] = { userId: USER, credits: 100 };
    mockLedger.balance = 1000;
    await deliver(refunded({ id: 'ch_8', amount: 1000, amount_refunded: 400 }));
    await deliver(disputed({ id: 'dp_2', charge: { id: 'ch_8', amount: 1000, payment_intent: 'pi_1' }, amount: 1000 }));
    expect(mockLedger.debits.map((d) => d.amount)).toEqual([40, 60]);
    expect(mockChargesRetrieve).not.toHaveBeenCalled();
  });

  it('a ledger that cannot debit → 500 (retry), never marked processed', async () => {
    mockSessionsList.mockResolvedValue({ data: [{ id: 'cs_e' }] });
    mockLedger.grants['stripe:cs_e'] = { userId: USER, credits: 10 };
    mockDeduct.mockResolvedValue({ ok: false, reason: 'error' });
    const r = await deliver(disputed({ id: 'dp_3', charge: { id: 'ch_9', amount: 1000, payment_intent: 'pi_1' }, amount: 1000 }));
    expect(r.status).toBe(500);
    expect(markedProcessed()).toBe(false);
  });
});
