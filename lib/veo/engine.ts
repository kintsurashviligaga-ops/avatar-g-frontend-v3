/**
 * lib/veo/engine.ts — the ONE create/poll surface the video pipeline calls (docs/VEO_ENGINE.md §3, §5).
 *
 *   veoTransport()   Vertex AI once configured, else null — MASTER TASK v3.1: new clips never render on the Gemini
 *                    Developer API (an unset VEO_TRANSPORT, or a key, never selects it)
 *   createVeoClip()  normalise → gate cameraControl → upload media to GCS → submit exactly once
 *   pollVeoClip()    poll by operation name on Vertex AI. A historical `models/…` name (made on the Developer API
 *                    before v3.1) is answered `failed` without calling that API; the name itself is left untouched
 *   deliverableUrl() a playable URL for a finished Vertex clip (V4 signed); bytes clips are hosted by the caller
 *
 * createVeoClip never re-submits: the transports classify a timed-out / 5xx submit as `ambiguous` (a job may exist
 * and bill), and this module calls a submit function at most once per clip. Retrying a `retryable` outcome is the
 * caller's decision.
 *
 * One log line per createVeoClip — transport, model, shape, adjustment count, outcome and a short URL-free prompt
 * excerpt. Never the full prompt, media, tokens, keys or signed URLs.
 */
import 'server-only';
import { createHash } from 'node:crypto';
import { isTruthyFlag } from '@/lib/env/flag';
import { DEFAULT_TIER, estimateClipCostUsd, normalizeClipRequest, resolveModel, type VeoClipAdjustment, type VeoClipInput } from './capabilities';
import { releaseVeoSpend, reserveVeoSpend, veoCapRefusalDetail } from './dailyCap';
import { signedReadUrl, uploadVeoInput, VEO_INPUT_FETCH_TIMEOUT_MS, VEO_INPUT_MAX_BYTES, veoOutputPrefix, VeoGcsError } from './gcs';
import { vertexConfig, vertexConfigProblems } from './vertexAuth';
import { pollVertexVeo, submitVertexVeo, type VeoCreateFailure } from './vertexClient';
import type { VeoClipRequest, VeoCreateOutcome, VeoFailureReason, VeoMedia, VeoPollOutcome, VeoTier, VeoTransport, VeoVideo } from './types';
import type { VeoSubmissionEvidence, VeoSubmissionJournal } from './submissionJournal';

export { isGoogleOnly } from './policy';

/** gcs.uploadVeoInput's own limits (one definition), re-exported for callers that check an input before submitting. */
export { VEO_INPUT_FETCH_TIMEOUT_MS, VEO_INPUT_MAX_BYTES };
/** Enough of the prompt to recognise a clip in the logs (and a safety refusal's trigger); never the whole prompt. */
const PROMPT_LOG_CHARS = 120;

// ── Transport selection ──────────────────────────────────────────────────────────────────────────────────────────

function forcedTransport(): VeoTransport | 'invalid' | null {
  const v = (process.env.VEO_TRANSPORT ?? '').trim().toLowerCase();
  if (!v || v === 'auto') return null;
  return v === 'vertex' || v === 'gemini' ? v : 'invalid';
}

/** Configuration names only: an invalid value may itself contain a misplaced credential. */
export function veoTransportConfigProblem(): string | null {
  return forcedTransport() === 'invalid' ? 'VEO_TRANSPORT must be vertex, gemini, auto or unset' : null;
}

/** What a VEO_TRANSPORT=gemini pin is told: the policy, not a missing variable. */
export const VEO_DEVELOPER_API_REFUSED = 'VEO_TRANSPORT=gemini asks for the Gemini Developer API, which is not an allowed transport (v3.1)';

/**
 * The transport new clips render on: Vertex AI once vertexConfig() is complete, else null (→ `not_configured`, naming
 * what is missing). VEO_TRANSPORT unset, `auto` or `vertex` all mean Vertex AI; `gemini` (the Developer API) is
 * refused rather than honoured, and so is any unknown value. No key, flag or unset variable selects the Developer API.
 */
