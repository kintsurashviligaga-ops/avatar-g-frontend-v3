/**
 * lib/veo/engine.ts — the ONE create/poll surface the video pipeline calls (docs/VEO_ENGINE.md §3, §5).
 *
 *   veoTransport()   which Google transport renders right now (Vertex AI once configured, else the Gemini API)
 *   createVeoClip()  normalise → gate cameraControl → put media in the transport's shape → submit exactly once
 *   pollVeoClip()    poll by operation name; the name alone says which transport made it, so a job submitted before
 *                    a transport switch keeps polling on the transport that owns it
 *   deliverableUrl() a playable URL for a finished Vertex clip (V4 signed); Gemini/bytes clips are hosted by the caller
 *
 * createVeoClip never re-submits: the transports classify a timed-out / 5xx submit as `ambiguous` (a job may exist
 * and bill), and this module calls a submit function at most once per clip. Retrying a `retryable` outcome is the
 * caller's decision.
 *
 * One log line per createVeoClip — transport, model, shape, adjustment count, outcome and a short URL-free prompt
 * excerpt. Never the full prompt, media, tokens, keys or signed URLs.
 */
import 'server-only';
import { isEnabledByDefault, isTruthyFlag } from '@/lib/env/flag';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { isPublicHttpUrl, readBodyWithCap } from '@/lib/security/allowlistedAudioFetch';
import { DEFAULT_TIER, normalizeClipRequest, resolveModel, type VeoClipAdjustment, type VeoClipInput } from './capabilities';
import { signedReadUrl, uploadVeoInput, VEO_INPUT_FETCH_TIMEOUT_MS, VEO_INPUT_MAX_BYTES, veoOutputPrefix, VeoGcsError } from './gcs';
import { pollGeminiVeo, submitGeminiVeo } from './geminiTransport';
import { vertexConfig, vertexConfigProblems } from './vertexAuth';
import { pollVertexVeo, submitVertexVeo, type VeoCreateFailure } from './vertexClient';
import type { VeoClipRequest, VeoCreateOutcome, VeoFailureReason, VeoMedia, VeoPollOutcome, VeoTier, VeoTransport, VeoVideo } from './types';

export { isGoogleOnly } from './policy';

/** gcs.uploadVeoInput's own limits (one definition), so an input behaves the same whichever transport renders it. */
export { VEO_INPUT_FETCH_TIMEOUT_MS, VEO_INPUT_MAX_BYTES };
const MAX_INPUT_REDIRECTS = 3;
/** Enough of the prompt to recognise a clip in the logs (and a safety refusal's trigger); never the whole prompt. */
const PROMPT_LOG_CHARS = 120;

// ── Transport selection ──────────────────────────────────────────────────────────────────────────────────────────

function forcedTransport(): VeoTransport | null {
  const v = (process.env.VEO_TRANSPORT ?? '').trim().toLowerCase();
  return v === 'vertex' || v === 'gemini' ? v : null;
}

const vertexReady = (): boolean => vertexConfig() !== null;
const geminiReady = (): boolean => !!resolveGeminiKey() && isEnabledByDefault(process.env.GEMINI_VEO_ENABLED);

/**
 * The transport new clips render on. Auto: Vertex once vertexConfig() is complete, else the Gemini API when a key
 * exists and GEMINI_VEO_ENABLED is not off, else null. VEO_TRANSPORT=vertex|gemini pins one transport; a pinned
 * transport that is not ready is null (→ `not_configured`, naming what is missing) rather than a quiet render on the
 * other one — an operator who pins a transport is asserting where clips render and bill.
 */
export function veoTransport(): VeoTransport | null {
  const forced = forcedTransport();
  if (forced === 'vertex') return vertexReady() ? 'vertex' : null;
  if (forced === 'gemini') return geminiReady() ? 'gemini' : null;
  if (vertexReady()) return 'vertex';
  return geminiReady() ? 'gemini' : null;
}

