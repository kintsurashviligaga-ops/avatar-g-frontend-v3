/**
 * lib/agent/media/quoteToken.ts — "this exact plan was quoted to this user at this price", signed.
 *
 * A quote is the analysis of the user's files and the plan Agent G made from them. The run must render THAT plan at
 * THAT price, not whatever a client sends back, and must never render it twice. So the quote hands the client the
 * plan with a token that binds (user, job id, the plan's fingerprint, the price, an expiry):
 *   · a changed plan, another user, or an expired quote is refused;
 *   · the job id in it is the run's idempotency key: the job row is inserted under it, so a second run of the same
 *     quote (a double tap, a retry after a lost response) finds the row and reports it instead of rendering again.
 *
 * Same construction as lib/orchestrator/jobChargeToken: HMAC-SHA256 over `<domain>:<payload>`, constant-time compare,
 * no key = no token (fail closed). The key is injected so the rules are tested without env.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const DOMAIN = 'agent-g-media-quote:v1';
/** A quote is good for half an hour: long enough to read it, short enough that a signed source link is still live. */
export const QUOTE_TTL_MS = 30 * 60 * 1000;

export interface QuoteClaims {
  /** The user the quote was made for. */
  u: string;
  /** The job id the run will use: the idempotency key. */
  j: string;
  /** The fingerprint of the quoted request (lib/orchestrator/idemRef bodyFingerprint). */
  f: string;
  /** Credits quoted. */
  c: number;
  /** Expiry, epoch ms. */
  x: number;
}

const mac = (key: string, payload: string) => createHmac('sha256', key).update(`${DOMAIN}:${payload}`).digest('base64url');

export function signQuote(claims: QuoteClaims, key: string): string | null {
  if (!key || !claims.u || !claims.j || !claims.f || !(claims.c >= 0) || !(claims.x > 0)) return null;
  const payload = Buffer.from(JSON.stringify({ v: 1, ...claims })).toString('base64url');
  return `${payload}.${mac(key, payload)}`;
}

export type QuoteCheck =
  | { ok: true; claims: QuoteClaims }
  | { ok: false; reason: 'invalid' | 'expired' | 'not_yours' | 'changed' };

/** Verify a token for this user and this request fingerprint at `now`. */
export function verifyQuote(token: unknown, key: string, expect: { userId: string; fingerprint: string; now: number }): QuoteCheck {
  if (!key || typeof token !== 'string' || token.length > 2048) return { ok: false, reason: 'invalid' };
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra !== undefined) return { ok: false, reason: 'invalid' };
  const a = Buffer.from(sig);
  const b = Buffer.from(mac(key, payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'invalid' };
  let c: Partial<QuoteClaims> & { v?: unknown };
  try {
    c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as typeof c;
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (c.v !== 1 || typeof c.u !== 'string' || typeof c.j !== 'string' || typeof c.f !== 'string'
    || typeof c.c !== 'number' || typeof c.x !== 'number') return { ok: false, reason: 'invalid' };
  if (c.u !== expect.userId) return { ok: false, reason: 'not_yours' };
  if (c.f !== expect.fingerprint) return { ok: false, reason: 'changed' };
  if (!(expect.now < c.x)) return { ok: false, reason: 'expired' };
  return { ok: true, claims: { u: c.u, j: c.j, f: c.f, c: c.c, x: c.x } };
}
