/**
 * lib/veo/vertexClient.ts — the Vertex AI Veo transport (docs/VEO_ENGINE.md §1, §5): submit via
 * `…/models/{MODEL}:predictLongRunning`, poll via `…/models/{MODEL}:fetchPredictOperation`, and the failure
 * classification BOTH transports share (geminiTransport imports it from here).
 *
 * The rule that shapes this file: `predictLongRunning` has NO idempotency key. A submit that timed out, lost its
 * connection, or answered 500/502/504 may already be a running, billed job — it is classified `ambiguous`,
 * `retryable: false`, and no function here (or in the engine) ever sends it again. Only answers that prove no job
 * exists — 429, 503, and everything refused before the POST — are retryable.
 *
 * Never logged or echoed: the bearer token, the request body (it can carry base64 images), signed URLs. Every
 * Google call uses `redirect: 'manual'`, so neither the token nor the body is ever re-sent to a redirect target.
 */
import 'server-only';
import { buildVertexPayload, VeoPayloadError } from './payload';
import { getVertexAccessToken, redactSecrets, VertexAuthError } from './vertexAuth';
import type {
  PersonGeneration,
  VeoClipRequest,
  VeoCreateOutcome,
  VeoFailureReason,
  VeoPollOutcome,
  VeoVideo,
  VertexConfig,
} from './types';

/** A submit uploads the body and waits only for the operation name; 30 s is generous, and a miss is `ambiguous`. */
export const VEO_SUBMIT_TIMEOUT_MS = 30_000;
/** One poll. A miss is just "still processing" — the caller polls again. */
export const VEO_POLL_TIMEOUT_MS = 15_000;
/** Enough of a Google error message to classify it and to act on it; errors can echo request content. */
const DETAIL_MAX_CHARS = 500;
const ERROR_BODY_MAX_CHARS = 16_384;

export type VeoCreateFailure = Extract<VeoCreateOutcome, { ok: false }>;

// ── Values that are interpolated into a request URL ──────────────────────────────────────────────────────────────
// The location becomes a HOST label (`{location}-aiplatform.googleapis.com`) and the rest become path segments, and
// the bearer token rides along. A value from an operation name like `projects/p/locations/evil.com?/…` would move
// the request (and the token) to another host, so each part is held to the character set Google uses for it.
const PROJECT_RE = /^[a-z0-9][a-z0-9.:-]{0,99}$/; // incl. legacy domain-scoped ids and a bare project number
const LOCATION_RE = /^[a-z0-9-]{2,40}$/;
/** Same rule as capabilities.resolveModel's env overrides. */
const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const OPERATION_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const VERTEX_OPERATION_RE = /^projects\/([^/]+)\/locations\/([^/]+)\/publishers\/google\/models\/([^/]+)\/operations\/([^/]+)$/;

export function isPlausibleModelId(model: unknown): model is string {
  return typeof model === 'string' && MODEL_ID_RE.test(model);
}

export interface VertexOperationParts {
  project: string;
  location: string;
  model: string;
  operationId: string;
}

/**
 * `projects/P/locations/L/publishers/google/models/M/operations/ID` → its parts, or null when it is not a Vertex Veo
 * operation name (or any part falls outside Google's character set — see above).
 */
export function parseVertexOperationName(name: unknown): VertexOperationParts | null {
  if (typeof name !== 'string') return null;
  const m = VERTEX_OPERATION_RE.exec(name.trim());
  if (!m) return null;
  const [, project = '', location = '', model = '', operationId = ''] = m;
  if (!PROJECT_RE.test(project) || !LOCATION_RE.test(location) || !MODEL_ID_RE.test(model) || !OPERATION_ID_RE.test(operationId)) {
    return null;
  }
  return { project, location, model, operationId };
}

