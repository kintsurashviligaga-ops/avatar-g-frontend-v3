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
 * — see lib/orchestrator/jobChargeToken for the construction. Domain `motion-charge:v1`, secret MOTION_CHARGE_SECRET
 * (service-role key fallback); fail-closed with no key (the route then refuses to reserve).
 */
import 'server-only';
import { createJobChargeToken, type JobCharge } from '@/lib/orchestrator/jobChargeToken';

export type MotionCharge = JobCharge;

const token = createJobChargeToken({ prefix: 'mc1', domain: 'motion-charge:v1', secretEnv: 'MOTION_CHARGE_SECRET' });

/** True when tokens can be minted — checked BEFORE reserving, so a reservation never strands without one. */
export function motionChargeSigningReady(): boolean {
  return token.ready();
}

/** A fresh server-side reservation ref. Never client-derived (a client-keyed ref is a free-replay exploit). */
export function motionChargeRef(userId: string, uuid: string): string {
  return `motion:reserve:${uuid}:${userId}`;
}

/** Mint the token. null when no signing key is configured or a field is missing. */
export function signMotionCharge(c: MotionCharge): string | null {
  return token.sign(c);
}

/** `<predictionId>~<token>` — what POST returns as `jobId`. */
export function withMotionCharge(jobId: string, t: string): string {
  return token.withToken(jobId, t);
}

/** The bare prediction id, and its charge only for an authentic token bound to exactly that prediction. */
export function motionChargeForPolledId(id: string): { jobId: string; charge: MotionCharge | null } {
  return token.forPolledId(id);
}
