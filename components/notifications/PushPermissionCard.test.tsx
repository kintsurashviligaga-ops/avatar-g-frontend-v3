/**
 * @jest-environment jsdom
 *
 * The push opt-in card against a fake browser (service worker, PushManager, Notification) and a mocked network: every
 * honest state (not supported, iPhone not installed, inside the app, not available, blocked, off, on), the permission
 * prompt only on the press, subscribe / unsubscribe / test, and the browser and server kept in agreement.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PushPermissionCard } from './PushPermissionCard';

// Shaped like a VAPID public key (an uncompressed P-256 point, 65 bytes) — not a real key.
const KEY = Buffer.from([4, ...Array.from({ length: 64 }, (_, i) => (i * 7 + 3) % 256)]).toString('base64url');
const OLD_KEY = Buffer.from([4, ...Array.from({ length: 64 }, (_, i) => (i * 11 + 5) % 256)]).toString('base64url');
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/device-1';

type Net = Array<{ url: string; method: string; body: unknown }>;
const calls: Net = [];

function network(answers: { key?: unknown; subscribe?: number; unsubscribe?: number; test?: { status?: number; data?: unknown } } = {}) {
  calls.length = 0;
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    let status = 200;
    let body: unknown = {};
    if (url === '/api/push/public-key') body = answers.key ?? { available: true, publicKey: KEY };
    else if (url === '/api/push/subscribe' && method === 'POST') { status = answers.subscribe ?? 200; body = { status: 'success', data: { subscribed: true } }; }
    else if (url === '/api/push/subscribe' && method === 'DELETE') { status = answers.unsubscribe ?? 200; body = { status: 'success', data: { removed: 1 } }; }
    else if (url === '/api/push/test') { status = answers.test?.status ?? 200; body = { status: 'success', data: answers.test?.data ?? { sent: true, delivered: 1 } }; }
    return { ok: status < 400, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
}

function keyBytes(k: string): ArrayBuffer {
  const b = Buffer.from(k, 'base64url');
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

function fakeSub(key = KEY) {
  return {
    endpoint: ENDPOINT,
    options: { applicationServerKey: keyBytes(key) },
    toJSON: () => ({ endpoint: ENDPOINT, expirationTime: null, keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: jest.fn(async () => true),
  };
}

interface FakeBrowser {
  permission: NotificationPermission;
  requestPermission: jest.Mock;
  register: jest.Mock;
  subscribe: jest.Mock;
  current: ReturnType<typeof fakeSub> | null;
}

function browser(opts: { permission?: NotificationPermission; prompt?: NotificationPermission; existing?: ReturnType<typeof fakeSub> | null; registered?: boolean } = {}): FakeBrowser {
  const fb = { permission: opts.permission ?? 'default', current: opts.existing ?? null } as FakeBrowser;
  let registered = opts.registered ?? true;
  const pushManager = {
    getSubscription: jest.fn(async () => fb.current),
    subscribe: jest.fn(async (o: { applicationServerKey: Uint8Array }) => {
      fb.current = fakeSub(Buffer.from(o.applicationServerKey).toString('base64url'));
      return fb.current;
    }),
  };
  fb.subscribe = pushManager.subscribe;
  const reg = { pushManager };
  fb.register = jest.fn(async () => { registered = true; return reg; });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: jest.fn(async () => (registered ? reg : undefined)), register: fb.register, ready: Promise.resolve(reg) },
  });
  (window as unknown as { PushManager: unknown }).PushManager = function PushManager() {};
  fb.requestPermission = jest.fn(async () => { fb.permission = opts.prompt ?? 'granted'; return fb.permission; });
  (window as unknown as { Notification: unknown }).Notification = {
    get permission() { return fb.permission; },
    requestPermission: fb.requestPermission,
  };
  return fb;
}

/** jsdom itself has no service worker, PushManager or Notification — exactly a browser without push. */
function unsupportedBrowser(ua?: string) {
  Reflect.deleteProperty(navigator, 'serviceWorker');
  delete (window as unknown as { PushManager?: unknown }).PushManager;
  delete (window as unknown as { Notification?: unknown }).Notification;
  if (ua) Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua });
}

const card = () => screen.getByTestId('push-permission-card');
const state = () => card().getAttribute('data-state');
const settle = (s: string) => waitFor(() => expect(state()).toBe(s));

const UA = navigator.userAgent;
beforeEach(() => {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: UA });
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  window.matchMedia = jest.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
  delete (window as unknown as { PushManager?: unknown }).PushManager;
  delete (window as unknown as { Notification?: unknown }).Notification;
});

