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
import { createHash, createHmac, timingSafeEqual } from 'crypto';

/** What a token authorises. A token is checked against the kind the route expects, so one can't cross routes. */
export type AvatarChargeKind =
  /** GET /api/video/lipsync — a reserved lip-sync job. */
  | 'lipsync'
  /** GET /api/heygen/presenter — a reserved HeyGen presenter job. */
  | 'presenter'
  /** Presenter Phase A (TTS) hold: lets the NEXT phase (HeyGen submit, or the SadTalker fallback) release it —
   *  only toward a render of its own audio on the presenter face (holdReleasableFor). */
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
  /** presenter-hold only: fingerprint of the hosted TTS audio the hold paid for (see holdReleasableFor). */
  a?: string;
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
  const body: AvatarCharge = { v: 1, k: c.k, u: c.u, r: c.r, j: c.j ?? null, iat: c.iat ?? Date.now(), ...(c.a ? { a: c.a } : {}) };
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
  if (p.a !== undefined && typeof p.a !== 'string') return null;
  return { v: 1, k: p.k, u: p.u, r: p.r, j: p.j ?? null, iat: typeof p.iat === 'number' ? p.iat : 0, ...(p.a ? { a: p.a } : {}) };
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

/** The bundled default presenter portrait (public, non-user). The presenter route may override it via env. */
export const PRESENTER_DEFAULT_FACE_URL = 'https://myavatar.ge/presenter/default-female.jpg';

/** True for the presenter's own default face — the canonical URL or the deployment's PRESENTER_FACE_URL override. */
export function isPresenterDefaultFace(url: unknown): boolean {
  if (typeof url !== 'string' || !url) return false;
  const override = process.env.PRESENTER_FACE_URL?.trim();
  return url === PRESENTER_DEFAULT_FACE_URL || (!!override && url === override);
}

/** A short, stable fingerprint of a hosted audio URL — what a presenter-hold binds to (the URL itself is long). */
export function audioFingerprint(url: string): string {
  return createHash('sha256').update(`presenter-audio:${url}`).digest('base64url').slice(0, 32);
}

/**
 * May this presenter-hold be released toward THIS render?
 *
 * ⚠️ FREE CLONED-VOICE TTS. Phase A hands the hosted TTS `audioUrl` to the client together with the hold; the next
 * render releases the hold as it reserves its own price, and that reservation is refunded on any submit or poll
 * failure. If the render could be made to fail at will — a junk `audioUrl` HeyGen rejects, a face SadTalker cannot
 * read, a `kind:'film'` engine fed a still — the net charge was 0 and the caller kept up to 1,500 characters of
 * cloned-voice audio. So a hold is released only toward the render it paid the voice FOR: the same user, exactly the
 * audio it produced, on the presenter's own default face. Anything else still renders (paying its own reservation)
 * but leaves the hold in place. What remains refundable is a GENUINE provider failure on those inputs.
 */
export function holdReleasableFor(
  hold: AvatarCharge | null,
  userId: string | null,
  render: { audioUrl: unknown; faceUrl: unknown },
): hold is AvatarCharge {
  if (!hold || hold.k !== 'presenter-hold' || !userId || hold.u !== userId) return false;
  if (typeof hold.a !== 'string' || !hold.a) return false;
  if (typeof render.audioUrl !== 'string' || !render.audioUrl) return false;
  const a = Buffer.from(audioFingerprint(render.audioUrl));
  const b = Buffer.from(hold.a);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return isPresenterDefaultFace(render.faceUrl);
}
