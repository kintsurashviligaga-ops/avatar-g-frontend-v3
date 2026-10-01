/**
 * lib/billing/avatarCharge.ts — the signed charge token for avatar renders (lip-sync + HeyGen presenter).
 *
 * The avatar routes used to charge on the GET poll's SUCCESS, so everything before that — the TTS, the provider
 * render, and every render whose poll never came back — was free, and a 0-balance user could start unlimited jobs.
 * They now RESERVE at POST (deduct_credits under a server UUID ref, before any TTS or provider work) and hand the
 * client a token that says "this job is already paid for under ref R". The GET poll reads it to:
 *   · skip its own legacy deduct (the reservation IS the charge — no double billing);
 *   · refund R through refundDebitByRef when the provider reports a TERMINAL failure for that job.
 *
 * ⚠️ THE TOKEN RIDES INSIDE THE jobId (`<providerJobId>~<token>`), not only beside it. Eight client call sites poll
 * `?id=<jobId>` and round-trip it verbatim; a separate field would need every one rewired, and any tab still running
 * the old bundle would poll WITHOUT it — the GET would then deduct a second time on top of the reservation. Carried
 * in the id, an old tab gets a paid-for id from the new server and the GET finds the token on its own. The prefix
 * (`heygen:` / `sync:`) is kept, so the client's `startsWith('heygen:')` retry logic still works.
 *
 * Same HMAC construction as lib/avatar/handoff.ts (service-role key fallback, constant-time compare, fail-closed
 * when no key). Nothing in the token is trusted for the AMOUNT: a refund pays back what the LEDGER shows under the
 * ref (refundDebitByRef → netDebitedForRef), never what the token claims. The token only names WHICH ref and binds
 * it to one user and one provider job, so it cannot be re-pointed at another job's failure.
 */
import { createHmac, timingSafeEqual } from 'crypto';

/** What a token authorises. A token is checked against the kind the route expects, so one can't cross routes. */
export type AvatarChargeKind =
  /** GET /api/video/lipsync — a reserved lip-sync job. */
  | 'lipsync'
  /** GET /api/heygen/presenter — a reserved HeyGen presenter job. */
  | 'presenter'
  /** Presenter Phase A (TTS) hold: lets the NEXT phase (HeyGen submit, or the SadTalker fallback) release it. */
  | 'presenter-hold';

export interface AvatarCharge {
  v: 1;
  k: AvatarChargeKind;
  /** The user whose ledger holds the reservation. */
  u: string;
  /** The deduct_credits ref the reservation was taken under. */
  r: string;
  /** Provider job id this charge covers (bare, without the token suffix). null for a presenter-hold. */
  j: string | null;
  /** Issued-at (ms) — observability only. No expiry: a token's only powers (skip a deduct that was already
   *  taken, refund a net-capped reservation on that job's terminal failure) are not more dangerous with age, and
   *  an expired token would fall back to the legacy deduct and DOUBLE-charge a long render. */
  iat: number;
}

const TOKEN_PREFIX = 'av1';
/** Separator between the provider job id and the token in a composite jobId. Not in base64url, not in any
 *  provider id we mint (`heygen:<hex>`, `sync:<id>`, Replicate ids) — and unreserved, so it survives encodeURIComponent. */
export const CHARGE_SEP = '~';

function signingKey(): string {
  return process.env.AVATAR_CHARGE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function hmac(payload: string): string {
  return createHmac('sha256', signingKey()).update(`avatar-charge:v1:${payload}`).digest('base64url');
}

/** True when tokens can be minted. Routes check this BEFORE reserving, so a reservation never strands without one. */
export function avatarChargeSigningReady(): boolean {
  return signingKey().length > 0;
}

/** Mint a token. null when no signing key is configured (fail-closed — the caller must not proceed unbilled). */
export function signAvatarCharge(c: Omit<AvatarCharge, 'v' | 'iat'> & { iat?: number }): string | null {
  if (!signingKey() || !c.u || !c.r) return null;
  const body: AvatarCharge = { v: 1, k: c.k, u: c.u, r: c.r, j: c.j ?? null, iat: c.iat ?? Date.now() };
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${TOKEN_PREFIX}.${payload}.${hmac(payload)}`;
}

/** Verify a token's signature and shape (and kind, when given). null on any mismatch. */
export function verifyAvatarCharge(token: unknown, kind?: AvatarChargeKind): AvatarCharge | null {
  if (typeof token !== 'string' || token.length > 4096 || !signingKey()) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  const payload = parts[1] ?? '';
  const sig = parts[2] ?? '';
  const a = Buffer.from(sig);
  const b = Buffer.from(hmac(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  const p = parsed as Partial<AvatarCharge> | null;
  if (!p || p.v !== 1 || typeof p.u !== 'string' || !p.u || typeof p.r !== 'string' || !p.r) return null;
  if (p.k !== 'lipsync' && p.k !== 'presenter' && p.k !== 'presenter-hold') return null;
  if (kind && p.k !== kind) return null;
  if (p.j !== null && typeof p.j !== 'string') return null;
  return { v: 1, k: p.k, u: p.u, r: p.r, j: p.j ?? null, iat: typeof p.iat === 'number' ? p.iat : 0 };
}

/** `<providerJobId>~<token>` — what POST returns as `jobId` / `videoId`. */
export function withChargeToken(jobId: string, token: string): string {
  return `${jobId}${CHARGE_SEP}${token}`;
}

/** Split a polled id back into the provider job id and (if present) its token. */
export function splitChargedJobId(id: string): { jobId: string; token: string | null } {
  // Split only on `~av1.` so a provider id that ever contains a bare `~` is never truncated.
  const i = id.lastIndexOf(`${CHARGE_SEP}${TOKEN_PREFIX}.`);
  if (i <= 0) return { jobId: id, token: null };
  return { jobId: id.slice(0, i), token: id.slice(i + 1) };
}

/**
 * The charge a polled id carries, when its token is authentic, of the expected kind, and bound to THIS job.
 * Anything else → null, and the route falls back to its legacy (deduct-on-success) behaviour: a forged or
 * mismatched token can only ever make its holder pay, never skip a payment or pull a refund.
 */
export function chargeForPolledId(id: string, kind: 'lipsync' | 'presenter'): { jobId: string; charge: AvatarCharge | null } {
  const { jobId, token } = splitChargedJobId(id);
  if (!token) return { jobId, charge: null };
  const charge = verifyAvatarCharge(token, kind);
  return { jobId, charge: charge && charge.j === jobId ? charge : null };
}

/** A fresh server-side reservation ref. Never client-derived (a client-keyed ref is a free-replay exploit). */
export function avatarChargeRef(kind: 'lipsync' | 'presenter' | 'presenter-tts', userId: string, uuid: string): string {
  return `avatar:${kind}:${uuid}:${userId}`;
}
