/**
 * lib/video/director/googleVeoProvider.ts — GoogleVeoProvider, the ONLY VideoGenProvider (V1): one frozen shot → one
 * Veo clip through lib/veo/engine, or a ShotError that says exactly why not (V5). No other vendor, no fallback, no
 * retry: a miss is returned to the director, which stops and asks the user.
 *
 * A thin wrapper. What it adds to the engine is the refusal to let anything change a shot on the way to Google:
 *
 *   • The prompt goes to the engine byte-for-byte (V3): no trim, translation, prefix, suffix or framing hint.
 *     Vertex's enhancePrompt is never requested. Veo 3.x still rewrites server-side and refuses an explicit `false`
 *     (PROVEN 2026-10-08, GCP Part 0 T1), so V3 holds on the wire, not inside Google's model.
 *   • Seed and reference image: the shot's own value, else the consistency lock's (Objective A, V4).
 *   • PREFLIGHT, before any money is spent. createVeoClip normalises a request to what the model can do — it snaps
 *     5 s to 6 s, renders 1:1 as 16:9, drops a reference image on Lite, coerces a seed — and reports it only AFTER the
 *     submit. So the same normalizeClipRequest runs here first, and any adjustment at all is a ShotError instead
 *     of a silently different clip (V6). Then the port says what its transport would put on the wire
 *     (VeoEnginePort.wire; the live port answers with lib/veo/payload's own builders), and a prompt, negative
 *     prompt, seed or reference that would not arrive exactly as frozen is a ShotError too.
 *
 * lib/veo/payload trims the prompt and the negative prompt for every other caller; the director's requests carry
 * `verbatimPrompt: true`, so a prompt with surrounding whitespace goes out as written. The preflight still compares
 * the wire against the frozen shot, so any future rewrite in the payload is refused here instead of sent.
 *
 * ⚠️ NEVER RE-SUBMITS. One createClip per call. Veo has no cancel: a cancellation stops the waiting, not a job
 * Google already accepted (it may still bill). A timed-out / ambiguous submit is reported, never re-POSTed.
 *
 * The engine is injected (VeoEnginePort) so this module stays pure — no 'server-only', no network, no keys — and is
 * fully testable with a fake engine. ./server.ts binds the live port to lib/veo/engine.
 */
import { normalizeClipRequest, resolveModel } from '@/lib/veo/capabilities';
import type { CreateVeoClipInput, CreateVeoClipResult } from '@/lib/veo/engine';
import { buildGeminiPayload, buildVertexPayload, VeoPayloadError } from '@/lib/veo/payload';
import type { VeoAspect, VeoClipRequest, VeoCreateOutcome, VeoMedia, VeoPollOutcome, VeoTier, VeoTransport, VeoVideo } from '@/lib/veo/types';
import { isSupportedReferenceImage, VEO_ASPECT_RATIOS, VEO_QUALITIES } from './storyboard';
import type {
  CancellationToken,
  Shot,
  ShotError,
  ShotErrorReason,
  ShotGenerationInput,
  ShotGenerationResult,
  ShotMetadata,
  VideoGenProvider,
} from './types';

// ── The engine port ──────────────────────────────────────────────────────────────────────────────────────────────

/** What the transport would send for the fields V3/V4 protect. */
export interface VeoWireFields {
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  referenceImageCount: number;
  /** Vertex `enhancePrompt: true` on the wire — asking Google to rewrite the prompt. Must be false (payload.ts never sends `false`). */
  enhancePrompt: boolean;
}

export interface VeoDeliveryContext {
  storyboardId: string;
  shotId: string;
  order: number;
  operationName: string;
  /** The native frame Veo rendered. */
  aspect: VeoAspect;
}

/** lib/veo/engine as the provider uses it. ./server.ts has the live binding; tests pass a fake. */
export interface VeoEnginePort {
  /** engine.veoTransport — null when no Google transport is configured. */
  transport(): VeoTransport | null;
  /** engine.createVeoClip (the live port runs it inside the platform budget guard). Submits at most once. */
  createClip(input: CreateVeoClipInput, ctx: { userId?: string | null }): Promise<CreateVeoClipResult>;
  /** engine.pollVeoClip — one poll. */
  pollClip(operationName: string): Promise<VeoPollOutcome>;
  /** A playable URL for a finished clip in our own storage; null when it cannot be delivered. */
  deliver(video: VeoVideo, ctx: VeoDeliveryContext): Promise<string | null>;
  /** What this transport puts on the wire for `request` (may throw VeoPayloadError). */
  wire(request: VeoClipRequest, transport: VeoTransport): VeoWireFields;
  /** The wait between polls. */
  sleep(ms: number): Promise<void>;
}

