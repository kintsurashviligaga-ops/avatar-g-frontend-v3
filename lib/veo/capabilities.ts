/**
 * lib/veo/capabilities.ts — what each Veo model can do, and the normalisation of a request into what it CAN do.
 *
 * The catalogue is the table in docs/VEO_ENGINE.md §1 (Google docs, verified 2026-09-29). Everything downstream —
 * the payload builders, the engine, the cost reserve, the panel — asks this module instead of hard-coding a model
 * fact, so a Google change is one edit here.
 *
 * Dependency-free on purpose (no server-only imports, no secrets): the studio panel imports the aspect mapping,
 * the framing hint and the price table too. The only env it reads are model-id overrides (never secrets); in a
 * client bundle they are simply unset and the documented defaults apply.
 */

import type {
  ClipAdjustment,
  OutputFormat,
  VeoAspect,
  VeoClipRequest,
  VeoDuration,
  VeoMedia,
  VeoResolution,
  VeoTier,
  VeoTransport,
  VertexCameraControl,
} from './types';

/** $/s by output resolution. 4k is absent where the tier has no 4k price (Lite). */
export interface VeoPriceRow {
  '720p': number;
  '1080p': number;
  '4k'?: number;
}

export interface VeoModelCaps {
  id: string;
  tier: VeoTier;
  transport: VeoTransport;
  status: 'ga' | 'preview';
  durations: readonly VeoDuration[];
  aspects: readonly VeoAspect[];
  /**
   * Supported resolutions → the clip lengths each one is allowed at. This IS the "8 s rule": Google renders
   * 1080p and 4k only for 8 s clips, 720p at every length. A resolution missing from the map is not offered.
   */
  resolutions: Readonly<Partial<Record<VeoResolution, readonly VeoDuration[]>>>;
  /** 0 = no reference images (Lite). */
  maxReferenceImages: number;
  supportsLastFrame: boolean;
  /** Vertex only — `parameters.generateAudio`. The Gemini API always renders native audio. */
  supportsAudioToggle: boolean;
  /** Vertex only — `instances[].cameraControl` (schema-only, opt-in; see docs/VEO_ENGINE.md §1). */
  supportsCameraControl: boolean;
  pricePerSecondUsd: {
    audio: VeoPriceRow;
    /** Vertex only: the cheaper rate when `generateAudio: false`. */
    videoOnly?: VeoPriceRow;
  };
  /** True when the id is not in the catalogue (e.g. a future id set by env) and this is its tier's profile. */
  inferred?: boolean;
}

/**
 * ClipAdjustment (lib/veo/types.ts) has no `startImage` or `seed` field, yet the contract requires an adjustment
 * when the reference-image exclusivity drops a first frame and when a seed is coerced to uint32. This widens the
 * field union by exactly those two; once types.ts gains them, this becomes an alias of ClipAdjustment.
 */
export type VeoClipAdjustment = Omit<ClipAdjustment, 'field'> & {
  field: ClipAdjustment['field'] | 'startImage' | 'seed';
};

/**
 * What normalizeClipRequest accepts: the contract's `Partial<VeoClipRequest> & { prompt, aspect }`, widened only
 * where normalisation is the point — any length (snapped to 4/6/8) and an output format (mapped to a native aspect).
 */
export type VeoClipInput = Omit<Partial<VeoClipRequest>, 'prompt' | 'aspect' | 'durationSec'> & {
  prompt: string;
  aspect: VeoAspect | OutputFormat;
  durationSec?: number;
};

export interface NormalizedClip {
  request: VeoClipRequest;
  adjustments: VeoClipAdjustment[];
}

export const DEFAULT_TIER: VeoTier = 'standard';

/** §1 ids. The Vertex -001 ids list retirement "November 17, 2026 or later" — override via VEO_MODEL_* then. */
export const DEFAULT_MODEL_IDS: Readonly<Record<VeoTransport, Readonly<Record<VeoTier, string>>>> = {
  vertex: {
    standard: 'veo-3.1-generate-001',
    fast: 'veo-3.1-fast-generate-001',
    lite: 'veo-3.1-lite-generate-001',
  },
  gemini: {
    standard: 'veo-3.1-generate-preview',
    fast: 'veo-3.1-fast-generate-preview',
    lite: 'veo-3.1-lite-generate-preview',
  },
};

const ALL_DURATIONS: readonly VeoDuration[] = [4, 6, 8];
const EIGHT_ONLY: readonly VeoDuration[] = [8];
const NATIVE_ASPECTS: readonly VeoAspect[] = ['16:9', '9:16'];
/** High → low: the fallback order when a resolution is unavailable. */
const RESOLUTION_ORDER: readonly VeoResolution[] = ['4k', '1080p', '720p'];

