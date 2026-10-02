/** @jest-environment node */
/**
 * notifyUser — one event to the bell, Web Push and WhatsApp. Pinned: the bell type per kind, the dedupe key, that the
 * outside channels run (awaited off Vercel), and that nothing a channel does can throw into the caller.
 */
jest.mock('server-only', () => ({}));
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => ({ client: true }) }));
jest.mock('./store', () => ({ createNotification: jest.fn(async () => true) }));
jest.mock('./channels/push', () => ({ sendPushAlert: jest.fn(async () => ({ sent: false, reason: 'not_configured' })) }));
jest.mock('./channels/whatsapp', () => ({ sendWhatsAppAlert: jest.fn(async () => ({ sent: true })) }));
const seen = new Set<string>();
jest.mock('../platform/idempotency', () => ({
  hashIdempotencyKey: (s: string) => s,
  markIdempotentDuplicate: jest.fn(async (k: string) => (seen.has(k) ? false : (seen.add(k), true))),
}));

import { notifyUser } from './dispatch';
import { createNotification } from './store';
import { sendPushAlert } from './channels/push';
import { sendWhatsAppAlert } from './channels/whatsapp';

const bell = createNotification as jest.MockedFunction<typeof createNotification>;

beforeEach(() => {
  jest.clearAllMocks();
  seen.clear();
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('the bell (typed by kind), then push and WhatsApp with the same event', async () => {
  const ev = { userId: 'u1', kind: 'film' as const, title: '🎬 მზადაა!', body: 'ნახე ბიბლიოთეკაში.', url: '/library' };
  await notifyUser(ev);
  expect(bell).toHaveBeenCalledWith({ client: true }, 'u1', 'video', '🎬 მზადაა! ნახე ბიბლიოთეკაში.');
  expect(sendPushAlert).toHaveBeenCalledWith(ev);
  expect(sendWhatsAppAlert).toHaveBeenCalledWith(ev);
});

test.each([
  ['music', 'music'], ['image', 'image'], ['avatar', 'video'], ['vfx', 'video'], ['research', 'research'],
  ['credits_low', 'credits_low'], ['payment', 'payment'],
] as const)('%s → bell type %s', async (kind, type) => {
  await notifyUser({ userId: 'u1', kind, title: 't', body: '' });
  expect(bell).toHaveBeenCalledWith(expect.anything(), 'u1', type, 't');
});

test('a generic event, or bell:false, skips the bell but still reaches the outside channels', async () => {
  await notifyUser({ userId: 'u1', kind: 'generic', title: 't', body: '' });
  await notifyUser({ userId: 'u1', kind: 'video', title: 't', body: '' }, { bell: false });
  expect(bell).not.toHaveBeenCalled();
  expect(sendWhatsAppAlert).toHaveBeenCalledTimes(2);
});

test('the same dedupe key notifies once', async () => {
  const ev = { userId: 'u1', kind: 'image' as const, title: 't', body: '', dedupeKey: 'job:42' };
  await notifyUser(ev);
  await notifyUser(ev);
  expect(bell).toHaveBeenCalledTimes(1);
  expect(sendPushAlert).toHaveBeenCalledTimes(1);
});

test('no user → nothing; a channel that throws never reaches the caller', async () => {
  await notifyUser({ userId: '', kind: 'image', title: 't', body: '' });
  expect(bell).not.toHaveBeenCalled();
  (sendWhatsAppAlert as jest.Mock).mockRejectedValueOnce(new Error('boom'));
  bell.mockRejectedValueOnce(new Error('db'));
  await expect(notifyUser({ userId: 'u1', kind: 'image', title: 't', body: '' })).resolves.toBeUndefined();
});

test('on Vercel the outside channels finish after the response (waitUntil), the bell before it', async () => {
  const waitUntil = jest.fn();
  const key = Symbol.for('@vercel/request-context');
  (globalThis as Record<symbol, unknown>)[key] = { get: () => ({ waitUntil }) };
  try {
    await notifyUser({ userId: 'u1', kind: 'image', title: 't', body: '' });
    expect(bell).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0][0];
    expect(sendWhatsAppAlert).toHaveBeenCalledTimes(1);
  } finally {
    delete (globalThis as Record<symbol, unknown>)[key];
  }
});
