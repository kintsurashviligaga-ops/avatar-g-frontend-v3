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

function buildFallbackOutput(service: ServiceType, reason?: string): string {
  const label = service.replace('-', ' ');
  const detail = reason ? ` Reason: ${reason.slice(0, 180)}` : '';
  return `Generation request for ${label} was accepted. Returning fallback output because the external generator is temporarily unavailable.${detail}`;
}

function buildFallbackPayload(service: ServiceType, reason?: string) {
  return {
    status: 'succeeded',
    service,
    model: 'fallback',
    outputType: 'text',
    output: buildFallbackOutput(service, reason),
    message: 'Generation completed in fallback mode.',
    metadata: {
      fallback: true,
      reason: reason ? reason.slice(0, 280) : undefined,
    },
  };
}

export async function POST(req: NextRequest) {
  let requestedService: ServiceType = 'image';
  try {
    const body = await req.json() as Record<string, unknown>;

    const serviceFromBody = typeof body.service === 'string' ? body.service : undefined;
    if (serviceFromBody && isValidService(serviceFromBody)) {
      requestedService = serviceFromBody;
    }

    // ── Poll existing prediction ───────────────────────────────────
    if (body.predictionId) {
      const prediction = await pollPrediction(String(body.predictionId));

      if (prediction.status === 'failed' || prediction.status === 'canceled') {
        return NextResponse.json(buildFallbackPayload(requestedService, prediction.error || prediction.status));
      }

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
      return NextResponse.json(buildFallbackPayload(requestedService, 'Invalid or missing service identifier'));
    }

    requestedService = service;

    // ── Validate input ─────────────────────────────────────────────
    const validation = validateInput({ ...body, service });
    if (!validation.valid || !validation.sanitized) {
      return NextResponse.json(buildFallbackPayload(requestedService, validation.error || 'Invalid generation input'));
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
      return NextResponse.json(buildFallbackPayload(requestedService, message));
    }

    if (message.includes('422') || message.includes('404')) {
      return NextResponse.json(buildFallbackPayload(requestedService, message));
    }

    return NextResponse.json(buildFallbackPayload(requestedService, message));
  }
}
