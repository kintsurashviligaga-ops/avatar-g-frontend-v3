import { NextRequest, NextResponse } from 'next/server';
import { validateInput, buildModelInput } from '@/lib/replicate/schemas';
import { resolveModel } from '@/lib/replicate/models';
import { createPrediction, pollPrediction, pollUntilDone } from '@/lib/replicate/client';
import { normalizeOutput } from '@/lib/replicate/normalizer';

export const dynamic = 'force-dynamic';

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
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    const input = validation.sanitized;
    const model = resolveModel(input.service, input.variant);
    const modelInput = buildModelInput(input);

    // ── Create prediction ────────────────────────────────────────────
    const prediction = await createPrediction(model.id, modelInput);

    // ── If sync result, return immediately ────────────────────────────
    if (prediction.status === 'succeeded' && prediction.output) {
      return NextResponse.json(
        normalizeOutput('image', model.label, model.outputType, prediction.id, prediction.status, prediction.output, null, prediction.metrics),
      );
    }

    // ── Wait for result (up to 60s) ─────────────────────────────────
    const completed = await pollUntilDone(prediction.id, 30, 2000);
    return NextResponse.json(
      normalizeOutput('image', model.label, model.outputType, completed.id, completed.status, completed.output, completed.error ?? null, completed.metrics),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Image generation failed';
    return NextResponse.json(
      { success: false, service: 'image', outputType: 'image', url: null, error: message, metadata: {} },
      { status: /token|configured/i.test(message) ? 500 : 502 },
    );
  }
}