/** Which transport created an operation: `projects/…` is Vertex AI, `models/…` the Gemini API, anything else null. */
export function transportOf(operationName: string): VeoTransport | null {
  if (typeof operationName !== 'string') return null;
  const name = operationName.trim();
  if (name.startsWith('projects/')) return 'vertex';
  if (name.startsWith('models/')) return 'gemini';
  return null;
}

/** Env variable NAMES only (vertexConfigProblems never returns values), so this is safe to log and to show. */
function notConfiguredDetail(): string {
  const forced = forcedTransport();
  const vertexMissing = vertexConfigProblems().join(', ') || 'incomplete';
  const gemini = resolveGeminiKey() ? 'GEMINI_VEO_ENABLED is off' : 'no Gemini API key';
  if (forced === 'vertex') return `VEO_TRANSPORT=vertex but Vertex AI is not configured: ${vertexMissing}`;
  if (forced === 'gemini') return `VEO_TRANSPORT=gemini but ${gemini}`;
  return `no Veo transport: Vertex AI is not configured (${vertexMissing}) and ${gemini}`;
}

// ── Input preparation ────────────────────────────────────────────────────────────────────────────────────────────

type MediaField = 'startImage' | 'lastFrame' | 'referenceImages';
type InputErrorCode = 'invalid_input' | 'blocked_url' | 'too_large' | 'fetch_failed' | 'unsupported_type';

