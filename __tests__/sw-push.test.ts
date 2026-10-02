/** @jest-environment node */
/**
 * public/sw.js — the Web Push `push` and `notificationclick` handlers, run in a VM against a fake worker global. Every push
 * shows a notification; a tap only ever opens OUR origin (an absolute URL to another host, `//host`, `javascript:` are
 * dropped); a tap without a link keeps the old behaviour; and the build stamp still finds CACHE_NAME.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const SRC = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');
const ORIGIN = 'https://myavatar.ge';

type Handler = (event: unknown) => void;
interface FakeClient { url: string; focus: jest.Mock }

function loadWorker(clients: FakeClient[] = []) {
  const handlers: Record<string, Handler> = {};
  const showNotification = jest.fn(async (..._a: unknown[]) => undefined);
  const openWindow = jest.fn(async (url: string) => ({ url }));
  const self = {
    location: { origin: ORIGIN },
    registration: { showNotification },
    clients: { matchAll: jest.fn(async () => clients), openWindow, claim: jest.fn() },
    skipWaiting: jest.fn(),
    addEventListener: (type: string, fn: Handler) => { handlers[type] = fn; },
  };
  vm.runInNewContext(SRC, { self, caches: {}, fetch: jest.fn(), URL, Promise, console });
  return { handlers, showNotification, openWindow };
}

async function fire(handler: Handler, event: Record<string, unknown>): Promise<void> {
  let pending: Promise<unknown> = Promise.resolve();
  handler({ ...event, waitUntil: (p: Promise<unknown>) => { pending = p; } });
  await pending;
}

const pushEvent = (payload: unknown) => ({
  data: {
    json: () => (typeof payload === 'string' ? JSON.parse(payload) : payload),
    text: () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
  },
});

const click = (data: unknown) => ({ notification: { close: jest.fn(), data } });

describe('push', () => {
  test('shows the payload, with the link resolved on our origin and the tag kept', async () => {
    const w = loadWorker();
    await fire(w.handlers.push!, pushEvent({ title: 'ვიდეო მზადაა', body: 'გახსენი', url: '/ka/dashboard?tool=video', tag: 'video:1' }));
    expect(w.showNotification).toHaveBeenCalledWith('ვიდეო მზადაა', {
      body: 'გახსენი',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      data: { url: `${ORIGIN}/ka/dashboard?tool=video` },
      tag: 'video:1',
    });
  });

  test.each([
    ['https://evil.example/phish'],
    ['//evil.example/phish'],
    ['/\\evil.example/phish'],
    ['javascript:alert(1)'],
  ])('a link to another place (%s) is dropped', async (url) => {
    const w = loadWorker();
    await fire(w.handlers.push!, pushEvent({ title: 'x', body: 'y', url }));
    expect((w.showNotification.mock.calls[0]![1] as { data: { url: unknown } }).data.url).toBeNull();
  });

  test('an empty or non-JSON push still shows a notification (Chrome and Safari require one per push)', async () => {
    const w = loadWorker();
    await fire(w.handlers.push!, {});
    await fire(w.handlers.push!, pushEvent('not json'));
    expect(w.showNotification).toHaveBeenCalledTimes(2);
    expect(w.showNotification.mock.calls[0]![0]).toBe('MyAvatar.ge');
    expect(w.showNotification.mock.calls[1]![1]).toEqual(expect.objectContaining({ body: 'not json' }));
  });
});

describe('notificationclick', () => {
  test('a window already on that page is focused — no new window', async () => {
    const onPage = { url: `${ORIGIN}/ka/dashboard`, focus: jest.fn(async () => undefined) };
    const elsewhere = { url: `${ORIGIN}/ka/settings`, focus: jest.fn(async () => undefined) };
    const w = loadWorker([elsewhere, onPage]);
    await fire(w.handlers.notificationclick!, click({ url: `${ORIGIN}/ka/dashboard?tool=video` }));
    expect(onPage.focus).toHaveBeenCalled();
    expect(elsewhere.focus).not.toHaveBeenCalled();
    expect(w.openWindow).not.toHaveBeenCalled();
  });

  test('otherwise the page opens in a new window; an open tab is never navigated away', async () => {
    const elsewhere = { url: `${ORIGIN}/ka/settings`, focus: jest.fn(async () => undefined) };
    const w = loadWorker([elsewhere]);
    await fire(w.handlers.notificationclick!, click({ url: `${ORIGIN}/en/dashboard` }));
    expect(w.openWindow).toHaveBeenCalledWith(`${ORIGIN}/en/dashboard`);
    expect(elsewhere.focus).not.toHaveBeenCalled();
  });

  test.each([['https://evil.example/x'], ['//evil.example/x'], ['javascript:alert(1)']])(
    'a link off our origin in the notification data (%s) is never opened',
    async (url) => {
      const w = loadWorker([]);
      await fire(w.handlers.notificationclick!, click({ url }));
      expect(w.openWindow).toHaveBeenCalledWith('/');
      expect(w.openWindow).not.toHaveBeenCalledWith(expect.stringContaining('evil'));
    },
  );

  test('a notification without a link keeps the old behaviour: focus the app, else open /', async () => {
    const tab = { url: `${ORIGIN}/ka/library`, focus: jest.fn(async () => undefined) };
    const w1 = loadWorker([tab]);
    await fire(w1.handlers.notificationclick!, click(undefined));
    expect(tab.focus).toHaveBeenCalled();
    expect(w1.openWindow).not.toHaveBeenCalled();

    const w2 = loadWorker([]);
    await fire(w2.handlers.notificationclick!, click(null));
    expect(w2.openWindow).toHaveBeenCalledWith('/');
  });
});

test('the build stamp (scripts/stamp-sw.mjs, next.config.js) still finds the CACHE_NAME line', () => {
  expect(SRC).toMatch(/const CACHE_NAME = '[^']*';/);
});
