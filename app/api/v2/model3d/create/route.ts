import { NextRequest, NextResponse } from 'next/server';
import { providerErrorBody } from '@/lib/api/providerError';
import { randomUUID } from 'node:crypto';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { validateModel3dRequest, model3dUnits, QUALITY_MODEL } from '@/lib/services/model3d/model3dPlan';
import { submitReconstruction, hasReplicate3dProvider } from '@/lib/services/model3d/replicate3dClient';
import { generateImagenImages, mapImagenAspect, hasGeminiImagenProvider } from '@/lib/ai/geminiImagen';
import { promptToEnglish } from '@/lib/ai/promptToEnglish';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { guardedCall, BudgetExceededError } from '@/lib/services/billing/guardedCall';
import { isPublicHttpUrl } from '@/lib/security/allowlistedAudioFetch';
import { resolveUploadRef } from '@/lib/services/resolveUpload';
import { createJob, failJob } from '@/lib/orchestrator/jobs';
import { reserveProduce } from '@/lib/orchestrator/produceBilling';
import { refundDebitByRef } from '@/lib/orchestrator/ledger';
import { creditCostFor } from '@/lib/credits/pricing';
import { model3dChargeRef, signModel3dCharge } from '@/lib/services/model3d/chargeToken';
import { reportError } from '@/lib/observability/report-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Text mode does an Imagen call before submitting; the reconstruction itself is polled from the browser.
//
// ⚠️ SIZED TO THE SERIAL WORST CASE, BECAUSE THE CHARGE IS TAKEN FIRST. The reservation lands before every
// paid leg, and a lambda the platform kills between that debit and a refund or response strands it: there is
// no `_reserve` stamp for the drainer, and no charge signature ever reached the client. Worst case after the
// debit: 2 × 12 s translation + 20 s Imagen + 2 × 90 s reference upload + 30 s version lookup + 30 s submit
// = 284 s. This was 120 here and 60 in vercel.json. Keep both at or above that sum.
export const maxDuration = 300;

const WEEK_SEC = 604_800;