function vertexModelUrl(project: string, location: string, model: string, verb: 'predictLongRunning' | 'fetchPredictOperation'): string {
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:${verb}`;
}

// ── Classification (shared with geminiTransport) ─────────────────────────────────────────────────────────────────

/**
 * Responsible-AI wording. Veo's refusals read like "…contains sensitive words that violate Google's Responsible AI
 * practices… Support codes: 29310472" or "…violates our usage guidelines"; the support code is the reliable marker.
 */
const SAFETY_RE =
  /responsible ai|usage guidelines|content polic|safety (?:filter|polic|system|reason|block)|sensitive (?:words|content|information)|prohibited content|\bunsafe\b|\bharmful\b|support codes?\s*:|\brai\b|photorealistic (?:child|children|minor)|celebrity|public figure/i;

/**
 * Billing wording. `(?!…details)` matters: Google's ORDINARY rate-limit text says "please check your plan and billing
 * details", and that 429 must stay retryable — only a real billing state (disabled, depleted prepay) is `quota`.
 */
const BILLING_RE =
  /billing(?![\s_-]*details)|prepa(?:y|id)(?:ment)?|credits? (?:are |is |have been |has been )?(?:depleted|exhausted|used up)|insufficient (?:funds|balance|credits?)|payment required|out of credits/i;

/**
 * Google answers a bad or expired API key with HTTP 400 INVALID_ARGUMENT ("API key not valid. Please pass a valid API
 * key.", ErrorInfo reason API_KEY_INVALID), not 401. It is an auth failure all the same: the fix is the key, not the
 * request, and the UI must say so.
 */
const API_KEY_RE = /\bapi[ _]key (?:not valid|expired|invalid)\b|\bAPI_KEY_INVALID\b/i;

export function isSafetyWording(text: string): boolean {
  return SAFETY_RE.test(text);
}

export function isBillingWording(text: string): boolean {
  return BILLING_RE.test(text);
}

/** "…Support codes: 29310472, 15236754" → ['29310472', '15236754'] (Google's RAI filter ids; empty when none). */
export function supportCodesIn(text: string): string[] {
  const codes = new Set<string>();
  for (const m of text.matchAll(/support codes?\s*:?\s*((?:\d{4,}[\s,;]*)+)/gi)) {
    for (const code of (m[1] ?? '').match(/\d{4,}/g) ?? []) codes.add(code);
  }
  return [...codes];
}

function failure(reason: VeoFailureReason, retryable: boolean, detail: string, status?: number): VeoCreateFailure {
  return { ok: false, reason, retryable, ...(status !== undefined ? { status } : {}), detail };
}

/**
 * A non-2xx answer to a submit → the failure it means (docs/VEO_ENGINE.md §5). Order matters: 402 and billing
 * wording win (a 403 BILLING_DISABLED or a 429 "prepayment credits are depleted" will not clear on retry); then 429
 * and 503, which Google sends BEFORE creating a job (safe to retry); 400 is the request's fault (or a safety refusal,
 * or an invalid API key → auth); 401/403 auth. 500/502/504 (and 408) may have created the job, so they are `ambiguous` and never retried. Any other
 * status (404 unknown model, 3xx that `redirect: 'manual'` refused to follow…) is a request problem.
 */
export function classifySubmitHttpFailure(status: number, message: string): VeoCreateFailure {
  const detail = message ? `HTTP ${status}: ${message}` : `HTTP ${status}`;
  if (status === 402) return failure('quota', false, detail, status);
  if (status >= 400 && status < 500 && isBillingWording(message)) return failure('quota', false, detail, status);
  if (status === 429) return failure('rate_limited', true, detail, status);
  if (status === 400 && API_KEY_RE.test(message)) return failure('auth', false, detail, status);
  if (status === 400) return failure(isSafetyWording(message) ? 'safety' : 'invalid_request', false, detail, status);
  if (status === 401 || status === 403) return failure('auth', false, detail, status);
  if (status === 503) return failure('unavailable', true, detail, status);
  if (status >= 500 || status === 408) {
    return failure('ambiguous', false, `${detail} — the job may exist; not re-submitted`, status);
  }
  return failure('invalid_request', false, detail, status);
}

function isTimeoutError(err: unknown): boolean {
  const name = err && typeof err === 'object' ? (err as { name?: unknown }).name : undefined;
  return name === 'TimeoutError' || name === 'AbortError';
}

/** The POST left but no answer came back (timeout, reset, DNS…): Google may have created the job. Never retried. */
export function ambiguousSubmitFailure(err: unknown, timeoutMs: number): VeoCreateFailure {
  if (isTimeoutError(err)) {
    return failure('ambiguous', false, `no answer within ${Math.round(timeoutMs / 1000)} s — the job may exist; not re-submitted`);
  }
  const cause = err && typeof err === 'object' ? (err as { cause?: { code?: unknown } }).cause : undefined;
  const code = typeof cause?.code === 'string' ? ` (${cause.code})` : '';
  return failure('ambiguous', false, `network error${code} — the job may exist; not re-submitted`);
}

/**
 * The message of a Google error body — `{ error: { status, message } }` (or the array form some REST surfaces use),
 * else the raw text — sanitised and bounded. `secret` (an API key) is scrubbed wherever it appears.
 */
export async function readGoogleError(res: Response, secret?: string): Promise<string> {
  let text = '';
  try {
    text = (await res.text()).slice(0, ERROR_BODY_MAX_CHARS);
  } catch {
    return '';
  }
  let message = '';
  try {
    const parsed: unknown = JSON.parse(text);
    const root: unknown = Array.isArray(parsed) ? parsed[0] : parsed;
    const err = root && typeof root === 'object' ? (root as { error?: unknown }).error : undefined;
    if (err && typeof err === 'object') {
      const e = err as { status?: unknown; message?: unknown };
      message = [e.status, e.message].filter((x): x is string => typeof x === 'string' && x.length > 0).join(': ');
    }
  } catch {
    // Not JSON (an HTML error page from a proxy): the text itself, sanitised below.
  }
  let out = message || text;
  if (secret) out = out.split(secret).join('[redacted]');
  return redactSecrets(out, DETAIL_MAX_CHARS);
}

export interface FinishedOperation {
  /** The operation's `error` ({ code, message }) when it has one. */
  error?: unknown;
  videos: VeoVideo[];
  raiMediaFilteredCount?: unknown;
  raiMediaFilteredReasons?: unknown;
}

function asCount(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/**
 * A `done: true` operation → its outcome (both transports). An error carrying Responsible-AI wording or a support
 * code is `filtered` (the user must change the prompt/image, not wait); any other error is `failed`. Videos win over a
 * non-zero filtered count (with sampleCount 1 that cannot co-occur, but a video in hand is never discarded). No video
 * and a filtered count → `filtered`. No video and no reason → `failed`, never `succeeded` with nothing.
 */
export function finishedOperationOutcome(op: FinishedOperation): VeoPollOutcome {
  if (op.error && typeof op.error === 'object') {
    const e = op.error as { code?: unknown; message?: unknown };
    const message = typeof e.message === 'string' ? redactSecrets(e.message, DETAIL_MAX_CHARS) : '';
    const supportCodes = supportCodesIn(message);
    if (supportCodes.length > 0 || isSafetyWording(message)) {
      return { state: 'filtered', reason: message || 'Blocked by Responsible-AI filters', supportCodes };
    }
    return {
      state: 'failed',
      reason: message || 'Veo operation failed',
      ...(typeof e.code === 'number' ? { code: e.code } : {}),
    };
  }
  if (op.videos.length > 0) return { state: 'succeeded', videos: op.videos };

  const reasons = Array.isArray(op.raiMediaFilteredReasons)
    ? op.raiMediaFilteredReasons.filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
    : [];
  if (asCount(op.raiMediaFilteredCount) > 0 || reasons.length > 0) {
    const reason = reasons.length > 0 ? redactSecrets(reasons.join('; '), DETAIL_MAX_CHARS) : 'Veo filtered the output (Responsible AI)';
    return { state: 'filtered', reason, supportCodes: supportCodesIn(reasons.join(' ')) };
  }
  return { state: 'failed', reason: 'Veo finished without returning a video' };
}

function positiveMs(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

// ── Submit ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface SubmitVertexOptions {
  model: string;
  /** `gs://bucket/prefix/` — Vertex writes `…/sample_0.mp4` there (gcs.veoOutputPrefix). Without it bytes come back inline. */
  storageUri?: string;
  timeoutMs?: number;
  /** Transport default; else VEO_VERTEX_PERSON_GENERATION; else the payload's 'allow_adult'. A value on the request wins. */
  personGeneration?: PersonGeneration;
}