/** Why an input could not be inlined for the Gemini API. Messages name the field, never the URL (it may be signed). */
class VeoInputError extends Error {
  readonly code: InputErrorCode;
  readonly status?: number;
  constructor(code: InputErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'VeoInputError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

function failure(reason: VeoFailureReason, retryable: boolean, detail: string): VeoCreateFailure {
  return { ok: false, reason, retryable, detail };
}

/**
 * An input that could not be prepared → an outcome. Nothing reached Veo, so no job exists: a transient miss (image
 * host timeout / 5xx / 429, a GCS blip) is `unavailable` and retryable; a bad input is `invalid_request`. The status
 * is the image host's or GCS's, not Veo's, so it stays in the detail rather than the outcome's `status`.
 */
function preparationFailure(err: unknown): VeoCreateFailure {
  if (!(err instanceof VeoGcsError) && !(err instanceof VeoInputError)) {
    return failure('invalid_request', false, 'the clip inputs could not be prepared');
  }
  const s = err.status;
  switch (err.code) {
    case 'not_configured':
      return failure('not_configured', false, err.message);
    case 'fetch_failed':
      return s !== undefined && s < 500 && s !== 408 && s !== 429
        ? failure('invalid_request', false, err.message)
        : failure('unavailable', true, err.message);
    case 'storage_failed':
      return s === 401 || s === 403 ? failure('auth', false, err.message) : failure('unavailable', true, err.message);
    default:
      return failure('invalid_request', false, err.message);
  }
}

/** Every media slot of a request mapped through `fn` (in parallel); slots the request does not use stay absent. */
async function mapMedia(
  req: VeoClipRequest,
  fn: (media: VeoMedia, field: MediaField) => Promise<VeoMedia>,
): Promise<VeoClipRequest> {
  const [startImage, lastFrame, referenceImages] = await Promise.all([
    req.startImage ? fn(req.startImage, 'startImage') : Promise.resolve(undefined),
    req.lastFrame ? fn(req.lastFrame, 'lastFrame') : Promise.resolve(undefined),
    req.referenceImages ? Promise.all(req.referenceImages.map((m) => fn(m, 'referenceImages'))) : Promise.resolve(undefined),
  ]);
  return {
    ...req,
    ...(startImage ? { startImage } : {}),
    ...(lastFrame ? { lastFrame } : {}),
    ...(referenceImages ? { referenceImages } : {}),
  };
}

function sniffImage(b: Buffer): 'image/jpeg' | 'image/png' | null {
  if (b.length >= 8 && b[0] === 0x89 && b.toString('latin1', 1, 8) === 'PNG\r\n\x1a\n') return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  return null;
}

/**
 * The mimeType to declare: JPEG/PNG by magic bytes (a CDN's content-type is often generic or wrong); otherwise the
 * declared image/* type, which Google judges — this path has always forwarded it, and refusing here could turn
 * inputs the Gemini API renders into failures. Non-images (and SVG, which is markup) are refused.
 */
function imageMimeType(bytes: Buffer, declared: string | null, field: MediaField): string {
  const sniffed = sniffImage(bytes);
  if (sniffed) return sniffed;
  const label = (declared ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (/^image\/[a-z0-9.+-]+$/.test(label) && label !== 'image/svg+xml') return label;
  throw new VeoInputError('unsupported_type', `${field}: the input is not a JPEG or PNG image`);
}

function decodeBase64Capped(base64: string, field: MediaField): Buffer {
  // Refuse by the encoded length before allocating (4 chars → 3 bytes, slack for line-wrapped base64).
  if (base64.length > Math.ceil(VEO_INPUT_MAX_BYTES / 3) * 4 * 1.05 + 16) {
    throw new VeoInputError('too_large', `${field}: the image exceeds 20 MB`);
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > VEO_INPUT_MAX_BYTES) throw new VeoInputError('too_large', `${field}: the image exceeds 20 MB`);
  if (bytes.length === 0) throw new VeoInputError('invalid_input', `${field}: the image is empty`);
  return bytes;
}

function bytesFromDataUrl(dataUrl: string, field: MediaField): VeoMedia & { kind: 'bytes' } {
  const comma = dataUrl.indexOf(',');
  const params = comma > 5 ? dataUrl.slice(5, comma).split(';') : [];
  if (comma < 0 || !params.slice(1).some((p) => p.trim().toLowerCase() === 'base64')) {
    throw new VeoInputError('invalid_input', `${field}: only base64 data URLs are accepted`);
  }
  const bytes = decodeBase64Capped(dataUrl.slice(comma + 1), field);
  return { kind: 'bytes', base64: bytes.toString('base64'), mimeType: imageMimeType(bytes, params[0] ?? null, field) };
}

const isTimeout = (err: unknown): boolean => {
  const name = err && typeof err === 'object' ? (err as { name?: unknown }).name : undefined;
  return name === 'TimeoutError' || name === 'AbortError';
};

/**
 * Download a caller's https image for the Gemini API, which takes inline bytes only. isPublicHttpUrl vets one URL,
 * so redirects are followed manually and every hop is re-vetted (a public host 302-ing to 169.254.169.254 is refused,
 * not fetched). One 15 s deadline spans every hop and the body, which is read under the 20 MB cap as it streams.
 */
async function fetchImageBytes(rawUrl: string, field: MediaField): Promise<VeoMedia & { kind: 'bytes' }> {
  const signal = AbortSignal.timeout(VEO_INPUT_FETCH_TIMEOUT_MS);
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_INPUT_REDIRECTS; hop++) {
    if (!/^https:\/\//i.test(current) || !isPublicHttpUrl(current)) {
      throw new VeoInputError('blocked_url', `${field}: the image URL must be a public https URL`);
    }
    let res: Response;
    try {
      res = await fetch(current, { redirect: 'manual', signal, cache: 'no-store', headers: { accept: 'image/jpeg, image/png, image/*;q=0.8' } });
    } catch (err) {
      throw new VeoInputError('fetch_failed', `${field}: image download ${isTimeout(err) || signal.aborted ? 'timed out after 15 s' : 'failed (network error)'}`);
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      await res.body?.cancel().catch(() => undefined);
      if (!location) throw new VeoInputError('fetch_failed', `${field}: image download got HTTP ${res.status} without a Location`, res.status);
      try {
        current = new URL(location, current).toString();
      } catch {
        throw new VeoInputError('fetch_failed', `${field}: image download got a malformed redirect`, res.status);
      }
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new VeoInputError('fetch_failed', `${field}: image download failed: HTTP ${res.status}`, res.status);
    }
    const bytes = await readBodyWithCap(res, VEO_INPUT_MAX_BYTES);
    if (!bytes) {
      throw signal.aborted
        ? new VeoInputError('fetch_failed', `${field}: image download timed out after 15 s`)
        : new VeoInputError('too_large', `${field}: the image exceeds 20 MB`);
    }
    if (bytes.length === 0) throw new VeoInputError('invalid_input', `${field}: the image is empty`);
    return { kind: 'bytes', base64: bytes.toString('base64'), mimeType: imageMimeType(bytes, res.headers.get('content-type'), field) };
  }
  throw new VeoInputError('fetch_failed', `${field}: image download exceeded ${MAX_INPUT_REDIRECTS} redirects`);
}

/** The Gemini API reads inline bytes only: url → downloaded bytes; gs:// → refused (it has no access to our bucket). */
async function inlineForGemini(media: VeoMedia, field: MediaField): Promise<VeoMedia> {
  if (media.kind === 'bytes') return media;
  if (media.kind === 'gcs') {
    throw new VeoInputError('invalid_input', `${field}: the Gemini API cannot read gs:// inputs — pass bytes or an https URL`);
  }
  const url = typeof media.url === 'string' ? media.url.trim() : '';
  return /^data:/i.test(url) ? bytesFromDataUrl(url, field) : fetchImageBytes(url, field);
}

// ── Create ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CreateVeoClipInput {
  /** The contract's `Partial<VeoClipRequest> & { prompt, aspect }` (capabilities.VeoClipInput also takes 1:1 / 4:5 and any length). */
  request: VeoClipInput;
  /** Quality tier; picks the model. Defaults to request.tier, then 'standard'. */
  tier?: VeoTier;
  /** Groups a film's GCS inputs/outputs (sanitised by gcs.ts). */
  sessionId: string;
  /** The scene index — part of the Vertex output prefix. */
  ordinal: number;
}

export interface CreateVeoClipResult {
  outcome: VeoCreateOutcome;
  /**
   * The request as normalised and camera-gated — what was (or would have been) rendered, for the UI and the cost
   * estimate. Media is as the caller supplied it: the uploaded gs:// copies and downloaded base64 exist only in the
   * submitted body, so a result that gets persisted or logged never carries a stranger's image bytes.
   */
  request: VeoClipRequest;
  /** Every change normalisation and the camera gate made (capabilities.VeoClipAdjustment: also covers startImage / seed). */
  adjustments: VeoClipAdjustment[];
  /** The model id submitted to; '' when no transport is configured. */
  model: string;
  transport: VeoTransport | null;
}

function promptExcerpt(prompt: string): string {
  const flat = String(prompt ?? '')
    .replace(/\b(?:https?|gs|data):\S+/gi, '[url]')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > PROMPT_LOG_CHARS ? `${flat.slice(0, PROMPT_LOG_CHARS)}…` : flat;
}

/**
 * console.warn even for a success: next.config.js compiles every non-development build (production AND jest) with
 * `removeConsole: { exclude: ['error', 'warn'] }`, so a console.info/log line is stripped and never reaches the
 * Vercel logs this line exists for.
 */
function logSubmit(result: CreateVeoClipResult): void {
  const { outcome: o, request: r } = result;
  const verdict = o.ok ? 'ok' : `${o.reason}${o.status !== undefined ? ` http=${o.status}` : ''} retryable=${o.retryable}`;
  console.warn(
    `[veo] submit transport=${result.transport ?? 'none'} model=${result.model || 'none'} aspect=${r.aspect} ` +
      `duration=${r.durationSec}s resolution=${r.resolution} adjustments=${result.adjustments.length} → ${verdict} ` +
      `prompt=${JSON.stringify(promptExcerpt(r.prompt))}`,
  );
}

async function submitViaVertex(request: VeoClipRequest, model: string, input: CreateVeoClipInput): Promise<VeoCreateOutcome> {
  const cfg = vertexConfig();
  if (!cfg) return failure('not_configured', false, notConfiguredDetail());
  let prepared: VeoClipRequest;
  let storageUri: string;
  try {
    // A fresh output prefix per attempt: a re-render never finds an earlier attempt's sample_0.mp4.
    storageUri = veoOutputPrefix(input.sessionId, input.ordinal);
    // Inputs travel as gs:// objects, so no base64 rides in the predictLongRunning body (gcs passes through as-is).
    prepared = await mapMedia(request, (media) => uploadVeoInput(media, { sessionId: input.sessionId }));
  } catch (err) {
    return preparationFailure(err);
  }
  return submitVertexVeo(prepared, cfg, { model, storageUri });
}

async function submitViaGemini(request: VeoClipRequest, model: string): Promise<VeoCreateOutcome> {
  let prepared: VeoClipRequest;
  try {
    prepared = await mapMedia(request, inlineForGemini);
  } catch (err) {
    return preparationFailure(err);
  }
  return submitGeminiVeo(prepared, { model });
}

/**
 * Submit one clip on the current transport. Never throws; never submits twice. Steps:
 *   1. transport + model (tier → capabilities.resolveModel);
 *   2. capabilities.normalizeClipRequest for that model and transport (adjustments recorded);
 *   3. native cameraControl kept only when VEO_NATIVE_CAMERA_CONTROL is on — it is undocumented for Veo 3.x, so the
 *      default is the prompt's camera language alone (normalisation already dropped it without a first frame / off
 *      Vertex);
 *   4. media in the transport's shape (Vertex: uploaded to GCS + an output prefix; Gemini: inline bytes);
 *   5. exactly one submit.
 */
export async function createVeoClip(input: CreateVeoClipInput): Promise<CreateVeoClipResult> {
  const tier = input.tier ?? input.request.tier ?? DEFAULT_TIER;
  const transport = veoTransport();
  if (!transport) {
    const { request, adjustments } = normalizeClipRequest(input.request, resolveModel('gemini', tier));
    const result: CreateVeoClipResult = {
      outcome: failure('not_configured', false, notConfiguredDetail()),
      request,
      adjustments,
      model: '',
      transport: null,
    };
    logSubmit(result);
    return result;
  }

  const model = resolveModel(transport, tier);
  const normalized = normalizeClipRequest(input.request, model, transport);
  const adjustments = [...normalized.adjustments];
  let request = normalized.request;
  if (request.cameraControl !== undefined && !isTruthyFlag(process.env.VEO_NATIVE_CAMERA_CONTROL)) {
    adjustments.push({
      field: 'cameraControl',
      from: request.cameraControl,
      to: null,
      reason: 'Native cameraControl is opt-in (VEO_NATIVE_CAMERA_CONTROL=1); the camera move stays in the prompt',
    });
    const { cameraControl: _cameraControl, ...withoutCamera } = request;
    request = withoutCamera;
  }

  const outcome = transport === 'vertex' ? await submitViaVertex(request, model, input) : await submitViaGemini(request, model);
  const result: CreateVeoClipResult = { outcome, request, adjustments, model, transport };
  logSubmit(result);
  return result;
}

// ── Poll / deliver ───────────────────────────────────────────────────────────────────────────────────────────────

/** Poll once, on the transport that created the operation (see transportOf). An unknown name is `failed`. */
export async function pollVeoClip(operationName: string): Promise<VeoPollOutcome> {
  switch (transportOf(operationName)) {
    case 'vertex':
      return pollVertexVeo(operationName.trim());
    case 'gemini':
      return pollGeminiVeo(operationName.trim());
    default:
      return { state: 'failed', reason: 'not a Veo operation name' };
  }
}

/**
 * A URL a browser can play: a V4 signed read URL (default 1 h, clamped to 60 s…7 d) for a Vertex `gcs` clip — a
 * bearer credential, never log it. Null for `gemini-file` (downloadable only with the key → the caller downloads it
 * with geminiTransport.downloadGeminiVideo and hosts it) and `bytes` (the caller hosts them). Signing errors throw
 * gcs.VeoGcsError: a null here would read as "host it yourself" for a clip the caller has no bytes of.
 */
export async function deliverableUrl(video: VeoVideo, ttlSec?: number): Promise<string | null> {
  if (video.kind === 'gcs') return signedReadUrl(video.gcsUri, ttlSec);
  return null;
}