/** Media is replaced by a placeholder: the wire check is about the text and numbers, and must never fetch an image. */
const PROBE_IMAGE: VeoMedia = { kind: 'bytes', base64: 'iVBORw0KGgo=', mimeType: 'image/png' };

/**
 * The live answer to VeoEnginePort.wire: lib/veo/payload's own builders — the last code that touches the request
 * before the POST — so this check follows payload.ts if it ever changes, instead of restating its rules here.
 */
export function veoWireFields(request: VeoClipRequest, transport: VeoTransport): VeoWireFields {
  const probe: VeoClipRequest = {
    ...request,
    ...(request.startImage ? { startImage: PROBE_IMAGE } : {}),
    ...(request.lastFrame ? { lastFrame: PROBE_IMAGE } : {}),
    ...(request.referenceImages ? { referenceImages: request.referenceImages.map(() => PROBE_IMAGE) } : {}),
  };
  if (transport === 'vertex') {
    const { instances, parameters } = buildVertexPayload(probe);
    return {
      prompt: instances[0].prompt,
      negativePrompt: parameters.negativePrompt,
      seed: parameters.seed,
      referenceImageCount: instances[0].referenceImages?.length ?? 0,
      enhancePrompt: parameters.enhancePrompt === true,
    };
  }
  const { instances, parameters } = buildGeminiPayload(probe);
  return {
    prompt: instances[0].prompt,
    negativePrompt: parameters.negativePrompt,
    seed: parameters.seed,
    referenceImageCount: instances[0].referenceImages?.length ?? 0,
    // The Gemini API body carries no enhancePrompt (payload.ts never sends it).
    enhancePrompt: false,
  };
}

// ── Errors ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Thrown (not returned) on cancellation: it is the user's stop, not one of V5's eight shot failures. */
export class ShotCancelledError extends Error {
  readonly shotId: string;
  constructor(shotId: string) {
    super(`cancelled before shot "${shotId}" finished`);
    this.name = 'ShotCancelledError';
    this.shotId = shotId;
  }
}

/** veoRawResponse is for a human reading the failure, not a dump: short, one line, no URL (it may be signed). */
const RAW_MAX_CHARS = 300;

function rawExcerpt(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const flat = text
    .replace(/\b(?:https?|gs|data):\S+/gi, '[url]')
    .replace(/\s+/g, ' ')
    .trim();
  if (!flat) return undefined;
  return flat.length > RAW_MAX_CHARS ? `${flat.slice(0, RAW_MAX_CHARS)}…` : flat;
}

function shotError(shotId: string, reason: ShotErrorReason, message: string, retryable: boolean, raw?: string): ShotError {
  const veoRawResponse = rawExcerpt(raw);
  return { shotId, reason, message, retryable, ...(veoRawResponse ? { veoRawResponse } : {}) };
}

/** A request field (normalisation adjustment or VeoPayloadError) → the reason a user can act on. */
const FIELD_REASON: Readonly<Record<string, ShotErrorReason>> = {
  aspect: 'invalid_dimension',
  resolution: 'invalid_dimension',
  durationSec: 'invalid_duration',
  seed: 'seed_conflict',
  referenceImages: 'reference_image_issue',
  startImage: 'reference_image_issue',
  lastFrame: 'reference_image_issue',
};

const reasonForField = (field: string): ShotErrorReason => FIELD_REASON[field] ?? 'unknown';

/** Google's and the engine's details name the field they are about; the most specific one wins. */
function reasonFromDetail(detail: string | undefined): ShotErrorReason | null {
  if (!detail) return null;
  if (/\b(?:referenceImages|startImage|lastFrame)\b|\breference image|\bimage\b/i.test(detail)) return 'reference_image_issue';
  if (/\bseed\b/i.test(detail)) return 'seed_conflict';
  if (/\bduration/i.test(detail)) return 'invalid_duration';
  if (/\b(?:aspect|resolution|dimension)/i.test(detail)) return 'invalid_dimension';
  return null;
}

