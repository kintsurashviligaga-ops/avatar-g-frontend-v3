import { NextRequest, NextResponse } from 'next/server';
import { generateNanoBananaImage } from '@/lib/nanobanana/client';
import { validateInput, buildModelInput } from '@/lib/replicate/schemas';
import { resolveModel } from '@/lib/replicate/models';
import { createPrediction, pollPrediction } from '@/lib/replicate/client';
import { normalizeOutput } from '@/lib/replicate/normalizer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── Quality → NanoBanana endpoint mapping ──────────────────────────────────────
const QUALITY_TO_NB_ENDPOINT: Record<string, string> = {
  standard: 'v2-1k',
  high:     'v2-2k',
  ultra:    'pro-4k',
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ── Poll existing Replicate prediction (fallback path only) ────────
    if (body.predictionId) {
      const result = await pollPrediction(String(body.predictionId));
      const model = resolveModel('image', body.variant);
      const normalized = normalizeOutput(
        'image', model.label, model.outputType,
        result.id, result.status, result.output, result.error ?? null, result.metrics,
      );
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
    const nanoBananaKey = process.env.NANOBANANA_API_KEY;

    // ── Primary: NanoBanana ────────────────────────────────────────────
    if (nanoBananaKey) {
      try {
        const endpoint = QUALITY_TO_NB_ENDPOINT[input.quality ?? 'high'] ?? 'v2-2k';
        const result = await generateNanoBananaImage({
          prompt: input.prompt,
          endpoint,
          aspectRatio: input.aspectRatio ?? '1:1',
          style: input.style,
        });

        if (result.url) {
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
    const message = err instanceof Error ? err.message : 'Image generation failed';
    return NextResponse.json(
      { success: false, service: 'image', outputType: 'image', url: null, error: message, metadata: {} },
      { status: /token|configured/i.test(message) ? 500 : 502 },
    );
  }
}
