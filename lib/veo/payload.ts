/**
 * lib/veo/payload.ts — the exact request JSON each Veo transport accepts (docs/VEO_ENGINE.md §5 "payload.ts").
 *
 * Pure and synchronous: no fetch, no env, no logging. This is the LAST gate before a `predictLongRunning` POST, so a
 * request that breaks Veo's contract is refused here with a field-named VeoPayloadError instead of travelling to
 * Google as an opaque 400. normalizeClipRequest() (capabilities.ts) is expected to have fitted the request to the
 * model already: a violation reaching this file is an upstream bug, and it is never silently "repaired" here, because
 * a repair at this layer would render something other than what the user was shown and charged for.
 *
 * Error messages never echo media: a `url` input can be a signed URL and a `bytes` input is base64 (see the module
 * rule in docs/VEO_ENGINE.md §5), and callers log these messages.
 */
import type {
  PersonGeneration,
  VeoAspect,
  VeoClipRequest,
  VeoDuration,
  VeoMedia,
  VeoResolution,
  VertexCameraControl,
} from './types';

/** Which request field broke the contract — `storageUri` is the one Vertex option that is not on VeoClipRequest. */
export type VeoPayloadField = keyof VeoClipRequest | 'storageUri';

export class VeoPayloadError extends Error {
  constructor(readonly field: VeoPayloadField, reason: string) {
    super(`${field}: ${reason}`);
    this.name = 'VeoPayloadError';
  }
}

/** Vertex `Image`: a Cloud Storage object (preferred — no base64 in the body) or inline bytes. */
export type VertexImage =
  | { gcsUri: string; mimeType: string }
  | { bytesBase64Encoded: string; mimeType: string };

/** Gemini API `Image`. Live-probed 2026-07-25: `bytesBase64Encoded` → 200; `inlineData` and `imageBytes` → 400. */
export interface GeminiImage {
  bytesBase64Encoded: string;
  mimeType: string;
}

export interface VeoReferenceImage<I> {
  image: I;
  /** Veo 3.1 documents only `asset` references (a subject / character / product to keep in every frame). */
  referenceType: 'asset';
}

export interface VertexVeoInstance {
  prompt: string;
  image?: VertexImage;
  lastFrame?: VertexImage;
  referenceImages?: VeoReferenceImage<VertexImage>[];
  cameraControl?: VertexCameraControl;
}

export interface VertexVeoParameters {
  aspectRatio: VeoAspect;
  durationSeconds: VeoDuration;
  resolution: VeoResolution;
  sampleCount: 1;
  seed?: number;
  negativePrompt?: string;
  personGeneration: PersonGeneration;
  generateAudio: boolean;
  /** Only ever `true`: Veo 3.x refuses `false` (see buildVertexPayload). */
  enhancePrompt?: true;
  storageUri?: string;
}

export interface VertexVeoPayload {
  instances: [VertexVeoInstance];
  parameters: VertexVeoParameters;
}

export interface GeminiVeoInstance {
  prompt: string;
  image?: GeminiImage;
  lastFrame?: GeminiImage;
  referenceImages?: VeoReferenceImage<GeminiImage>[];
}

export interface GeminiVeoParameters {
  aspectRatio: VeoAspect;
  resolution: VeoResolution;
  durationSeconds: VeoDuration;
  personGeneration: 'allow_all';
  seed?: number;
  negativePrompt?: string;
}

export interface GeminiVeoPayload {
  instances: [GeminiVeoInstance];
  parameters: GeminiVeoParameters;
}

export interface VertexPayloadOptions {
  /** `gs://bucket[/prefix]` — Vertex writes `…/sample_0.mp4` there; without it the video comes back inline. */
  storageUri?: string;
  /** Transport default (VEO_VERTEX_PERSON_GENERATION); a value on the request itself wins. */
  personGeneration?: PersonGeneration;
}

type MediaField = 'startImage' | 'lastFrame' | 'referenceImages';

