/** @jest-environment node */
import {
  ALLOWANCE_BILLING_REASONS,
  RetryableWebhookError,
  SILENT_SKIPS,
  applyInvoiceAllowance,
  planInvoiceAllowance,
  type AllowanceDeps,
  type InvoiceLike,
} from './subscriptionAllowance';

const ENV = { STRIPE_PRICE_STARTER: 'price_s', STRIPE_PRICE_CREATOR: 'price_c', STRIPE_PRICE_BUSINESS: 'price_b' };
const USER = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const START = 1_790_000_000; // unix seconds
const END = START + 30 * 86_400;

/** An invoice in the shape API 2026-02-25.clover delivers (subscription under parent, price under pricing). */
function cloverInvoice(over: Partial<InvoiceLike> = {}, price = 'price_c'): InvoiceLike {
  return {
    id: 'in_123',
    customer: 'cus_1',
    status: 'paid',
    amount_paid: 3999,
    billing_reason: 'subscription_cycle',
    period_start: START - 30 * 86_400,
    period_end: START,
    parent: { subscription_details: { subscription: 'sub_1', metadata: { user_id: USER, tier: 'creator' } } },
    lines: { data: [{ amount: 3999, period: { start: START, end: END }, pricing: { price_details: { price } } }] },
    ...over,
  };
}

/** The same invoice in the pre-basil shape (invoice.subscription, line.price). */
function legacyInvoice(over: Partial<InvoiceLike> = {}): InvoiceLike {
  return {
    id: 'in_legacy',
    customer: { id: 'cus_2' },
    status: 'paid',
    amount_paid: 1999,
    billing_reason: 'subscription_create',
    subscription: { id: 'sub_2' },
    subscription_details: { metadata: { user_id: USER } },
    lines: { data: [{ amount: 1999, period: { start: START, end: END }, price: { id: 'price_s' } }] },
    ...over,
  };
}

describe('planInvoiceAllowance — what one paid invoice is worth', () => {
  it('a clover-shape creator renewal grants 525 credits under sub:<invoice id>', () => {
    expect(planInvoiceAllowance(cloverInvoice(), ENV)).toEqual({
      action: 'grant',
      invoiceId: 'in_123',
      ref: 'sub:in_123',
      tier: 'creator',
      credits: 525,
      subscriptionId: 'sub_1',
      customerId: 'cus_1',
      priceId: 'price_c',
      periodStart: new Date(START * 1000).toISOString(),
      periodEnd: new Date(END * 1000).toISOString(),
      metadataUserId: USER,
    });
  });

  it('reads the pre-basil shape too (invoice.subscription, line.price, expanded objects)', () => {
    const plan = planInvoiceAllowance(legacyInvoice(), ENV);
    expect(plan).toMatchObject({ action: 'grant', tier: 'starter', credits: 230, subscriptionId: 'sub_2', customerId: 'cus_2', priceId: 'price_s', metadataUserId: USER });
  });

  it('accepts an expanded Price object on the clover line', () => {
    const inv = cloverInvoice({ lines: { data: [{ amount: 7999, period: { start: START, end: END }, pricing: { price_details: { price: { id: 'price_b' } } } }] } });
    expect(planInvoiceAllowance(inv, ENV)).toMatchObject({ action: 'grant', tier: 'business', credits: 1200 });
  });

  it('is INERT with no price env: every invoice is "no_tier" — silently', () => {
    expect(planInvoiceAllowance(cloverInvoice(), {})).toEqual({ action: 'skip', reason: 'no_tier' });
    expect(SILENT_SKIPS.has('no_tier')).toBe(true);
  });

  it.each<[string, Partial<InvoiceLike>, string]>([
    ['no invoice id', { id: '' }, 'no_invoice_id'],
    ['a one-off (non-subscription) invoice', { parent: null }, 'not_subscription'],
    ['an invoice not marked paid', { status: 'open' }, 'not_paid'],
    ['a $0 invoice (trial / 100% coupon)', { amount_paid: 0 }, 'zero_amount'],
    ['a missing amount', { amount_paid: null }, 'zero_amount'],
    ['a proration on a plan change', { billing_reason: 'subscription_update' }, 'billing_reason'],
    ['a manual invoice', { billing_reason: 'manual' }, 'billing_reason'],
    ['no billing reason', { billing_reason: null }, 'billing_reason'],
  ])('skips %s', (_label, over, reason) => {
    expect(planInvoiceAllowance(cloverInvoice(over), ENV)).toEqual({ action: 'skip', reason });
  });

  it('skips a price that maps to no tier (e.g. a legacy PRO subscription)', () => {
    expect(planInvoiceAllowance(cloverInvoice({}, 'price_legacy_pro'), { ...ENV, STRIPE_PRICE_PRO: 'price_legacy_pro' })).toEqual({ action: 'skip', reason: 'no_tier' });
  });

  it('refuses an invoice that sells two different tiers', () => {
    const inv = cloverInvoice({
      lines: {
        data: [
          { amount: 1999, period: { start: START, end: END }, pricing: { price_details: { price: 'price_s' } } },
          { amount: 7999, period: { start: START, end: END }, pricing: { price_details: { price: 'price_b' } } },
        ],
      },
    });
    expect(planInvoiceAllowance(inv, ENV)).toEqual({ action: 'skip', reason: 'ambiguous_tier' });
  });

  it('ignores a negative (credit) line when working out what was sold', () => {
    const inv = cloverInvoice({
      lines: {
        data: [
          { amount: -1999, period: { start: START, end: END }, pricing: { price_details: { price: 'price_s' } } },
          { amount: 3999, period: { start: START, end: END }, pricing: { price_details: { price: 'price_c' } } },
        ],
      },
    });
    expect(planInvoiceAllowance(inv, ENV)).toMatchObject({ action: 'grant', tier: 'creator' });
  });

  it('only creation and renewal carry a month', () => {
    expect([...ALLOWANCE_BILLING_REASONS].sort()).toEqual(['subscription_create', 'subscription_cycle']);
  });

  it('drops a malformed metadata user id (the DB lookup takes over)', () => {
    const inv = cloverInvoice({ parent: { subscription_details: { subscription: 'sub_1', metadata: { user_id: 'not-a-uuid; drop table' } } } });
    expect(planInvoiceAllowance(inv, ENV)).toMatchObject({ action: 'grant', metadataUserId: null });
  });

  it('a missing line period leaves periodEnd null (the entitlement row then never outlives the invoice)', () => {
    const inv = cloverInvoice({ lines: { data: [{ amount: 3999, pricing: { price_details: { price: 'price_c' } } }] } });
    expect(planInvoiceAllowance(inv, ENV)).toMatchObject({ action: 'grant', periodEnd: null, periodStart: new Date((START - 30 * 86_400) * 1000).toISOString() });
  });

  it('null / undefined invoice → skip, never throw', () => {
    expect(planInvoiceAllowance(null, ENV)).toEqual({ action: 'skip', reason: 'no_invoice_id' });
    expect(planInvoiceAllowance(undefined, ENV)).toEqual({ action: 'skip', reason: 'no_invoice_id' });
  });
});

