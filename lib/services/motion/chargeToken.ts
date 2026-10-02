/**
 * lib/services/motion/chargeToken.ts — "this Motion Control job is already paid for under ref R", signed.
 *
 * /api/motion-control used to submit the Kling render FIRST and charge AFTER, best-effort: a parallel burst passed one
 * stale balance read and only the first charge fit (the rest rendered free), and a ledger miss rendered free too. It
 * now RESERVES before the submit under a fresh server ref — which cannot contain the Kling prediction id, because the
 * prediction does not exist yet. So the status route can no longer derive the ref from the id it polls, and the
 * refund needs to learn it from somewhere it can trust.
 *
 * That place is this token, riding INSIDE the jobId the client already round-trips verbatim (`<predictionId>~mc1.…`)
 * — the same construction as lib/billing/avatarCharge, so no client change and no DB read is needed to authorise the
 * refund. It binds (user, ref, prediction): it cannot be re-pointed at someone else's job, nor at another prediction
 * of one's own. The AMOUNT is never in it — refundDebitByRef pays back what the LEDGER shows under the ref, once.
 *
 * Domain-separated HMAC (`motion-charge:v1:`) with the service-role key as the fallback secret, like the avatar and
 * 3D tokens; fail-closed when no key is configured (the route then refuses to reserve, rather than reserve a charge
 * nothing could ever refund).
 */
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface MotionCharge {
  /** The user whose ledger holds the reservation. */
  u: string;
  /** The deduct_credits ref the reservation was taken under. */
  r: string;
  /** The Kling prediction this charge covers (bare). */
  j: string;
}

const PREFIX = 'mc1';
const SEP = '~';

function signingKey(): string {
  return process.env.MOTION_CHARGE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function mac(payload: string): string {
  return createHmac('sha256', signingKey()).update(`motion-charge:v1:${payload}`).digest('base64url');
}

/** True when tokens can be minted — checked BEFORE reserving, so a reservation never strands without one. */
export function motionChargeSigningReady(): boolean {
  return signingKey().length > 0;
}

/** A fresh server-side reservation ref. Never client-derived (a client-keyed ref is a free-replay exploit). */
export function motionChargeRef(userId: string, uuid: string): string {
  return `motion:reserve:${uuid}:${userId}`;
}

/** Mint the token. null when no signing key is configured or a field is missing. */
export function signMotionCharge(c: MotionCharge): string | null {
  if (!signingKey() || !c.u || !c.r || !c.j) return null;
  const payload = Buffer.from(JSON.stringify({ v: 1, u: c.u, r: c.r, j: c.j })).toString('base64url');
  return `${PREFIX}.${payload}.${mac(payload)}`;
}

/** `<predictionId>~<token>` — what POST returns as `jobId`. */
export function withMotionCharge(jobId: string, token: string): string {
  return `${jobId}${SEP}${token}`;
}

/**
 * Split a polled id into the bare prediction id and the charge it carries — non-null only for an authentic token
 * bound to exactly this prediction. A forged, tampered or re-pointed token yields `charge: null`, which can only
 * ever cost its holder a refund, never earn one.
 */
export function motionChargeForPolledId(id: string): { jobId: string; charge: MotionCharge | null } {
  const at = id.lastIndexOf(`${SEP}${PREFIX}.`);
  if (at <= 0) return { jobId: id, charge: null };
  const jobId = id.slice(0, at);
  const token = id.slice(at + 1);
  if (!signingKey() || token.length > 4096) return { jobId, charge: null };
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return { jobId, charge: null };
  const payload = parts[1] ?? '';
  const a = Buffer.from(parts[2] ?? '');
  const b = Buffer.from(mac(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { jobId, charge: null };
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<MotionCharge> & { v?: unknown };
    if (p.v !== 1 || typeof p.u !== 'string' || !p.u || typeof p.r !== 'string' || !p.r || p.j !== jobId) {
      return { jobId, charge: null };
    }
    return { jobId, charge: { u: p.u, r: p.r, j: p.j } };
  } catch {
    return { jobId, charge: null };
  }
}
