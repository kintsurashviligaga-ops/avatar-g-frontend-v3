/**
 * lib/notifications/push/config.ts — is Web Push usable on THIS deployment? Probed, never assumed.
 *
 * Two things must be there: a VAPID key pair (env, see ENV_CHECKLIST.md) and the `push_subscriptions` table
 * (supabase/migrations/20261003d_push_subscriptions.sql — prepared, applied by the owner by hand). Until both are, the
 * opt-in card says "not available yet", GET /api/push/public-key answers `{ available: false }` and sendPushAlert answers
 * `not_configured`; nothing 500s over a missing key or table.
 */
import 'server-only';

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * The contact the push services see in every VAPID token. ⚠️ Apple's push service refuses a `mailto:` with spaces or an
 * `https://localhost` subject (BadJwtToken), so a malformed override falls back to this address instead of being sent.
 */
export const DEFAULT_VAPID_SUBJECT = 'mailto:support@myavatar.ge';

const B64URL = /^[A-Za-z0-9_-]+$/;

/** Decoded byte length of an unpadded base64url string, or -1 when it is not one (web-push rejects padding too). */
function b64urlBytes(s: string): number {
  if (!B64URL.test(s)) return -1;
  return Buffer.from(s, 'base64url').length;
}

function vapidSubject(raw: string | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return DEFAULT_VAPID_SUBJECT;
  try {
    const u = new URL(s);
    if (u.protocol === 'mailto:' && /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return s;
    if (u.protocol === 'https:' && u.hostname !== 'localhost') return s;
  } catch {
    /* fall through */
  }
  return DEFAULT_VAPID_SUBJECT;
}

/**
 * The VAPID key pair, or null when it is missing or malformed. The keys are checked the way web-push checks them (a P-256
 * public point of 65 bytes, a 32-byte private scalar) so a pasted-wrong key reads as "not configured" here instead of
 * throwing inside every send.
 */
export function getVapidConfig(env: NodeJS.ProcessEnv = process.env): VapidConfig | null {
  const publicKey = (env.VAPID_PUBLIC_KEY || env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (env.VAPID_PRIVATE_KEY || '').trim();
  if (!publicKey || !privateKey) return null;
  if (b64urlBytes(publicKey) !== 65 || b64urlBytes(privateKey) !== 32) return null;
  return { publicKey, privateKey, subject: vapidSubject(env.VAPID_SUBJECT) };
}

/** PostgREST's "that table is not there": 42P01 (undefined_table) or PGRST205 (not in the schema cache). */
export function isMissingTableError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === '42P01' || code === 'PGRST205';
}

type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

let probe: { at: number; ready: boolean } | null = null;

/**
 * One cached `select id … limit 1`: 5 minutes once the table is there, 30 seconds while it is not (so applying the
 * migration shows up fast). The pattern of lib/research/capabilities.tableReady.
 */
export async function pushTableReady(db: Db, now: number = Date.now()): Promise<boolean> {
  if (probe && now - probe.at < (probe.ready ? 300_000 : 30_000)) return probe.ready;
  let ready = false;
  try {
    const { error } = await db.from('push_subscriptions').select('id').limit(1);
    ready = !error;
  } catch {
    ready = false;
  }
  probe = { at: now, ready };
  return ready;
}

/** Test hook. */
export function resetPushTableProbe(): void {
  probe = null;
}
