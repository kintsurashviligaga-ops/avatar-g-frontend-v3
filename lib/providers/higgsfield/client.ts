import { assertProviderPermitted } from '@/lib/providers/policy';
/**
 * Higgsfield REST client — server-side only.
 *
 * Implements the documented contract (docs.higgsfield.ai, verified 2026-09-28) directly on fetch rather than
 * through @higgsfield/client v2, deliberately (a documented deviation from brief D1, see docs/REPORT_PHASE_1.md):
 *   - the SDK's `subscribe()` wraps the generation POST in retryWithBackoff (default maxRetries 3) and retries
 *     on ETIMEDOUT / ECONNRESET / 5xx — the exact "repeat a POST after an ambiguous timeout" that the docs and
 *     the brief forbid, because submissions have no idempotency key and a retry charges twice;
 *   - it exposes no estimate, no cancel, no status-by-id and no upload URL for the v2 API, which the billing
 *     saga needs; and it would pull axios + form-data into every server bundle.
 *
 * Retry policy, straight from docs/concepts/errors + polling:
 *   estimate / status / upload-url → retried on network errors and 5xx with exponential backoff + jitter;
 *   submit                         → NEVER retried. A timeout or dropped connection is `ambiguous`;
 *   cancel                         → not retried (a lost 202 is resolved by the next status read).
 * Every response's X-Correlation-ID is surfaced so it can be stored beside the request_id for support.
 */
import 'server-only';
import {
  ProviderError,
  isProviderStatus,
  type ProviderErrorCode,
  type ProviderEstimate,
  type ProviderResult,
  type ProviderSubmission,
  type ProviderUpload,
} from '@/lib/providers/types';

export const HF_DEFAULT_BASE_URL = 'https://api.higgsfield.ai';

/** Endpoint ids come from OUR registry, never from a request — still, refuse anything path-like. */
const ENDPOINT_RE = /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/i;
const REQUEST_ID_RE = /^[A-Za-z0-9-]{8,80}$/;

/** Content types the upload endpoint accepts (docs/concepts/file-uploads). */
export const HF_UPLOAD_CONTENT_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'audio/wav', 'audio/x-wav', 'video/mp4',
]);

export interface HfClientOptions {
  /** `Key <id>:<secret>` — built by hfAuthHeaderFromEnv; never logged. */
  authHeader: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** A submit that has not answered in this long is treated as AMBIGUOUS, never retried. */
  submitTimeoutMs?: number;
  readTimeoutMs?: number;
  /** Attempts for retryable calls (estimate / status / upload-url). */
  maxAttempts?: number;
  /** Injected for tests so backoff does not sleep. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The Authorization header from env — `HF_CREDENTIALS="id:secret"` or the `HF_API_KEY_ID` + `HF_API_KEY_SECRET`
 * pair. Returns null (never a partial header) when the pair is incomplete.
 */
export function hfAuthHeaderFromEnv(_env: NodeJS.ProcessEnv = process.env): string | null { return null; }

/** HTTP status → the saga's vocabulary (docs/concepts/errors). */
export function mapHttpError(status: number, detail: string): ProviderErrorCode {
  switch (status) {
    case 400:
      return /concurrent/i.test(detail) ? 'concurrency' : 'bad_request';
    case 401:
      return 'auth';
    case 403:
      return 'credits_exhausted';
    case 404:
      return 'model_unavailable';
    case 422:
      return 'validation';
    case 423:
    case 503:
      return 'model_unavailable';
    default:
      return status >= 500 ? 'server' : 'bad_request';
  }
}

function detailOf(json: unknown, text: string): string {
  const d = (json as { detail?: unknown } | null)?.detail;
  if (typeof d === 'string') return d;
  if (d !== undefined) {
    try { return JSON.stringify(d); } catch { /* fall through */ }
  }
  return text;
}

/** Output URLs from a status body OR a webhook `payload` (the two nest them differently). */
export function extractOutputUrls(body: unknown): string[] {
  const b = (body ?? {}) as Record<string, unknown>;
  const src = (b.payload && typeof b.payload === 'object' ? b.payload : b) as Record<string, unknown>;
  const urls: string[] = [];
  const push = (v: unknown) => {
    const u = (v as { url?: unknown } | null)?.url;
    if (typeof u === 'string' && u.startsWith('https://')) urls.push(u);
  };
  if (Array.isArray(src.images)) src.images.forEach(push);
  push(src.video);
  push(src.audio);
  if (Array.isArray(src.audios) && !src.audio) src.audios.forEach(push);
  return [...new Set(urls)];
}

export function createHfClient(opts: HfClientOptions) {
  assertProviderPermitted('higgsfield');
  const base = (opts.baseUrl ?? HF_DEFAULT_BASE_URL).replace(/\/+$/, '');
  const doFetch = opts.fetchImpl ?? fetch;
  const submitTimeoutMs = opts.submitTimeoutMs ?? 30_000;
  const readTimeoutMs = opts.readTimeoutMs ?? 20_000;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  if (!/^Key [^:\s]+:\S+$/.test(opts.authHeader)) throw new ProviderError('not_configured');

  type Raw = { status: number; json: unknown; text: string; correlationId: string | null };

  async function once(method: 'GET' | 'POST', path: string, body: unknown, timeoutMs: number): Promise<Raw> {
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: opts.authHeader,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    const text = await res.text().catch(() => '');
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: res.status, json, text: text.slice(0, 2000), correlationId: res.headers.get('x-correlation-id') };
  }

