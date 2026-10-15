/**
 * lib/orchestrator/confirmedJob.ts — the money half of a quoted, confirmed paid run (final P0/P1 repair run).
 *
 * Shared by /api/v2/dubbing/start and /api/v2/presentation/build. Order is the invariant:
 *   1. the confirmation is checked (lib/billing/paidServiceGate) — no token, no charge;
 *   2. the job row is INSERTED under the quote's job id. A second confirmation of the same quote (double tap, retry
 *      after a lost response, two tabs) hits the primary key and is refused with the existing job — so the provider
 *      runs at most once per quote. A failed insert for any other reason refuses too: no charge without a durable row,
 *      so a reservation can never be orphaned from the job that explains it;
 *   3. credits are reserved under `<service>:<job id>` with replay refusal (a second debit is impossible even if (2)
 *      were bypassed), and the reservation is stamped on the row (`_reserve`) and the row moved to `processing` — a
 *      request killed at maxDuration then leaves a row the drainer can reap and refund idempotently (`…:refund`);
 *   4. on failure the refund runs once; if it does not land the row is left live for the drainer instead of being
 *      failed (a failed row is never reaped, so failing it would strand the credits).
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { createJob, completeJob, failJob, jobSnapshot, recordJobReservation, updateJobStage } from './jobs';
import type { ProduceKind } from './rate-limit';
import { reserveProduce, refundProduce, reservationErrorCode, type Reservation } from './produceBilling';
import { checkServiceConfirmation, type GatedService } from '@/lib/billing/paidServiceGate';
import { reportError } from '@/lib/observability/report-error';

export interface ConfirmedJob {
  jobId: string;
  chargeRef: string;
  reservation: Reservation;
  /** Refund once. Resolves whether nothing is owed any more; on false the job is left live for the drainer. */
  refundAndFail: (error: string) => Promise<{ refunded: boolean }>;
}

export async function startConfirmedJob(input: {
  service: GatedService;
  userId: string;
  raw: unknown;
  credits: number;
  serviceType: ProduceKind;
  params: Record<string, unknown>;
  now?: number;
}): Promise<{ ok: true; job: ConfirmedJob } | { ok: false; response: NextResponse }> {
  const check = checkServiceConfirmation({ service: input.service, userId: input.userId, raw: input.raw, credits: input.credits, now: input.now ?? Date.now() });
  if (!check.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: check.reason === 'price_changed' ? 'quote_price_changed' : 'quote_invalid', reason: check.reason, requoteRequired: true },
        { status: 409 },
      ),
    };
  }
  const jobId = check.claims.j;

  const created = await createJob({ id: jobId, userId: input.userId, serviceType: input.serviceType, params: input.params }).catch(() => false);
  if (!created) {
    const existing = await jobSnapshot(jobId).catch(() => null);
    if (existing && existing.userId === input.userId) {
      // Already confirmed once: report that run, never start (or charge) a second one.
      return { ok: false, response: NextResponse.json({ error: 'duplicate_request', jobId, status: existing.status }, { status: 409 }) };
    }
    return { ok: false, response: NextResponse.json({ error: 'job_unavailable', message: 'Could not record the job — nothing was charged.' }, { status: 503 }) };
  }

  const chargeRef = `${input.service}:${jobId}`;
  const reservation: Reservation = await reserveProduce(input.userId, input.credits, chargeRef, { refuseReplay: true })
    .catch(() => ({ proceed: false, charged: false, reason: 'error' as const }));
  if (!reservation.proceed) {
    await failJob(jobId, reservationErrorCode(reservation)).catch(() => false);
    return {
      ok: false,
      response: reservation.reason === 'insufficient'
        ? NextResponse.json({ error: 'insufficient_credits', message: 'Not enough credits — please top up.', needed: input.credits, jobId }, { status: 402 })
        : NextResponse.json({ error: reservationErrorCode(reservation), jobId }, { status: reservation.reason === 'replay' ? 409 : 503 }),
    };
  }
  if (reservation.charged) {
    await recordJobReservation(jobId, { ref: chargeRef, credits: input.credits });
    await updateJobStage(jobId, 'reserved', 2).catch(() => false);
  }

  const refundAndFail = async (error: string) => {
    const refunded = await refundProduce(input.userId, input.credits, chargeRef, reservation.charged);
    // A row whose refund did not land stays `processing` with its `_reserve` stamp: the drainer refunds it later
    // through the same idempotent ref. Failing it now would hide it from the drainer forever.
    if (refunded) await failJob(jobId, error).catch(() => false);
    else await updateJobStage(jobId, 'refund_pending', null).catch(() => false);
    return { refunded };
  };
  return { ok: true, job: { jobId, chargeRef, reservation, refundAndFail } };
}

/**
 * Persist a finished job. Retries once. False means the result was produced but is NOT durably recorded: the caller
 * must say so (never "completed") so the user downloads it now; the credits stay charged because the output exists.
 */
export async function persistCompletion(jobId: string, out: { signedUrl: string | null; result: Record<string, unknown> }): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ok = await completeJob(jobId, out).catch(() => false);
    if (ok) return true;
  }
  reportError(new Error('job finished but completion was not persisted'), { fn: 'persistCompletion', jobId });
  return false;
}
