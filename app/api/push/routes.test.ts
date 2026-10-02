/** @jest-environment node */
/**
 * /api/push/subscribe, /api/push/test and /api/push/public-key against an in-memory push_subscriptions and a mocked
 * web-push: a session is required to write, the body is validated (an endpoint must be a real push service), the device
 * cap holds, a test only ever reaches the caller's own devices, and "not configured" is an honest 503 / available:false.
 */
import { NextRequest } from 'next/server';
import { resetPushTableProbe } from '../../../lib/notifications/push/config';
import { FakePushDb } from '../../../lib/notifications/push/testing/fakeDb';
import { testBrowserKeys, testVapidKeys } from '../../../lib/notifications/push/testing/keys';

jest.mock('server-only', () => ({}));
let mockUser: { id: string } | null = null;
jest.mock('../../../lib/supabase/auth', () => ({ getAuthenticatedUser: jest.fn(async () => mockUser) }));
let mockDb: FakePushDb = new FakePushDb();
jest.mock('../../../lib/supabase/server', () => ({ createServiceRoleClient: () => mockDb }));
const mockUserLimit = jest.fn(async (..._a: unknown[]): Promise<Response | null> => null);
jest.mock('../../../lib/api/rate-limit', () => ({
  checkRateLimit: async () => null,
  checkRateLimitByKey: (...a: unknown[]) => mockUserLimit(...a),
  RATE_LIMITS: { READ: {}, WRITE: {} },
}));
const mockSend = jest.fn();
jest.mock('web-push', () => ({ sendNotification: (...a: unknown[]) => mockSend(...a), WebPushError: class extends Error {} }));

import { DELETE as unsubscribe, POST as subscribe } from './subscribe/route';
import { POST as sendTest } from './test/route';
import { GET as publicKey } from './public-key/route';

const ME = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const OTHER = '9b2f0a51-3a43-4f4e-9f53-2d1f5b0c8e11';
const VAPID = testVapidKeys();
const FCM = 'https://fcm.googleapis.com/fcm/send/my-device';

