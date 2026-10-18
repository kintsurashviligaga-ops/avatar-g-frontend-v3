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
const mockDb: {
  live: unknown[];
  insertError: unknown;
  liveError: unknown;
  /** bog_orders rows the limit check reads: paid ones (any user), and this customer's open checkouts before/after our insert. */
  paid: unknown[];
  open: unknown[];
  openAfterInsert: unknown[] | null;
  ordersError: unknown;
  /** the update that records BOG's order id on our row fails */
  bindError: unknown;
} = { live: [], insertError: null, liveError: null, paid: [], open: [], openAfterInsert: null, ordersError: null, bindError: null };
let mockLog: FakeCall[] = [];
jest.mock('../../../../../lib/supabase/server', () => ({
  createServiceRoleClient: () => {
    const { client, log } = fakeSupabase((c) => {
      if (c.table === 'subscriptions' && c.op === 'select') return { data: mockDb.live, error: mockDb.liveError };
      if (c.table === 'bog_orders' && c.op === 'insert') return { error: mockDb.insertError };
      if (c.table === 'bog_orders' && c.op === 'update' && 'bog_order_id' in (c.args[0] as object)) return { error: mockDb.bindError };
      if (c.table === 'bog_orders' && c.op === 'select') {
        if (mockDb.ordersError) return { error: mockDb.ordersError };
        const openQuery = c.filters.some((f) => f[0] === 'eq' && f[1] === 'status' && f[2] === 'pending');
        if (!openQuery) return { data: mockDb.paid };
        const afterInsert = log.some((x) => x.table === 'bog_orders' && x.op === 'insert');
        return { data: afterInsert && mockDb.openAfterInsert ? mockDb.openAfterInsert : mockDb.open };
      }
      return {};
    });
    mockLog = log;
    return client;
  },
}));
let mockIsAdmin = false;
jest.mock('../../../../../lib/auth/adminGuard', () => ({
  isAdminIdentity: jest.fn(async () => mockIsAdmin),
}));
jest.mock('../../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  checkRateLimitByKey: jest.fn(async () => null),
  RATE_LIMITS: { WRITE: {} },
}));
jest.mock('../../../../../lib/billing/pricingConfig.db', () => ({
  getActiveTiers: jest.fn(async () => [5, 9, 10, 20, 29, 50, 89, 500, 600].map((g) => ({ gelAmount: g, creditsAmount: g * 10, label: null, isActive: true }))),
}));
let mockConfigured = true;
let mockEnvironment: 'production' | 'sandbox' = 'production';
const mockCreateOrder = jest.fn();
const mockSaveCard = jest.fn();
jest.mock('../../../../../lib/billing/bogClient', () => ({
  ...jest.requireActual('../../../../../lib/billing/bogClient'),
  bogConfig: () => (mockConfigured ? { environment: mockEnvironment, clientId: 'c', secretKey: 's' } : null),
  createBogOrder: (...a: unknown[]) => mockCreateOrder(...a),
  saveCardForAutomaticPayments: (...a: unknown[]) => mockSaveCard(...a),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { TIERS } from '../../../../../lib/billing/tiers';

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
  mockEnvironment = 'production';
  mockIsAdmin = false;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL;
  mockLog = [];
  delete process.env.BOG_CHECKOUT_MODE;
  mockDb.live = [];
  mockDb.insertError = null;
  mockDb.liveError = null;
  mockDb.paid = [];
  mockDb.open = [];
  mockDb.openAfterInsert = null;
  mockDb.ordersError = null;
  mockDb.bindError = null;
  delete process.env.BOG_LIMIT_24H_GEL;
  delete process.env.BOG_LIMIT_30D_GEL;
  delete process.env.BOG_LIMIT_PER_PAYMENT_GEL;
  delete process.env.BOG_LIMIT_SCOPE;
  process.env.BOG_SUBSCRIPTION_MODE = 'public'; // plan tests below run with plans open; the lock has its own tests
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

test('plan: priced by the catalogue (Creator = 108 ₾, its tier credits), card-only, card saved for renewals before the redirect', async () => {
  const res = await POST(post({ kind: 'plan', tierId: 'pro' }));
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body).toMatchObject({ autoRenew: true, orderId: expect.stringMatching(/^myavatar-plan-/) });
  expect(inserted()).toMatchObject({ kind: 'subscription', tier: 'creator', amount_gel: 108, credits: TIERS.creator.includedCredits, locale: 'ka' });
  expect(mockCreateOrder.mock.calls[0][2]).toMatchObject({ amountGel: 108, cardOnly: true });
  expect(mockSaveCard).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'bog-ord-1');
  expect(updatesTo()).toEqual(expect.arrayContaining([expect.objectContaining({ card_saved: true })]));
});

test('BOG refuses the order → 502, the row is init_failed and says why (BOG\'s answer, the environment); nothing to pay', async () => {
  const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockCreateOrder.mockImplementationOnce(async (_cfg: unknown, _deps: unknown, _p: unknown, report: (r: string) => void) => {
    report('oauth HTTP 401 {"error":"unauthorized_client"}');
    return null;
  });
  const res = await POST(post({ kind: 'topup', amountGel: 10 }));
  expect(res.status).toBe(502);
  expect(await res.json()).toMatchObject({ error_code: 'BOG_ORDER' });
  const reason = 'init (production): oauth HTTP 401 {"error":"unauthorized_client"}';
  expect(updatesTo()).toEqual([expect.objectContaining({ status: 'init_failed', reject_reason: reason })]);
  expect(err).toHaveBeenCalledWith(expect.stringContaining(reason));
  expect(mockSaveCard).not.toHaveBeenCalled();
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

test('BOG\'s order id cannot be recorded → 503, no redirect: an order only a callback could settle is never paid', async () => {
  const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockDb.bindError = { message: 'connection reset' };
  const res = await POST(post({ kind: 'plan', tierId: 'starter' }));
  expect(res.status).toBe(503);
  const body = await res.json();
  expect(body).toMatchObject({ error_code: 'BOG_ORDER_ROW' });
  expect(body.redirectUrl).toBeUndefined();
  expect(updatesTo()).toEqual([
    expect.objectContaining({ bog_order_id: 'bog-ord-1' }),
    expect.objectContaining({ status: 'init_failed', reject_reason: 'init (production): bog_order_id not recorded' }),
  ]);
  expect(mockSaveCard).not.toHaveBeenCalled();
  expect(err).toHaveBeenCalled();
});

test('BOG\'s 500 ₾ single-transaction limit: 500 goes ahead, a tier priced above it is refused before any row or order', async () => {
  expect((await POST(post({ kind: 'topup', amountGel: 500 }))).status).toBe(200);
  jest.clearAllMocks();
  const res = await POST(post({ kind: 'topup', amountGel: 600 }));
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ error_code: 'BOG_LIMIT', maxGel: 500 });
  expect(inserted()).toBeUndefined();
  expect(mockCreateOrder).not.toHaveBeenCalled();
});

describe("BOG's 24 h / 30 day limits (lib/billing/bogLimits)", () => {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const H = 3600_000;

  test('24 h full: 429 BOG_LIMIT_24H with when there is room again — no row, no BOG order, nobody’s turnover revealed', async () => {
    const paidAt = ago(2 * H);
    mockDb.paid = [{ amount_gel: 990, created_at: paidAt, credited_at: paidAt }];
    const res = await POST(post({ kind: 'topup', amountGel: 20 }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ error: expect.any(String), error_code: 'BOG_LIMIT_24H', availableAt: new Date(Date.parse(paidAt) + 24 * H).toISOString() });
    expect(JSON.stringify(body)).not.toContain('990');
    expect(inserted()).toBeUndefined();
    expect(mockCreateOrder).not.toHaveBeenCalled();
    // 10 ₾ still fits (990 + 10 = 1000, the limit is "at most")
    expect((await POST(post({ kind: 'topup', amountGel: 10 }))).status).toBe(200);
  });

  test('30 days full while every single day is under 1,000 ₾: 429 BOG_LIMIT_30D', async () => {
    mockDb.paid = Array.from({ length: 10 }, (_, i) => ({ amount_gel: 499.5, created_at: ago((i + 1) * 2 * 24 * H), credited_at: null }));
    const res = await POST(post({ kind: 'topup', amountGel: 10 }));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error_code: 'BOG_LIMIT_30D', availableAt: expect.any(String) });
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  test('two checkouts racing past the first check: the re-check with our row counted refuses, the row is init_failed, BOG never hears of it', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockDb.paid = [{ amount_gel: 970, created_at: ago(H), credited_at: ago(H) }]; // 970 + 20 fits; 970 + 20 + 20 does not
    mockDb.openAfterInsert = [
      { amount_gel: 20, created_at: ago(1000) },
      { amount_gel: 20, created_at: ago(500) },
    ];
    const res = await POST(post({ kind: 'topup', amountGel: 20 }));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error_code: 'BOG_LIMIT_24H' });
    expect(inserted()).toMatchObject({ status: 'pending', amount_gel: 20 });
    expect(updatesTo()).toEqual([expect.objectContaining({ status: 'init_failed', reject_reason: 'limit: merchant 24h' })]);
    const mark = mockLog.find((c) => c.table === 'bog_orders' && c.op === 'update');
    expect(mark?.filters).toEqual(expect.arrayContaining([['eq', 'status', 'pending']]));
    expect(mockCreateOrder).not.toHaveBeenCalled();
    err.mockRestore();
  });

  test('the limits cannot be read → 503 BOG_LIMIT_UNKNOWN (fail closed), nothing created', async () => {
    mockDb.ordersError = { message: 'timeout' };
    const res = await POST(post({ kind: 'topup', amountGel: 10 }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error_code: 'BOG_LIMIT_UNKNOWN' });
    expect(inserted()).toBeUndefined();
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  test('BOG_LIMIT_24H_GEL raises the 24 h limit without a code change; BOG_LIMIT_SCOPE=customer counts only this customer', async () => {
    mockDb.paid = [{ amount_gel: 990, created_at: ago(H), credited_at: ago(H) }];
    process.env.BOG_LIMIT_24H_GEL = '2000';
    expect((await POST(post({ kind: 'topup', amountGel: 50 }))).status).toBe(200);
    delete process.env.BOG_LIMIT_24H_GEL;
    process.env.BOG_LIMIT_SCOPE = 'customer';
    mockLog = [];
    await POST(post({ kind: 'topup', amountGel: 5 }));
    const paidQ = mockLog.find((c) => c.table === 'bog_orders' && c.op === 'select' && !c.filters.some((f) => f[0] === 'eq' && f[2] === 'pending'));
    expect(paidQ?.filters).toEqual(expect.arrayContaining([['eq', 'user_id', 'user-1']]));
  });

  test('BOG_LIMIT_PER_PAYMENT_GEL lowers the per-payment limit; an unreadable value keeps the bank letter\'s 500', async () => {
    process.env.BOG_LIMIT_PER_PAYMENT_GEL = '15';
    expect(await (await POST(post({ kind: 'topup', amountGel: 20 }))).json()).toMatchObject({ error_code: 'BOG_LIMIT', maxGel: 15 });
    process.env.BOG_LIMIT_PER_PAYMENT_GEL = '5OO';
    expect((await POST(post({ kind: 'topup', amountGel: 500 }))).status).toBe(200);
  });
});

