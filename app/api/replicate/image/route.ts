import { NextRequest, NextResponse } from 'next/server';
import { generateNanoBananaImage } from '@/lib/nanobanana/client';
import { providerErrorBody } from '@/lib/api/providerError';
import { reportError } from '@/lib/observability/report-error';
import { validateInput, buildModelInput } from '@/lib/replicate/schemas';
import { resolveModel } from '@/lib/replicate/models';
import { createPrediction, pollPrediction } from '@/lib/replicate/client';
import { normalizeOutput } from '@/lib/replicate/normalizer';
import { applyApiGuards } from '@/lib/api/guard';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { guardGeneration } from '@/lib/api/generationGuard';
import { deductCredits } from '@/lib/orchestrator/ledger';
import { creditCostFor } from '@/lib/credits/pricing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// 120s — NanoBanana polling can take ~30s (20 polls × 1.5s), Replicate fallback
// another ~10s. 60s was tripping FUNCTION_INVOCATION_TIMEOUT in production.
export const maxDuration = 120;

// ── Quality → NanoBanana endpoint mapping ──────────────────────────────────────
const QUALITY_TO_NB_ENDPOINT: Record<string, string> = {
  standard: 'v2-1k',
  high:     'v2-2k',
  ultra:    'pro-4k',
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Poll calls re-hit the same route — skip budget on poll to avoid double-counting.
    const gate = await applyApiGuards(req, {
      limit: body?.predictionId ? RATE_LIMITS.READ : RATE_LIMITS.EXPENSIVE,
      skipBudget: !!body?.predictionId,
      label: 'replicate.image',
    });
    if (gate.response) return gate.response;

    // FINANCIAL SHIELD — require a signed-in user. Balance-gate ONLY the initial generation; a poll
    // (predictionId) starts no new compute, so it is auth-only and must never be blocked/re-gated.
    const guard = await guardGeneration(req, 'image', { gate: !body?.predictionId });
    if (!guard.ok) return guard.response;

    // ── Poll existing Replicate prediction (fallback path only) ────────
    if (body.predictionId) {
      const result = await pollPrediction(String(body.predictionId));
      const model = resolveModel('image', body.variant);
      const normalized = normalizeOutput(
        'image', model.label, model.outputType,
        result.id, result.status, result.output, result.error ?? null, result.metrics,
      );
      // FINANCIAL SHIELD — charge exactly ONCE when the async image completes, keyed on the predictionId so
      // repeated polls of a finished render are ref-idempotent no-ops. Never bills a failed/pending poll.
      //
      // ⚠️ `succeeded` IS THE PROVIDER'S VERDICT, NOT PROOF OF AN IMAGE. Charging on the status alone
      // billed the user whenever Replicate marked a prediction succeeded but the normalizer could not
      // read a URL out of the output — an empty array, a null entry, a changed output schema. The client
      // receives `normalized.url`, so that is what the charge is for. This route has no refund path at
      // all, which makes not charging the only correction available here.
      if (result.status === 'succeeded' && normalized.url) {
        await deductCredits(guard.userId, creditCostFor('image'), `image:${result.id}`).catch((e) => reportError(e, { where: 'replicate.image.deduct' }));
      } else if (result.status === 'succeeded') {
        // eslint-disable-next-line no-console
        console.warn(`[replicate.image] prediction ${result.id} succeeded with no readable url — NOT charging`);
      }
      return NextResponse.json(normalized);
    }

    // ── Validate input ─────────────────────────────────────────────────
    const validation = validateInput({
      service: 'image',
      prompt: body.prompt,
      quality: body.quality || 'standard',
      variant: body.variant,
      aspectRatio: body.ratio || body.aspectRatio || '1:1',
      negativePrompt: body.negativePrompt,
      style: body.style,
    });

    if (!validation.valid || !validation.sanitized) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    const input = validation.sanitized;
    // ⚠️ SAME BUG AS THE MUSIC ROUTE, SAME FIX. Both legs below read English only: NanoBanana first,
    // then Replicate/FLUX via buildModelInput. The brief was passed through verbatim, so a Georgian
    // prompt reached the model as noise and it rendered its priors instead of the request. Only the
    // DESCRIPTION (and the negative, which is also a description) is translated — this route carries
    // no text the image must reproduce. Fail-open: any miss returns the ORIGINAL string.
    const { promptToEnglish } = await import('@/lib/ai/promptToEnglish');
    input.prompt = await promptToEnglish(input.prompt, 'image');
    if (input.negativePrompt) input.negativePrompt = await promptToEnglish(input.negativePrompt, 'image');
    const nanoBananaKey = process.env.NANOBANANA_API_KEY;

    // ── Primary: NanoBanana ────────────────────────────────────────────
    // Hard wall-clock cap so a slow/failing NanoBanana can't block the whole
    // request: if it doesn't return a URL within the cap, fail over to the fast
    // Replicate predictionId path immediately (the client then polls). This keeps
    // time-to-first-preview low even when NanoBanana is degraded.
    const NB_CAP_MS = 14_000;
    if (nanoBananaKey) {
      try {
        const endpoint = QUALITY_TO_NB_ENDPOINT[input.quality ?? 'high'] ?? 'v2-2k';
        const result = await Promise.race([
          generateNanoBananaImage({
            prompt: input.prompt,
            endpoint,
            aspectRatio: input.aspectRatio ?? '1:1',
            style: input.style,
          }),
          new Promise<{ url?: string; credits?: number }>((_, reject) =>
            setTimeout(() => reject(new Error('nanobanana cap exceeded')), NB_CAP_MS),
          ),
        ]);

        if (result.url) {
          // Post-success debit for the synchronous NanoBanana path (no stable provider id → per-call ref).
          await deductCredits(guard.userId, creditCostFor('image'), `image:nb:${guard.userId}:${Date.now()}`).catch((e) => reportError(e, { where: 'replicate.image.deduct' }));
          return NextResponse.json({
            success: true,
            url: result.url,
            model: `NanoBanana ${endpoint.toUpperCase()}`,
            outputType: 'image',
            provider: 'nanobanana',
            credits: result.credits,
          });
        }
      } catch (nbErr) {
        console.warn('[image] NanoBanana failed, falling back to Replicate:', nbErr instanceof Error ? nbErr.message : nbErr);
      }
    }

    // ── Fallback: Replicate FLUX ───────────────────────────────────────
    const model = resolveModel(input.service, input.variant);
    const modelInput = buildModelInput(input);
    const prediction = await createPrediction(model.id, modelInput);

    if (prediction.status === 'succeeded' && prediction.output) {
      // Replicate returned a finished render inline — charge once, keyed on the prediction id (idempotent).
      await deductCredits(guard.userId, creditCostFor('image'), `image:${prediction.id}`).catch((e) => reportError(e, { where: 'replicate.image.deduct' }));
      return NextResponse.json(
        normalizeOutput('image', model.label, model.outputType, prediction.id, prediction.status, prediction.output, null, prediction.metrics),
      );
    }

    // Return predictionId — client polls
    return NextResponse.json({
      success: true,
      predictionId: prediction.id,
      status: prediction.status,
      model: model.label,
      outputType: model.outputType,
      provider: 'replicate',
    });
  } catch (err) {
    reportError(err, { route: 'replicate.image' }); // whole-route failure was invisible to Sentry
    // ⚠️ THIS USED TO HAND THE USER THE PROVIDER'S RAW RESPONSE. lib/replicate/client.ts throws
    // `Replicate API ${status}: ${body}`, so a Georgian user pressing Generate was shown, in English:
    // `Replicate API 402: {"title":"Insufficient credit", … "Go to https://replicate.com/account/billing"}`
    // — untranslated, JSON, and inviting our customer to go and top up OUR supplier's account. Nobody
    // should learn who our providers are from an error message. The real reason is logged above.
    const safe = providerErrorBody(err, req.headers.get('x-locale') || undefined);
    return NextResponse.json(
      { success: false, service: 'image', outputType: 'image', url: null, error: safe.error, message: safe.message, metadata: {} },
      { status: safe.status },
    );
  }
}