type CreateFailure = Extract<VeoCreateOutcome, { ok: false }>;

function submitError(shotId: string, o: CreateFailure): ShotError {
  const raw = o.detail ?? (o.status !== undefined ? `HTTP ${o.status}` : undefined);
  const engineRetryable = o.retryable;
  switch (o.reason) {
    case 'safety':
      return shotError(shotId, 'prompt_safety', "Veo refused this shot under Google's safety rules. Change the prompt or image and retry.", false, raw);
    case 'rate_limited':
      return shotError(shotId, 'rate_limit', 'Veo is rate-limiting requests. Nothing was rendered; retry in a minute.', true, raw);
    case 'quota':
      return shotError(shotId, 'rate_limit', 'The Veo quota or the platform budget is exhausted. Nothing was rendered; a retry fails until it is restored.', false, raw);
    case 'unavailable': {
      const reason = reasonFromDetail(o.detail) === 'reference_image_issue' ? 'reference_image_issue' : 'veo_internal';
      return shotError(shotId, reason, reason === 'reference_image_issue'
        ? 'The reference image could not be fetched right now. Nothing was rendered; retry shortly.'
        : 'Veo is temporarily unavailable. Nothing was rendered; retry shortly.', true, raw);
    }
    case 'ambiguous':
      return shotError(shotId, 'veo_internal', 'Veo did not answer the submit. It may still render (and bill) this clip; a retry renders a second one.', engineRetryable, raw);
    case 'invalid_request':
      return shotError(shotId, reasonFromDetail(o.detail) ?? 'unknown', 'Veo rejected the request for this shot.', false, raw);
    case 'auth':
      return shotError(shotId, 'unknown', 'The Veo credentials were refused — a configuration problem, not the shot.', false, raw);
    case 'not_configured':
      return shotError(shotId, 'unknown', 'No Veo transport is configured.', false, raw);
    default:
      return shotError(shotId, 'unknown', 'Veo did not accept the shot.', engineRetryable, raw);
  }
}

function pollError(shotId: string, o: Exclude<VeoPollOutcome, { state: 'processing' } | { state: 'succeeded' }>): ShotError {
  if (o.state === 'filtered') {
    const codes = o.supportCodes.length > 0 ? ` (support codes ${o.supportCodes.join(', ')})` : '';
    const reason = /\b(?:image|photo|reference)\b/i.test(o.reason) ? 'reference_image_issue' : 'prompt_safety';
    return shotError(shotId, reason, `Google's safety filters blocked this clip${codes}. Change the ${reason === 'prompt_safety' ? 'prompt' : 'reference image'} and retry.`, false, o.reason);
  }
  const code = o.code;
  if (code === 8 || code === 429) return shotError(shotId, 'rate_limit', 'Veo ran out of capacity for this clip. Retry in a minute.', true, o.reason);
  if (code === 3 || code === 400) return shotError(shotId, reasonFromDetail(o.reason) ?? 'unknown', 'Veo rejected this shot while rendering it.', false, o.reason);
  if (code === 404) return shotError(shotId, 'veo_internal', 'Veo no longer knows this render (expired or unknown). Retry renders it again.', true, o.reason);
  return shotError(shotId, 'veo_internal', 'Veo failed while rendering this clip.', true, o.reason);
}

// ── The provider ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Veo takes about a minute per clip; polling faster only burns quota (the cadence every other Veo caller uses). */
export const VEO_POLL_INTERVAL_MS = 5_000;
/** Generous: Vertex can queue a clip for several minutes under load. */
export const VEO_MAX_WAIT_MS = 10 * 60_000;

export interface GoogleVeoProviderOptions {
  engine: VeoEnginePort;
  pollIntervalMs?: number;
  maxWaitMs?: number;
}

const isUint32 = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffff_ffff;

export class GoogleVeoProvider implements VideoGenProvider {
  readonly providerName = 'google_veo' as const;
  private readonly engine: VeoEnginePort;
  private readonly pollIntervalMs: number;
  private readonly maxPolls: number;

  constructor(opts: GoogleVeoProviderOptions) {
    this.engine = opts.engine;
    this.pollIntervalMs = opts.pollIntervalMs ?? VEO_POLL_INTERVAL_MS;
    // A poll budget rather than a wall clock: the wait is the engine's sleep, so a fake engine runs it instantly.
    this.maxPolls = Math.max(1, Math.ceil((opts.maxWaitMs ?? VEO_MAX_WAIT_MS) / Math.max(1, this.pollIntervalMs)));
  }