function req(path: string, method: string, body?: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`https://myavatar.ge${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 Test', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const subBody = (endpoint = FCM, locale = 'en') => ({ subscription: { endpoint, expirationTime: null, keys: testBrowserKeys() }, locale });

beforeEach(() => {
  process.env.VAPID_PUBLIC_KEY = VAPID.publicKey;
  process.env.VAPID_PRIVATE_KEY = VAPID.privateKey;
  mockUser = { id: ME };
  mockDb = new FakePushDb();
  mockUserLimit.mockReset();
  mockUserLimit.mockResolvedValue(null);
  mockSend.mockReset();
  mockSend.mockResolvedValue({ statusCode: 201 });
  resetPushTableProbe();
});
afterEach(() => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});

describe('POST /api/push/subscribe', () => {
  test('no session → 401, nothing written', async () => {
    mockUser = null;
    const res = await subscribe(req('/api/push/subscribe', 'POST', subBody()));
    expect(res.status).toBe(401);
    expect(mockDb.ops).toEqual([]);
  });

  test('a cross-site cookie request is refused before the session is even read', async () => {
    const res = await subscribe(req('/api/push/subscribe', 'POST', subBody(), { 'sec-fetch-site': 'cross-site' }));
    expect(res.status).toBe(403);
    expect(mockDb.ops).toEqual([]);
  });

  test.each([
    ['an endpoint that is not a push service', subBody('https://evil.example/collect')],
    ['an http endpoint', subBody('http://fcm.googleapis.com/fcm/send/x')],
    ['missing keys', { subscription: { endpoint: FCM } }],
    ['malformed keys', { subscription: { endpoint: FCM, keys: { p256dh: 'abc', auth: 'def' } } }],
    ['not JSON', undefined],
  ])('400 for %s, nothing written', async (_label, body) => {
    const res = await subscribe(req('/api/push/subscribe', 'POST', body));
    expect(res.status).toBe(400);
    expect(mockDb.ops).toEqual([]);
  });

  test('stores the device for the SESSION user (a user_id in the body is ignored), with its locale and user agent', async () => {
    const body = { ...subBody(), user_id: OTHER };
    const res = await subscribe(req('/api/push/subscribe', 'POST', body));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ subscribed: true });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(mockDb.rows).toHaveLength(1);
    expect(mockDb.rows[0]).toEqual(expect.objectContaining({
      user_id: ME, endpoint: FCM, p256dh: body.subscription.keys.p256dh, auth: body.subscription.keys.auth,
      locale: 'en', user_agent: 'Mozilla/5.0 Test', failure_count: 0,
    }));
    expect(mockDb.ops.find((o) => o.op === 'upsert')!.opts).toEqual({ onConflict: 'endpoint' });
  });

  test('the same browser subscribing under another account moves to that account (one endpoint, one owner)', async () => {
    mockDb = new FakePushDb([{ id: 'old', user_id: OTHER, endpoint: FCM, p256dh: 'x', auth: 'y', created_at: '2026-09-01T00:00:00Z', failure_count: 4 }]);
    const res = await subscribe(req('/api/push/subscribe', 'POST', subBody()));
    expect(res.status).toBe(200);
    expect(mockDb.rows).toHaveLength(1);
    expect(mockDb.rows[0]).toEqual(expect.objectContaining({ id: 'old', user_id: ME, failure_count: 0 }));
  });

  test('an 11th device retires the oldest — never more than 10 per user, other users untouched', async () => {
    const seed = Array.from({ length: 10 }, (_, i) => ({
      id: `d${i}`, user_id: ME, endpoint: `https://fcm.googleapis.com/fcm/send/d${i}`, p256dh: 'x', auth: 'y',
      created_at: `2026-09-${String(10 + i).padStart(2, '0')}T00:00:00Z`,
    }));
    mockDb = new FakePushDb([...seed, { id: 'theirs', user_id: OTHER, endpoint: 'https://fcm.googleapis.com/fcm/send/t', p256dh: 'x', auth: 'y', created_at: '2026-01-01T00:00:00Z' }]);
    const res = await subscribe(req('/api/push/subscribe', 'POST', subBody('https://fcm.googleapis.com/fcm/send/new')));
    expect(res.status).toBe(200);
    const mine = mockDb.rows.filter((r) => r.user_id === ME);
    expect(mine).toHaveLength(10);
    expect(mine.map((r) => r.id)).not.toContain('d0');
    expect(mine.map((r) => r.endpoint)).toContain('https://fcm.googleapis.com/fcm/send/new');
    expect(mockDb.rows.some((r) => r.id === 'theirs')).toBe(true);
  });

  test('the per-account limit answers 429 before anything is written', async () => {
    mockUserLimit.mockResolvedValue(new Response('{}', { status: 429 }));
    const res = await subscribe(req('/api/push/subscribe', 'POST', subBody()));
    expect(res.status).toBe(429);
    expect(mockUserLimit).toHaveBeenCalledWith(ME, expect.objectContaining({ keyPrefix: 'rl:push:sub' }));
    expect(mockDb.ops).toEqual([]);
  });

  test('no VAPID keys → 503, nothing written', async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    const res = await subscribe(req('/api/push/subscribe', 'POST', subBody()));
    expect(res.status).toBe(503);
    expect(mockDb.ops).toEqual([]);
  });

  test('table not migrated → 503 (not a 500)', async () => {
    mockDb.missingTable = true;
    const res = await subscribe(req('/api/push/subscribe', 'POST', subBody()));
    expect(res.status).toBe(503);
  });
});