/** Published $/s WITH native audio (the Gemini API rate, and Vertex with generateAudio on). */
const PRICE_WITH_AUDIO: Readonly<Record<VeoTier, VeoPriceRow>> = {
  standard: { '720p': 0.4, '1080p': 0.4, '4k': 0.6 },
  fast: { '720p': 0.1, '1080p': 0.12, '4k': 0.3 },
  lite: { '720p': 0.05, '1080p': 0.08 },
};

/** Vertex's video-only rate (generateAudio: false). The Gemini API has no toggle, hence no such rate. */
const PRICE_VIDEO_ONLY_VERTEX: Readonly<Record<VeoTier, VeoPriceRow>> = {
  standard: { '720p': 0.2, '1080p': 0.2, '4k': 0.4 },
  fast: { '720p': 0.08, '1080p': 0.1, '4k': 0.25 },
  lite: { '720p': 0.03, '1080p': 0.05 },
};

/**
 * 4k per §1: Standard on both transports; Fast only where Google documents it (the Gemini API); Lite never.
 * The price rows keep the published Fast 4k rates regardless — a price is not a promise the model renders it.
 */
function resolutionsFor(transport: VeoTransport, tier: VeoTier): VeoModelCaps['resolutions'] {
  const has4k = tier === 'standard' || (tier === 'fast' && transport === 'gemini');
  return has4k
    ? { '720p': ALL_DURATIONS, '1080p': EIGHT_ONLY, '4k': EIGHT_ONLY }
    : { '720p': ALL_DURATIONS, '1080p': EIGHT_ONLY };
}

function tierProfile(transport: VeoTransport, tier: VeoTier): VeoModelCaps {
  const vertex = transport === 'vertex';
  return {
    id: DEFAULT_MODEL_IDS[transport][tier],
    tier,
    transport,
    // Gemini-API Veo ids are all Preview; on Vertex only Lite is (§1).
    status: vertex && tier !== 'lite' ? 'ga' : 'preview',
    durations: ALL_DURATIONS,
    aspects: NATIVE_ASPECTS,
    resolutions: resolutionsFor(transport, tier),
    maxReferenceImages: tier === 'lite' ? 0 : 3,
    supportsLastFrame: true,
    supportsAudioToggle: vertex,
    supportsCameraControl: vertex,
    pricePerSecondUsd: vertex
      ? { audio: PRICE_WITH_AUDIO[tier], videoOnly: PRICE_VIDEO_ONLY_VERTEX[tier] }
      : { audio: PRICE_WITH_AUDIO[tier] },
  };
}

const TIERS: readonly VeoTier[] = ['standard', 'fast', 'lite'];
const TRANSPORTS: readonly VeoTransport[] = ['vertex', 'gemini'];

/** The §1 catalogue, keyed by model id. */
export const VEO_MODELS: Readonly<Record<string, VeoModelCaps>> = Object.freeze(
  Object.fromEntries(
    TRANSPORTS.flatMap((transport) =>
      TIERS.map((tier) => {
        const caps = Object.freeze(tierProfile(transport, tier));
        return [caps.id, caps] as const;
      }),
    ),
  ),
);

function catalogued(modelId: string): VeoModelCaps | undefined {
  // Own-property check: a plain lookup would hand back Object.prototype members for ids like "constructor".
  return Object.prototype.hasOwnProperty.call(VEO_MODELS, modelId) ? VEO_MODELS[modelId] : undefined;
}

/** Tier of an id that is not in the catalogue: 'lite' before 'fast' (neither contains the other), else standard. */
export function inferTier(modelId: string): VeoTier {
  const id = modelId.toLowerCase();
  if (id.includes('lite')) return 'lite';
  if (id.includes('fast')) return 'fast';
  return 'standard';
}

/**
 * Capabilities of a model id. A catalogued id returns its §1 row. Any other id (a future veo-3.2 set by env, a
 * typo) never throws: it gets its inferred tier's profile — on `transport` when the caller knows it, otherwise the
 * conservative profile: audio always on and no video-only rate (never under-reserve credits), and only the
 * resolutions BOTH transports render (never send what one of them rejects). A catalogued id asked for on the other
 * transport (Google has reused an id across the two APIs before) likewise gets that transport's profile.
 */