  async generateShot(input: ShotGenerationInput, cancellation?: CancellationToken): Promise<ShotGenerationResult> {
    const { shot, consistencyLock: lock, storyboardId } = input;
    const fail = (reason: ShotErrorReason, message: string, retryable: boolean, raw?: string): ShotGenerationResult => ({
      ok: false,
      error: shotError(shot.id, reason, message, retryable, raw),
    });
    if (cancellation?.aborted) throw new ShotCancelledError(shot.id);

    // V4: the shot's own value wins over the lock's.
    const seedSource = shot.seed !== undefined ? 'shot' : lock.seed !== undefined ? 'consistency_lock' : undefined;
    const seed = shot.seed ?? lock.seed;
    const referenceSource = shot.referenceImage !== undefined ? 'shot' : lock.characterReference !== undefined ? 'consistency_lock' : undefined;
    const reference = shot.referenceImage ?? lock.characterReference;

    // What normalisation would not flag as a shot problem: the lock's frame, the tier name, the image's form.
    if (!VEO_ASPECT_RATIOS.includes(shot.aspectRatio) || shot.aspectRatio !== lock.aspectRatio) {
      return fail('invalid_dimension', `The shot's aspect ratio ${shot.aspectRatio} must be the storyboard's locked ${lock.aspectRatio} (16:9 or 9:16).`, false);
    }
    if (!VEO_QUALITIES.includes(shot.quality)) {
      return fail('unknown', `"${shot.quality}" is not a Veo quality tier (${VEO_QUALITIES.join(', ')}).`, false);
    }
    if (seed !== undefined && !isUint32(seed)) {
      return fail('seed_conflict', 'The seed must be a whole number from 0 to 4294967295.', false);
    }
    if (reference !== undefined && !isSupportedReferenceImage(reference)) {
      return fail('reference_image_issue', 'The reference image must be an https:// URL or a base64 data:image URL.', false);
    }

    const transport = this.engine.transport();
    if (!transport) return fail('unknown', 'No Veo transport is configured (Vertex AI or the Gemini API).', false);

    const tier = shot.quality as VeoTier;
    const createInput: CreateVeoClipInput = {
      request: {
        prompt: shot.prompt,
        aspect: shot.aspectRatio as VeoAspect,
        durationSec: shot.durationSeconds,
        tier,
        // Google-side prompt rewriting would break V3 (and defeat the seed).
        enhancePrompt: false,
        // V3 on the wire too: lib/veo/payload trims surrounding whitespace unless asked not to.
        verbatimPrompt: true,
        ...(shot.negativePrompt !== undefined ? { negativePrompt: shot.negativePrompt } : {}),
        ...(seed !== undefined ? { seed } : {}),
        ...(reference !== undefined ? { referenceImages: [{ kind: 'url' as const, url: reference }] } : {}),
      },
      tier,
      sessionId: input.params?.sessionId || `director-${storyboardId}`,
      ordinal: shot.order,
    };

    const preflight = this.preflight(shot, createInput, transport, seed, reference);
    if (preflight) return { ok: false, error: preflight };

    if (cancellation?.aborted) throw new ShotCancelledError(shot.id);
    let created: CreateVeoClipResult;
    try {
      created = await this.engine.createClip(createInput, { userId: input.params?.userId ?? null });
    } catch (err) {
      return fail('unknown', 'The Veo submit failed unexpectedly; it is not known whether Google accepted it.', false, err instanceof Error ? err.message : String(err));
    }
    if (!created.outcome.ok) return { ok: false, error: submitError(shot.id, created.outcome) };
    // Preflight ran the same normalisation, so this only trips if the transport changed in between. The job exists
    // (and may bill) but it is not the frozen shot, so it is never handed back as one.
    if (created.adjustments.length > 0 || created.request.prompt !== shot.prompt) {
      const first = created.adjustments[0];
      return fail(first ? reasonForField(first.field) : 'unknown', 'The engine changed this shot after it was submitted, so the clip was discarded. Retry renders it as frozen.', true, created.adjustments.map((a) => a.reason).join('; '));
    }

    input.onStage?.('generating');
    const operationName = created.outcome.operation.name;
    let outcome: VeoPollOutcome = { state: 'processing' };
    for (let i = 0; i < this.maxPolls && outcome.state === 'processing'; i++) {
      if (cancellation?.aborted) throw new ShotCancelledError(shot.id);
      await this.engine.sleep(this.pollIntervalMs);
      if (cancellation?.aborted) throw new ShotCancelledError(shot.id);
      try {
        outcome = await this.engine.pollClip(operationName);
      } catch {
        // A poll that throws is a transient miss, like the engine's own network misses: keep waiting.
        outcome = { state: 'processing' };
      }
    }
    if (outcome.state === 'processing') {
      const minutes = Math.round((this.maxPolls * this.pollIntervalMs) / 60_000);
      return fail('veo_internal', `Veo did not finish this clip within ${minutes} min. It may still finish (and bill); a retry renders a new one.`, true);
    }
    if (outcome.state !== 'succeeded') return { ok: false, error: pollError(shot.id, outcome) };
    const video = outcome.videos[0];
    if (!video) return fail('veo_internal', 'Veo finished without returning a video.', true);

    input.onStage?.('finalizing');
    let clipUrl: string | null;
    try {
      clipUrl = await this.engine.deliver(video, { storyboardId, shotId: shot.id, order: shot.order, operationName, aspect: created.request.aspect });
    } catch {
      clipUrl = null;
    }
    if (!clipUrl) return fail('unknown', 'Veo rendered the clip but it could not be saved to storage. A retry renders it again.', true);

    const metadata: ShotMetadata = {
      providerName: this.providerName,
      model: created.model,
      transport: created.transport ?? transport,
      operationName,
      durationSeconds: created.request.durationSec,
      aspectRatio: created.request.aspect,
      quality: created.request.tier,
      resolution: created.request.resolution,
      ...(seed !== undefined ? { seed } : {}),
      ...(seedSource ? { seedSource } : {}),
      ...(referenceSource ? { referenceImageSource: referenceSource } : {}),
    };
    return { ok: true, clipUrl, metadata };
  }

