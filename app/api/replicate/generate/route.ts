import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';
import { NextRequest, NextResponse } from 'next/server';
import { guardGeneration, type GenKind } from '@/lib/api/generationGuard';
import { providerErrorBody } from '@/lib/api/providerError';
import { validateInput, buildModelInput } from '@/lib/replicate/schemas';
import { resolveModel, isValidService, type ServiceType } from '@/lib/replicate/models';
import { createPrediction, pollPrediction } from '@/lib/replicate/client';
import { normalizeOutput } from '@/lib/replicate/normalizer';
import { deductCredits, refundDebitByRef } from '@/lib/orchestrator/ledger';
import { creditCostFor } from '@/lib/credits/pricing';
import { insufficientCreditsMessage } from '@/lib/api/generationGuard';
import { ledgerUnavailableBody } from '@/lib/api/billingCopy';
import { createJobChargeToken } from '@/lib/orchestrator/jobChargeToken';
import { randomUUID } from 'node:crypto';

/**
 * ⚠️ THIS ROUTE NEVER CHARGED. It balance-GATED (a fail-open read) and then rendered — image, photo, video, music or
 * avatar on Replicate — without ever touching the ledger, so any signed-in user with a few credits could render
 * unlimited paid media (through /services and its photo / video proxies) while the balance never moved. It now
 * RESERVES the service's price before the prediction is created, hands back the job id with a signed charge token
 * inside (lib/orchestrator/jobChargeToken — the clients poll that id verbatim), and refunds through the ledger when
 * the create fails or a poll reports the prediction failed.
 */
const charge = createJobChargeToken({ prefix: 'rg1', domain: 'replicate-generate-charge:v1', secretEnv: 'REPLICATE_CHARGE_SECRET' });

/** The credit price per service — the same table every other surface uses (lib/credits/pricing). */
function priceFor(service: string): number {
  if (service === 'video') return creditCostFor('video');
  if (service === 'music') return creditCostFor('music');
  if (service === 'avatar') return creditCostFor('avatar');
  return creditCostFor('image'); // image · photo · visual-ai
}

export const dynamic = 'force-dynamic';

// ── Legacy type mapping for backwards compat with existing proxy routes ──
const LEGACY_TYPE_MAP: Record<string, ServiceType> = {
  image: 'image',
  video: 'video',
  music: 'music',
};

// FINANCIAL SHIELD — map each generation service to the guard's cost tier. This route is the
// chokepoint for its own direct callers AND the photo/video proxies (which forward the caller's
// cookie), so every paid create passes through guardGeneration here (avatar has its own guard).
const SERVICE_GEN_KIND: Record<string, GenKind> = {
  image: 'image', photo: 'image', 'visual-ai': 'image',
  video: 'video', music: 'music', avatar: 'avatar',
};

