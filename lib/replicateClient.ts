/**
 * lib/replicateClient.ts
 * ======================
 * Centralized Replicate integration facade.
 * Re-exports the core helpers so callers can use a single import.
 *
 * Server-side only — never import in client components.
 */

export { getReplicateClient, createPrediction, pollPrediction, pollUntilDone } from './replicate/client';
export type { PredictionResult } from './replicate/client';

export { validateInput, buildModelInput, getAspectDimensions } from './replicate/schemas';
export type { GenerateInput, ValidationResult } from './replicate/schemas';

export { resolveModel, isValidService, getQualityParams } from './replicate/models';
export type { ServiceType, QualityTier, ModelSpec, RouteConfig } from './replicate/models';

export { normalizeOutput } from './replicate/normalizer';
export type { NormalizedOutput } from './replicate/normalizer';

/**
 * High-level helper: validate → resolve model → create prediction → wait → normalize.
 * Returns a NormalizedOutput ready for the frontend.
 */
export async function runReplicatePrediction(
  service: 'avatar' | 'image',
  prompt: string,
  opts: {
    quality?: 'standard' | 'high';
    variant?: string;
    style?: string;
    ratio?: string;
    imageUrl?: string;
    negativePrompt?: string;
  } = {},
) {
  const { validateInput: validate, buildModelInput: buildInput } = await import('./replicate/schemas');
  const { resolveModel: resolve } = await import('./replicate/models');
  const { createPrediction: create, pollUntilDone: poll } = await import('./replicate/client');
  const { normalizeOutput: normalize } = await import('./replicate/normalizer');

  const validation = validate({
    service,
    prompt,
    quality: opts.quality || 'standard',
    variant: opts.variant || opts.style,
    aspectRatio: opts.ratio || '1:1',
    imageUrl: opts.imageUrl,
    negativePrompt: opts.negativePrompt,
    style: opts.style,
  });

  if (!validation.valid || !validation.sanitized) {
    return { success: false, service, outputType: 'image' as const, url: null, error: validation.error || 'Invalid input', metadata: { predictionId: '' } };
  }

  const input = validation.sanitized;
  const model = resolve(input.service, input.variant);
  const modelInput = buildInput(input);

  const prediction = await create(model.id, modelInput);

  if (prediction.status === 'succeeded' && prediction.output) {
    return normalize(service, model.label, model.outputType, prediction.id, prediction.status, prediction.output, null, prediction.metrics);
  }

  const completed = await poll(prediction.id, 30, 2000);
  return normalize(service, model.label, model.outputType, completed.id, completed.status, completed.output, completed.error ?? null, completed.metrics);
}
