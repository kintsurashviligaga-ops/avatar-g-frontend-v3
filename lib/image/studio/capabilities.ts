import { MODEL_CATALOG } from '@/lib/models/catalog';
import { resolveModelPreference, type ModelCatalog } from '@/lib/contracts/modelCatalog';
import { ASPECTS, RESOLUTIONS, type ImageRequest, type ImageTransport } from './contracts';
import { ImageError } from './errors';

// Operation detail for an EXISTING catalog ID; it cannot enable a model or verify a deployment.
// Source: Google's image-generation docs, reviewed 2026-10-12. Live operation evidence remains null.
const ADAPTERS = {
  'gemini-3.1-flash-image': {
    operations: ['generate', 'edit', 'replace_object', 'remove_object', 'replace_background', 'extend', 'character_variation', 'product_scene'] as const,
    aspects: ASPECTS, resolutions: RESOLUTIONS,
    maxReferences: 4, // Deliberately smaller application limit, not a claimed provider ceiling.
    maxOutputsPerJob: 1,
    operationVerifiedAt: null,
    semantics: 'generative' as const,
    unsupported: ['seed', 'negativePrompt', 'mask', 'referenceStrength', 'transparentBackground', 'deterministicUpscale'],
    limitations: ['Identity, text, labels and unchanged pixels are not guaranteed.', 'One output per confirmed job; the workspace runs 1/2/4 independently priced jobs in sequence.'],
  },
};
export function imageModels(transport: ImageTransport, catalog: ModelCatalog = MODEL_CATALOG) {
  return catalog.entries.flatMap(entry => {
    const adapter = ADAPTERS[entry.id as keyof typeof ADAPTERS];
    const resolved = resolveModelPreference(catalog, entry.id, 'media');
    if (!adapter || !resolved.ok || !entry.capabilities.includes('image') ||
      (entry.transport !== 'either' && entry.transport !== transport)) return [];
    return [{ ...entry, transport, ...adapter, creditsSource: 'lib/credits/quote.ts', providerCostUSD: null }];
  });
}
export function validateCapability(request: ImageRequest, transport: ImageTransport, catalog: ModelCatalog = MODEL_CATALOG) {
  const model = imageModels(transport, catalog).find(m => m.id === request.modelId);
  if (!model) throw new ImageError('unsupported_capability', 'The selected image model is unavailable on this transport.');
  if (!(model.operations as readonly string[]).includes(request.operation)) throw new ImageError('unsupported_capability', 'This operation has no verified adapter.');
  if (request.count !== 1) throw new ImageError('unsupported_capability', 'This engine supports one output per confirmed job.');
  if (request.references.length > model.maxReferences) throw new ImageError('unsupported_capability', 'Too many references.');
  return model;
}
