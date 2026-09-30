/** @jest-environment node */
/**
 * Cross-module contract (docs/VEO_ENGINE.md §5): capabilities.normalizeClipRequest is the ONLY place a request is
 * fitted to a model, and payload.ts refuses — never repairs — a request that breaks Veo's rules. The two agree only if
 * every request the normaliser returns is one the transport's payload builder accepts, and normalising it again
 * changes nothing. This sweeps the input space (lengths, resolutions, reference counts, first/last frames, audio,
 * cameraControl, seeds, formats, stale tier labels) for every catalogued model — and an uncatalogued env-override id —
 * on its own transport, and checks both.
 */
import { DEFAULT_MODEL_IDS, VEO_MODELS, normalizeClipRequest, resolveModel, type VeoClipInput } from './capabilities';
import { buildGeminiPayload, buildVertexPayload } from './payload';
import type { OutputFormat, VeoAspect, VeoMedia, VeoResolution, VeoTier, VeoTransport } from './types';

/** The media shape each transport's payload takes: the engine uploads to GCS for Vertex and inlines for Gemini. */
const mediaFor = (transport: VeoTransport, i: number): VeoMedia =>
  transport === 'vertex'
    ? { kind: 'gcs', uri: `gs://bucket/inputs/s/${i}.png`, mimeType: 'image/png' }
    : { kind: 'bytes', base64: 'iVBORw0KGgo=', mimeType: 'image/png' };

const DURATIONS: Array<number | undefined> = [undefined, 3, 4, 5, 6, 7, 8, 12];
const RESOLUTIONS: Array<VeoResolution | undefined> = [undefined, '720p', '1080p', '4k'];
const REFERENCE_COUNTS = [0, 1, 4];
const AUDIO: Array<boolean | undefined> = [undefined, false];
const SEEDS: Array<number | undefined> = [undefined, -1.5];
const ASPECTS: Array<VeoAspect | OutputFormat> = ['9:16', '1:1'];
const TIER_LABELS: Array<VeoTier | undefined> = [undefined, 'lite'];

function* inputs(transport: VeoTransport): Generator<VeoClipInput> {
  for (const durationSec of DURATIONS)
    for (const resolution of RESOLUTIONS)
      for (const refs of REFERENCE_COUNTS)
        for (const start of [false, true])
          for (const last of [false, true])
            for (const generateAudio of AUDIO)
              for (const camera of [false, true])
                for (const seed of SEEDS)
                  for (const aspect of ASPECTS)
                    for (const tier of TIER_LABELS) {
                      yield {
                        prompt: 'A lighthouse keeper climbs the spiral stairs at dusk',
                        aspect,
                        ...(durationSec !== undefined ? { durationSec } : {}),
                        ...(resolution ? { resolution } : {}),
                        ...(refs ? { referenceImages: Array.from({ length: refs }, (_, i) => mediaFor(transport, i)) } : {}),
                        ...(start ? { startImage: mediaFor(transport, 10) } : {}),
                        ...(last ? { lastFrame: mediaFor(transport, 11) } : {}),
                        ...(generateAudio !== undefined ? { generateAudio } : {}),
                        ...(camera ? { cameraControl: 'push_in' as const } : {}),
                        ...(seed !== undefined ? { seed } : {}),
                        ...(tier ? { tier } : {}),
                      };
                    }
}

/** The six §1 ids, plus env-override ids the catalogue does not know (they get their inferred tier's profile). */
const CATALOGUE: ReadonlyArray<readonly [string, VeoTransport]> = [
  ...Object.values(VEO_MODELS).map((caps) => [caps.id, caps.transport] as const),
  ['veo-3.2-fast-generate-001', 'vertex'],
  ['veo-3.2-lite-generate-preview', 'gemini'],
];

describe('normalizeClipRequest → payload builders', () => {
  it.each(CATALOGUE)('every normalised request for %s is accepted by the %s payload, and is a fixed point', (model, transport) => {
    let checked = 0;
    for (const input of inputs(transport)) {
      const { request } = normalizeClipRequest(input, model, transport);
      const build = () => (transport === 'vertex' ? buildVertexPayload(request) : buildGeminiPayload(request));
      expect(build).not.toThrow();
      expect(normalizeClipRequest(request, model, transport).adjustments).toEqual([]);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(10_000);
  });

  it('the engine resolves the same ids the catalogue lists, per transport and tier', () => {
    for (const transport of ['vertex', 'gemini'] as const) {
      for (const tier of ['standard', 'fast', 'lite'] as const) {
        const id = resolveModel(transport, tier);
        expect(id).toBe(DEFAULT_MODEL_IDS[transport][tier]);
        expect(VEO_MODELS[id]).toMatchObject({ transport, tier });
        expect(normalizeClipRequest({ prompt: 'x', aspect: '16:9' }, id, transport).request.tier).toBe(tier);
      }
    }
  });
});