const ASPECTS: ReadonlySet<string> = new Set<VeoAspect>(['16:9', '9:16']);
const DURATIONS: ReadonlySet<number> = new Set<VeoDuration>([4, 6, 8]);
const RESOLUTIONS: ReadonlySet<string> = new Set<VeoResolution>(['720p', '1080p', '4k']);
const PERSON_GENERATION: ReadonlySet<string> = new Set<PersonGeneration>(['allow_all', 'allow_adult', 'dont_allow']);
const CAMERA_CONTROLS: ReadonlySet<string> = new Set<VertexCameraControl>([
  'fixed', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down',
  'truck_left', 'truck_right', 'pedestal_up', 'pedestal_down', 'push_in', 'pull_out',
]);
const MAX_REFERENCE_IMAGES = 3;
const UINT32_MAX = 0xffff_ffff;
/** An input object: bucket AND object path. */
const GCS_OBJECT_URI = /^gs:\/\/[^/\s]+\/\S+$/;
/** An output location: a bucket, optionally with a prefix. */
const GCS_PREFIX_URI = /^gs:\/\/[^/\s]+(\/\S*)?$/;

/** A short, safe rendering of a scalar the caller got wrong (enum-sized; never media — see the header). */
function shown(value: unknown): string {
  const s = typeof value === 'string' ? JSON.stringify(value) : String(value);
  return s.length > 32 ? `${s.slice(0, 32)}…` : s;
}

/**
 * The rules both transports share (Google docs, verified 2026-09-29). Returns the reference list with `[]`
 * normalised to "none", so an empty array never trips the exclusivity rule nor reaches the body.
 */
function validateClip(req: VeoClipRequest): VeoMedia[] {
  if (typeof req.prompt !== 'string' || !req.prompt.trim()) {
    throw new VeoPayloadError('prompt', 'a non-empty prompt is required');
  }
  if (!ASPECTS.has(req.aspect)) {
    throw new VeoPayloadError('aspect', `Veo renders only 16:9 and 9:16 (got ${shown(req.aspect)}); map 1:1 / 4:5 with nativeAspectFor()`);
  }
  if (!DURATIONS.has(req.durationSec)) {
    throw new VeoPayloadError('durationSec', `durationSeconds must be 4, 6 or 8 (got ${shown(req.durationSec)})`);
  }
  if (!RESOLUTIONS.has(req.resolution)) {
    throw new VeoPayloadError('resolution', `resolution must be 720p, 1080p or 4k (got ${shown(req.resolution)})`);
  }
  // Google: 1080p and 4k exist only for 8 s clips. normalizeClipRequest keeps the duration and drops to 720p, so a
  // high resolution on a short clip here means the normaliser was skipped — refuse rather than guess which to change.
  if (req.resolution !== '720p' && req.durationSec !== 8) {
    throw new VeoPayloadError('resolution', `${req.resolution} requires an 8 s clip (got ${req.durationSec} s)`);
  }
  if (req.seed !== undefined && !(Number.isInteger(req.seed) && req.seed >= 0 && req.seed <= UINT32_MAX)) {
    throw new VeoPayloadError('seed', `seed must be a uint32 (got ${shown(req.seed)})`);
  }

  const references = req.referenceImages ?? [];
  if (references.length > 0) {
    if (references.length > MAX_REFERENCE_IMAGES) {
      throw new VeoPayloadError('referenceImages', `at most ${MAX_REFERENCE_IMAGES} asset reference images (got ${references.length})`);
    }
    // Google documents reference-to-video as its own mode, exclusive with a first / last frame.
    if (req.startImage || req.lastFrame) {
      throw new VeoPayloadError('referenceImages', 'reference images are exclusive with startImage / lastFrame');
    }
    if (req.durationSec !== 8) {
      throw new VeoPayloadError('referenceImages', `reference images require an 8 s clip (got ${req.durationSec} s)`);
    }
    if (req.tier === 'lite') {
      throw new VeoPayloadError('referenceImages', 'Veo 3.1 Lite does not accept reference images');
    }
  }
  // lastFrame is the END of a first→last interpolation; Google has no "last frame only" mode.
  if (req.lastFrame && !req.startImage) {
    throw new VeoPayloadError('lastFrame', 'lastFrame requires startImage');
  }
  return references;
}