function envPersonGeneration(): PersonGeneration | undefined {
  const v = (process.env.VEO_VERTEX_PERSON_GENERATION ?? '').trim().toLowerCase();
  return v === 'allow_all' || v === 'allow_adult' || v === 'dont_allow' ? v : undefined;
}

/**
 * A token failure happens BEFORE anything reaches Veo, so it never creates a job: STS/IAM 5xx, 429 or a network miss
 * is safe to retry; a configuration or permission problem is not.
 */
function tokenFailure(err: unknown): VeoCreateFailure {
  if (err instanceof VertexAuthError) {
    const detail = redactSecrets(err.message, DETAIL_MAX_CHARS);
    if (err.code === 'not_configured' || err.code === 'client_init_failed') return failure('not_configured', false, detail);
    if (err.code === 'token_failed') {
      if (err.status === 429) return failure('rate_limited', true, detail);
      if (err.status === undefined || err.status >= 500) return failure('unavailable', true, detail);
    }
    return failure('auth', false, detail);
  }
  return failure('auth', false, 'Vertex access token unavailable');
}

/**
 * Submit ONE clip to Vertex AI. Exactly one POST at most — see the header. Total: every failure is an outcome, and
 * everything that can be refused locally (model id, config, payload contract, token) is refused before the POST.
 */
