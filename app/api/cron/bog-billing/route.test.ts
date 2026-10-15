/** @jest-environment node */
/**
 * /api/cron/bog-billing — reconcile lost callbacks, expire dead checkouts, charge due renewals exactly once.
 */
jest.mock('server-only', () => ({}));

import { fakeSupabase, type FakeCall } from '../../../../lib/billing/__testing__/fakeSupabase';
const mockDb: { pending: unknown[]; paid: unknown[]; due: unknown[]; expired: unknown[] } = { pending: [], paid: [], due: [], expired: [] };
/** The refund sweep's query reads paid statuses; the reconcile reads pending ones. */
const isRefundSweep = (c: FakeCall) => c.filters.some((f) => f[0] === 'in' && f[1] === 'status');
let mockLog: FakeCall[] = [];
jest.mock('../../../../lib/supabase/server', () => ({
  createServiceRoleClient: () => {
    const f = fakeSupabase((c) => {
      if (c.table === 'bog_orders' && c.op === 'select') return { data: isRefundSweep(c) ? mockDb.paid : mockDb.pending };
      if (c.table === 'bog_orders' && c.op === 'update' && (c.args[0] as { status?: string }).status === 'expired') return { data: mockDb.expired };
      if (c.table === 'subscriptions' && c.op === 'select') return { data: mockDb.due };
      return {};
    });
    mockLog = f.log;
    return f.client;
  },
}));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
let mockConfigured = true;
let mockEnvironment: 'production' | 'sandbox' = 'production';
const mockCharge = jest.fn();
const mockReceipt = jest.fn();
jest.mock('../../../../lib/billing/bogClient', () => ({
  bogConfig: () => (mockConfigured ? { environment: mockEnvironment } : null),
  chargeSavedCard: (...a: unknown[]) => mockCharge(...a),
  getBogReceipt: (...a: unknown[]) => mockReceipt(...a),
}));
const mockReconcile = jest.fn();
const mockSettle = jest.fn();
jest.mock('../../../../lib/billing/bogSettlement', () => ({
  BOG_ORDER_COLUMNS: '*',
  bogCallbackUrl: () => 'https://myavatar.ge/api/billing/bog/webhook',
  reconcileBogOrder: (...a: unknown[]) => mockReconcile(...a),
  settleBogOrder: (...a: unknown[]) => mockSettle(...a),
  isBogRefundStatus: (s: unknown) => ['refund_requested', 'refunded_partially', 'refunded'].includes(String(s)),
  bogSandboxBlocked: (...a: unknown[]) =>
    (jest.requireActual('../../../../lib/billing/bogSettlement') as typeof import('../../../../lib/billing/bogSettlement')).bogSandboxBlocked(
      ...(a as Parameters<typeof import('../../../../lib/billing/bogSettlement').bogSandboxBlocked>),
    ),
}));
const mockLimits = jest.fn();
let mockScope: 'merchant' | 'customer' = 'merchant';
jest.mock('../../../../lib/billing/bogLimits', () => ({
  bogLimits: () => ({ singleTransaction: 500, per24h: 1000, per30d: 5000, scope: mockScope }),
  checkBogLimits: (...a: unknown[]) => mockLimits(...a),
}));
const mockClaim = jest.fn();
const mockFail = jest.fn();
jest.mock('../../../../lib/billing/wallet-ledger', () => ({
  claimBogRenewal: (...a: unknown[]) => mockClaim(...a),
  recordBogRenewalFailure: (...a: unknown[]) => mockFail(...a),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

const ENV = { ...process.env };
const tick = (auth = 'Bearer cron-secret') => GET(new NextRequest('https://myavatar.ge/api/cron/bog-billing', { headers: { authorization: auth } }));

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, CRON_SECRET: 'cron-secret' };
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  mockConfigured = true;
  mockEnvironment = 'production';
  mockLog = [];
  mockDb.pending = [];
  mockDb.paid = [];
  mockDb.due = [];
  mockDb.expired = [];
  mockScope = 'merchant';
  mockLimits.mockResolvedValue({ ok: true, used24hGel: 0, used30dGel: 0 });
});
afterEach(() => {
  process.env = { ...ENV };
});

