/**
 * Cross-device avatar-enrollment handoff token (desktop → phone).
 *
 * The desktop (authenticated) mints a short-lived HMAC-signed token carrying its userId + expiry. The
 * phone — which has NO session — opens /{locale}/avatar/enroll?t=<token>, captures a selfie, and POSTs it to
 * /api/avatar/handoff/complete with the token; the server verifies the signature + expiry and enrolls the
 * avatar for the token's userId. The desktop meanwhile polls its OWN /api/avatar/core and continues the
 * moment the avatar appears. (With NEXT_PUBLIC_TWIN_ENABLED the phone runs the Digital Twin capture instead and
 * commits through /api/twin/commit with the same token.)
 *
 * The signing key is the SERVER-ONLY AVATAR_HANDOFF_SECRET (falling back, loudly, to the service-role key;
 * neither is ever shipped to the client), so a token can't be forged. The token is single-purpose (only
 * authorizes enrolling the caller's own avatar/twin — no financial action) and short-lived.
 *
 * ⚠️ SINGLE USE (jti). The link sits in a QR code, browser history and screenshots, and it writes BIOMETRICS: replayed
 * inside its 15 minutes it could put someone else's face on the account after the owner finished. Every token now
 * carries a random id, and the route that completes the handoff CLAIMS it (consumeHandoffToken) — the first completion
 * wins, any later one is refused. The signature is still stateless; only "already used" needs a store, and the store is
 * the private twin bucket (lib/twin/store.ts twinHandoffJtiStore: create-if-absent is atomic there), so no table or
 * Redis is needed. A token minted before this change carries no id and no longer verifies — it just reads as expired.
 */
import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 min to walk over to the phone and shoot the selfie

/** 16 random bytes → 22 base64url characters. */
const JTI_RE = /^[A-Za-z0-9_-]{22}$/;

let keyWarned = false;

function signingKey(): string {
  const dedicated = process.env.AVATAR_HANDOFF_SECRET;
  if (dedicated) return dedicated;
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  // ⚠️ LOUD, once per instance: the fallback works, so nothing else would ever surface it. The service-role
  // key is the database master key and already doubles as an HMAC key elsewhere (csrf, voice-v2v) — handoff
  // links should have their own key so one can be rotated/revoked without the other. Names only, never values.
  if (!keyWarned) {
    keyWarned = true;
    // eslint-disable-next-line no-console
    console.error(
      fallback
        ? '[avatar/handoff] ⚠️ AVATAR_HANDOFF_SECRET is UNSET — phone-handoff tokens are being signed with SUPABASE_SERVICE_ROLE_KEY. Set a dedicated AVATAR_HANDOFF_SECRET.'
        : '[avatar/handoff] ⚠️ AVATAR_HANDOFF_SECRET and SUPABASE_SERVICE_ROLE_KEY are both UNSET — phone handoff is DISABLED (fail-closed).',
    );
  }
  return fallback;
}

function hmac(payload: string): string {
  return createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

export interface HandoffClaims {
  userId: string;
  /** The token's unique id — what a store marks as used. */
  jti: string;
  /** Expiry, epoch ms. */
  exp: number;
}

/**
 * Remembers which handoff tokens were already used. `claim` must be ATOMIC: 'claimed' for the first caller of a jti
 * only, 'used' for everyone after; it THROWS when it cannot tell (the caller then refuses — fail closed).
 */
export interface HandoffJtiStore {
  claim(jti: string, exp: number): Promise<'claimed' | 'used'>;
  /** Undo a claim whose work then failed, so the person can retry with the same link. Best-effort, never throws. */
  release(jti: string): Promise<void>;
  /** true / false when the store answered; null when it could not be asked. */
  isClaimed(jti: string): Promise<boolean | null>;
}

/** Mint a signed handoff token for `userId`. Returns null if no signing key is configured (fail-closed). */
export function signHandoffToken(userId: string, ttlMs: number = DEFAULT_TTL_MS): string | null {
  if (!signingKey() || !userId) return null;
  const jti = randomBytes(16).toString('base64url');
  const payload = `${userId}.${Date.now() + ttlMs}.${jti}`; // userId is a UUID (no '.'); exp is digits; jti is base64url
  return `${Buffer.from(payload).toString('base64url')}.${hmac(payload)}`;
}

export interface VerifyHandoffOptions {
  /**
   * Accept this ONE token past its expiry when its jti equals `graceJti`. Only the twin commit passes it — with the jti
   * bound into a valid capture ticket that was minted while the link was still live (lib/twin/ticket.ts `j`). A capture
   * takes up to 2 hours on the phone; the link only 15 minutes. The link is still single-use: the commit claims it.
   */
  graceJti?: string | null;
}

/**
 * Verify a handoff token's signature, shape and expiry. Does NOT mark it used — reading is not completing (the twin
 * capture verifies once to sign its uploads, then consumes at the commit).
 */
export function verifyHandoffToken(token: string, opts: VerifyHandoffOptions = {}): HandoffClaims | null {
  if (!signingKey() || typeof token !== 'string' || token.length > 1024) return null;
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
  const parts = payload.split('.');
  if (parts.length !== 3) return null; // a pre-jti token (`userId.exp`) can never be single-use — refused
  const [userId, expStr, jti] = parts as [string, string, string];
  const exp = Number(expStr);
  if (!userId || !/^\d+$/.test(expStr) || !JTI_RE.test(jti) || !Number.isFinite(exp)) return null;
  if (Date.now() > exp && !(opts.graceJti && opts.graceJti === jti)) return null;
  return { userId, jti, exp };
}

export type ConsumeResult =
  | { ok: true; claims: HandoffClaims }
  | { ok: false; reason: 'invalid' | 'used' | 'unavailable' };

/**
 * Verify AND claim: succeeds for the token's FIRST use only. 'invalid' (bad/expired) and 'used' are the caller's 401;
 * 'unavailable' (the store could not answer) is a retryable 503 — nothing was claimed, so the link still works.
 */
export async function consumeHandoffToken(token: string, store: HandoffJtiStore, opts: VerifyHandoffOptions = {}): Promise<ConsumeResult> {
  const claims = verifyHandoffToken(token, opts);
  if (!claims) return { ok: false, reason: 'invalid' };
  try {
    return (await store.claim(claims.jti, claims.exp)) === 'claimed' ? { ok: true, claims } : { ok: false, reason: 'used' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