export async function submitVertexVeo(req: VeoClipRequest, cfg: VertexConfig, opts: SubmitVertexOptions): Promise<VeoCreateOutcome> {
  const model = typeof opts.model === 'string' ? opts.model.trim() : '';
  if (!isPlausibleModelId(model)) return failure('invalid_request', false, 'model id is not a plausible Veo model id');
  if (!PROJECT_RE.test(cfg.projectId) || !LOCATION_RE.test(cfg.location)) {
    return failure('not_configured', false, 'Vertex project id or location is malformed');
  }
  const timeoutMs = positiveMs(opts.timeoutMs, VEO_SUBMIT_TIMEOUT_MS);

  const personGeneration = opts.personGeneration ?? envPersonGeneration();
  let body: string;
  try {
    body = JSON.stringify(
      buildVertexPayload(req, {
        ...(opts.storageUri !== undefined ? { storageUri: opts.storageUri } : {}),
        ...(personGeneration ? { personGeneration } : {}),
      }),
    );
  } catch (err) {
    // VeoPayloadError messages never carry media (payload.ts); anything else is not echoed.
    return failure('invalid_request', false, err instanceof VeoPayloadError ? err.message : 'the request could not be encoded');
  }

  let token: string;
  try {
    token = await getVertexAccessToken();
  } catch (err) {
    return tokenFailure(err);
  }

  let res: Response;
  try {
    res = await fetch(vertexModelUrl(cfg.projectId, cfg.location, model, 'predictLongRunning'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return ambiguousSubmitFailure(err, timeoutMs);
  }
  if (!res.ok) return classifySubmitHttpFailure(res.status, await readGoogleError(res));

  // A 2xx means Google accepted the job. If its name is unreadable the job still exists and bills — ambiguous.
  let name: unknown;
  try {
    name = ((await res.json()) as { name?: unknown } | null)?.name;
  } catch {
    name = undefined;
  }
  if (typeof name !== 'string' || !parseVertexOperationName(name)) {
    return failure('ambiguous', false, 'Vertex accepted the submit but returned no usable operation name — the job may exist; not re-submitted', res.status);
  }
  return {
    ok: true,
    operation: {
      transport: 'vertex',
      name: name.trim(),
      model,
      ...(opts.storageUri !== undefined ? { outputPrefix: opts.storageUri } : {}),
    },
  };
}

// ── Poll ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** `response.videos[]` — `{ gcsUri, mimeType }` when a storageUri was set, else `{ bytesBase64Encoded, mimeType }`. */
function vertexVideos(response: unknown): VeoVideo[] {
  const list = response && typeof response === 'object' ? (response as { videos?: unknown }).videos : undefined;
  if (!Array.isArray(list)) return [];
  const videos: VeoVideo[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const v = item as { gcsUri?: unknown; bytesBase64Encoded?: unknown; mimeType?: unknown };
    const mimeType = typeof v.mimeType === 'string' && v.mimeType ? v.mimeType : 'video/mp4';
    if (typeof v.gcsUri === 'string' && v.gcsUri.startsWith('gs://')) videos.push({ kind: 'gcs', gcsUri: v.gcsUri, mimeType });
    else if (typeof v.bytesBase64Encoded === 'string' && v.bytesBase64Encoded) videos.push({ kind: 'bytes', base64: v.bytesBase64Encoded, mimeType });
  }
  return videos;
}

/**
 * Poll a Vertex operation ONCE. Project, location and model come from the operation name itself, so an operation
 * keeps polling after the env changes. Anything transient (token refresh, network, any non-2xx, unreadable body) is
 * `processing` — the caller's own deadline ends a job that never finishes. A name that is not a Vertex operation, or
 * a Vertex that is no longer configured at all, is `failed`: no amount of waiting fixes those.
 */
export async function pollVertexVeo(operationName: string, opts: { timeoutMs?: number } = {}): Promise<VeoPollOutcome> {
  const parts = parseVertexOperationName(operationName);
  if (!parts) return { state: 'failed', reason: 'not a Vertex Veo operation name' };

  let token: string;
  try {
    token = await getVertexAccessToken();
  } catch (err) {
    if (err instanceof VertexAuthError && (err.code === 'not_configured' || err.code === 'client_init_failed')) {
      return { state: 'failed', reason: 'Vertex AI is not configured' };
    }
    return { state: 'processing' };
  }

  let res: Response;
  try {
    res = await fetch(vertexModelUrl(parts.project, parts.location, parts.model, 'fetchPredictOperation'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ operationName: operationName.trim() }),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(positiveMs(opts.timeoutMs, VEO_POLL_TIMEOUT_MS)),
    });
  } catch {
    return { state: 'processing' };
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    return { state: 'processing' };
  }

  let op: { done?: unknown; error?: unknown; response?: unknown };
  try {
    op = ((await res.json()) ?? {}) as typeof op;
  } catch {
    return { state: 'processing' };
  }
  if (op.done !== true) return { state: 'processing' };
  const response = op.response && typeof op.response === 'object' ? (op.response as Record<string, unknown>) : {};
  return finishedOperationOutcome({
    error: op.error,
    videos: vertexVideos(response),
    raiMediaFilteredCount: response.raiMediaFilteredCount,
    raiMediaFilteredReasons: response.raiMediaFilteredReasons,
  });
}
