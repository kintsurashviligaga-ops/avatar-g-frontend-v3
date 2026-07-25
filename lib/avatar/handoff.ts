/**
 * Cross-device avatar-enrollment handoff token (desktop → phone).
 *
 * The desktop (authenticated) mints a short-lived HMAC-signed token carrying its userId + expiry. The
 * phone — which has NO session — opens /{locale}/avatar/enroll?t=<token>, captures a selfie, and POSTs it to
 * /api/avatar/handoff/complete with the token; the server verifies the signature + expiry and enrolls the
 * avatar for the token's userId. The desktop meanwhile polls its OWN /api/avatar/core and continues the
 * moment the avatar appears — so NO shared session store (Redis/DB table) is needed; the token is stateless.
 *
 * The signing key is the SERVER-ONLY service-role key (never shipped to the client), so a token can't be
 * forged. The token is single-purpose (only authorizes enrolling a 2D avatar — no financial or destructive
 * action) and short-lived, so its risk profile is that of a magic link.
 */
import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 min to walk over to the phone and shoot the selfie

function signingKey(): string {
  return process.env.AVATAR_HANDOFF_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function hmac(payload: string): string {
  return createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

/** Mint a signed handoff token for `userId`. Returns null if no signing key is configured (fail-closed). */
export function signHandoffToken(userId: string, ttlMs: number = DEFAULT_TTL_MS): string | null {
  if (!signingKey() || !userId) return null;
  const payload = `${userId}.${Date.now() + ttlMs}`; // userId is a UUID (no '.'); exp is digits
  return `${Buffer.from(payload).toString('base64url')}.${hmac(payload)}`;
}

/** Verify a handoff token; returns the userId when the signature is valid and unexpired, else null. */
export function verifyHandoffToken(token: string): { userId: string } | null {
  if (!signingKey() || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let payload: string;
  try { payload = Buffer.from(b64, 'base64url').toString('utf8'); } catch { return null; }
  const expected = hmac(payload);
  // Constant-time compare (guard unequal lengths first — timingSafeEqual throws on a length mismatch).
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const sep = payload.lastIndexOf('.');
  const userId = payload.slice(0, sep);
  const exp = Number(payload.slice(sep + 1));
  if (!userId || !Number.isFinite(exp) || Date.now() > exp) return null;
  return { userId };
}
