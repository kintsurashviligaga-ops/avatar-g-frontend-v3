/**
 * Browser side of Web Push: can this device do it, the service worker it needs, and the three /api/push calls.
 * Every helper is best-effort and answers instead of throwing where the card has something honest to show.
 */
import { isNativeIOSShell } from '@/lib/platform/nativeShell';

export type PushSupport = 'supported' | 'unsupported' | 'ios_install' | 'in_app';

function isIOSDevice(nav: Navigator): boolean {
  const ua = nav.userAgent || '';
  // iPadOS reports a desktop Mac user agent; the touch points give it away.
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (nav.maxTouchPoints ?? 0) > 1);
}

function isStandalone(win: Window): boolean {
  try {
    if (win.matchMedia?.('(display-mode: standalone)').matches) return true;
  } catch {
    /* no matchMedia */
  }
  return (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * ⚠️ iOS Safari (16.4+) offers push ONLY to a web app installed on the Home Screen — in a Safari tab PushManager simply
 * does not exist. So "no PushManager on an iPhone that is not installed" means "install first", not "unsupported". Our own
 * Capacitor shell is a WKWebView, which has no Web Push at all.
 */
export function detectPushSupport(win: Window = window): PushSupport {
  if (isNativeIOSShell()) return 'in_app';
  const nav = win.navigator;
  if ('serviceWorker' in nav && 'PushManager' in win && 'Notification' in win) return 'supported';
  if (isIOSDevice(nav) && !isStandalone(win)) return 'ios_install';
  return 'unsupported';
}

/** The VAPID public key (unpadded base64url) as the bytes PushManager.subscribe wants. */
export function base64UrlToBytes(s: string): Uint8Array {
  const b64 = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Was this subscription made with this key? After a VAPID key rotation an old one can never be delivered to again. */
export function subscribedWithKey(sub: PushSubscription, key: Uint8Array): boolean {
  const k = sub.options?.applicationServerKey;
  if (!k) return true; // the browser does not say — assume it is ours rather than churn a working subscription
  const a = new Uint8Array(k);
  return a.length === key.length && a.every((b, i) => b === key[i]);
}

/** Notification.requestPermission, promise or (older Safari) callback form. Call it straight from the click. */
export function requestNotificationPermission(): Promise<NotificationPermission> {
  return new Promise((resolve) => {
    try {
      const p = Notification.requestPermission((r) => resolve(r));
      if (p && typeof p.then === 'function') p.then(resolve, () => resolve('default'));
    } catch {
      resolve('default');
    }
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * An ACTIVE service worker registration (subscribe() refuses one that is still installing). components/AppShell registers
 * /sw.js in production only; when nothing is registered (development, or that registration failed) the opt-in registers
 * the same worker with the same options.
 */
export async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  const sw = navigator.serviceWorker;
  const existing = await sw.getRegistration('/');
  if (!existing) await sw.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  return withTimeout(sw.ready, 15_000);
}

/** This browser's current subscription, or null (no worker, none yet, or the browser refuses to say). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch {
    return null;
  }
}

export interface ApiAnswer<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T | null;
}

async function call<T>(url: string, init: RequestInit): Promise<ApiAnswer<T>> {
  try {
    const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
    const body = (await res.json().catch(() => null)) as { data?: T } | null;
    return { ok: res.ok, status: res.status, data: body?.data ?? null };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

/** GET /api/push/public-key — `{ available, publicKey? }`; null when the network failed. */
export async function fetchPushKey(): Promise<{ available: boolean; publicKey?: string } | null> {
  try {
    const res = await fetch('/api/push/public-key', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { available?: unknown; publicKey?: unknown };
    return body.available === true && typeof body.publicKey === 'string'
      ? { available: true, publicKey: body.publicKey }
      : { available: false };
  } catch {
    return null;
  }
}

export function saveSubscription(sub: PushSubscription, locale: string): Promise<ApiAnswer> {
  return call('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON(), locale }) });
}

export function removeSubscription(endpoint: string): Promise<ApiAnswer> {
  return call('/api/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint }) });
}

export function sendTestPush(locale: string): Promise<ApiAnswer<{ sent?: boolean; reason?: string; delivered?: number }>> {
  return call('/api/push/test', { method: 'POST', body: JSON.stringify({ locale }) });
}