export function capsFor(modelId: string, transport?: VeoTransport): VeoModelCaps {
  const id = modelId.trim();
  const known = catalogued(id);
  if (known && (!transport || known.transport === transport)) return known;
  const tier = known?.tier ?? inferTier(id);
  if (transport) return { ...tierProfile(transport, tier), id, status: 'preview', inferred: true };

  const gemini = tierProfile('gemini', tier);
  const vertexRes = resolutionsFor('vertex', tier);
  const shared = Object.fromEntries(
    Object.entries(gemini.resolutions).filter(([res]) => vertexRes[res as VeoResolution] !== undefined),
  ) as VeoModelCaps['resolutions'];
  return { ...gemini, id, status: 'preview', resolutions: shared, supportsCameraControl: false, inferred: true };
}

const TIER_ENV: Readonly<Record<VeoTier, string>> = {
  standard: 'VEO_MODEL_STANDARD',
  fast: 'VEO_MODEL_FAST',
  lite: 'VEO_MODEL_LITE',
};

/** The id lands in a URL path (`…/models/{MODEL}:predictLongRunning`), so an override must look like a model id. */
const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function envModelId(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  return raw && MODEL_ID_RE.test(raw) ? raw : undefined;
}

function isTier(value: unknown): value is VeoTier {
  return value === 'standard' || value === 'fast' || value === 'lite';
}

/**
 * The model id for a transport + tier. Env overrides beat the §1 defaults. For the Gemini transport's standard tier
 * the transport-specific GEMINI_VEO_MODEL is consulted before the generic VEO_MODEL_STANDARD, so it "keeps working"
 * exactly as lib/ai/geminiVeo.ts reads it even when a Vertex-oriented VEO_MODEL_STANDARD (e.g. a -001 successor) is
 * set. An override that is not a plausible model id is ignored rather than spliced into a request URL.
 */
export function resolveModel(transport: VeoTransport, tier: VeoTier = DEFAULT_TIER): string {
  const t = isTier(tier) ? tier : DEFAULT_TIER;
  const specific = transport === 'gemini' && t === 'standard' ? envModelId('GEMINI_VEO_MODEL') : undefined;
  return specific ?? envModelId(TIER_ENV[t]) ?? DEFAULT_MODEL_IDS[transport][t];
}

/** Veo renders only 16:9 and 9:16; 1:1 is cropped from a 16:9 frame and 4:5 from a 9:16 frame. */
export function nativeAspectFor(format: OutputFormat): VeoAspect {
  switch (format) {
    case '9:16':
    case '4:5':
      return '9:16';
    case '16:9':
    case '1:1':
    default:
      return '16:9';
  }
}

/**
 * The prompt clause that keeps a cropped format usable: a square crop of a 16:9 frame keeps only the middle ~56% of
 * its width, a 4:5 crop of a 9:16 frame only the middle ~70% of its height. Null for the native formats.
 */
export function framingHintFor(format: OutputFormat): string | null {
  if (format === '1:1') {
    return 'Keep the subject and all key action centred in the middle of the frame, with generous safe margins on the left and right, so the shot survives a square 1:1 crop.';
  }
  if (format === '4:5') {
    return 'Keep the subject and all key action centred in the frame, with safe margins at the top and bottom, so the shot survives a 4:5 crop.';
  }
  return null;
}

/** Google's rule, model-agnostic: anything above 720p needs an 8 s clip; shorter clips render 720p. */
export function resolutionFor(durationSec: number, preferred: VeoResolution = '1080p'): VeoResolution {
  return durationSec >= 8 ? preferred : '720p';
}

function isResolution(value: unknown): value is VeoResolution {
  return value === '720p' || value === '1080p' || value === '4k';
}

function isNativeAspect(value: unknown): value is VeoAspect {
  return value === '16:9' || value === '9:16';
}

/** Nearest allowed length; an exact tie goes UP (5 s → 6 s, 7 s → 8 s) — never shorten what the user asked for. */
function snapDuration(value: number, allowed: readonly VeoDuration[]): VeoDuration {
  let best: VeoDuration = allowed[0] ?? 8;
  for (const d of allowed) {
    const dist = Math.abs(d - value);
    const bestDist = Math.abs(best - value);
    if (dist < bestDist || (dist === bestDist && d > best)) best = d;
  }
  return best;
}

/** Adjustments are logged and shown in the UI, so media is described, never embedded (no base64, no signed URL). */
function describeMedia(media: VeoMedia): string {
  return `${media.kind} image`;
}

function highestSupported(caps: VeoModelCaps, atOrBelow: VeoResolution, duration?: VeoDuration): VeoResolution {
  const start = RESOLUTION_ORDER.indexOf(atOrBelow);
  for (const res of RESOLUTION_ORDER.slice(start)) {
    const durations = caps.resolutions[res];
    if (durations && (duration === undefined || durations.includes(duration))) return res;
  }
  return '720p';
}