describe('applyInvoiceAllowance — the effectful half', () => {
  const deps = (over: Partial<AllowanceDeps> = {}): AllowanceDeps & { grant: jest.Mock; findUserId: jest.Mock } => ({
    env: ENV,
    findUserId: jest.fn().mockResolvedValue(null),
    grant: jest.fn().mockResolvedValue({ granted: true, balance: 575 }),
    ...over,
  }) as AllowanceDeps & { grant: jest.Mock; findUserId: jest.Mock };

  it('grants through deps.grant with the metadata user, without a DB lookup', async () => {
    const d = deps();
    const out = await applyInvoiceAllowance(cloverInvoice(), d);
    expect(out).toEqual({ status: 'granted', userId: USER, invoiceId: 'in_123', tier: 'creator', credits: 525, ref: 'sub:in_123', balance: 575 });
    expect(d.findUserId).not.toHaveBeenCalled();
    expect(d.grant).toHaveBeenCalledWith({
      userId: USER,
      invoiceId: 'in_123',
      tier: 'creator',
      credits: 525,
      subscriptionId: 'sub_1',
      customerId: 'cus_1',
      priceId: 'price_c',
      periodStart: new Date(START * 1000).toISOString(),
      periodEnd: new Date(END * 1000).toISOString(),
    });
  });

  it('a redelivered invoice reports "duplicate" — success, nothing granted twice', async () => {
    const d = deps({ grant: jest.fn().mockResolvedValue({ granted: false, balance: 575 }) });
    expect(await applyInvoiceAllowance(cloverInvoice(), d)).toMatchObject({ status: 'duplicate', credits: 525 });
  });

  it('falls back to the subscriptions lookup when the metadata has no user', async () => {
    const d = deps({ findUserId: jest.fn().mockResolvedValue('db-user') });
    const inv = cloverInvoice({ parent: { subscription_details: { subscription: 'sub_1', metadata: {} } } });
    expect(await applyInvoiceAllowance(inv, d)).toMatchObject({ status: 'granted', userId: 'db-user' });
    expect(d.findUserId).toHaveBeenCalledWith({ subscriptionId: 'sub_1', customerId: 'cus_1' });
  });

  it('THROWS RetryableWebhookError when no user can be found — Stripe must redeliver, not drop a paid month', async () => {
    const d = deps();
    const inv = cloverInvoice({ parent: { subscription_details: { subscription: 'sub_1', metadata: null } } });
    await expect(applyInvoiceAllowance(inv, d)).rejects.toBeInstanceOf(RetryableWebhookError);
    expect(d.grant).not.toHaveBeenCalled();
  });

  it('a throwing user lookup is the same as "not found" → retry', async () => {
    const d = deps({ findUserId: jest.fn().mockRejectedValue(new Error('db down')) });
    const inv = cloverInvoice({ parent: { subscription_details: { subscription: 'sub_1' } } });
    await expect(applyInvoiceAllowance(inv, d)).rejects.toBeInstanceOf(RetryableWebhookError);
  });

  it('THROWS RetryableWebhookError when the grant fails or throws', async () => {
    await expect(applyInvoiceAllowance(cloverInvoice(), deps({ grant: jest.fn().mockResolvedValue(null) }))).rejects.toBeInstanceOf(RetryableWebhookError);
    await expect(applyInvoiceAllowance(cloverInvoice(), deps({ grant: jest.fn().mockRejectedValue(new Error('rpc')) }))).rejects.toBeInstanceOf(RetryableWebhookError);
  });

  it('a skip does no I/O at all', async () => {
    const d = deps({ env: {} });
    expect(await applyInvoiceAllowance(cloverInvoice(), d)).toEqual({ status: 'skipped', reason: 'no_tier' });
    expect(d.findUserId).not.toHaveBeenCalled();
    expect(d.grant).not.toHaveBeenCalled();
  });

  it('RetryableWebhookError is an Error with a retryable marker', () => {
    const e = new RetryableWebhookError('x');
    expect(e).toBeInstanceOf(Error);
    expect(e.retryable).toBe(true);
    expect(e.name).toBe('RetryableWebhookError');
  });
});
