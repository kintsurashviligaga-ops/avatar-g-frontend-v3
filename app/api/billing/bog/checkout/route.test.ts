/** @jest-environment node */
/**
 * POST /api/billing/bog/checkout — the server prices the order, writes it BEFORE BOG hears of it, and only then
 * sends the customer to the bank. BOG, the session, the limiter and the db are mocked.
 */
jest.mock('server-only', () => ({}));

let mockUserId: string | null = 'user-1';
jest.mock('../../../../../lib/supabase/auth', () => ({
  requireAuthenticatedUser: jest.fn(async () => {
    if (!mockUserId) throw new Error('UNAUTHENTICATED');
    return { id: mockUserId };
  }),
}));
import { fakeSupabase, type FakeCall } from '../../../../../lib/billing/__testing__/fakeSupabase';
const mockDb: { live: unknown[]; insertError: unknown; liveError: unknown } = { live: [], insertError: null, liveError: null };
let mockLog: FakeCall[] = [];
jest.mock('../../../../../lib/supabase/server', () => ({
  createServiceRoleClient: () => {
    const { client, log } = fakeSupabase((c) => {
      if (c.table === 'subscriptions' && c.op === 'select') return { data: mockDb.live, error: mockDb.liveError };
      if (c.table === 'bog_orders' && c.op === 'insert') return { error: mockDb.insertError };
      return {};
    });
    mockLog = log;
    return client;
  },
}));
jest.mock('../../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  checkRateLimitByKey: jest.fn(async () => null),
  RATE_LIMITS: { WRITE: {} },
}));
jest.mock('../../../../../lib/billing/pricingConfig.db', () => ({
  getActiveTiers: jest.fn(async () => [5, 9, 10, 20, 29, 50, 89, 500].map((g) => ({ gelAmount: g, creditsAmount: g * 10, label: null, isActive: true }))),
}));
let mockConfigured = true;
const mockCreateOrder = jest.fn();
const mockSaveCard = jest.fn();
jest.mock('../../../../../lib/billing/bogClient', () => ({
  bogConfig: () => (mockConfigured ? { environment: 'production', clientId: 'c', secretKey: 's' } : null),
  createBogOrder: (...a: unknown[]) => mockCreateOrder(...a),
  saveCardForAutomaticPayments: (...a: unknown[]) => mockSaveCard(...a),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/billing/bog/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  mockUserId = 'user-1';
  mockConfigured = true;
  mockDb.live = [];
  mockDb.insertError = null;
  mockDb.liveError = null;
  mockCreateOrder.mockResolvedValue({ orderId: 'bog-ord-1', redirectUrl: 'https://payment.bog.ge/?order_id=bog-ord-1' });
  mockSaveCard.mockResolvedValue(true);
  process.env.NEXT_PUBLIC_SITE_URL = 'https://myavatar.ge';
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  process.env = { ...ENV };
  jest.restoreAllMocks();
});

const inserted = () => mockLog.find((c) => c.table === 'bog_orders' && c.op === 'insert')?.args[0] as Record<string, unknown>;
const updatesTo = () => mockLog.filter((c) => c.table === 'bog_orders' && c.op === 'update').map((c) => c.args[0] as Record<string, unknown>);

test('503 until BOG credentials are set — nothing is created', async () => {
  mockConfigured = false;
  const res = await POST(post({ kind: 'topup', amountGel: 20 }));
  expect(res.status).toBe(503);
  expect(mockCreateOrder).not.toHaveBeenCalled();
});

test('401 for a guest', async () => {
  mockUserId = null;
  expect((await POST(post({ kind: 'topup', amountGel: 20 }))).status).toBe(401);
  expect(mockCreateOrder).not.toHaveBeenCalled();
});

test('400 for an unknown kind, an amount outside the purchasable set, or an unknown plan', async () => {
  expect((await POST(post({ kind: 'gift' }))).status).toBe(400);
  expect((await POST(post({ kind: 'topup', amountGel: 21 }))).status).toBe(400);
  expect((await POST(post({ kind: 'plan', tierId: 'enterprise' }))).status).toBe(400);
  expect(mockCreateOrder).not.toHaveBeenCalled();
});

test('top-up: the row (amount, credits, kind, locale) is written first; BOG gets GEL, our id and the return URLs', async () => {
  const res = await POST(post({ kind: 'topup', amountGel: 20, locale: 'en' }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual({ redirectUrl: 'https://payment.bog.ge/?order_id=bog-ord-1', orderId: expect.stringMatching(/^myavatar-topup-[0-9a-f]{16}$/) });
  expect(inserted()).toMatchObject({ shop_order_id: body.orderId, user_id: 'user-1', status: 'pending', kind: 'topup', amount_gel: 20, credits: 200, locale: 'en' });
  const params = mockCreateOrder.mock.calls[0][2];
  expect(params).toMatchObject({
    externalOrderId: body.orderId,
    amountGel: 20,
    callbackUrl: 'https://myavatar.ge/api/billing/bog/webhook',
    successUrl: `https://myavatar.ge/en/dashboard?bog=${body.orderId}&pay=success`,
    failUrl: `https://myavatar.ge/en/dashboard?bog=${body.orderId}&pay=failed`,
    locale: 'en',
    cardOnly: false,
  });
  expect(updatesTo()).toEqual([expect.objectContaining({ bog_order_id: 'bog-ord-1' })]);
  expect(mockSaveCard).not.toHaveBeenCalled();
});

test('plan: priced by the catalogue (Creator = 108 ₾, 525 credits), card-only, card saved for renewals before the redirect', async () => {
  const res = await POST(post({ kind: 'plan', tierId: 'pro' }));
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body).toMatchObject({ autoRenew: true, orderId: expect.stringMatching(/^myavatar-plan-/) });
  expect(inserted()).toMatchObject({ kind: 'subscription', tier: 'creator', amount_gel: 108, credits: 525, locale: 'ka' });
  expect(mockCreateOrder.mock.calls[0][2]).toMatchObject({ amountGel: 108, cardOnly: true });
  expect(mockSaveCard).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'bog-ord-1');
  expect(updatesTo()).toEqual(expect.arrayContaining([expect.objectContaining({ card_saved: true })]));
});

test('plan: a merchant without automatic payments still sells the month, honestly marked non-renewing', async () => {
  mockSaveCard.mockResolvedValueOnce(false);
  const body = await (await POST(post({ kind: 'plan', tierId: 'starter' }))).json();
  expect(body.autoRenew).toBe(false);
  expect(updatesTo()).toEqual(expect.arrayContaining([expect.objectContaining({ card_saved: false })]));
});

test('plan: the same tier already live → 409, no second charge', async () => {
  mockDb.live = [{ tier: 'creator', current_period_end: '2026-11-02T00:00:00Z' }];
  const res = await POST(post({ kind: 'plan', tierId: 'creator' }));
  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({ error_code: 'BOG_ALREADY_SUBSCRIBED', activeUntil: '2026-11-02T00:00:00Z' });
  expect(mockCreateOrder).not.toHaveBeenCalled();
});

test('plan: a different live tier is an upgrade and goes ahead', async () => {
  mockDb.live = [{ tier: 'starter', current_period_end: '2026-11-02T00:00:00Z' }];
  expect((await POST(post({ kind: 'plan', tierId: 'business' }))).status).toBe(200);
});

test('no order row → no BOG order (a payment we could not credit is never started)', async () => {
  mockDb.insertError = { message: 'relation does not exist' };
  expect((await POST(post({ kind: 'topup', amountGel: 20 }))).status).toBe(503);
  expect(mockCreateOrder).not.toHaveBeenCalled();
});

test('BOG refuses the order → 502 and the row is marked init_failed', async () => {
  mockCreateOrder.mockResolvedValueOnce(null);
  expect((await POST(post({ kind: 'topup', amountGel: 20 }))).status).toBe(502);
  expect(updatesTo()).toEqual([expect.objectContaining({ status: 'init_failed' })]);
});
