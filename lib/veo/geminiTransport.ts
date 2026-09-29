/**
 * lib/veo/geminiTransport.ts — the Gemini API Veo transport (docs/VEO_ENGINE.md §1, §5): the production path until
 * the GCP credentials for Vertex exist.
 *
 *   submit   POST /v1beta/models/{MODEL}:predictLongRunning    → `models/{MODEL}/operations/{ID}`
 *   poll     GET  /v1beta/{operation}                          → a Files-API video URI, kept for 2 days
 *   download GET  {uri}                                        → the mp4 (the URI works only with the key)
 *
 * The API key travels ONLY in the `x-goog-api-key` header — never `?key=` (a URL ends up in logs, traces and error
 * reports) — and only to generativelanguage.googleapis.com: every call uses `redirect: 'manual'`, and a download
 * redirect to another Google host is followed without the key. Failures are classified exactly as on Vertex
 * (vertexClient.classifySubmitHttpFailure): a timed-out or 5xx submit is `ambiguous` and never re-POSTed.
 */
import 'server-only';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { isPublicHttpUrl, readBodyWithCap } from '@/lib/security/allowlistedAudioFetch';
import { buildGeminiPayload, VeoPayloadError } from './payload';
import {
  ambiguousSubmitFailure,
  classifySubmitHttpFailure,
  finishedOperationOutcome,
  isPlausibleModelId,
  readGoogleError,
  VEO_POLL_TIMEOUT_MS,
  VEO_SUBMIT_TIMEOUT_MS,
} from './vertexClient';
import type { VeoClipRequest, VeoCreateOutcome, VeoPollOutcome, VeoVideo } from './types';

export const GEMINI_API_HOST = 'generativelanguage.googleapis.com';
export const GEMINI_API_BASE = `https://${GEMINI_API_HOST}/v1beta`;
/** An 8 s 1080p/4k mp4 can take a while to stream from the Files API. */
export const GEMINI_DOWNLOAD_TIMEOUT_MS = 60_000;
/** Bounds memory: an 8 s 4k clip is tens of MB; nothing legitimate comes near this. */
export const GEMINI_VIDEO_MAX_BYTES = 256 * 1024 * 1024;
const MAX_DOWNLOAD_REDIRECTS = 3;

/** The name goes into the poll URL path: `models/…/operations/../../x` must never re-route a keyed request. */
const GEMINI_OPERATION_RE = /^models\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/operations\/[A-Za-z0-9_-]{1,128}$/;

export function isGeminiOperationName(name: unknown): name is string {
  return typeof name === 'string' && GEMINI_OPERATION_RE.test(name.trim());
}