describe('BOG_SUBSCRIPTION_MODE (plans stay closed when checkout opens)', () => {
  test('unset → a customer may top up but not buy a plan (403, no row, no order); an admin may', async () => {
    delete process.env.BOG_SUBSCRIPTION_MODE;
    expect((await POST(post({ kind: 'topup', amountGel: 10 }))).status).toBe(200);
    jest.clearAllMocks();
    mockLog = [];
    const res = await POST(post({ kind: 'plan', tierId: 'starter' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error_code: 'BOG_PLANS_ADMIN_ONLY' });
    expect(inserted()).toBeUndefined();
    expect(mockCreateOrder).not.toHaveBeenCalled();
    expect(mockSaveCard).not.toHaveBeenCalled();
    mockIsAdmin = true;
    expect((await POST(post({ kind: 'plan', tierId: 'starter' }))).status).toBe(200);
  });

  test('off (or a typo) → 503 BOG_PLANS_DISABLED for everyone, admins included; top-ups unaffected', async () => {
    mockIsAdmin = true;
    for (const v of ['off', 'publik']) {
      process.env.BOG_SUBSCRIPTION_MODE = v;
      const res = await POST(post({ kind: 'plan', tierId: 'creator' }));
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ error_code: 'BOG_PLANS_DISABLED' });
    }
    expect(mockCreateOrder).not.toHaveBeenCalled();
    expect((await POST(post({ kind: 'topup', amountGel: 10 }))).status).toBe(200);
  });
});