test('403 without the cron secret — and when the secret is unset', async () => {
  expect((await tick('Bearer nope')).status).toBe(403);
  delete process.env.CRON_SECRET;
  expect((await tick('Bearer ')).status).toBe(403);
});

test('inert until BOG is configured', async () => {
  mockConfigured = false;
  expect(await (await tick()).json()).toEqual({ ok: true, skipped: 'bog_unconfigured' });
});

test('sandbox credentials on a Vercel deployment (Production database): nothing is reconciled, expired or charged', async () => {
  mockEnvironment = 'sandbox';
  process.env.VERCEL_ENV = 'preview';
  mockDb.pending = [{ shop_order_id: 'myavatar-topup-0123456789abcdef', bog_order_id: 'bog-1' }];
  expect(await (await tick()).json()).toEqual({ ok: true, skipped: 'bog_sandbox_blocked' });
  expect(mockReconcile).not.toHaveBeenCalled();
  expect(mockClaim).not.toHaveBeenCalled();
  expect(mockCharge).not.toHaveBeenCalled();
  expect(mockLog).toEqual([]);
});

test('every pending order with a BOG id is reconciled (lost callbacks get credited)', async () => {
  mockDb.pending = [{ shop_order_id: 'a' }, { shop_order_id: 'b' }];
  mockReconcile.mockResolvedValueOnce({ status: 'completed' }).mockResolvedValueOnce({ status: 'rejected' });
  const body = await (await tick()).json();
  expect(body).toMatchObject({ ok: true, reconciled: 2, completed: 1, rejected: 1 });
  const q = mockLog.find((c) => c.table === 'bog_orders' && c.op === 'select' && !isRefundSweep(c));
  expect(q?.filters).toEqual(expect.arrayContaining([['eq', 'status', 'pending'], ['not', 'bog_order_id', 'is', null]]));
});

test('least recently checked first; a still-pending order goes to the back of the queue (abandoned checkouts cannot starve a paid one)', async () => {
  mockDb.pending = [{ shop_order_id: 'old-abandoned' }, { shop_order_id: 'paid-but-callback-lost' }];
  mockReconcile.mockResolvedValueOnce({ status: 'pending' }).mockResolvedValueOnce({ status: 'completed' });
  await tick();
  const q = mockLog.find((c) => c.table === 'bog_orders' && c.op === 'select' && !isRefundSweep(c));
  expect(q?.filters).toEqual(expect.arrayContaining([['order', 'updated_at', { ascending: true }], ['limit', 50]]));
  const touched = mockLog.filter(
    (c) => c.table === 'bog_orders' && c.op === 'update' && Object.keys(c.args[0] as object).join() === 'updated_at' && c.filters.some((f) => f[1] === 'status'),
  );
  expect(touched).toHaveLength(1);
  expect(touched[0]?.filters).toEqual([['eq', 'shop_order_id', 'old-abandoned'], ['eq', 'status', 'pending']]);
});

test('one order failing (a throw) does not stop the rest of the batch', async () => {
  mockDb.pending = [{ shop_order_id: 'a' }, { shop_order_id: 'b' }];
  mockReconcile.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ status: 'completed' });
  const body = await (await tick()).json();
  expect(body).toMatchObject({ ok: true, reconciled: 2, completed: 1, errors: 1 });
});

test('a renewal BOG’s limits have no room for is not claimed or charged — it waits (three limit declines would end a paying plan)', async () => {
  mockDb.due = [{ id: 'sub-1', tier: 'creator', user_id: 'u1', amount_gel: 108 }];
  mockLimits.mockResolvedValueOnce({ ok: false, window: '24h', limitGel: 1000, usedGel: 950, availableAt: null });
  const body = await (await tick()).json();
  expect(body).toMatchObject({ limitDeferred: 1, charged: 0 });
  expect(mockLimits).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: 'u1', amountGel: 108 }));
  expect(mockClaim).not.toHaveBeenCalled();
  expect(mockCharge).not.toHaveBeenCalled();
  expect(mockFail).not.toHaveBeenCalled();
});