  /** Null when the shot reaches Veo exactly as frozen; otherwise the ShotError that stops it before any spend. */
  private preflight(shot: Shot, input: CreateVeoClipInput, transport: VeoTransport, seed: number | undefined, reference: string | undefined): ShotError | null {
    const tier = input.tier ?? 'standard';
    const { request, adjustments } = normalizeClipRequest(input.request, resolveModel(transport, tier), transport);
    const first = adjustments[0];
    if (first) {
      return shotError(shot.id, reasonForField(first.field), `Veo cannot render this shot as written: ${adjustments.map((a) => a.reason).join('; ')}.`, false);
    }

    let wire: VeoWireFields;
    try {
      wire = this.engine.wire(request, transport);
    } catch (err) {
      if (err instanceof VeoPayloadError) return shotError(shot.id, reasonForField(err.field), `Veo cannot accept this shot: ${err.message}.`, false);
      return shotError(shot.id, 'unknown', 'The Veo request for this shot could not be built.', false, err instanceof Error ? err.message : String(err));
    }
    if (wire.prompt !== shot.prompt) {
      const trimmed = wire.prompt === shot.prompt.trim();
      return shotError(shot.id, 'unknown', trimmed
        ? 'The Veo transport trims leading and trailing whitespace, so this prompt cannot be sent byte-for-byte. Remove the surrounding whitespace and approve the storyboard again.'
        : 'The Veo transport would alter this prompt, so it cannot be sent byte-for-byte.', false);
    }
    if (wire.enhancePrompt) return shotError(shot.id, 'unknown', 'Google-side prompt enhancement is on, so the prompt would not reach Veo as written.', false);
    if (shot.negativePrompt !== undefined && wire.negativePrompt !== shot.negativePrompt) {
      return shotError(shot.id, 'unknown', 'The Veo transport would alter the negative prompt (it trims surrounding whitespace). Remove it and approve again.', false);
    }
    if (wire.seed !== seed) return shotError(shot.id, 'seed_conflict', `The ${transport} transport would not send seed ${String(seed)} as set.`, false);
    if (wire.referenceImageCount !== (reference !== undefined ? 1 : 0)) {
      return shotError(shot.id, 'reference_image_issue', `The ${transport} transport would not send the reference image as set.`, false);
    }
    return null;
  }
}