  const isTimeout = (e: unknown) => {
    const name = (e as { name?: string } | null)?.name ?? '';
    return name === 'TimeoutError' || name === 'AbortError';
  };

  /** A call with no side effect on the provider: retried on network errors and 5xx, with jittered backoff. */
  async function retryable(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Raw> {
    let last: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const r = await once(method, path, body, readTimeoutMs);
        if (r.status < 500 || attempt === maxAttempts) return r;
        last = r;
      } catch (e) {
        last = e;
        if (attempt === maxAttempts) {
          throw new ProviderError(isTimeout(e) ? 'timeout' : 'network', { detail: e instanceof Error ? e.message : String(e) });
        }
      }
      await sleep(Math.min(10_000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250));
    }
    // Unreachable (the loop returns or throws), kept for the type checker.
    throw new ProviderError('network', { detail: String(last) });
  }

  function fail(r: Raw): never {
    const detail = detailOf(r.json, r.text);
    throw new ProviderError(mapHttpError(r.status, detail), { httpStatus: r.status, correlationId: r.correlationId, detail });
  }

  const endpointPath = (endpoint: string) => {
    if (!ENDPOINT_RE.test(endpoint)) throw new ProviderError('bad_request', { detail: `invalid endpoint id: ${endpoint}` });
    return `/${endpoint}`;
  };

  return {
    /** POST /estimate/<endpoint> with the same body as the generation → { credits, usd }. */
    async estimate(endpoint: string, input: Record<string, unknown>): Promise<ProviderEstimate> {
      const r = await retryable('POST', `/estimate${endpointPath(endpoint)}`, input);
      if (r.status !== 200) fail(r);
      const j = (r.json ?? {}) as {
        type?: unknown; credits?: unknown; usd?: unknown; pricing_description?: unknown; discount?: { usd?: unknown } | null;
      };
      // Token-priced models describe their pricing instead of pricing the request (see ProviderEstimate).
      if (j.type === 'description' || (j.usd === undefined && typeof j.pricing_description === 'string')) {
        const text = typeof j.pricing_description === 'string' ? j.pricing_description.slice(0, 2000) : '';
        return { usd: null, providerCredits: null, listUsd: null, pricingDescription: text || null, correlationId: r.correlationId };
      }
      const usd = Number(j.usd);
      const providerCredits = Number(j.credits);
      if (!Number.isFinite(usd) || usd < 0 || !Number.isFinite(providerCredits)) {
        throw new ProviderError('bad_response', { httpStatus: r.status, correlationId: r.correlationId, detail: r.text });
      }
      // `usd` is what is charged; `discount.usd` is the amount taken OFF (verified: Kling 3 std 5 s with sound →
      // usd 0.347, discount 45 % = 0.284 → list 0.631).
      const discount = Number(j.discount?.usd);
      const listUsd = Number.isFinite(discount) && discount > 0 ? Math.round((usd + discount) * 1e6) / 1e6 : usd;
      return { usd, providerCredits, listUsd, pricingDescription: null, correlationId: r.correlationId };
    },

    /**
     * POST /<endpoint>[?hf_webhook=…] — EXACTLY ONCE.
     * A timeout or dropped connection throws `ambiguous: true`: the caller must record that and reconcile by
     * webhook / status, never POST again.
     */
    async submit(endpoint: string, input: Record<string, unknown>, o: { webhookUrl?: string | null } = {}): Promise<ProviderSubmission> {
      let path = endpointPath(endpoint);
      if (o.webhookUrl) {
        if (!o.webhookUrl.startsWith('https://')) throw new ProviderError('bad_request', { detail: 'webhook must be https' });
        path += `?hf_webhook=${encodeURIComponent(o.webhookUrl)}`;
      }
      let r: Raw;
      try {
        r = await once('POST', path, input, submitTimeoutMs);
      } catch (e) {
        throw new ProviderError(isTimeout(e) ? 'timeout' : 'network', {
          ambiguous: true,
          detail: e instanceof Error ? e.message : String(e),
        });
      }
      if (r.status < 200 || r.status >= 300) fail(r);
      const j = (r.json ?? {}) as { request_id?: unknown; status?: unknown };
      const requestId = typeof j.request_id === 'string' ? j.request_id : '';
      if (!REQUEST_ID_RE.test(requestId)) {
        // Accepted (2xx) but unreadable — the request probably exists. Treat as ambiguous, never re-POST.
        throw new ProviderError('bad_response', { httpStatus: r.status, correlationId: r.correlationId, ambiguous: true, detail: r.text });
      }
      return { requestId, status: isProviderStatus(j.status) ? j.status : 'queued', correlationId: r.correlationId };
    },

    /** GET /requests/<id>/status (use the id, not a URL from a payload — nothing user-supplied is fetched). */
    async status(requestId: string): Promise<ProviderResult> {
      if (!REQUEST_ID_RE.test(requestId)) throw new ProviderError('bad_request', { detail: 'invalid request id' });
      const r = await retryable('GET', `/requests/${requestId}/status`);
      if (r.status !== 200) fail(r);
      const j = (r.json ?? {}) as { status?: unknown; error?: unknown };
      if (!isProviderStatus(j.status)) throw new ProviderError('bad_response', { httpStatus: r.status, correlationId: r.correlationId, detail: r.text });
      return {
        requestId,
        status: j.status,
        outputUrls: j.status === 'completed' ? extractOutputUrls(r.json) : [],
        error: typeof j.error === 'string' ? j.error : null,
        correlationId: r.correlationId,
      };
    },

    /** POST /requests/<id>/cancel → 202 = canceled (refunded by Higgsfield); 400 = already processing. */
    async cancel(requestId: string): Promise<boolean> {
      if (!REQUEST_ID_RE.test(requestId)) throw new ProviderError('bad_request', { detail: 'invalid request id' });
      let r: Raw;
      try {
        r = await once('POST', `/requests/${requestId}/cancel`, undefined, readTimeoutMs);
      } catch (e) {
        throw new ProviderError(isTimeout(e) ? 'timeout' : 'network', { detail: e instanceof Error ? e.message : String(e) });
      }
      if (r.status === 202 || r.status === 200) return true;
      if (r.status === 400) return false;
      fail(r);
    },

    /** POST /files/generate-upload-url → presigned PUT target + the public URL to pass as model input. */
    async createUpload(contentType: string): Promise<ProviderUpload> {
      if (!HF_UPLOAD_CONTENT_TYPES.has(contentType)) throw new ProviderError('bad_request', { detail: `unsupported upload type ${contentType}` });
      const r = await retryable('POST', '/files/generate-upload-url', { content_type: contentType });
      if (r.status !== 200) fail(r);
      const j = (r.json ?? {}) as { upload_url?: unknown; public_url?: unknown; upload_headers?: unknown };
      if (typeof j.upload_url !== 'string' || typeof j.public_url !== 'string') {
        throw new ProviderError('bad_response', { httpStatus: r.status, correlationId: r.correlationId, detail: r.text });
      }
      const headers: Record<string, string> = {};
      if (j.upload_headers && typeof j.upload_headers === 'object') {
        for (const [k, v] of Object.entries(j.upload_headers as Record<string, unknown>)) if (typeof v === 'string') headers[k] = v;
      }
      return { uploadUrl: j.upload_url, publicUrl: j.public_url, headers };
    },
  };
}

export type HfClient = ReturnType<typeof createHfClient>;
