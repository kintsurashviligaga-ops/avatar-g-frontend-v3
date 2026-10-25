/**
 * lib/voice/relay/ticket.ts — the ticket a browser opens a Vertex AI Live session with, through our Live relay.
 *
 * Vertex AI authenticates Live with the service account's OAuth token, which may never reach a browser (MASTER TASK
 * v3.1). So the browser connects to our relay (services/live-relay, on Cloud Run), and the relay connects to Vertex with
 * its own service account. /api/voice/live hands the browser a TICKET in place of the old ephemeral token. It works the
 * same way as Google's ephemeral token:
 *   · it is signed (HMAC-SHA256, LIVE_RELAY_TICKET_SECRET shared by the app and the relay) and expires (`exp`);
 *   · it LOCKS the setup: it carries the digest of the exact setup the server built, so the relay refuses any other
 *     first frame. The browser still sends the setup itself, so the ticket stays small enough for a URL;
 *   · a new session must start before `nse` and only once per ticket (`jti`); a resumption (setup with a
 *     sessionResumption handle) may reuse it until `exp`, as Google's `uses: 1` token allows.
 *
 * The browser may change the setup in exactly two ways, so both are accepted:
 *   · on a reconnect it sets `sessionResumption` to the handle Google gave it, so the digest leaves that field out;
 *   · its degraded retry drops the parity fields (PARITY_FIELDS, the same list as components/voice/live
 *     useGeminiLiveSession), so the ticket also carries the digest of that stripped setup.
 *
 * Pure (node:crypto only): the relay bundles this same file, so both sides always agree on the format.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TICKET_VERSION = 'v1';

/** Setup fields the browser's degraded retry deletes (components/voice/live/useGeminiLiveSession PARITY_FIELDS). */
export const PARITY_FIELDS = ['inputAudioTranscription', 'outputAudioTranscription', 'sessionResumption', 'contextWindowCompression', 'tools'] as const;

/** A shared secret shorter than this is treated as missing. */
export const TICKET_SECRET_MIN_LENGTH = 32;

export interface TicketClaims {
  v: 1;
  /** One id per ticket; the relay starts a NEW session on it once. */
  jti: string;
  /** A short hash of the user id, for logs. Never the id itself. */
  sub: string;
  /** Issued at, ms since epoch. */
  iat: number;
  /** A new (non-resumed) session must start before this, ms. */
  nse: number;
  /** The ticket is dead after this, ms. */
  exp: number;
  /** Accepted setup digests: the full lock, then (when different) the degraded one. */
  d: string[];
}

export type TicketCheck =
  | { ok: true; claims: TicketClaims }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** JSON with object keys sorted at every level (arrays keep their order, `undefined` members are dropped). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): Json | undefined {
  if (Array.isArray(value)) return value.map((v) => sortKeys(v) ?? null);
  if (value && typeof value === 'object') {
    const out: { [k: string]: Json } = {};
    for (const k of Object.keys(value as object).sort()) {
      const v = sortKeys((value as Record<string, unknown>)[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (typeof value === 'function' || typeof value === 'symbol' || value === undefined) return undefined;
  return value as Json;
}

const b64url = (buf: Buffer) => buf.toString('base64url');

/** Digest of a setup, ignoring `sessionResumption` (the browser fills in the handle on a reconnect). */
export function setupDigest(setup: object): string {
  const rest: Record<string, unknown> = { ...(setup as Record<string, unknown>) };
  delete rest.sessionResumption;
  return b64url(createHash('sha256').update(canonicalJson(rest)).digest());
}

/** The digests a ticket accepts for this locked setup: the full one, then the degraded one when it differs. */
export function lockDigests(setup: object): string[] {
  const degraded: Record<string, unknown> = { ...(setup as Record<string, unknown>) };
  for (const f of PARITY_FIELDS) delete degraded[f];
  const full = setupDigest(setup);
  const lite = setupDigest(degraded);
  return lite === full ? [full] : [full, lite];
}

/** A short, non-reversible label for a user id in relay logs. */
export function subjectOf(userId: string): string {
  return createHash('sha256').update(`live-relay:${userId}`).digest('hex').slice(0, 16);
}

function sign(secret: string, payload: string): string {
  return b64url(createHmac('sha256', secret).update(`${TICKET_VERSION}.${payload}`).digest());
}

export function mintTicket(
  secret: string,
  input: { sub: string; nowMs: number; nseMs: number; expMs: number; digests: string[]; jti?: string },
): string {
  const claims: TicketClaims = {
    v: 1,
    jti: input.jti ?? b64url(randomBytes(16)),
    sub: input.sub,
    iat: input.nowMs,
    nse: input.nseMs,
    exp: input.expMs,
    d: input.digests,
  };
  const payload = b64url(Buffer.from(JSON.stringify(claims), 'utf8'));
  return `${TICKET_VERSION}.${payload}.${sign(secret, payload)}`;
}

/** Checks the signature and `exp`. `nse` and single use are the relay's to enforce (they depend on the setup). */
export function verifyTicket(secret: string, ticket: string, nowMs: number): TicketCheck {
  if (typeof ticket !== 'string' || ticket.length > 2048) return { ok: false, reason: 'malformed' };
  const parts = ticket.split('.');
  if (parts.length !== 3 || parts[0] !== TICKET_VERSION || !parts[1] || !parts[2]) return { ok: false, reason: 'malformed' };
  const want = Buffer.from(sign(secret, parts[1]));
  const got = Buffer.from(parts[2]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: 'bad_signature' };
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!isClaims(claims)) return { ok: false, reason: 'malformed' };
  if (nowMs >= claims.exp) return { ok: false, reason: 'expired' };
  return { ok: true, claims };
}

function isClaims(c: unknown): c is TicketClaims {
  if (!c || typeof c !== 'object') return false;
  const o = c as Record<string, unknown>;
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  return (
    o.v === 1 &&
    typeof o.jti === 'string' && o.jti.length > 0 &&
    typeof o.sub === 'string' &&
    num(o.iat) && num(o.nse) && num(o.exp) &&
    Array.isArray(o.d) && o.d.length > 0 && o.d.every((x) => typeof x === 'string' && x.length > 0)
  );
}
