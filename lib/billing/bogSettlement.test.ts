/** @jest-environment node */
/**
 * lib/billing/bogSettlement — a receipt decides WHETHER an order is paid; our row decides what it is worth.
 * The money RPCs (wallet-ledger) and BOG's card deletion are mocked; the db is a recording fake.
 */
jest.mock('server-only', () => ({}));

const mockFulfill = jest.fn();
const mockRecordFailure = jest.fn();
jest.mock('./wallet-ledger', () => ({
  fulfillBogOrder: (...a: unknown[]) => mockFulfill(...a),
  recordBogRenewalFailure: (...a: unknown[]) => mockRecordFailure(...a),
}));
const mockDeleteCard = jest.fn(async () => true);
const mockReceipt = jest.fn();
jest.mock('./bogClient', () => ({
  deleteSavedCard: (...a: unknown[]) => (mockDeleteCard as (...x: unknown[]) => Promise<boolean>)(...a),
  getBogReceipt: (...a: unknown[]) => mockReceipt(...a),
}));

import {
  bogCallbackUrl,
  cardSavedForRenewals,
  isBogOrderId,
  newBogOrderId,
  reconcileBogOrder,
  settleBogOrder,
  type BogOrderRow,
} from './bogSettlement';
import type { BogConfig, BogReceipt } from './bogClient';

