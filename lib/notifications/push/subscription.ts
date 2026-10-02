/**
 * lib/notifications/push/subscription.ts — what a browser's PushSubscription must look like before we store it.
 *
 * ⚠️ THE ENDPOINT IS A URL THE SERVER WILL POST TO. Stored as-is, any https URL would turn every notification into a
 * request from our servers to a host the user chose (SSRF: an internal address, someone else's API). So it must be https,
 * on the default port, with no credentials, and on a push service a real browser hands out — the list below. A browser
 * on a push service not listed here simply cannot opt in until the host is added.
 */
import { z } from 'zod';

/** One person's devices: phone, laptop, a work browser … Subscribing an 11th device retires the oldest. */
export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 10;
/** FCM endpoints are ~200 characters, Windows (WNS) ones up to several hundred. Matches the table's check. */
export const MAX_ENDPOINT_CHARS = 2048;

/** Exact hosts. Chrome, Android, Opera, Samsung Internet and Brave all subscribe through FCM. */
const PUSH_HOSTS = new Set(['fcm.googleapis.com']);
/** Host suffixes (any subdomain): Firefox (autopush), Safari macOS/iOS 16.4+ (Apple), Edge on Windows (WNS). */
const PUSH_HOST_SUFFIXES = ['push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT_CHARS) return false;
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
  const host = u.hostname.toLowerCase();
  return PUSH_HOSTS.has(host) || PUSH_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

const B64URL = /^[A-Za-z0-9_-]+$/;
const unpad = (s: string) => s.replace(/=+$/, '');

/** An unpadded base64url string that decodes to exactly `bytes` bytes (and starts with `lead`, when given). */
function isKey(s: string, bytes: number, lead?: number): boolean {
  if (!B64URL.test(s)) return false;
  const buf = Buffer.from(s, 'base64url');
  return buf.length === bytes && (lead === undefined || buf[0] === lead);
}

const localeSchema = z.enum(['ka', 'en', 'ru']);

/** POST /api/push/subscribe — `{ subscription: PushSubscription.toJSON(), locale? }`. */
export const subscribeBodySchema = z.object({
  subscription: z.object({
    endpoint: z.string().min(1).max(MAX_ENDPOINT_CHARS).refine(isAllowedPushEndpoint, 'endpoint'),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({
      // The browser's P-256 public key: an uncompressed point, 65 bytes, 0x04 first.
      p256dh: z.string().max(200).transform(unpad).refine((s) => isKey(s, 65, 0x04), 'p256dh'),
      // The 16-byte auth secret.
      auth: z.string().max(100).transform(unpad).refine((s) => isKey(s, 16), 'auth'),
    }),
  }),
  locale: localeSchema.optional(),
});
export type SubscribeBody = z.infer<typeof subscribeBodySchema>;

/** DELETE /api/push/subscribe — `{ endpoint }`. Only ever a filter on the caller's OWN rows, so no host check. */
export const unsubscribeBodySchema = z.object({
  endpoint: z.string().min(1).max(MAX_ENDPOINT_CHARS),
});

/** POST /api/push/test — `{ locale? }`. */
export const testBodySchema = z.object({ locale: localeSchema.optional() });