describe('DELETE /api/push/subscribe', () => {
  test('no session → 401', async () => {
    mockUser = null;
    const res = await unsubscribe(req('/api/push/subscribe', 'DELETE', { endpoint: FCM }));
    expect(res.status).toBe(401);
  });

  test('removes only the caller\'s own row — another user\'s device is not theirs to switch off', async () => {
    mockDb = new FakePushDb([
      { id: 'mine', user_id: ME, endpoint: FCM },
      { id: 'theirs', user_id: OTHER, endpoint: 'https://fcm.googleapis.com/fcm/send/theirs' },
    ]);
    const mine = await unsubscribe(req('/api/push/subscribe', 'DELETE', { endpoint: FCM }));
    expect(mine.status).toBe(200);
    expect((await mine.json()).data).toEqual({ removed: 1 });
    const theirs = await unsubscribe(req('/api/push/subscribe', 'DELETE', { endpoint: 'https://fcm.googleapis.com/fcm/send/theirs' }));
    expect((await theirs.json()).data).toEqual({ removed: 0 });
    expect(mockDb.rows.map((r) => r.id)).toEqual(['theirs']);
  });

  test('400 without an endpoint', async () => {
    const res = await unsubscribe(req('/api/push/subscribe', 'DELETE', {}));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/push/test', () => {
  test('no session → 401, nothing sent', async () => {
    mockUser = null;
    const res = await sendTest(req('/api/push/test', 'POST', { locale: 'en' }));
    expect(res.status).toBe(401);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('sends to the caller\'s own devices only, in their language', async () => {
    mockDb = new FakePushDb([
      { id: 'mine', user_id: ME, endpoint: FCM, ...testBrowserKeys(), created_at: '2026-10-01T00:00:00Z', failure_count: 0 },
      { id: 'theirs', user_id: OTHER, endpoint: 'https://fcm.googleapis.com/fcm/send/theirs', ...testBrowserKeys(), created_at: '2026-10-01T00:00:00Z', failure_count: 0 },
    ]);
    const res = await sendTest(req('/api/push/test', 'POST', { locale: 'en', userId: OTHER }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ sent: true, delivered: 1, attempted: 1 });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0]![0].endpoint).toBe(FCM);
    expect(JSON.parse(mockSend.mock.calls[0]![1])).toEqual({
      title: 'Test notification', body: expect.stringContaining('Notifications are on'), url: '/en/dashboard', tag: 'myavatar-push-test',
    });
  });

  test('Georgian by default', async () => {
    mockDb = new FakePushDb([{ id: 'mine', user_id: ME, endpoint: FCM, ...testBrowserKeys(), created_at: '2026-10-01T00:00:00Z', failure_count: 0 }]);
    await sendTest(req('/api/push/test', 'POST', {}));
    expect(JSON.parse(mockSend.mock.calls[0]![1])).toEqual(expect.objectContaining({ title: 'სატესტო შეტყობინება', url: '/ka/dashboard' }));
  });

  test('no device registered → 200 sent:false not_linked (the card says "turn it on again")', async () => {
    const res = await sendTest(req('/api/push/test', 'POST', { locale: 'ka' }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ sent: false, reason: 'not_linked', delivered: 0, attempted: 0 });
  });

  test('rate-limited per account', async () => {
    mockUserLimit.mockResolvedValue(new Response('{}', { status: 429 }));
    const res = await sendTest(req('/api/push/test', 'POST', {}));
    expect(res.status).toBe(429);
    expect(mockUserLimit).toHaveBeenCalledWith(ME, expect.objectContaining({ keyPrefix: 'rl:push:test' }));
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('not configured (no keys, or no table) → 503', async () => {
    mockDb.missingTable = true;
    expect((await sendTest(req('/api/push/test', 'POST', {}))).status).toBe(503);
    delete process.env.VAPID_PUBLIC_KEY;
    expect((await sendTest(req('/api/push/test', 'POST', {}))).status).toBe(503);
  });

  test('400 for an unknown locale', async () => {
    expect((await sendTest(req('/api/push/test', 'POST', { locale: 'de' }))).status).toBe(400);
  });
});

describe('GET /api/push/public-key', () => {
  test('keys + table → the public key (never the private one)', async () => {
    const res = await publicKey(req('/api/push/public-key', 'GET'));
    const body = await res.json();
    expect(body).toEqual({ available: true, publicKey: VAPID.publicKey });
    expect(JSON.stringify(body)).not.toContain(VAPID.privateKey);
  });

  test('no keys → { available: false }', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    expect(await (await publicKey(req('/api/push/public-key', 'GET'))).json()).toEqual({ available: false });
  });

  test('keys but no table → { available: false }', async () => {
    mockDb.missingTable = true;
    expect(await (await publicKey(req('/api/push/public-key', 'GET'))).json()).toEqual({ available: false });
  });
});