function positiveMs(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

export interface SubmitGeminiOptions {
  model: string;
  timeoutMs?: number;
}

/**
 * Submit ONE clip to the Gemini API. At most one POST; total (every failure is an outcome). The body comes from
 * payload.buildGeminiPayload, so url/gcs media are refused here as `invalid_request` — the engine inlines them first.
 */
export async function submitGeminiVeo(req: VeoClipRequest, opts: SubmitGeminiOptions): Promise<VeoCreateOutcome> {
  const key = resolveGeminiKey();
  if (!key) return { ok: false, reason: 'not_configured', retryable: false, detail: 'no Gemini API key configured' };
  const model = typeof opts.model === 'string' ? opts.model.trim() : '';
  if (!isPlausibleModelId(model)) {
    return { ok: false, reason: 'invalid_request', retryable: false, detail: 'model id is not a plausible Veo model id' };
  }
  const timeoutMs = positiveMs(opts.timeoutMs, VEO_SUBMIT_TIMEOUT_MS);

  let body: string;
  try {
    body = JSON.stringify(buildGeminiPayload(req));
  } catch (err) {
    const detail = err instanceof VeoPayloadError ? err.message : 'the request could not be encoded';
    return { ok: false, reason: 'invalid_request', retryable: false, detail };
  }

  let res: Response;
  try {
    res = await fetch(`${GEMINI_API_BASE}/models/${model}:predictLongRunning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-goog-api-key': key },
      body,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return ambiguousSubmitFailure(err, timeoutMs);
  }
  if (!res.ok) return classifySubmitHttpFailure(res.status, await readGoogleError(res, key));

  let name: unknown;
  try {
    name = ((await res.json()) as { name?: unknown } | null)?.name;
  } catch {
    name = undefined;
  }
  if (!isGeminiOperationName(name)) {
    return {
      ok: false,
      reason: 'ambiguous',
      retryable: false,
      status: res.status,
      detail: 'the Gemini API accepted the submit but returned no usable operation name — the job may exist; not re-submitted',
    };
  }
  return { ok: true, operation: { transport: 'gemini', name: name.trim(), model } };
}

/** Video URIs from both shapes the API has used; only https URIs (anything else cannot be downloaded anyway). */
function geminiVideos(response: Record<string, unknown>, gvr: Record<string, unknown>): VeoVideo[] {
  const videos: VeoVideo[] = [];
  const push = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    const { uri, mimeType } = v as { uri?: unknown; mimeType?: unknown };
    if (typeof uri === 'string' && /^https:\/\//i.test(uri)) {
      videos.push({ kind: 'gemini-file', uri, mimeType: typeof mimeType === 'string' && mimeType ? mimeType : 'video/mp4' });
    }
  };
  if (Array.isArray(gvr.generatedSamples)) {
    for (const sample of gvr.generatedSamples) push(sample && typeof sample === 'object' ? (sample as { video?: unknown }).video : undefined);
  }
  if (videos.length === 0 && Array.isArray(response.videos)) response.videos.forEach(push);
  return videos;
}

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/**
 * Poll a Gemini operation ONCE. Transient misses (network, 5xx, 429, unreadable body) are `processing`. A 404 is
 * `failed`: the operation is unknown or past the API's 2-day retention, and waiting cannot bring it back.
 */
export async function pollGeminiVeo(operationName: string, opts: { timeoutMs?: number } = {}): Promise<VeoPollOutcome> {
  const key = resolveGeminiKey();
  if (!key) return { state: 'failed', reason: 'no Gemini API key configured' };
  if (!isGeminiOperationName(operationName)) return { state: 'failed', reason: 'not a Gemini Veo operation name' };

  let res: Response;
  try {
    res = await fetch(`${GEMINI_API_BASE}/${operationName.trim()}`, {
      headers: { 'x-goog-api-key': key },
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(positiveMs(opts.timeoutMs, VEO_POLL_TIMEOUT_MS)),
    });
  } catch {
    return { state: 'processing' };
  }
  if (res.status === 404) {
    await res.body?.cancel().catch(() => undefined);
    return { state: 'failed', reason: 'operation expired or unknown', code: 404 };
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
  const response = asRecord(op.response);
  const gvr = asRecord(response.generateVideoResponse);
  return finishedOperationOutcome({
    error: op.error,
    videos: geminiVideos(response, gvr),
    raiMediaFilteredCount: gvr.raiMediaFilteredCount ?? response.raiMediaFilteredCount,
    raiMediaFilteredReasons: gvr.raiMediaFilteredReasons ?? response.raiMediaFilteredReasons,
  });
}

/** Other Google hosts a Files-API download may redirect to (served without the key: the redirect URL is signed). */
function isGoogleContentHost(host: string): boolean {
  return host.endsWith('.googleusercontent.com') || host.endsWith('.googleapis.com');
}

/**
 * Download a Veo video from the Files API (header auth). Null on any failure. The key is sent only to
 * generativelanguage.googleapis.com: a URI anywhere else is refused outright, and a redirect is followed manually —
 * to the same host with the key, to another https Google content host without it, anywhere else not at all.
 */
export async function downloadGeminiVideo(uri: string, opts: { timeoutMs?: number; maxBytes?: number } = {}): Promise<Buffer | null> {
  const key = resolveGeminiKey();
  if (!key || typeof uri !== 'string') return null;
  let url: URL;
  try {
    url = new URL(uri.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== GEMINI_API_HOST) return null;

  const signal = AbortSignal.timeout(positiveMs(opts.timeoutMs, GEMINI_DOWNLOAD_TIMEOUT_MS));
  const maxBytes = positiveMs(opts.maxBytes, GEMINI_VIDEO_MAX_BYTES);
  try {
    for (let hop = 0; hop <= MAX_DOWNLOAD_REDIRECTS; hop++) {
      const keyed = url.hostname === GEMINI_API_HOST;
      const res = await fetch(url.toString(), {
        ...(keyed ? { headers: { 'x-goog-api-key': key } } : {}),
        cache: 'no-store',
        redirect: 'manual',
        signal,
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        await res.body?.cancel().catch(() => undefined);
        if (!location) return null;
        const next = new URL(location, url);
        if (next.protocol !== 'https:' || !isPublicHttpUrl(next.toString())) return null;
        if (next.hostname !== GEMINI_API_HOST && !isGoogleContentHost(next.hostname)) return null;
        url = next;
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        return null;
      }
      const bytes = await readBodyWithCap(res, maxBytes);
      return bytes && bytes.length > 0 ? bytes : null;
    }
    return null;
  } catch {
    return null;
  }
}
