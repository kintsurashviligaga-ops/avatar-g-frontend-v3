/**
 * Web Push channel — tells a user's phone or desktop that something finished, even with every tab closed.
 *
 * The browser subscribed through the opt-in card (components/notifications/PushPermissionCard → POST /api/push/subscribe);
 * here we load that user's devices with the service-role client and send each one an encrypted payload through its push
 * service (FCM, Mozilla, Apple, WNS), signed with our VAPID key. public/sw.js shows it and opens `url` on a tap.
 *
 * Contract (lib/notifications/types.ts): NEVER throws into a generation flow, and never stalls one — every send has a
 * timeout and the whole call a deadline. A device the push service says is gone (404/410) is deleted on the spot; any
 * other failure only counts against the row (`failure_count`), because a 429 or a 5xx says nothing about the device.
 */
import 'server-only';
import { createHash } from 'node:crypto';
import { sendNotification, WebPushError, type RequestOptions } from 'web-push';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { ChannelFailure, ChannelResult, NotifyEvent } from '../types';
import { getVapidConfig, isMissingTableError, type VapidConfig } from '../push/config';
import { isAllowedPushEndpoint, MAX_PUSH_SUBSCRIPTIONS_PER_USER } from '../push/subscription';

/** One push service request (web-push's socket timeout, plus a hard race for a server that drips bytes). */
const SEND_TIMEOUT_MS = 8_000;
/** The whole call: the subscriptions read, the parallel sends and the bookkeeping. */
const DEADLINE_MS = 12_000;
/** "Your video is ready" from yesterday is noise — a phone that was off for a day does not get it. */
const TTL_SECONDS = 24 * 60 * 60;
const TITLE_MAX = 120;
const BODY_MAX = 300;
const URL_MAX = 512;

export interface PushDelivery extends ChannelResult {
  /** Devices we tried. */
  attempted: number;
  /** Devices the push service accepted the message for. */
  delivered: number;
  /** Devices deleted because the push service said they are gone (404/410). */
  pruned: number;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number | null;
}

type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const TIMED_OUT = Symbol('timed_out');

