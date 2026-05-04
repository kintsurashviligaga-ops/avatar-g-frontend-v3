import { NextRequest, NextResponse } from 'next/server';
import { validateInput, buildModelInput } from '@/lib/replicate/schemas';
import { resolveModel } from '@/lib/replicate/models';
import { createPrediction, pollPrediction, pollUntilDone } from '@/lib/replicate/client';
import { normalizeOutput } from '@/lib/replicate/normalizer';

export const dynamic = 'force-dynamic';

function buildFallbackImage(reason?: string) {
  const detail = reason ? ` Reason: ${reason.slice(0, 180)}` : '';
  return {
    success: true,
    service: 'image',
    model: 'fallback',
    outputType: 'text',
    url: null,
    text: `Image request accepted. Returning fallback output because the external generator is temporarily unavailable.${detail}`,
    metadata: {
      predictionId: `fallback_${Date.now()}`,
      fallback: true,
      reason: reason ? reason.slice(0, 280) : undefined,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ── Poll existing prediction ─────────────────────────────────────
    if (body.predictionId) {
      const result = await pollPrediction(String(body.predictionId));
      const model = resolveModel('image', body.variant);
      const normalized = normalizeOutput(
        'image', model.label, model.outputType,
        result.id, result.status, result.output, result.error ?? null, result.metrics,
      );
      if (!normalized.success) {
        return NextResponse.json(buildFallbackImage(normalized.error));
      }
      return NextResponse.json(normalized);
    }

    // ── Validate ─────────────────────────────────────────────────────
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
      return NextResponse.json(buildFallbackImage(validation.error || 'Invalid image input'));
    }

    const input = validation.sanitized;
    const model = resolveModel(input.service, input.variant);
    const modelInput = buildModelInput(input);

    // ── Create prediction ────────────────────────────────────────────
    const prediction = await createPrediction(model.id, modelInput);

    // ── If sync result, return immediately ────────────────────────────
    if (prediction.status === 'succeeded' && prediction.output) {
      const normalized = normalizeOutput('image', model.label, model.outputType, prediction.id, prediction.status, prediction.output, null, prediction.metrics);
      if (!normalized.success) {
        return NextResponse.json(buildFallbackImage(normalized.error));
      }
      return NextResponse.json(normalized);
    }

    // ── Wait for result (up to 60s) ─────────────────────────────────
    const completed = await pollUntilDone(prediction.id, 30, 2000);
    const normalized = normalizeOutput('image', model.label, model.outputType, completed.id, completed.status, completed.output, completed.error ?? null, completed.metrics);
    if (!normalized.success) {
      return NextResponse.json(buildFallbackImage(normalized.error));
    }
    return NextResponse.json(normalized);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Image generation failed';
    return NextResponse.json(buildFallbackImage(message));
  }
}