describe('BOG_CHECKOUT_MODE', () => {
  test('unset → everyone signed in (unchanged behaviour)', async () => {
    expect((await POST(post({ kind: 'topup', amountGel: 5 }))).status).toBe(200);
  });

  test('off (or a typo) → 503 BOG_DISABLED, nothing created', async () => {
    for (const v of ['off', 'admim']) {
      process.env.BOG_CHECKOUT_MODE = v;
      const res = await POST(post({ kind: 'topup', amountGel: 5 }));
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ error_code: 'BOG_DISABLED' });
    }
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  test('admin → a customer gets 403 with no row and no order; an admin goes through', async () => {
    process.env.BOG_CHECKOUT_MODE = 'admin';
    const res = await POST(post({ kind: 'topup', amountGel: 5 }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error_code: 'BOG_ADMIN_ONLY' });
    expect(inserted()).toBeUndefined();
    expect(mockCreateOrder).not.toHaveBeenCalled();
    mockIsAdmin = true;
    expect((await POST(post({ kind: 'topup', amountGel: 5 }))).status).toBe(200);
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
  });

  test('a Vercel Preview / Development deployment never takes a live payment, admins and public mode included', async () => {
    mockIsAdmin = true;
    for (const mode of ['public', 'admin']) {
      process.env.BOG_CHECKOUT_MODE = mode;
      for (const v of ['preview', 'development']) {
        process.env.VERCEL_ENV = v;
        const res = await POST(post({ kind: 'topup', amountGel: 5 }));
        expect(res.status).toBe(503);
        expect(await res.json()).toMatchObject({ error_code: 'BOG_DISABLED' });
      }
    }
    expect(inserted()).toBeUndefined();
    expect(mockCreateOrder).not.toHaveBeenCalled();
    process.env.VERCEL_ENV = 'production';
    expect((await POST(post({ kind: 'topup', amountGel: 5 }))).status).toBe(200);
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
  });
});