function within<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<typeof TIMED_OUT>((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

const none = (reason: ChannelFailure): PushDelivery => ({ sent: false, reason, attempted: 0, delivered: 0, pruned: 0 });

/**
 * ⚠️ `ev.url` is a PATH on our own origin (the NotifyEvent contract). Anything else — an absolute URL, `//host`, `/\host`
 * (both are another host to a URL parser), a control character — becomes `/`. The service worker re-checks on the tap.
 */
export function safeAppPath(url: string | undefined): string {
  if (typeof url !== 'string') return '/';
  const s = url.trim();
  if (!s.startsWith('/') || s.startsWith('//') || s.startsWith('/\\') || s.length > URL_MAX) return '/';
  if (/[\u0000-\u001f\u007f]/.test(s)) return '/';
  return s;
}

function clip(s: unknown, max: number): string {
  const t = typeof s === 'string' ? s.trim() : '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** The JSON public/sw.js reads: `{ title, body, url, tag }` — `tag` makes the OS replace, not stack, a repeat. */
export function buildPushPayload(ev: NotifyEvent): string {
  const tag = clip(ev.dedupeKey, 64);
  return JSON.stringify({
    title: clip(ev.title, TITLE_MAX) || 'MyAvatar.ge',
    body: clip(ev.body, BODY_MAX),
    url: safeAppPath(ev.url),
    ...(tag ? { tag } : {}),
  });
}

/**
 * The push-service Topic for a dedupe key (≤ 32 base64url characters): a second message with the same Topic REPLACES one
 * still waiting for an offline phone, so a webhook delivered twice reaches it once.
 */
function topicFor(dedupeKey: string | undefined): string | undefined {
  if (!dedupeKey) return undefined;
  return createHash('sha256').update(dedupeKey).digest('base64url').slice(0, 32);
}

type Outcome = 'delivered' | 'gone' | 'failed';

async function sendOne(row: SubscriptionRow, payload: string, options: RequestOptions): Promise<{ outcome: Outcome; status: string }> {
  // ⚠️ Re-checked at send time, not only at subscribe time: a row that did not come through the route (a manual insert,
  // an old row from a looser rule) must never make our server POST to an arbitrary host.
  if (!isAllowedPushEndpoint(row.endpoint)) return { outcome: 'failed', status: 'bad_endpoint' };
  try {
    const r = await within(sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, options), SEND_TIMEOUT_MS + 1_000);
    if (r === TIMED_OUT) return { outcome: 'failed', status: 'timeout' };
    return { outcome: 'delivered', status: String(r.statusCode) };
  } catch (e) {
    const status = e instanceof WebPushError ? e.statusCode : (e as { statusCode?: unknown } | null)?.statusCode;
    if (status === 404 || status === 410) return { outcome: 'gone', status: String(status) };
    return { outcome: 'failed', status: typeof status === 'number' ? String(status) : 'error' };
  }
}

async function run(db: Db, vapid: VapidConfig, ev: NotifyEvent): Promise<PushDelivery> {
  const { data, error } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, failure_count')
    .eq('user_id', ev.userId)
    .order('created_at', { ascending: false })
    .limit(MAX_PUSH_SUBSCRIPTIONS_PER_USER);
  if (error) return none(isMissingTableError(error) ? 'not_configured' : 'failed');
  const rows = (Array.isArray(data) ? data : []) as SubscriptionRow[];
  if (rows.length === 0) return none('not_linked');

  const payload = buildPushPayload(ev);
  const topic = topicFor(ev.dedupeKey);
  const options: RequestOptions = {
    vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
    TTL: TTL_SECONDS,
    urgency: 'normal',
    timeout: SEND_TIMEOUT_MS,
    ...(topic ? { topic } : {}),
  };

  const results = await Promise.all(rows.map((row) => sendOne(row, payload, options)));
  const ids = (o: Outcome) => rows.filter((_, i) => results[i]!.outcome === o).map((r) => r.id);
  const delivered = ids('delivered');
  const gone = ids('gone');
  const failed = rows.filter((_, i) => results[i]!.outcome === 'failed');

  // Bookkeeping is best-effort: a failed write here must not turn a delivered notification into a reported failure.
  const now = new Date().toISOString();
  await Promise.allSettled([
    delivered.length ? db.from('push_subscriptions').update({ last_success_at: now, failure_count: 0 }).in('id', delivered) : null,
    gone.length ? db.from('push_subscriptions').delete().in('id', gone) : null,
    ...failed.map((r) => db.from('push_subscriptions').update({ failure_count: (r.failure_count ?? 0) + 1 }).eq('id', r.id)),
  ]);

  if (failed.length) {
    // Status codes only — an endpoint is a bearer capability for that device and never goes to a log.
    const statuses = results.filter((r) => r.outcome === 'failed').map((r) => r.status);
    console.warn(`[push] ${failed.length} of ${rows.length} deliveries failed (${statuses.join(', ')})`);
  }

  const base = { attempted: rows.length, delivered: delivered.length, pruned: gone.length };
  if (delivered.length > 0) return { sent: true, ...base };
  // Every device was gone: the user has, in effect, no device left — not a delivery failure.
  if (gone.length === rows.length) return { sent: false, reason: 'not_linked', ...base };
  return { sent: false, reason: 'failed', ...base };
}

/** The detailed answer (the test route shows "sent to 2 devices"); sendPushAlert is the channel contract over it. */
export async function deliverPush(ev: NotifyEvent): Promise<PushDelivery> {
  try {
    const vapid = getVapidConfig();
    if (!vapid) return none('not_configured');
    if (!ev || typeof ev.userId !== 'string' || !ev.userId) return none('not_linked');
    let db: Db;
    try {
      db = createServiceRoleClient() as unknown as Db;
    } catch {
      return none('not_configured');
    }
    const out = await within(run(db, vapid, ev), DEADLINE_MS);
    return out === TIMED_OUT ? none('failed') : out;
  } catch {
    return none('failed');
  }
}

export async function sendPushAlert(ev: NotifyEvent): Promise<ChannelResult> {
  const r = await deliverPush(ev);
  return r.sent ? { sent: true } : { sent: false, reason: r.reason ?? 'failed' };
}