export function veoTransport(): 'vertex' | null {
  const forced = forcedTransport();
  if (forced === 'invalid' || forced === 'gemini') return null;
  return vertexConfig() !== null ? 'vertex' : null;
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
export function veoNotConfiguredDetail(): string {
  const invalid = veoTransportConfigProblem();
  if (invalid) return invalid;
  if (forcedTransport() === 'gemini') return VEO_DEVELOPER_API_REFUSED;
  return `Vertex AI is not configured for Veo: ${vertexConfigProblems().join(', ') || 'incomplete'}`;
}

// ── Input preparation ────────────────────────────────────────────────────────────────────────────────────────────

type MediaField = 'startImage' | 'lastFrame' | 'referenceImages';

function failure(reason: VeoFailureReason, retryable: boolean, detail: string): VeoCreateFailure {
  return { ok: false, reason, retryable, detail };
}

/**
 * An input that could not be prepared → an outcome. Nothing reached Veo, so no job exists: a transient miss (image
 * host timeout / 5xx / 429, a GCS blip) is `unavailable` and retryable; a bad input is `invalid_request`. The status
 * is the image host's or GCS's, not Veo's, so it stays in the detail rather than the outcome's `status`.
 */
function preparationFailure(err: unknown): VeoCreateFailure {
  if (!(err instanceof VeoGcsError)) {
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
  /** Internal durable-run hook. Never accepted from request JSON. */
  submissionJournal?: VeoSubmissionJournal;
}

export interface CreateVeoClipResult {
  outcome: VeoCreateOutcome;
  /**
   * The request as normalised and camera-gated — what was (or would have been) rendered, for the UI and the cost
   * estimate. Media is as the caller supplied it: the uploaded gs:// copies exist only in the submitted body, so a
   * result that gets persisted or logged never carries a stranger's image.
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
  // The operation name is not a secret (reading it needs the deployment's own credentials), and it is the only handle on
  // a billed job whose caller went away before polling it.
  const verdict = o.ok
    ? `ok op=${o.operation.name}`
    : `${o.reason}${o.status !== undefined ? ` http=${o.status}` : ''} retryable=${o.retryable}`;
  console.warn(
    `[veo] submit transport=${result.transport ?? 'none'} model=${result.model || 'none'} aspect=${r.aspect} ` +
      `duration=${r.durationSec}s resolution=${r.resolution} adjustments=${result.adjustments.length} → ${verdict} ` +
      `prompt=${JSON.stringify(promptExcerpt(r.prompt))}`,
  );
}

async function submitViaVertex(request: VeoClipRequest, model: string, input: CreateVeoClipInput, cfg: ReturnType<typeof vertexConfig>, storageUri: string, beforeSubmit?: (body: string) => Promise<boolean>): Promise<VeoCreateOutcome> {
  if (!cfg) return failure('not_configured', false, veoNotConfiguredDetail());
  let prepared: VeoClipRequest;
  try {
    // Inputs travel as gs:// objects, so no base64 rides in the predictLongRunning body (gcs passes through as-is).
    prepared = await mapMedia(request, (media) => uploadVeoInput(media, { sessionId: input.sessionId }));
  } catch (err) {
    return preparationFailure(err);
  }
  return submitVertexVeo(prepared, cfg, { model, storageUri, beforeSubmit });
}

/**
 * Submit one clip on the current transport. Never throws; never submits twice. Steps:
 *   1. transport + model (tier → capabilities.resolveModel);
 *   2. capabilities.normalizeClipRequest for that model and transport (adjustments recorded);
 *   3. native cameraControl kept only when VEO_NATIVE_CAMERA_CONTROL is on — it is undocumented for Veo 3.x, so the
 *      default is the prompt's camera language alone (normalisation already dropped it without a first frame);
 *   4. the daily Veo ceiling (dailyCap.ts, VEO_DAILY_LIMIT_USD): the clip's price reserved, or a `quota` refusal with no submit;
 *   5. media uploaded to GCS, plus an output prefix;
 *   6. exactly one submit.
 */
export async function createVeoClip(input: CreateVeoClipInput): Promise<CreateVeoClipResult> {
  const tier = input.tier ?? input.request.tier ?? DEFAULT_TIER;
  const transport = veoTransport();
  if (!transport) {
    const { request, adjustments } = normalizeClipRequest(input.request, resolveModel('vertex', tier));
    const result: CreateVeoClipResult = {
      outcome: failure('not_configured', false, veoNotConfiguredDetail()),
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

  // Capture output location/request before any input upload or provider POST. Hooks receive no media or credentials.
  const selectedConfig = vertexConfig();
  const cfg = selectedConfig ? { ...selectedConfig, auth: { ...selectedConfig.auth } } : null;
  const sameConfig = () => !cfg || JSON.stringify(vertexConfig()) === JSON.stringify(cfg);
  let storageUri = '';
  let evidence: VeoSubmissionEvidence | undefined;
  const persist = async (value: VeoSubmissionEvidence): Promise<boolean> => {
    if (!input.submissionJournal) return true;
    try { return (await input.submissionJournal(Object.freeze({ ...value }))) === true; } catch { return false; }
  };
  try {
    // Clone before awaiting caller code: fingerprint and execution share this owned request snapshot.
    if (input.submissionJournal) request = JSON.parse(JSON.stringify(request)) as VeoClipRequest;
    if (!cfg) throw new Error('missing configuration');
    storageUri = veoOutputPrefix(input.sessionId, input.ordinal, cfg);
    if (input.submissionJournal) evidence = { schema: 1, phase: 'prepared', transport, model,
      requestSha256: createHash('sha256').update(JSON.stringify(request)).digest('hex'),
      estimatedUsd: estimateClipCostUsd(request, model, transport),
      projectId: cfg.projectId, location: cfg.location, outputPrefix: storageUri,
    };
  } catch {
    return { outcome: failure('not_configured', false, 'The submission could not be prepared'), request, adjustments, model, transport };
  }
  if (evidence && !(await persist(evidence))) {
    return { outcome: failure('invalid_request', false, 'The submission journal refused this attempt before preparation'), request, adjustments, model, transport };
  }
  if (!sameConfig()) return { outcome: failure('invalid_request', false, 'Vertex configuration changed before input preparation'), request, adjustments, model, transport };
  const preparedEvidence = evidence;
  const beforeSubmit = preparedEvidence ? async (body: string) => sameConfig()
    && await persist({ ...preparedEvidence, phase: 'posting', bodySha256: createHash('sha256').update(body).digest('hex') })
    && sameConfig() : undefined;

  // The daily Veo ceiling (dailyCap.ts): reserved at this clip's exact price BEFORE the submit, so no caller can reach Google
  // around it. A refusal creates nothing and bills nothing, and reads as Veo's own non-retryable `quota` failure.
  const cap = await reserveVeoSpend(estimateClipCostUsd(request, model, transport));
  if (!cap.ok) {
    const refused: CreateVeoClipResult = { outcome: failure('quota', false, veoCapRefusalDetail(cap)), request, adjustments, model, transport };
    logSubmit(refused);
    return refused;
  }

  const outcome = await submitViaVertex(request, model, input, cfg, storageUri, beforeSubmit);
  // Google provably created no job (anything but `ambiguous`) → the reservation goes back; an ambiguous submit may bill.
  if (!outcome.ok && outcome.reason !== 'ambiguous') await releaseVeoSpend(cap);
  const result: CreateVeoClipResult = { outcome, request, adjustments, model, transport };
  logSubmit(result);
  return result;
}

// ── Poll / deliver ───────────────────────────────────────────────────────────────────────────────────────────────

/** Why a historical Developer API operation is not polled (its name and any stored asset are left as they are). */
export const VEO_DEVELOPER_API_OPERATION = 'made on the Gemini Developer API, which is no longer called (v3.1)';

/**
 * Poll once on Vertex AI. A `models/…` name was made on the Gemini Developer API before v3.1: it is `failed` without
 * calling that API (a deployment with no AI Studio key answered the same way before). An unknown name is `failed`.
 */
export async function pollVeoClip(operationName: string): Promise<VeoPollOutcome> {
  switch (transportOf(operationName)) {
    case 'vertex':
      return pollVertexVeo(operationName.trim());
    case 'gemini':
      return { state: 'failed', reason: VEO_DEVELOPER_API_OPERATION };
    default:
      return { state: 'failed', reason: 'not a Veo operation name' };
  }
}

/**
 * A URL a browser can play: a V4 signed read URL (default 1 h, clamped to 60 s…7 d) for a Vertex `gcs` clip — a
 * bearer credential, never log it. Null for `bytes` (the caller hosts them) and for a historical `gemini-file` (only
 * the Developer API could serve it, and v3.1 no longer calls it). Signing errors throw
 * gcs.VeoGcsError: a null here would read as "host it yourself" for a clip the caller has no bytes of.
 */
export async function deliverableUrl(video: VeoVideo, ttlSec?: number): Promise<string | null> {
  if (video.kind === 'gcs') return signedReadUrl(video.gcsUri, ttlSec);
  return null;
}
