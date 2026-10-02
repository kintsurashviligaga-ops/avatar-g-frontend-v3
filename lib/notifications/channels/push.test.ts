/** @jest-environment node */
/**
 * The Web Push channel against a mocked web-push and an in-memory push_subscriptions: it sends to every device of the
 * user, deletes the ones the push service says are gone (404/410), answers not_configured without keys or without the
 * table, keeps a lock-screen link on our own origin — and never throws or stalls a generation flow.
 */
import { FakePushDb } from '../push/testing/fakeDb';
import { testBrowserKeys, testVapidKeys } from '../push/testing/keys';
import { resetPushTableProbe } from '../push/config';

jest.mock('server-only', () => ({}));
const mockSend = jest.fn();
jest.mock('web-push', () => {
  class WebPushError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  }
  return { sendNotification: (...a: unknown[]) => mockSend(...a), WebPushError };
});
let mockDb: unknown = null;
jest.mock('../../supabase/server', () => ({
  createServiceRoleClient: () => {
    if (mockDb instanceof Error) throw mockDb;
    return mockDb;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { WebPushError } = require('web-push') as { WebPushError: new (m: string, s: number) => Error };
import { buildPushPayload, deliverPush, safeAppPath, sendPushAlert } from './push';

const USER = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const OTHER = '9b2f0a51-3a43-4f4e-9f53-2d1f5b0c8e11';
const VAPID = testVapidKeys();
const ENV_KEYS = ['VAPID_PUBLIC_KEY', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const;
const saved: Record<string, string | undefined> = {};

function device(id: string, userId: string, endpoint: string, extra: Record<string, unknown> = {}) {
  return { id, user_id: userId, endpoint, ...testBrowserKeys(), created_at: `2026-10-0${id.slice(-1)}T00:00:00Z`, failure_count: 0, last_success_at: null, ...extra };
}

const ev = { userId: USER, kind: 'video' as const, title: 'ვიდეო მზადაა', body: 'შენი ვიდეო მზადაა — გახსენი.', url: '/ka/dashboard?tool=video', dedupeKey: 'video:job-1', locale: 'ka' as const };

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.VAPID_PUBLIC_KEY = VAPID.publicKey;
  process.env.VAPID_PRIVATE_KEY = VAPID.privateKey;
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  delete process.env.VAPID_SUBJECT;
  mockSend.mockReset();
  mockSend.mockResolvedValue({ statusCode: 201, body: '', headers: {} });
  mockDb = null;
  resetPushTableProbe();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('sendPushAlert — delivery', () => {
  test('sends to every device of THIS user, signed with our VAPID key, and stamps the delivery', async () => {
    const db = new FakePushDb([
      device('a1', USER, 'https://fcm.googleapis.com/fcm/send/aaa'),
      device('a2', USER, 'https://web.push.apple.com/QbbB', { failure_count: 3 }),
      device('b3', OTHER, 'https://updates.push.services.mozilla.com/wpush/v2/ccc'),
    ]);
    mockDb = db;

    await expect(sendPushAlert(ev)).resolves.toEqual({ sent: true });

    expect(mockSend).toHaveBeenCalledTimes(2);
    const endpoints = mockSend.mock.calls.map((c) => (c[0] as { endpoint: string }).endpoint).sort();
    expect(endpoints).toEqual(['https://fcm.googleapis.com/fcm/send/aaa', 'https://web.push.apple.com/QbbB']);
    const [sub, payload, options] = mockSend.mock.calls[0]!;
    expect((sub as { keys: { p256dh: string; auth: string } }).keys.p256dh).toMatch(/^[A-Za-z0-9_-]{87}$/);
    expect(JSON.parse(payload as string)).toEqual({ title: ev.title, body: ev.body, url: ev.url, tag: ev.dedupeKey });
    expect(options).toEqual(expect.objectContaining({
      vapidDetails: { subject: 'mailto:support@myavatar.ge', publicKey: VAPID.publicKey, privateKey: VAPID.privateKey },
      TTL: 86_400,
      urgency: 'normal',
      timeout: 8_000,
    }));
    expect((options as { topic: string }).topic).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const mine = db.rows.filter((r) => r.user_id === USER);
    expect(mine.every((r) => typeof r.last_success_at === 'string' && r.failure_count === 0)).toBe(true);
  });

  test('deliverPush reports how many devices it reached', async () => {
    mockDb = new FakePushDb([device('a1', USER, 'https://fcm.googleapis.com/fcm/send/aaa'), device('a2', USER, 'https://fcm.googleapis.com/fcm/send/bbb')]);
    await expect(deliverPush(ev)).resolves.toEqual({ sent: true, attempted: 2, delivered: 2, pruned: 0 });
  });

  test('a device the push service calls gone (410 / 404) is deleted; the rest are kept and the call still succeeds', async () => {
    const db = new FakePushDb([
      device('a1', USER, 'https://fcm.googleapis.com/fcm/send/gone410'),
      device('a2', USER, 'https://fcm.googleapis.com/fcm/send/gone404'),
      device('a3', USER, 'https://fcm.googleapis.com/fcm/send/alive'),
    ]);
    mockDb = db;
    mockSend.mockImplementation(async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith('gone410')) throw new WebPushError('Received unexpected response code', 410);
      if (s.endpoint.endsWith('gone404')) throw new WebPushError('Received unexpected response code', 404);
      return { statusCode: 201 };
    });

    await expect(deliverPush(ev)).resolves.toEqual({ sent: true, attempted: 3, delivered: 1, pruned: 2 });
    expect(db.rows.map((r) => r.id)).toEqual(['a3']);
  });

  test('when every device is gone the user has none left: not_linked, and the rows are pruned', async () => {
    const db = new FakePushDb([device('a1', USER, 'https://fcm.googleapis.com/fcm/send/x')]);
    mockDb = db;
    mockSend.mockRejectedValue(new WebPushError('gone', 410));
    await expect(sendPushAlert(ev)).resolves.toEqual({ sent: false, reason: 'not_linked' });
    expect(db.rows).toEqual([]);
  });

  test('any other failure (429, 5xx, a network error) keeps the device and counts it', async () => {
    const db = new FakePushDb([
      device('a1', USER, 'https://fcm.googleapis.com/fcm/send/busy', { failure_count: 2 }),
      device('a2', USER, 'https://fcm.googleapis.com/fcm/send/down'),
    ]);
    mockDb = db;
    mockSend.mockImplementation(async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith('busy')) throw new WebPushError('rate limited', 429);
      throw new Error('ECONNRESET');
    });
    await expect(sendPushAlert(ev)).resolves.toEqual({ sent: false, reason: 'failed' });
    expect(db.rows.map((r) => [r.id, r.failure_count])).toEqual([['a1', 3], ['a2', 1]]);
  });

  test('no devices → not_linked, nothing sent', async () => {
    mockDb = new FakePushDb([device('b1', OTHER, 'https://fcm.googleapis.com/fcm/send/theirs')]);
    await expect(sendPushAlert(ev)).resolves.toEqual({ sent: false, reason: 'not_linked' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('a stored endpoint that is not on a known push service is never POSTed to (SSRF), even though the row exists', async () => {
    const db = new FakePushDb([
      device('a1', USER, 'https://169.254.169.254/latest/meta-data'),
      device('a2', USER, 'http://fcm.googleapis.com/fcm/send/plain-http'),
    ]);
    mockDb = db;
    await expect(sendPushAlert(ev)).resolves.toEqual({ sent: false, reason: 'failed' });
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('sendPushAlert — not configured', () => {
  test('without VAPID keys: not_configured, and neither the database nor the network is touched', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const db = new FakePushDb([device('a1', USER, 'https://fcm.googleapis.com/fcm/send/aaa')]);
    mockDb = db;
    await expect(sendPushAlert(ev)).resolves.toEqual({ sent: false, reason: 'not_configured' });
    expect(db.ops).toEqual([]);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('a malformed key reads as not configured instead of throwing in every send', async () => {
    process.env.VAPID_PRIVATE_KEY = 'not-a-key';
    mockDb = new FakePushDb([device('a1', USER, 'https://fcm.googleapis.com/fcm/send/aaa')]);
    await expect(sendPushAlert(ev)).resolves.toEqual({ sent: false, reason: 'not_configured' });
  });

  test('the NEXT_PUBLIC_ name of the public key works too', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = VAPID.publicKey;
    mockDb = new FakePushDb([device('a1', USER, 'https://fcm.googleapis.com/fcm/send/aaa')]);
    await expect(sendPushAlert(ev)).resolves.toEqual({ sent: true });
  });

  test('a malformed VAPID_SUBJECT falls back to the support address (Apple rejects a bad one)', async () => {
    process.env.VAPID_SUBJECT = 'mailto: someone';
    mockDb = new FakePushDb([device('a1', USER, 'https://fcm.googleapis.com/fcm/send/aaa')]);
    await sendPushAlert(ev);
    expect((mockSend.mock.calls[0]![2] as { vapidDetails: { subject: string } }).vapidDetails.subject).toBe('mailto:support@myavatar.ge');
  });

  test.each([['PGRST205'], ['42P01']])('without the table (%s): not_configured', async (code) => {
    const db = new FakePushDb();
    db.failNext('select', code);
    mockDb = db;
    await expect(sendPushAlert(ev)).resolves.toEqual({ sent: false, reason: 'not_configured' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('any other read error is a failure, not "not configured"', async () => {
    const db = new FakePushDb();
    db.failNext('select', '57014');
    mockDb = db;
    await expect(sendPushAlert(ev)).resolves.toEqual({ sent: false, reason: 'failed' });
  });
});

describe('sendPushAlert — never throws, never stalls', () => {
  test('the service-role client cannot be built (no service key) → not_configured', async () => {
    mockDb = new Error('SUPABASE_SERVICE_ROLE_KEY is required');
    await expect(sendPushAlert(ev)).resolves.toEqual({ sent: false, reason: 'not_configured' });
  });

  test('a client that throws on use → failed', async () => {
    mockDb = { from: () => { throw new Error('boom'); } };
    await expect(sendPushAlert(ev)).resolves.toEqual({ sent: false, reason: 'failed' });
  });

  test('a bookkeeping write that fails does not turn a delivery into a failure', async () => {
    const db = new FakePushDb([device('a1', USER, 'https://fcm.googleapis.com/fcm/send/aaa')]);
    db.failNext('update');
    mockDb = db;
    await expect(sendPushAlert(ev)).resolves.toEqual({ sent: true });
  });

  test('a garbage event answers instead of throwing', async () => {
    mockDb = new FakePushDb();
    await expect(sendPushAlert(undefined as never)).resolves.toEqual({ sent: false, reason: 'not_linked' });
    await expect(sendPushAlert({ ...ev, userId: '' })).resolves.toEqual({ sent: false, reason: 'not_linked' });
  });

  test('a push service that never answers is given up on — the call ends by its deadline', async () => {
    jest.useFakeTimers();
    mockDb = new FakePushDb([device('a1', USER, 'https://fcm.googleapis.com/fcm/send/hang')]);
    mockSend.mockImplementation(() => new Promise(() => {}));
    const p = sendPushAlert(ev);
    await jest.advanceTimersByTimeAsync(9_500);
    await expect(p).resolves.toEqual({ sent: false, reason: 'failed' });
  });
});

describe('the payload', () => {
  test('the link is always a path on our own origin', () => {
    expect(safeAppPath('/ka/dashboard?tool=video')).toBe('/ka/dashboard?tool=video');
    for (const bad of ['https://evil.example/x', '//evil.example/x', '/\\evil.example', 'javascript:alert(1)', 'ka/dashboard', '/a\nb', undefined, `/${'x'.repeat(600)}`]) {
      expect(safeAppPath(bad as string | undefined)).toBe('/');
    }
    expect(JSON.parse(buildPushPayload({ ...ev, url: 'https://evil.example/phish' })).url).toBe('/');
  });

  test('title and body are clipped for a lock screen; no dedupe key → no tag', () => {
    const p = JSON.parse(buildPushPayload({ ...ev, title: 'T'.repeat(500), body: 'B'.repeat(900), dedupeKey: undefined }));
    expect(p.title.length).toBeLessThanOrEqual(120);
    expect(p.body.length).toBeLessThanOrEqual(300);
    expect(p).not.toHaveProperty('tag');
  });
});