const UINT32_MAX = 0xffffffff;

/**
 * Turns an intent into a request the model accepts, in the contract's order (docs/VEO_ENGINE.md §5). Values the
 * caller did not set get the defaults (8 s, 1080p-if-8 s, audio on) silently; every value the caller DID set and
 * that had to change pushes an adjustment with a short English reason.
 */
export function normalizeClipRequest(input: VeoClipInput, modelId: string, transport?: VeoTransport): NormalizedClip {
  const caps = capsFor(modelId, transport);
  const adjustments: VeoClipAdjustment[] = [];
  const adjust = (field: VeoClipAdjustment['field'], from: unknown, to: unknown, reason: string) => {
    adjustments.push({ field, from, to, reason });
  };

  // 1. Tier comes from the model — the id decides what renders, not the label the caller carried.
  const tier = caps.tier;
  if (input.tier !== undefined && input.tier !== tier) {
    adjust('tier', input.tier, tier, `${caps.id} is the ${tier} tier`);
  }

  // Aspect: Veo has no 1:1 / 4:5 — render the native frame the crop comes from (post-production crops it).
  let aspect: VeoAspect;
  if (isNativeAspect(input.aspect) && caps.aspects.includes(input.aspect)) {
    aspect = input.aspect;
  } else {
    const format: OutputFormat = input.aspect === '1:1' || input.aspect === '4:5' ? input.aspect : '16:9';
    aspect = nativeAspectFor(format);
    adjust('aspect', input.aspect, aspect, `Veo renders only 16:9 and 9:16; ${String(input.aspect)} is rendered at ${aspect} and cropped in post`);
  }

  // 2. Duration snapped to 4 / 6 / 8 s.
  let durationSec: VeoDuration;
  if (input.durationSec === undefined) {
    durationSec = 8;
  } else if (typeof input.durationSec !== 'number' || !Number.isFinite(input.durationSec)) {
    durationSec = 8;
    adjust('durationSec', input.durationSec, durationSec, 'Duration was not a number; used 8 s');
  } else {
    durationSec = snapDuration(input.durationSec, caps.durations);
    if (durationSec !== input.durationSec) {
      adjust('durationSec', input.durationSec, durationSec, `Veo renders ${caps.durations.join(', ')} s clips; snapped to ${durationSec} s`);
    }
  }

  let startImage = input.startImage;
  let lastFrame = input.lastFrame;

  // 3. Reference images: none on Lite; ≤3; 8 s only; exclusive with a first/last frame (Google: asset references
  //    are a separate generation mode — the request is rejected when image/lastFrame ride along).
  let referenceImages = input.referenceImages && input.referenceImages.length > 0 ? input.referenceImages : undefined;
  if (referenceImages) {
    if (caps.maxReferenceImages === 0) {
      adjust('referenceImages', referenceImages.length, 0, `${caps.id} does not accept reference images`);
      referenceImages = undefined;
    } else {
      if (referenceImages.length > caps.maxReferenceImages) {
        adjust('referenceImages', referenceImages.length, caps.maxReferenceImages, `Veo accepts at most ${caps.maxReferenceImages} reference images; kept the first ${caps.maxReferenceImages}`);
        referenceImages = referenceImages.slice(0, caps.maxReferenceImages);
      }
      if (durationSec !== 8) {
        adjust('durationSec', durationSec, 8, 'Reference images require an 8 s clip');
        durationSec = 8;
      }
      if (startImage) {
        adjust('startImage', describeMedia(startImage), null, 'Reference images and a first frame are mutually exclusive; kept the reference images');
        startImage = undefined;
      }
      if (lastFrame) {
        adjust('lastFrame', describeMedia(lastFrame), null, 'Reference images and a last frame are mutually exclusive; kept the reference images');
        lastFrame = undefined;
      }
    }
  }

  // 4. A last frame is an interpolation target — it needs a first frame to interpolate from.
  if (lastFrame && !startImage) {
    adjust('lastFrame', describeMedia(lastFrame), null, 'A last frame needs a first frame to interpolate from');
    lastFrame = undefined;
  } else if (lastFrame && !caps.supportsLastFrame) {
    adjust('lastFrame', describeMedia(lastFrame), null, `${caps.id} does not support a last frame`);
    lastFrame = undefined;
  }

  // 5. Resolution: only what the model renders, and above 720p only at 8 s. A short clip keeps its length (the
  //    user chose the pacing) and drops to 720p rather than being stretched to 8 s.
  let resolution: VeoResolution;
  if (input.resolution === undefined) {
    resolution = highestSupported(caps, resolutionFor(durationSec, '1080p'), durationSec);
  } else {
    const requested: VeoResolution = isResolution(input.resolution) ? input.resolution : '1080p';
    if (!isResolution(input.resolution)) {
      adjust('resolution', input.resolution, requested, 'Unknown resolution; used 1080p');
    }
    resolution = requested;
    if (!caps.resolutions[resolution]) {
      const fallback = highestSupported(caps, resolution);
      adjust('resolution', resolution, fallback, `${caps.id} does not render ${resolution}`);
      resolution = fallback;
    }
    if (!caps.resolutions[resolution]?.includes(durationSec)) {
      const fallback = highestSupported(caps, resolution, durationSec);
      adjust('resolution', resolution, fallback, `${resolution} requires an 8 s clip; kept ${durationSec} s and rendered ${fallback}`);
      resolution = fallback;
    }
  }

  // 6. Video-only exists only where the transport has the toggle (Vertex). The Gemini API always renders audio.
  let generateAudio = input.generateAudio ?? true;
  if (!generateAudio && !caps.supportsAudioToggle) {
    adjust('generateAudio', false, true, 'This transport always renders native audio; the audio toggle is Vertex-only');
    generateAudio = true;
  }

  // 7. cameraControl is a Vertex schema field that requires a first frame.
  let cameraControl: VertexCameraControl | undefined = input.cameraControl;
  if (cameraControl && !caps.supportsCameraControl) {
    adjust('cameraControl', cameraControl, null, 'cameraControl exists only on Vertex AI');
    cameraControl = undefined;
  } else if (cameraControl && !startImage) {
    adjust('cameraControl', cameraControl, null, 'cameraControl requires a first frame');
    cameraControl = undefined;
  }

  // 8. Seed → uint32 (Vertex: 0–4294967295). ToUint32 truncates and wraps, as the API would read the integer.
  let seed: number | undefined;
  const raw: unknown = input.seed;
  if (raw !== undefined && raw !== null) {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) {
      adjust('seed', raw, null, 'Seed was not a finite number; dropped');
    } else {
      seed = n >>> 0;
      if (seed !== raw) adjust('seed', raw, seed, `Seed must be a whole number from 0 to ${UINT32_MAX}`);
    }
  }

  const request: VeoClipRequest = {
    prompt: input.prompt,
    aspect,
    durationSec,
    resolution,
    tier,
    generateAudio,
    ...(input.negativePrompt !== undefined ? { negativePrompt: input.negativePrompt } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...(startImage ? { startImage } : {}),
    ...(lastFrame ? { lastFrame } : {}),
    ...(referenceImages ? { referenceImages } : {}),
    ...(cameraControl ? { cameraControl } : {}),
    ...(input.personGeneration !== undefined ? { personGeneration: input.personGeneration } : {}),
    ...(input.enhancePrompt !== undefined ? { enhancePrompt: input.enhancePrompt } : {}),
    ...(input.verbatimPrompt === true ? { verbatimPrompt: true } : {}),
  };
  return { request, adjustments };
}