export async function POST(req: NextRequest) {
  // MEDIA_GOOGLE_ONLY (lib/providers/mediaPolicy): this entry reaches an outside engine, so the switch refuses it here,
  // before any charge. Off (the default) → no-op.
  const outside = refuseOutsideEngine(req);
  if (outside) return outside;
  // Set once a create-path reservation lands; the catch refunds it if the create then throws.
  let reservation: { userId: string; ref: string } | null = null;
  try {
    const body = await req.json() as Record<string, unknown>;

    // ── Poll existing prediction ───────────────────────────────────
    if (body.predictionId) {
      // Auth-only (gate:false) — a status poll starts no compute, so it is never balance-gated,
      // but it still must require a signed-in user (no anonymous prediction inspection).
      const pollGuard = await guardGeneration(req, 'image', { gate: false });
      if (!pollGuard.ok) return pollGuard.response;
      // A job started by the current POST carries its charge token inside the id: poll the bare prediction, and on
      // a TERMINAL failure give the payer's reservation back — only to the payer the token names, only what the
      // ledger shows under its ref, once (`${ref}:refund`), however often the dead job is polled.
      const { jobId: predictionId, charge: paid } = charge.forPolledId(String(body.predictionId));
      const prediction = await pollPrediction(predictionId);
      let refunded = false;
      if (paid && paid.u === pollGuard.userId && (prediction.status === 'failed' || prediction.status === 'canceled')) {
        const r = await refundDebitByRef(paid.u, paid.r).catch(() => null);
        refunded = !!r?.ok;
      }
      return NextResponse.json({
        id: prediction.id,
        status: prediction.status,
        output: prediction.output,
        error: prediction.error,
        ...(refunded ? { refunded: true } : {}),
      });
    }

    // ── Resolve service (support both new `service` and legacy `type`) ──
    let service = body.service ? String(body.service) : undefined;
    if (!service && body.type) {
      service = LEGACY_TYPE_MAP[String(body.type)] || String(body.type);
    }
    if (!service || !isValidService(service)) {
      return NextResponse.json(
        { error: `Invalid or missing service. Valid: avatar, image, photo, video, music, visual-ai` },
        { status: 400 },
      );
    }

    // ── Validate input ─────────────────────────────────────────────
    const validation = validateInput({ ...body, service });
    if (!validation.valid || !validation.sanitized) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const input = validation.sanitized;

    // ── FINANCIAL SHIELD — auth + balance gate BEFORE any paid provider call ──
    const guard = await guardGeneration(req, SERVICE_GEN_KIND[input.service] ?? 'image');
    if (!guard.ok) return guard.response;

    const model = resolveModel(input.service, input.variant);
    const modelInput = buildModelInput(input);

    // ── RESERVE before the paid create (see the header). Insufficient → 402, a ledger failure → 503 (nothing charged,
    //    nothing rendered), `skipped` (no ledger RPC at all) → uncharged as everywhere else. The signing key is checked
    //    first, so a charge is never taken that a failed poll could not refund.
    if (!charge.ready()) return NextResponse.json(ledgerUnavailableBody(guard.locale), { status: 503 });
    const cost = priceFor(input.service);
    const chargeRef = `replicate:gen:${input.service}:${randomUUID()}:${guard.userId}`;
    const debit = await deductCredits(guard.userId, cost, chargeRef);
    if (!debit.ok && debit.reason === 'insufficient') {
      return NextResponse.json({ error: 'insufficient_credits', message: insufficientCreditsMessage(guard.locale), requiredCredits: cost }, { status: 402 });
    }
    if (!debit.ok && debit.reason === 'error') return NextResponse.json(ledgerUnavailableBody(guard.locale), { status: 503 });
    reservation = debit.ok ? { userId: guard.userId, ref: chargeRef } : null;

    // ── Create prediction ──────────────────────────────────────────
    const prediction = await createPrediction(model.id, modelInput);

    // Some models return instantly (e.g. blip captioning)
    if (prediction.status === 'succeeded' && prediction.output) {
      const normalized = normalizeOutput(
        input.service, model.label, model.outputType,
        prediction.id, prediction.status, prediction.output,
      );
      return NextResponse.json({
        id: prediction.id,
        status: prediction.status,
        output: prediction.output,
        normalized,
      });
    }

    // The id the client polls carries the charge token, so a failed prediction can be refunded on the poll.
    const t = reservation ? charge.sign({ u: reservation.userId, r: reservation.ref, j: prediction.id }) : null;
    return NextResponse.json({
      id: t ? charge.withToken(prediction.id, t) : prediction.id,
      status: prediction.status,
      service: input.service,
      model: model.label,
      outputType: model.outputType,
      message: `${input.service} generation started. Poll with predictionId to check status.`,
    });
  } catch (err) {
    // A throw after the reservation (the create failed) delivered nothing — give it back.
    const refunded = reservation ? !!(await refundDebitByRef(reservation.userId, reservation.ref).catch(() => null))?.ok : false;
    reservation = null;
    // Never echo a provider body — see lib/api/providerError.
    const safe = providerErrorBody(err);
    const message = safe.message;

    if (message.includes('429') || message.includes('rate limit')) {
      return NextResponse.json({
        status: 'throttled',
        error: message,
        message: 'Replicate rate limit reached. Retry shortly or increase account credit.',
        refunded,
      }, { status: 200 });
    }

    if (message.includes('422') || message.includes('404')) {
      return NextResponse.json({
        status: 'model_unavailable',
        error: message,
        message: 'Selected model/version is unavailable. Update model version or permissions.',
        refunded,
      }, { status: 200 });
    }

    return NextResponse.json({ error: message, refunded }, { status: 500 });
  }
}