const updates: Array<{ patch: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
const db = {
  from: () => ({
    update: (patch: Record<string, unknown>) => {
      const entry = { patch, filters: [] as Array<[string, unknown]> };
      updates.push(entry);
      const chain = {
        eq: (col: string, val: unknown) => {
          entry.filters.push([col, val]);
          return chain;
        },
        then: (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res),
      };
      return chain;
    },
  }),
} as never;

const order = (o: Partial<BogOrderRow> = {}): BogOrderRow => ({
  shop_order_id: 'myavatar-topup-0123456789abcdef',
  bog_order_id: 'bog-1',
  user_id: 'user-1',
  amount_gel: 20,
  status: 'pending',
  kind: 'topup',
  tier: null,
  credits: 200,
  subscription_id: null,
  card_saved: false,
  ...o,
});
const receipt = (r: Partial<BogReceipt> = {}): BogReceipt => ({
  orderId: 'bog-1',
  externalOrderId: 'myavatar-topup-0123456789abcdef',
  statusKey: 'completed',
  state: 'completed',
  requestAmount: 20,
  transferAmount: 20,
  currency: 'GEL',
  transferMethod: 'card',
  savedCardType: null,
  parentOrderId: null,
  paymentOption: 'direct_debit',
  cardMask: '548888xxxxxx9893',
  cardExpiry: '03/27',
  code: '100',
  rejectReason: null,
  ...r,
});
const fulfilled = (f: Record<string, unknown> = {}) => ({
  granted: true, kind: 'topup', credits: 200, balance: 250, subscriptionId: null, tier: null, periodEnd: null, autoRenew: null,
  supersededParentOrders: [], ...f,
});

beforeEach(() => {
  jest.clearAllMocks();
  updates.length = 0;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('a completed payment', () => {
  test('a top-up is fulfilled through the RPC with OUR order id and BOG’s id — never an amount from the receipt', async () => {
    mockFulfill.mockResolvedValueOnce(fulfilled());
    const out = await settleBogOrder(db, order(), receipt());
    expect(out).toEqual({ status: 'completed', granted: true, kind: 'topup', credits: 200, tier: null, periodEnd: null, autoRenew: null });
    expect(mockFulfill).toHaveBeenCalledWith({ shopOrderId: 'myavatar-topup-0123456789abcdef', bogOrderId: 'bog-1', cardMask: '548888xxxxxx9893', cardSaved: false });
  });

  test('a redelivery is still "completed", just granted=false (the RPC is idempotent)', async () => {
    mockFulfill.mockResolvedValueOnce(fulfilled({ granted: false }));
    const out = await settleBogOrder(db, order({ status: 'completed' }), receipt());
    expect(out).toMatchObject({ status: 'completed', granted: false });
  });

  test('a plan’s first payment saves the card for renewals when BOG says so, and stops the plans it replaces', async () => {
    mockFulfill.mockResolvedValueOnce(fulfilled({ kind: 'subscription', credits: 525, tier: 'creator', autoRenew: true, supersededParentOrders: ['old-parent'] }));
    const cfg = {} as BogConfig;
    const deps = { fetch: jest.fn() as unknown as typeof fetch };
    const out = await settleBogOrder(
      db,
      order({ shop_order_id: 'myavatar-plan-aaaaaaaaaaaaaaaa', kind: 'subscription', tier: 'creator', credits: 525, amount_gel: 108, card_saved: true }),
      receipt({ externalOrderId: 'myavatar-plan-aaaaaaaaaaaaaaaa', requestAmount: 108, transferAmount: 108, savedCardType: 'subscription' }),
      { cfg, deps },
    );
    expect(out).toMatchObject({ status: 'completed', kind: 'subscription', autoRenew: true });
    expect(mockFulfill.mock.calls[0][0]).toMatchObject({ cardSaved: true });
    expect(mockDeleteCard).toHaveBeenCalledWith(cfg, deps, 'old-parent');
  });

  test('when the receipt omits saved_card_type, only OUR save-card request + a card payment count as saved', () => {
    const plan = order({ kind: 'subscription', card_saved: true });
    expect(cardSavedForRenewals(plan, receipt({ savedCardType: null, transferMethod: 'card' }))).toBe(true);
    expect(cardSavedForRenewals(plan, receipt({ savedCardType: null, transferMethod: 'apple_pay' }))).toBe(false);
    expect(cardSavedForRenewals(order({ kind: 'subscription', card_saved: false }), receipt({ savedCardType: null }))).toBe(false);
    expect(cardSavedForRenewals(plan, receipt({ savedCardType: 'recurrent' }))).toBe(false);
    expect(cardSavedForRenewals(order({ kind: 'topup', card_saved: true }), receipt({ savedCardType: 'subscription' }))).toBe(false);
  });

  test.each([
    ['amount', { requestAmount: 2000 }],
    ['currency', { currency: 'USD' }],
    ['partial_payment', { transferAmount: 5 }],
  ])('a %s mismatch credits NOTHING and flags the order for review', async (reason, patch) => {
    const out = await settleBogOrder(db, order(), receipt(patch));
    expect(out).toEqual({ status: 'mismatch', reason });
    expect(mockFulfill).not.toHaveBeenCalled();
    expect(updates[0].patch).toMatchObject({ status: 'amount_mismatch', reject_reason: reason });
  });

  test('a receipt about a different order is refused outright (our id, or BOG’s bound id)', async () => {
    expect(await settleBogOrder(db, order(), receipt({ externalOrderId: 'myavatar-topup-ffffffffffffffff' }))).toEqual({ status: 'mismatch', reason: 'external_order_id' });
    expect(await settleBogOrder(db, order(), receipt({ orderId: 'bog-OTHER' }))).toEqual({ status: 'mismatch', reason: 'order_id' });
    expect(mockFulfill).not.toHaveBeenCalled();
  });

  test('a failed RPC is an error to retry, never "paid"', async () => {
    mockFulfill.mockResolvedValueOnce(null);
    expect(await settleBogOrder(db, order(), receipt())).toEqual({ status: 'error', reason: 'fulfill_failed' });
  });
});

describe('a declined or refunded payment', () => {
  test('a declined checkout order is marked rejected (only while still pending)', async () => {
    const out = await settleBogOrder(db, order(), receipt({ state: 'rejected', statusKey: 'rejected', rejectReason: 'expiration' }));
    expect(out).toEqual({ status: 'rejected', reason: 'expiration' });
    expect(updates[0].patch).toMatchObject({ status: 'rejected', reject_reason: 'expiration' });
    expect(updates[0].filters).toEqual(expect.arrayContaining([['status', 'pending']]));
    expect(mockFulfill).not.toHaveBeenCalled();
  });

  test('a declined renewal goes through the back-off RPC', async () => {
    await settleBogOrder(db, order({ kind: 'renewal', shop_order_id: 'myavatar-renew-20261102-1-abc' }), receipt({ externalOrderId: 'myavatar-renew-20261102-1-abc', state: 'rejected', rejectReason: null, code: '107' }));
    expect(mockRecordFailure).toHaveBeenCalledWith('myavatar-renew-20261102-1-abc', 'code_107');
  });

  test('a refund made in BOG’s business manager is recorded, credits are not clawed back automatically', async () => {
    const out = await settleBogOrder(db, order({ status: 'completed' }), receipt({ state: 'refunded', statusKey: 'refunded' }));
    expect(out).toEqual({ status: 'refunded' });
    expect(updates[0].patch).toMatchObject({ status: 'refunded' });
    expect(mockFulfill).not.toHaveBeenCalled();
  });

  test('a still-processing payment moves nothing but binds BOG’s id', async () => {
    const out = await settleBogOrder(db, order({ bog_order_id: null }), receipt({ state: 'pending', statusKey: 'processing' }));
    expect(out).toEqual({ status: 'pending' });
    expect(updates[0].patch).toMatchObject({ bog_order_id: 'bog-1' });
  });
});

describe('reconcile', () => {
  const cfg = {} as BogConfig;
  const deps = { fetch: jest.fn() as unknown as typeof fetch };

  test('an order that never reached BOG stays pending without a request', async () => {
    expect(await reconcileBogOrder(db, cfg, deps, order({ bog_order_id: null }))).toEqual({ status: 'pending' });
    expect(mockReceipt).not.toHaveBeenCalled();
  });

  test('no receipt → error (try again later); a receipt → settled', async () => {
    mockReceipt.mockResolvedValueOnce(null);
    expect(await reconcileBogOrder(db, cfg, deps, order())).toEqual({ status: 'error', reason: 'receipt_unavailable' });
    mockReceipt.mockResolvedValueOnce(receipt());
    mockFulfill.mockResolvedValueOnce(fulfilled());
    expect(await reconcileBogOrder(db, cfg, deps, order())).toMatchObject({ status: 'completed' });
    expect(mockReceipt).toHaveBeenLastCalledWith(cfg, deps, 'bog-1');
  });
});

describe('ids + callback url', () => {
  test('our order ids: a readable prefix (bank statements show 25 chars) and URL-safe', () => {
    const t = newBogOrderId('topup');
    expect(t).toMatch(/^myavatar-topup-[0-9a-f]{16}$/);
    expect(newBogOrderId('plan')).toMatch(/^myavatar-plan-[0-9a-f]{16}$/);
    expect(isBogOrderId(t)).toBe(true);
    expect(isBogOrderId('myavatar-renew-20261102-1-fc2900b439c24c78')).toBe(true);
    expect(isBogOrderId("x' or 1=1 --")).toBe(false);
    expect(isBogOrderId('myavatar-topup-' + 'a'.repeat(100))).toBe(false);
  });

  test('callbacks go to the canonical site when one is configured', () => {
    const before = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = 'https://myavatar.ge/';
    expect(bogCallbackUrl('https://preview.vercel.app')).toBe('https://myavatar.ge/api/billing/bog/webhook');
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const app = process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(bogCallbackUrl('https://preview.vercel.app')).toBe('https://preview.vercel.app/api/billing/bog/webhook');
    if (before !== undefined) process.env.NEXT_PUBLIC_SITE_URL = before;
    if (app !== undefined) process.env.NEXT_PUBLIC_APP_URL = app;
  });
});
