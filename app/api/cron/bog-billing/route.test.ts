/** @jest-environment node */
/**
 * /api/cron/bog-billing — reconcile lost callbacks, expire dead checkouts, charge due renewals exactly once.
 */
jest.mock('server-only', () => ({}));

import { fakeSupabase, type FakeCall } from '../../../../lib/billing/__testing__/fakeSupabase';
const mockDb: { pending: unknown[]; due: unknown[]; expired: unknown[] } = { pending: [], due: [], expired: [] };
let mockLog: FakeCall[] = [];
jest.mock('../../../../lib/supabase/server', () => ({
  createServiceRoleClient: () => {
    const f = fakeSupabase((c) => {
      if (c.table === 'bog_orders' && c.op === 'select') return { data: mockDb.pending };
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
const mockCharge = jest.fn();
jest.mock('../../../../lib/billing/bogClient', () => ({
  bogConfig: () => (mockConfigured ? {} : null),
  chargeSavedCard: (...a: unknown[]) => mockCharge(...a),
}));
const mockReconcile = jest.fn();
jest.mock('../../../../lib/billing/bogSettlement', () => ({
  BOG_ORDER_COLUMNS: '*',
  bogCallbackUrl: () => 'https://myavatar.ge/api/billing/bog/webhook',
  reconcileBogOrder: (...a: unknown[]) => mockReconcile(...a),
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
  mockConfigured = true;
  mockDb.pending = [];
  mockDb.due = [];
  mockDb.expired = [];
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

test('every pending order with a BOG id is reconciled (lost callbacks get credited)', async () => {
  mockDb.pending = [{ shop_order_id: 'a' }, { shop_order_id: 'b' }];
  mockReconcile.mockResolvedValueOnce({ status: 'completed' }).mockResolvedValueOnce({ status: 'rejected' });
  const body = await (await tick()).json();
  expect(body).toMatchObject({ ok: true, reconciled: 2, completed: 1, rejected: 1 });
  const q = mockLog.find((c) => c.table === 'bog_orders' && c.op === 'select');
  expect(q?.filters).toEqual(expect.arrayContaining([['eq', 'status', 'pending'], ['not', 'bog_order_id', 'is', null]]));
});

test('a due renewal: claimed, charged on the saved card with OUR id, BOG’s id bound to the order', async () => {
  mockDb.due = [{ id: 'sub-1', tier: 'creator' }];
  mockClaim.mockResolvedValueOnce({ claimed: true, reason: null, shopOrderId: 'myavatar-renew-20261102-1-abc', parentOrderId: 'parent-1', bogOrderId: null, status: 'pending' });
  mockCharge.mockResolvedValueOnce({ ok: true, orderId: 'bog-ren-1' });
  const body = await (await tick()).json();
  expect(body).toMatchObject({ charged: 1 });
  expect(mockClaim).toHaveBeenCalledWith('sub-1', 525);
  expect(mockCharge).toHaveBeenCalledWith({}, expect.anything(), { parentOrderId: 'parent-1', externalOrderId: 'myavatar-renew-20261102-1-abc', callbackUrl: 'https://myavatar.ge/api/billing/bog/webhook' });
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