/**
 * $/s for a clip. The video-only rate applies only where it exists (Vertex with audio off); otherwise the audio rate —
 * the Gemini API bills audio because it always renders it. A resolution the model does not render is priced as the
 * resolution normalisation would actually render (4k on Lite, or on Fast via Vertex → 1080p): the published Fast 4k
 * rate is a Gemini-API price, and reserving it for a clip Vertex renders at 1080p would over-charge 2.5×.
 */
export function costPerSecondUsd(modelId: string, resolution: VeoResolution, audio: boolean, transport?: VeoTransport): number {
  const caps = capsFor(modelId, transport);
  const row = !audio && caps.pricePerSecondUsd.videoOnly ? caps.pricePerSecondUsd.videoOnly : caps.pricePerSecondUsd.audio;
  const rendered = highestSupported(caps, isResolution(resolution) ? resolution : '1080p');
  const start = Math.max(0, RESOLUTION_ORDER.indexOf(rendered));
  for (const res of RESOLUTION_ORDER.slice(start)) {
    const price = row[res];
    if (price !== undefined) return price;
  }
  return row['720p'];
}

/** USD for one normalised clip (rounded to 1e-6 to shed float noise such as 0.1 × 6). */
export function estimateClipCostUsd(request: VeoClipRequest, modelId: string, transport?: VeoTransport): number {
  const perSecond = costPerSecondUsd(modelId, request.resolution, request.generateAudio, transport);
  return Math.round(perSecond * request.durationSec * 1e6) / 1e6;
}
