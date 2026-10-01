/**
 * lib/services/model3d/chargeToken.ts — what authorises a 3D refund from the STATUS route.
 *
 * /api/v2/model3d/create reserves the credits under `model3d:charge:<jobId>` before any paid leg runs, and
 * the browser then drives /api/v2/model3d/status with a `jobId` and a `predictionId` — two query parameters
 * the caller can set to anything. Refunding on "Replicate says this prediction failed" with nothing tying
 * the prediction to the charge would be the motion-control / film-token exploit again: keep the model from
 * a prediction that SUCCEEDED, then poll with the same paid jobId and any FAILED prediction id (one of your
 * own, or one harvested elsewhere — the poll reads any prediction on the shared Replicate token) and
 * collect the charge back.
 *
 * So create signs the triple it actually issued — (user, job, prediction) — and status refunds only when
 * the triple it was handed carries that signature. The job row cannot play this role: generation_jobs is
 * owner-writable under RLS, so anything stored there is a claim, not a fact. The AMOUNT never comes from
 * here either — refundDebitByRef pays back only what the ledger shows was debited under the ref.
 *
 * Stateless, no expiry: the refund is idempotent on `${ref}:refund`, so a replayed token can never pay twice,
 * and the verdict it unlocks (a provider-reported failure) cannot later turn into a delivered model.
 */
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/** The reservation ref for one 3D job. Server-generated jobId → a client cannot steer what gets charged. */
export function model3dChargeRef(jobId: string): string {
  return `model3d:charge:${jobId}`;
}

function signingKey(): string {
  return process.env.MODEL3D_CHARGE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

// Domain-separated: the same fallback key signs other tokens (avatar handoff), and none of them can ever
// be replayed as this one because the signed message starts with a different label.
function mac(userId: string, jobId: string, predictionId: string): string {
  return createHmac('sha256', signingKey())
    .update(`model3d-charge:v1|${userId}|${jobId}|${predictionId}`)
    .digest('base64url');
}

/** Sign the issued triple. Null when no signing key is configured — status then refunds nothing (fail-closed). */
export function signModel3dCharge(input: { userId: string; jobId: string; predictionId: string }): string | null {
  if (!signingKey() || !input.userId || !input.jobId || !input.predictionId) return null;
  return mac(input.userId, input.jobId, input.predictionId);
}

/** True only when `token` is the signature create issued for exactly this user, job and prediction. */
export function verifyModel3dCharge(
  token: string | null | undefined,
  input: { userId: string; jobId: string; predictionId: string },
): boolean {
  if (!signingKey() || typeof token !== 'string' || !token || token.length > 128) return false;
  if (!input.userId || !input.jobId || !input.predictionId) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(mac(input.userId, input.jobId, input.predictionId));
  // timingSafeEqual throws on a length mismatch, so the (non-secret) length is checked first.
  return a.length === b.length && timingSafeEqual(a, b);
}