function mimeTypeOf(mimeType: unknown, field: MediaField): string {
  // The subtype is Google's to judge (gcs.uploadVeoInput already limits uploads to jpeg/png); a MISSING type is a
  // guaranteed 400, so it is caught here.
  if (typeof mimeType !== 'string' || !mimeType.trim()) {
    throw new VeoPayloadError(field, 'a mimeType is required for every image input');
  }
  return mimeType.trim();
}

function base64Of(base64: unknown, field: MediaField): string {
  if (typeof base64 !== 'string' || !/\S/.test(base64)) {
    throw new VeoPayloadError(field, 'inline image bytes are empty');
  }
  // A data: URL is the commonest wrong value for `bytesBase64Encoded` — Google 400s it. Only the head is inspected.
  if (/^\s*data:/i.test(base64.slice(0, 16))) {
    throw new VeoPayloadError(field, 'inline bytes must be raw base64, not a data: URL');
  }
  return base64;
}

function vertexImage(media: VeoMedia, field: MediaField): VertexImage {
  switch (media.kind) {
    case 'gcs':
      if (typeof media.uri !== 'string' || !GCS_OBJECT_URI.test(media.uri)) {
        throw new VeoPayloadError(field, 'a gcs input must be a gs://bucket/object URI');
      }
      return { gcsUri: media.uri, mimeType: mimeTypeOf(media.mimeType, field) };
    case 'bytes':
      return { bytesBase64Encoded: base64Of(media.base64, field), mimeType: mimeTypeOf(media.mimeType, field) };
    case 'url':
      // Vertex reads only gs:// objects or inline bytes; it never fetches an http(s) URL.
      throw new VeoPayloadError(field, 'Vertex cannot read a URL input — upload it to GCS (gcs.uploadVeoInput) or inline its bytes first');
    default:
      throw new VeoPayloadError(field, `unknown media kind ${shown((media as { kind?: unknown }).kind)}`);
  }
}

function geminiImage(media: VeoMedia, field: MediaField): GeminiImage {
  // The Gemini API has no gs:// access to our bucket and does not fetch URLs: inline bytes are the only proven shape.
  if (media.kind !== 'bytes') {
    throw new VeoPayloadError(field, `the Gemini API takes inline bytes only (got a ${shown((media as { kind?: unknown }).kind)} input)`);
  }
  return { bytesBase64Encoded: base64Of(media.base64, field), mimeType: mimeTypeOf(media.mimeType, field) };
}

/** The prompt as it goes on the wire: trimmed, unless the request asks for it verbatim (V3). */
function wirePrompt(req: VeoClipRequest): string {
  return req.verbatimPrompt === true ? req.prompt : req.prompt.trim();
}

/** The negative prompt as it goes on the wire (verbatim like the prompt); blank → not sent. */
function wireNegative(req: VeoClipRequest): string | undefined {
  const raw = req.negativePrompt;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  return req.verbatimPrompt === true ? raw : raw.trim();
}

/**
 * Vertex AI `predictLongRunning` body (VideoGenerationModelInstance / VideoGenerationModelParams).
 * `url` media is refused — the engine uploads it to GCS (or inlines it) before calling this.
 */