test('merchant scope: renewals charged earlier in the same tick count toward the next one’s limit check', async () => {
  mockDb.due = [
    { id: 'sub-1', tier: 'starter', user_id: 'u1', amount_gel: 54 },
    { id: 'sub-2', tier: 'starter', user_id: 'u2', amount_gel: 54 },
  ];
  mockClaim
    .mockResolvedValueOnce({ claimed: true, shopOrderId: 'r1', parentOrderId: 'p1', bogOrderId: null, status: 'pending', reason: null })
    .mockResolvedValueOnce({ claimed: true, shopOrderId: 'r2', parentOrderId: 'p2', bogOrderId: null, status: 'pending', reason: null });
  mockCharge.mockResolvedValue({ ok: true, orderId: 'bog-r' });
  await tick();
  expect(mockLimits.mock.calls.map((c) => (c[1] as { amountGel: number }).amountGel)).toEqual([54, 108]);
});

test('a due renewal: claimed, charged on the saved card with OUR id, BOG’s id bound to the order', async () => {
  mockDb.due = [{ id: 'sub-1', tier: 'creator' }];
  mockClaim.mockResolvedValueOnce({ claimed: true, reason: null, shopOrderId: 'myavatar-renew-20261102-1-abc', parentOrderId: 'parent-1', bogOrderId: null, status: 'pending' });
  mockCharge.mockResolvedValueOnce({ ok: true, orderId: 'bog-ren-1' });
  const body = await (await tick()).json();
  expect(body).toMatchObject({ charged: 1 });
  expect(mockClaim).toHaveBeenCalledWith('sub-1', 525);
  expect(mockCharge).toHaveBeenCalledWith({ environment: 'production' }, expect.anything(), { parentOrderId: 'parent-1', externalOrderId: 'myavatar-renew-20261102-1-abc', callbackUrl: 'https://myavatar.ge/api/billing/bog/webhook' });
  const bind = mockLog.find((c) => c.table === 'bog_orders' && c.op === 'update' && (c.args[0] as { bog_order_id?: string }).bog_order_id === 'bog-ren-1');
  expect(bind?.filters).toEqual(expect.arrayContaining([['eq', 'shop_order_id', 'myavatar-renew-20261102-1-abc'], ['is', 'bog_order_id', null]]));
});

test('a refused charge (card gone) is recorded as a failed attempt; no answer is retried next tick', async () => {
  mockDb.due = [{ id: 'sub-1', tier: 'starter' }, { id: 'sub-2', tier: 'starter' }];
  mockClaim
    .mockResolvedValueOnce({ claimed: true, shopOrderId: 'r1', parentOrderId: 'p1', bogOrderId: null, status: 'pending', reason: null })
    .mockResolvedValueOnce({ claimed: true, shopOrderId: 'r2', parentOrderId: 'p2', bogOrderId: null, status: 'pending', reason: null });
  mockCharge.mockResolvedValueOnce({ ok: false, error: 'refused', status: 404 }).mockResolvedValueOnce({ ok: false, error: 'unavailable', status: 0 });
  const body = await (await tick()).json();
  expect(body).toMatchObject({ refused: 1, retryLater: 1 });
  expect(mockFail).toHaveBeenCalledWith('r1', 'refused_404');
  expect(mockFail).toHaveBeenCalledTimes(1);
});

test('a period already in flight is charged again ONLY if the first request never got an answer (same id → same key)', async () => {
  mockDb.due = [{ id: 'sub-1', tier: 'starter' }, { id: 'sub-2', tier: 'starter' }];
  mockClaim
    .mockResolvedValueOnce({ claimed: false, reason: 'in_flight', shopOrderId: 'r1', parentOrderId: 'p1', bogOrderId: null, status: 'pending' })
    .mockResolvedValueOnce({ claimed: false, reason: 'in_flight', shopOrderId: 'r2', parentOrderId: 'p2', bogOrderId: 'bog-x', status: 'pending' });
  mockCharge.mockResolvedValueOnce({ ok: true, orderId: 'bog-r1' });
  await tick();
  expect(mockCharge).toHaveBeenCalledTimes(1);
  expect(mockCharge.mock.calls[0][2]).toMatchObject({ externalOrderId: 'r1' });
});

