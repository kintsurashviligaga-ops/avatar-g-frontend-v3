import { NextRequest, NextResponse } from 'next/server';
import { validateInput, buildModelInput } from '@/lib/replicate/schemas';
import { resolveModel, isValidService, type ServiceType } from '@/lib/replicate/models';
import { createPrediction, pollPrediction } from '@/lib/replicate/client';
import { normalizeOutput } from '@/lib/replicate/normalizer';

export const dynamic = 'force-dynamic';

// ── Legacy type mapping for backwards compat with existing proxy routes ──
const LEGACY_TYPE_MAP: Record<string, ServiceType> = {
  image: 'image',
  video: 'video',
  music: 'music',
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;

    // ── Poll existing prediction ───────────────────────────────────
    if (body.predictionId) {
      const prediction = await pollPrediction(String(body.predictionId));
      return NextResponse.json({
        id: prediction.id,
        status: prediction.status,
        output: prediction.output,
        error: prediction.error,
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
    const model = resolveModel(input.service, input.variant);
    const modelInput = buildModelInput(input);

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

    return NextResponse.json({
      id: prediction.id,
      status: prediction.status,
      service: input.service,
      model: model.label,
      outputType: model.outputType,
      message: `${input.service} generation started. Poll with predictionId to check status.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('429') || message.includes('rate limit')) {
      return NextResponse.json({
        status: 'throttled',
        error: message,
        message: 'Replicate rate limit reached. Retry shortly or increase account credit.',
      }, { status: 200 });
    }

    if (message.includes('422') || message.includes('404')) {
      return NextResponse.json({
        status: 'model_unavailable',
        error: message,
        message: 'Selected model/version is unavailable. Update model version or permissions.',
      }, { status: 200 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