describe('sandbox credentials never touch Production', () => {
  test('on any Vercel deployment (Production database) → 503 BOG_SANDBOX_BLOCKED, before auth, no row, no order', async () => {
    mockEnvironment = 'sandbox';
    for (const v of ['production', 'preview']) {
      process.env.VERCEL_ENV = v;
      const res = await POST(post({ kind: 'topup', amountGel: 20 }));
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ error_code: 'BOG_SANDBOX_BLOCKED' });
    }
    expect(inserted()).toBeUndefined();
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  test('locally (no Vercel), a sandbox order calls back to this server — never the canonical live site', async () => {
    mockEnvironment = 'sandbox';
    const res = await POST(
      new NextRequest('http://localhost:3000/api/billing/bog/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'topup', amountGel: 20 }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mockCreateOrder.mock.calls[0][2].callbackUrl).toBe('http://localhost:3000/api/billing/bog/webhook');
  });

  test('live credentials are unaffected by the guard (callback stays the canonical site)', async () => {
    process.env.VERCEL_ENV = 'production';
    expect((await POST(post({ kind: 'topup', amountGel: 20 }))).status).toBe(200);
    expect(mockCreateOrder.mock.calls[0][2].callbackUrl).toBe('https://myavatar.ge/api/billing/bog/webhook');
  });
});