export function buildVertexPayload(req: VeoClipRequest, opts: VertexPayloadOptions = {}): VertexVeoPayload {
  const references = validateClip(req);

  if (req.cameraControl !== undefined) {
    if (!CAMERA_CONTROLS.has(req.cameraControl)) {
      throw new VeoPayloadError('cameraControl', `unknown cameraControl ${shown(req.cameraControl)}`);
    }
    // The REST schema documents cameraControl as applying to image-to-video only.
    if (!req.startImage) {
      throw new VeoPayloadError('cameraControl', 'cameraControl requires startImage');
    }
  }
  if (typeof req.generateAudio !== 'boolean') {
    // Always stated, never left to a model default: it picks the per-second price (with-audio vs video-only rate).
    throw new VeoPayloadError('generateAudio', 'generateAudio must be true or false on Vertex');
  }
  if (opts.storageUri !== undefined && !GCS_PREFIX_URI.test(opts.storageUri)) {
    throw new VeoPayloadError('storageUri', 'storageUri must be a gs://bucket[/prefix] URI');
  }
  const personGeneration = req.personGeneration ?? opts.personGeneration ?? 'allow_adult';
  if (!PERSON_GENERATION.has(personGeneration)) {
    throw new VeoPayloadError('personGeneration', `personGeneration must be allow_all, allow_adult or dont_allow (got ${shown(personGeneration)})`);
  }

  const instance: VertexVeoInstance = { prompt: wirePrompt(req) };
  if (req.startImage) instance.image = vertexImage(req.startImage, 'startImage');
  if (req.lastFrame) instance.lastFrame = vertexImage(req.lastFrame, 'lastFrame');
  if (references.length > 0) {
    instance.referenceImages = references.map((media) => ({ image: vertexImage(media, 'referenceImages'), referenceType: 'asset' }));
  }
  if (req.cameraControl !== undefined) instance.cameraControl = req.cameraControl;

  const negativePrompt = wireNegative(req);
  const parameters: VertexVeoParameters = {
    aspectRatio: req.aspect,
    durationSeconds: req.durationSec,
    resolution: req.resolution,
    // One sample per clip: each extra sample is billed at the full per-second rate.
    sampleCount: 1,
    ...(req.seed !== undefined ? { seed: req.seed } : {}),
    ...(negativePrompt ? { negativePrompt } : {}),
    personGeneration,
    generateAudio: req.generateAudio,
    // Never `false`: Veo 3.x on Vertex fails the whole operation with "Veo 3 prompt enhancement cannot be disabled"
    // (PROVEN 2026-10-08, operation 71e35314-…, GCP Part 0 T1). Omitted means Google's default, which is on; `true` is sent
    // only when asked for. The prompt still leaves us byte-for-byte; the rewrite happens inside Google.
    ...(req.enhancePrompt === true ? { enhancePrompt: true as const } : {}),
    ...(opts.storageUri !== undefined ? { storageUri: opts.storageUri } : {}),
  };
  return { instances: [instance], parameters };
}

/**
 * Gemini API `predictLongRunning` body — the production-proven shape of lib/ai/geminiVeo.ts. Fields this API does
 * not take are never sent: `generateAudio` (audio is always on), `enhancePrompt`, `storageUri`, `sampleCount` and
 * `cameraControl` (Vertex-schema only). The request's own personGeneration is ignored: live-probed 2026-07-25,
 * `allow_all` is the only value this API accepts ('allow_adult' / 'dont_allow' → 400 "not supported").
 */
export function buildGeminiPayload(req: VeoClipRequest): GeminiVeoPayload {
  const references = validateClip(req);

  const instance: GeminiVeoInstance = { prompt: wirePrompt(req) };
  if (req.startImage) instance.image = geminiImage(req.startImage, 'startImage');
  if (req.lastFrame) instance.lastFrame = geminiImage(req.lastFrame, 'lastFrame');
  if (references.length > 0) {
    instance.referenceImages = references.map((media) => ({ image: geminiImage(media, 'referenceImages'), referenceType: 'asset' }));
  }

  const negativePrompt = wireNegative(req);
  const parameters: GeminiVeoParameters = {
    aspectRatio: req.aspect,
    resolution: req.resolution,
    durationSeconds: req.durationSec,
    personGeneration: 'allow_all',
    ...(req.seed !== undefined ? { seed: req.seed } : {}),
    ...(negativePrompt ? { negativePrompt } : {}),
  };
  return { instances: [instance], parameters };
}