test('stale checkout orders are expired; renewals are never auto-expired (a charge may exist)', async () => {
  mockDb.expired = [{ shop_order_id: 'x' }];
  const body = await (await tick()).json();
  expect(body.expired).toBe(1);
  const exp = mockLog.find((c) => c.op === 'update' && (c.args[0] as { status?: string }).status === 'expired');
  expect(exp?.filters).toEqual(expect.arrayContaining([['in', 'kind', ['topup', 'subscription']]]));
});

describe('refunds whose callback never came (the bank, 2026-10-15: read refund status from Payment Details)', () => {
  const PAID = { shop_order_id: 'myavatar-topup-0123456789abcdef', bog_order_id: 'bog-1', status: 'completed', amount_gel: 10, kind: 'topup' };
  const touchedSweep = () =>
    mockLog.filter((c) => c.table === 'bog_orders' && c.op === 'update' && Object.keys(c.args[0] as object).join() === 'updated_at' && !c.filters.some((f) => f[1] === 'status'));

  test('reads paid orders of the last 60 days, each at most once a day, least recently checked first, 20 a tick', async () => {
    const before = Date.now();
    await tick();
    const q = mockLog.find((c) => c.table === 'bog_orders' && c.op === 'select' && isRefundSweep(c));
    expect(q?.filters).toEqual(
      expect.arrayContaining([
        ['in', 'status', ['completed', 'refund_requested', 'refunded_partially']],
        ['not', 'bog_order_id', 'is', null],
        ['order', 'updated_at', { ascending: true }],
        ['limit', 20],
      ]),
    );
    const at = (op: string, col: string) => Date.parse(String(q?.filters.find((f) => f[0] === op && f[1] === col)?.[2]));
    expect(before - at('gt', 'credited_at')).toBeGreaterThanOrEqual(60 * 86_400_000 - 1_000);
    expect(before - at('gt', 'credited_at')).toBeLessThan(60 * 86_400_000 + 5_000);
    expect(before - at('lt', 'updated_at')).toBeGreaterThanOrEqual(86_400_000 - 1_000);
    expect(before - at('lt', 'updated_at')).toBeLessThan(86_400_000 + 5_000);
  });

  test('BOG says refunded: settled through the refund branch (bookkeeping only), counted, checked', async () => {
    mockDb.paid = [PAID];
    const receipt = { orderId: 'bog-1', state: 'refunded', refundAmount: 10 };
    mockReceipt.mockResolvedValueOnce(receipt);
    mockSettle.mockResolvedValueOnce({ status: 'refunded', refundAmountGel: 10 });
    const body = await (await tick()).json();
    expect(body).toMatchObject({ ok: true, refundChecked: 1, refundUpdated: 1, errors: 0 });
    expect(mockReceipt).toHaveBeenCalledWith({ environment: 'production' }, expect.anything(), 'bog-1');
    expect(mockSettle).toHaveBeenCalledWith(expect.anything(), PAID, receipt);
    expect(touchedSweep().map((c) => c.filters)).toEqual([[['eq', 'shop_order_id', PAID.shop_order_id]]]);
  });

  test('BOG still says completed (or the same refund state we have): nothing is settled — no fulfil, no credit — only the check time moves', async () => {
    mockDb.paid = [PAID, { ...PAID, shop_order_id: 'myavatar-topup-fedcba9876543210', bog_order_id: 'bog-2', status: 'refund_requested' }];
    mockReceipt.mockResolvedValueOnce({ orderId: 'bog-1', state: 'completed' }).mockResolvedValueOnce({ orderId: 'bog-2', state: 'refund_requested' });
    const body = await (await tick()).json();
    expect(body).toMatchObject({ refundChecked: 2, refundUpdated: 0, errors: 0 });
    expect(mockSettle).not.toHaveBeenCalled();
    expect(touchedSweep()).toHaveLength(2);
  });

  test('no answer from BOG, or a throw: counted as an error, the rest of the batch still runs, tried again tomorrow', async () => {
    mockDb.paid = [PAID, { ...PAID, shop_order_id: 'myavatar-topup-fedcba9876543210', bog_order_id: 'bog-2' }];
    mockReceipt.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('boom'));
    const body = await (await tick()).json();
    expect(body).toMatchObject({ ok: true, refundChecked: 2, refundUpdated: 0, errors: 2 });
    expect(touchedSweep()).toHaveLength(2);
  });
});