/**
 * POST /api/v2/model3d/create — submit a 3D reconstruction, return the poll handle.
 *
 * BACKEND: Replicate (TRELLIS). Meshy was the original spec but has no API key on any environment.
 *
 * TEXT MODE IS TWO HOPS: the strong open 3D models are IMAGE-to-3D, so a text prompt first becomes a
 * reference image via Imagen 4, which is then reconstructed. The reference URL is returned so the UI can
 * show what the mesh is actually being built from.
 *
 * SUBMIT-THEN-POLL: reconstruction takes minutes, past any lambda budget, so the browser drives
 * /api/v2/model3d/status — the same lifecycle the film studio uses for Veo.
 *
 * BILLED: creditCostFor('model3d') is reserved BEFORE the first paid leg and refunded on every exit that
 * delivers nothing. The response carries `charge`, the signature status needs before it will refund a
 * prediction the provider failed (lib/services/model3d/chargeToken.ts).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE);
  if (limited) return limited;

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const raw = await req.json().catch(() => null);

  // Same as dubbing: the image-to-3D reference is uploaded browser-direct to storage, so it arrives as
  // a PATH. Signing it here is what lets the panel offer a real file picker instead of demanding a URL.
  // Signed for a WEEK, like the text path's reference: this URL comes back as `referenceUrl`, which the chat
  // keeps as the 3D message's thumbnail. At resolveUploadRef's default hour, every photo-mode thumbnail
  // went blank in saved history about an hour after it was made.
  const body = raw && typeof raw === 'object'
    ? { ...(raw as Record<string, unknown>), imageUrl: await resolveUploadRef((raw as Record<string, unknown>).imageUrl, WEEK_SEC) }
    : raw;

  const parsed = validateModel3dRequest(body);
  if (!parsed.ok || !parsed.request) {
    return NextResponse.json({ error: 'invalid_request', message: parsed.error }, { status: 400 });
  }
  const request = parsed.request;

  // Honest failure BEFORE anything is charged or a job row is written.
  if (!hasReplicate3dProvider()) {
    return NextResponse.json(
      { error: 'provider_not_configured', message: '3D generation is unavailable — REPLICATE_API_TOKEN is not configured on this deployment.' },
      { status: 503 },
    );
  }
  if (request.mode === 'text' && !hasGeminiImagenProvider()) {
    return NextResponse.json(
      { error: 'provider_not_configured', message: 'Text-to-3D needs the image provider, which is not configured. Upload a photo instead.' },
      { status: 503 },
    );
  }

  // SSRF: Replicate fetches this URL, but we refuse a private-range host here rather than have a third
  // party probe our network on a caller's behalf.
  if (request.mode === 'image' && request.imageUrl && !isPublicHttpUrl(request.imageUrl)) {
    return NextResponse.json({ error: 'invalid_request', message: 'imageUrl must be a public http(s) URL' }, { status: 400 });
  }

  const jobId = randomUUID();

  // ⚠️ 3D WAS FREE. This route signed the user in and then spent a Replicate mesh (~$0.10) — plus an Imagen
  // reference on the text path — without touching their balance, so every 3D model was platform spend
  // nobody paid for. Reserved HERE, before the text path's Imagen call, not just before guardedCall: the
  // reference image is paid too, and a user who cannot afford the model must not get it generated either.
  // The ref is keyed on the SERVER-generated jobId, so a client cannot replay a ref to render for free.
  // Same primitive as the produce routes: insufficient → 402, a ledger error → refuse (never render
  // unbilled on a DB blip), RPC absent → proceed uncharged (the pre-billing behaviour).
  const cost = creditCostFor('model3d');
  const chargeRef = model3dChargeRef(jobId);
  const reservation = await reserveProduce(user.id, cost, chargeRef).catch(() => ({ proceed: false, charged: false, reason: 'error' as const }));
  if (!reservation.proceed) {
    return reservation.reason === 'insufficient'
      ? NextResponse.json({ error: 'insufficient_credits', message: 'Not enough credits — please top up.', needed: cost }, { status: 402 })
      : NextResponse.json({ error: 'billing_unavailable', message: 'billing_unavailable' }, { status: 503 });
  }
  let refunded = false;
  /** Give the reservation back — at most once per request, and only what the LEDGER shows was taken. */
  const refundCharge = async (why: string): Promise<void> => {
    if (!reservation.charged || refunded) return;
    refunded = true;
    const r = await refundDebitByRef(user.id, chargeRef, cost).catch(() => null);
    if (!r?.ok) reportError(new Error('model3d refund did not land'), { route: 'model3d.create', ref: chargeRef, why, reason: r?.reason ?? 'threw' });
  };

  // service_type DB CHECK ('film','avatar','interior','image','music','voice') — 3D rides as 'image'.
  // ⚠️ NO `_reserve` STAMP, ON PURPOSE. The drainer refunds stale rows that carry one, and a 3D job that
  // merely went unpolled may still have SUCCEEDED — reaping it would refund a model the user can still
  // fetch. 3D refunds only on outcomes that can never deliver: a failed create, or a provider-failed poll.
  await createJob({
    id: jobId,
    userId: user.id,
    serviceType: 'image',
    params: { subtype: 'model3d', mode: request.mode, quality: request.quality },
  }).catch(() => false);

  try {
    let referenceUrl = request.imageUrl ?? '';

    if (request.mode === 'text') {
      // ⚠️ TEXT-TO-3D IS TEXT-TO-IMAGE-TO-3D, AND IMAGEN READS ENGLISH. A Georgian object description
      // ("ძველი თიხის დოქი ყვავილებით") arrived as noise, Imagen fell back to its priors, and TRELLIS then
      // faithfully reconstructed a mesh of something the user never asked for. This is the worst shape of the
      // bug: the deliverable is always a competent 3D model, so nothing about the result says it is wrong.
      // Both fields are DESCRIPTIONS — the prompt of the object, the negative prompt of what to keep out —
      // and a mesh reproduces no text, so there is nothing here that must survive verbatim.
      const promptEn = await promptToEnglish(request.prompt, 'image');
      const negativeEn = request.negativePrompt ? await promptToEnglish(request.negativePrompt, 'image') : '';
      const images = await generateImagenImages({
        // A clean, centred, single-subject reference reconstructs far better than a scene.
        prompt: `${promptEn}. A single centred object, plain neutral background, even studio lighting, full object visible, product photo.`,
        aspectRatio: mapImagenAspect('1:1'),
        numberOfImages: 1,
        ...(negativeEn ? { negativePrompt: negativeEn } : {}),
      }).catch(() => null);
      const first = images?.[0];
      if (!first) {
        await refundCharge('reference_failed');
        void failJob(jobId, 'the reference image could not be generated').catch(() => {});
        return NextResponse.json({ error: 'reference_failed', message: 'the reference image could not be generated', jobId }, { status: 502 });
      }
      // Must be publicly fetchable — Replicate pulls it from its own network.
      const hosted = await uploadBufferAndSign(
        'renders',
        `models3d/ref-${jobId}.png`,
        first.buffer,
        first.mimeType || 'image/png',
        WEEK_SEC,
      );
      if (!hosted) {
        await refundCharge('reference_store_failed');
        void failJob(jobId, 'the reference image could not be stored').catch(() => {});
        return NextResponse.json({ error: 'reference_failed', message: 'the reference image could not be stored', jobId }, { status: 502 });
      }
      referenceUrl = hosted;
    }

    const submitted = await guardedCall(
      {
        service: 'model3d',
        model: QUALITY_MODEL[request.quality],
        units: model3dUnits(),
        // ⚠️ BOOK NOTHING FOR A SUBMIT THAT NEVER REACHED THE PROVIDER.
        //
        // guardedCall books its estimate on whatever fn() RETURNS, and its own comment says booking
        // happens "after a SUCCESSFUL call" — but submitReconstruction never throws BY DESIGN: a bad
        // token, a 4xx, a non-JSON body and a timeout all come back as { ok:false }. So every failed
        // submission still charged the full $0.10 model3d estimate against the platform envelope. An
        // unfunded or misconfigured Replicate token would drain the budget on requests that produced
        // nothing, tripping the ladder into economy / free_tier_restricted early and degrading services
        // for everyone. A failed submit costs zero, and is now booked as zero.
        actualCost: (r) => ((r as { ok?: boolean } | null)?.ok === false ? 0 : undefined),
      },
      () => submitReconstruction(referenceUrl, request),
    );

    if (!submitted.ok) {
      // ⚠️ `submitted.error` IS THE PROVIDER'S BODY — `replicate_http_402: {"title":"Insufficient credit",
      // …"Go to https://replicate.com/account/billing"}` — and it was being handed to the client as
      // `message`, which the UI prints as a sentence. Same leak the image lane had. The raw string stays
      // in the log line below for diagnosis; the user gets a Georgian sentence.
      console.error('[model3d.create] submit failed:', submitted.error);
      // Nothing reached the provider (or it refused the job), so nothing was delivered: give it back.
      await refundCharge('submit_failed');
      void failJob(jobId, 'the reconstruction could not be submitted').catch(() => {});
      const safe = providerErrorBody(submitted.error);
      return NextResponse.json(
        { error: 'submit_failed', message: safe.message, retryable: submitted.retryable, jobId },
        { status: submitted.retryable ? 503 : safe.status },
      );
    }

    // The job row stays 'processing'; the status route completes it.
    return NextResponse.json({
      jobId,
      predictionId: submitted.predictionId,
      pollUrl: submitted.pollUrl,
      referenceUrl,
      // Opaque to the client; status refunds a provider-failed prediction only when this matches.
      charge: signModel3dCharge({ userId: user.id, jobId, predictionId: submitted.predictionId }),
    });
  } catch (err) {
    // A throw (budget envelope, translation, storage) means no job was submitted — nothing to deliver.
    await refundCharge(err instanceof BudgetExceededError ? 'budget_exceeded' : 'threw');
    void failJob(jobId, 'the reconstruction could not be submitted').catch(() => {});
    if (err instanceof BudgetExceededError) {
      return NextResponse.json(
        { error: 'budget_exceeded', reason: err.reason, message: 'The platform budget for this period is exhausted. Please try again later.' },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: 'submit_failed', jobId }, { status: 500 });
  }
}