describe('honest states', () => {
  test('Georgian by default; a browser without push says so', async () => {
    network();
    unsupportedBrowser();
    render(<PushPermissionCard />);
    await settle('unsupported');
    expect(card().textContent).toContain('შეტყობინებები ამ მოწყობილობაზე');
    expect(card().textContent).toContain('ეს ბრაუზერი push-შეტყობინებებს არ უჭერს მხარს');
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('iPhone Safari, not installed: "add the app to the Home Screen first"', async () => {
    network();
    unsupportedBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1');
    render(<PushPermissionCard locale="en" />);
    await settle('ios_install');
    expect(card().textContent).toContain('add the app to your Home Screen first');
  });

  test('inside our own iOS app shell: says push does not work in the app (not "install it")', async () => {
    network();
    unsupportedBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MyAvatarApp');
    render(<PushPermissionCard locale="en" />);
    await settle('in_app');
    expect(card().textContent).toContain('don’t work inside the app');
  });

  test('the site has no keys / table yet: "not available", no button', async () => {
    network({ key: { available: false } });
    browser();
    render(<PushPermissionCard locale="ru" />);
    await settle('unavailable');
    expect(card().textContent).toContain('Push-уведомления на этом сайте пока не включены');
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('blocked: points to the browser settings, offers no button that cannot work', async () => {
    network();
    browser({ permission: 'denied' });
    render(<PushPermissionCard locale="en" />);
    await settle('blocked');
    expect(card().textContent).toContain('Allow them in your browser settings');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('turning it on', () => {
  test('NO permission prompt on mount — only from the press; then subscribe with our key and register on the server', async () => {
    network();
    const fb = browser();
    render(<PushPermissionCard locale="en" />);
    await settle('off');
    expect(fb.requestPermission).not.toHaveBeenCalled();
    expect(fb.subscribe).not.toHaveBeenCalled();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /turn on/i })); });
    await settle('on');
    expect(fb.requestPermission).toHaveBeenCalledTimes(1);
    const opts = fb.subscribe.mock.calls[0]![0] as { userVisibleOnly: boolean; applicationServerKey: Uint8Array };
    expect(opts.userVisibleOnly).toBe(true);
    expect(Buffer.from(opts.applicationServerKey).toString('base64url')).toBe(KEY);
    const post = calls.find((c) => c.url === '/api/push/subscribe' && c.method === 'POST')!;
    expect(post.body).toEqual({ subscription: { endpoint: ENDPOINT, expirationTime: null, keys: { p256dh: 'p', auth: 'a' } }, locale: 'en' });
    expect(screen.getByTestId('push-card-note').textContent).toContain('Done!');
  });

  test('registers /sw.js when no worker is registered yet (development, or the shell\'s registration failed)', async () => {
    network();
    const fb = browser({ registered: false });
    render(<PushPermissionCard locale="en" />);
    await settle('off');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /turn on/i })); });
    await settle('on');
    expect(fb.register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
  });

  test('the prompt answered "Block" → the blocked state', async () => {
    network();
    const fb = browser({ prompt: 'denied' });
    render(<PushPermissionCard locale="en" />);
    await settle('off');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /turn on/i })); });
    await settle('blocked');
    expect(fb.subscribe).not.toHaveBeenCalled();
  });

  test('the server refuses (signed out) → the browser subscription is undone, and the card says why', async () => {
    network({ subscribe: 401 });
    const fb = browser();
    render(<PushPermissionCard locale="en" />);
    await settle('off');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /turn on/i })); });
    await waitFor(() => expect(screen.getByTestId('push-card-note').textContent).toContain('Sign in'));
    expect(state()).toBe('off');
    expect(fb.current!.unsubscribe).toHaveBeenCalled();
  });
});

describe('when it is on', () => {
  test('an existing subscription shows "on" and is re-registered for whoever is signed in now', async () => {
    network();
    browser({ permission: 'granted', existing: fakeSub() });
    render(<PushPermissionCard locale="en" />);
    await settle('on');
    expect(calls.some((c) => c.url === '/api/push/subscribe' && c.method === 'POST')).toBe(true);
  });

  test('a subscription made with an old key is dropped on mount (it could never ring again)', async () => {
    network();
    const old = fakeSub(OLD_KEY);
    browser({ permission: 'granted', existing: old });
    render(<PushPermissionCard locale="en" />);
    await settle('off');
    expect(old.unsubscribe).toHaveBeenCalled();
  });

  test('send a test: the result is shown; "no device" and the rate limit have their own words', async () => {
    network();
    browser({ permission: 'granted', existing: fakeSub() });
    render(<PushPermissionCard locale="en" />);
    await settle('on');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /test notification/i })); });
    await waitFor(() => expect(screen.getByTestId('push-card-note').textContent).toContain('Sent'));
    expect(calls.find((c) => c.url === '/api/push/test')!.body).toEqual({ locale: 'en' });

    network({ test: { data: { sent: false, reason: 'not_linked' } } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /test notification/i })); });
    await waitFor(() => expect(screen.getByTestId('push-card-note').textContent).toContain('no longer registered'));

    network({ test: { status: 429 } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /test notification/i })); });
    await waitFor(() => expect(screen.getByTestId('push-card-note').textContent).toContain('Too many attempts'));
  });

  test('turn off: forgotten by the server, then unsubscribed in the browser', async () => {
    network();
    const sub = fakeSub();
    browser({ permission: 'granted', existing: sub });
    render(<PushPermissionCard locale="ka" />);
    await settle('on');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'გამორთვა' })); });
    await settle('off');
    expect(calls.find((c) => c.method === 'DELETE')!.body).toEqual({ endpoint: ENDPOINT });
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(card().textContent).toContain('გამორთულია ამ მოწყობილობაზე');
  });
});
