/**
 * The art-pack runner's provider seam (docs/SUPER_APP_PLAN.md 2c): `--provider hf | replicate | imagen`.
 *
 *   hf         Higgsfield (lib/providers/higgsfield/client) — the shots are written for it; its /estimate is a free call.
 *   replicate  FLUX schnell (black-forest-labs/flux-schnell) — submitted with `Prefer: wait`, files downloaded at once.
 *   imagen     Google Imagen 4 on the Gemini API (`:predict`) — answers with the images inline, as base64.
 *
 * The shots stay written for Soul: the committed spec is exactly what runs. `prepare` carries a PLAIN Soul
 * text-to-image shot over to the other provider's own body — prompt, aspect ratio, image count (+ seed on FLUX) —
 * drops the Soul render settings that have no counterpart, and REFUSES anything else (a Soul style, a reference
 * image, an edit or a video endpoint) instead of silently dropping what makes the shot what it is.
 *
 * Money: neither Replicate nor Imagen prices a request before it runs, so a quote is the static PRICES_USD × the
 * number of images — local arithmetic, no network. The runner adds every quote up against the pack's STOP line
 * BEFORE the one POST, and an ambiguous submit (no answer, a 5xx, an unreadable 2xx) is counted as spent and never
 * re-POSTed: neither API takes an idempotency key.
 *
 * ⚠️ Imports here are RELATIVE, never `@/…`: the runner runs under the jiti CLI, which ignores tsconfig `paths`.
 * The imported file has no imports of its own.
 */
import { randomUUID } from 'node:crypto';
import {
  ProviderError,
  TERMINAL_PROVIDER_STATUSES,
  type ProviderErrorCode,
  type ProviderEstimate,
  type ProviderResult,
  type ProviderStatus,
  type ProviderSubmission,
} from '../lib/providers/types';

export const ART_PROVIDERS = ['hf', 'replicate', 'imagen'] as const;
export type ArtProviderId = (typeof ART_PROVIDERS)[number];

export function providerFromArgv(argv: readonly string[]): ArtProviderId {
  const i = argv.indexOf('--provider');
  const id = i >= 0 ? argv[i + 1] : 'hf';
  if (!ART_PROVIDERS.includes(id as ArtProviderId)) throw new Error(`unknown --provider ${id} (${ART_PROVIDERS.join(' | ')})`);
  return id as ArtProviderId;
}

/**
 * USD per OUTPUT IMAGE, as the providers publish it: Replicate bills FLUX schnell at $3 per 1,000 images; the
 * Gemini API bills Imagen 4 Standard at $0.04 per image.
 * ⚠️ Static on purpose (there is no free estimate to ask), so a price rise makes the STOP line under-count: re-read
 * replicate.com/black-forest-labs/flux-schnell and ai.google.dev/gemini-api/docs/pricing before a --yes-spend run.
 * A model that is not in this table has no price and is never run.
 */
export const PRICES_USD: Readonly<Record<string, number>> = {
  'black-forest-labs/flux-schnell': 0.003,
  'imagen-4.0-generate-001': 0.04,
};

export function priceOf(model: string): number | null {
  return Object.hasOwn(PRICES_USD, model) ? PRICES_USD[model]! : null;
}

/** The quote for `images` outputs of `model`. No numeric price (unknown model, no image count) → `usd: null`. */
export function staticQuote(model: string, images: unknown): ProviderEstimate {
  const per = priceOf(model);
  if (per === null || !Number.isInteger(images) || (images as number) < 1) {
    return { usd: null, listUsd: null, providerCredits: null, pricingDescription: `no static price for ${model} × ${String(images)}`, correlationId: null };
  }
  const usd = Math.round(per * (images as number) * 1e6) / 1e6;
  return { usd, listUsd: usd, providerCredits: null, pricingDescription: null, correlationId: null };
}

// ─── The seam the runner talks to ─────────────────────────────────────────────────────────────────────────────

/** Image bytes a provider answered with (Imagen's base64; a Replicate `data:` output). */
export interface InlineOutput { bytes: Buffer; mimeType: string }

export interface ArtResult extends ProviderResult {
  /** Outputs that came back as bytes rather than URLs — written straight to disk, never fetched. */
  inline?: InlineOutput[];
}

export interface ArtSubmission extends ProviderSubmission {
  /** The finished take, when the provider answered the submit with it (Imagen always; Replicate under Prefer: wait). */
  result?: ArtResult;
}

/** What actually goes to the provider — and into the manifest, so the log shows what was sent, not the Soul draft. */
export interface ArtRequest { endpoint: string; input: Record<string, unknown> }

/** The provider calls the runner makes, as an interface a test can stand in for. */
export interface ArtClient {
  /** Recorded on every attempt; absent = hf (the brand-v1 manifest predates the seam). */
  readonly provider?: ArtProviderId;
  /** The spec's shot → this provider's endpoint + body; throws when it cannot be carried over. Absent = as written. */
  prepare?(endpoint: string, input: Record<string, unknown>): ArtRequest;
  estimate(endpoint: string, input: Record<string, unknown>): Promise<ProviderEstimate>;
  submit(endpoint: string, input: Record<string, unknown>): Promise<ArtSubmission>;
  status(requestId: string): Promise<ArtResult>;
}

export const isTerminal = (s: ProviderStatus) => TERMINAL_PROVIDER_STATUSES.has(s);

/** A dry run's fetch on a statically priced provider: it has no reason to touch the network — and cannot. */
export const offlineFetch: typeof fetch = async () => { throw new Error('dry run: no network'); };

// ─── Soul → anything: what a plain text-to-image shot is made of ─────────────────────────────────────────────────

const SOUL_T2I_RE = /^higgsfield-ai\/soul\//;
/** Soul render settings with no counterpart elsewhere — dropped (batch_size becomes the image count). */
const SOUL_ONLY: ReadonlySet<string> = new Set(['resolution', 'enhance_prompt', 'batch_size']);
const CARRIED: ReadonlySet<string> = new Set(['prompt', 'aspect_ratio', 'seed']);
/** Both FLUX schnell and Imagen return at most four images per request. */
const MAX_IMAGES = 4;

export interface PlainShot { prompt: string; aspectRatio: string; images: number; seed: number | null }

const refuse = (detail: string) => new ProviderError('validation', { detail });

export function plainSoulShot(endpoint: string, input: Record<string, unknown>): PlainShot {
  if (!SOUL_T2I_RE.test(endpoint)) throw refuse(`${endpoint} is not a Soul text-to-image shot — it stays on --provider hf`);
  const other = Object.keys(input).filter((k) => !SOUL_ONLY.has(k) && !CARRIED.has(k));
  if (other.length) throw refuse(`carries ${other.join(', ')}, which only Higgsfield understands — it stays on --provider hf`);
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  if (!prompt) throw refuse('no prompt');
  if (typeof input.aspect_ratio !== 'string') throw refuse('no aspect_ratio');
  const n = input.batch_size ?? 1;
  const images = Number.isInteger(n) && (n as number) >= 1 ? Math.min(MAX_IMAGES, n as number) : 1;
  return { prompt, aspectRatio: input.aspect_ratio, images, seed: Number.isSafeInteger(input.seed) ? (input.seed as number) : null };
}

// ─── Shared HTTP plumbing ─────────────────────────────────────────────────────────────────────────────────────────

const isTimeout = (e: unknown) => {
  const name = (e as { name?: string } | null)?.name ?? '';
  return name === 'TimeoutError' || name === 'AbortError';
};

/** The provider's text, bounded, with the credential cut out wherever it appears. */
function scrubbed(text: string, secret: string): string {
  const t = text.slice(0, 2000);
  return secret ? t.split(secret).join('[redacted]') : t;
}

/**
 * A non-2xx answer to a SUBMIT.
 * ⚠️ A 5xx or 408 may mean the job exists (and is billed): it is `ambiguous` — counted, held for review, never
 * re-POSTed. Over-counting costs one --retry; under-counting could cross the cap.
 */
function submitHttpError(status: number, detail: string): ProviderError {
  if (status === 408 || status >= 500) return new ProviderError(status === 408 ? 'timeout' : 'server', { httpStatus: status, ambiguous: true, detail });
  return new ProviderError(readHttpCode(status), { httpStatus: status, detail });
}

function readHttpCode(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'credits_exhausted';
  if (status === 404) return 'model_unavailable';
  if (status === 422) return 'validation';
  if (status === 429) return 'concurrency';
  if (status >= 500) return 'server';
  return 'bad_request';
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const j: unknown = JSON.parse(text);
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ─── Replicate · FLUX schnell ─────────────────────────────────────────────────────────────────────────────────────

export const REPLICATE_API_BASE = 'https://api.replicate.com/v1';
export const REPLICATE_MODEL = 'black-forest-labs/flux-schnell';
const FLUX_ASPECTS: ReadonlySet<string> = new Set(['1:1', '16:9', '21:9', '3:2', '2:3', '4:5', '5:4', '3:4', '4:3', '9:16', '9:21']);
const REPLICATE_MODEL_RE = /^[a-z0-9][a-z0-9-]{0,63}\/[a-z0-9][a-z0-9._-]{0,63}$/;
const REPLICATE_ID_RE = /^[a-z0-9]{8,64}$/i;
/** Replicate holds a `Prefer: wait` request open for at most 60 s; the timeout leaves room for the answer to arrive. */
const REPLICATE_WAIT_S = 60;
/** A `data:` output (sync mode may answer that way) — the prefix only; the payload is sliced, never matched. */
const DATA_IMAGE_RE = /^data:(image\/(?:png|jpeg|webp));base64,/;

export interface ReplicateArtClientOptions {
  token: string;
  fetchImpl?: typeof fetch;
  submitTimeoutMs?: number;
  readTimeoutMs?: number;
}

/** Splits a Replicate `output` (a URL, or a list of them) into https URLs to download and inline bytes. */
function replicateOutputs(output: unknown): { outputUrls: string[]; inline: InlineOutput[] } {
  const outputUrls: string[] = [];
  const inline: InlineOutput[] = [];
  for (const o of Array.isArray(output) ? output : [output]) {
    if (typeof o !== 'string') continue;
    if (/^https:\/\//i.test(o)) { outputUrls.push(o); continue; }
    const m = DATA_IMAGE_RE.exec(o.slice(0, 40));
    if (m) {
      const bytes = Buffer.from(o.slice(m[0].length), 'base64');
      if (bytes.byteLength) inline.push({ bytes, mimeType: m[1]! });
    }
  }
  return { outputUrls, inline };
}

function replicateStatus(p: Record<string, unknown>): ProviderStatus | null {
  switch (p.status) {
    case 'starting': return 'queued';
    case 'processing': return 'in_progress';
    case 'succeeded': return 'completed';
    // FLUX's safety checker fails the prediction with an "NSFW content detected" error.
    case 'failed': return /nsfw/i.test(String(p.error ?? '')) ? 'nsfw' : 'failed';
    case 'canceled':
    case 'aborted': return 'canceled';
    default: return null;
  }
}

function replicateResult(requestId: string, status: ProviderStatus, p: Record<string, unknown>): ArtResult {
  const { outputUrls, inline } = status === 'completed' ? replicateOutputs(p.output) : { outputUrls: [], inline: [] };
  return { requestId, status, outputUrls, inline, error: typeof p.error === 'string' ? p.error.slice(0, 500) : null, correlationId: null };
}

/**
 * FLUX schnell on Replicate. ⚠️ Replicate deletes a prediction's files about an hour after it finishes — unlike
 * Higgsfield's ≥ 7 days — so the take is downloaded the moment it is done (the submit waits for it), never later.
 */
export function createReplicateArtClient(o: ReplicateArtClientOptions): ArtClient {
  const doFetch = o.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const submitTimeoutMs = o.submitTimeoutMs ?? (REPLICATE_WAIT_S + 30) * 1000;
  const readTimeoutMs = o.readTimeoutMs ?? 20_000;
  const token = o.token.trim();

  return {
    provider: 'replicate',

    prepare(endpoint, input) {
      const s = plainSoulShot(endpoint, input);
      if (!FLUX_ASPECTS.has(s.aspectRatio)) throw refuse(`FLUX schnell has no ${s.aspectRatio} aspect ratio`);
      return {
        endpoint: REPLICATE_MODEL,
        input: {
          prompt: s.prompt,
          aspect_ratio: s.aspectRatio,
          num_outputs: s.images,
          ...(s.seed === null ? {} : { seed: s.seed }),
          // Lossless masters: build-thumbs.mjs makes the one JPEG.
          output_format: 'png',
        },
      };
    },

    async estimate(endpoint, input) {
      return staticQuote(endpoint, input.num_outputs);
    },

    /** POST /models/<owner>/<name>/predictions — EXACTLY ONCE. */
    async submit(endpoint, input) {
      if (!REPLICATE_MODEL_RE.test(endpoint) || priceOf(endpoint) === null) {
        throw new ProviderError('bad_request', { detail: `${endpoint} is not a priced Replicate model` });
      }
      if (!token) throw new ProviderError('not_configured');
      let res: Response;
      try {
        res = await doFetch(`${REPLICATE_API_BASE}/models/${endpoint}/predictions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: `wait=${REPLICATE_WAIT_S}` },
          body: JSON.stringify({ input }),
          cache: 'no-store',
          redirect: 'manual',
          signal: AbortSignal.timeout(submitTimeoutMs),
        });
      } catch (e) {
        throw new ProviderError(isTimeout(e) ? 'timeout' : 'network', { ambiguous: true, detail: scrubbed(e instanceof Error ? e.message : String(e), token) });
      }
      const text = await res.text().catch(() => '');
      if (res.status < 200 || res.status >= 300) throw submitHttpError(res.status, scrubbed(text, token));
      const p = parseJson(text);
      const id = p?.id;
      if (!p || typeof id !== 'string' || !REPLICATE_ID_RE.test(id)) {
        // Accepted but unreadable — the prediction probably exists. Ambiguous: counted, never re-POSTed.
        throw new ProviderError('bad_response', { httpStatus: res.status, ambiguous: true, detail: scrubbed(text, token) });
      }
      const status = replicateStatus(p) ?? 'queued';
      return { requestId: id, status, correlationId: null, ...(isTerminal(status) ? { result: replicateResult(id, status, p) } : {}) };
    },

    /** GET /predictions/<id> — the id from our own submit, never a URL from a payload. */
    async status(requestId) {
      if (!REPLICATE_ID_RE.test(requestId)) throw new ProviderError('bad_request', { detail: 'invalid prediction id' });
      if (!token) throw new ProviderError('not_configured');
      let res: Response;
      try {
        res = await doFetch(`${REPLICATE_API_BASE}/predictions/${requestId}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          redirect: 'manual',
          signal: AbortSignal.timeout(readTimeoutMs),
        });
      } catch (e) {
        throw new ProviderError(isTimeout(e) ? 'timeout' : 'network', { detail: scrubbed(e instanceof Error ? e.message : String(e), token) });
      }
      const text = await res.text().catch(() => '');
      if (res.status !== 200) throw new ProviderError(readHttpCode(res.status), { httpStatus: res.status, detail: scrubbed(text, token) });
      const p = parseJson(text);
      const status = p ? replicateStatus(p) : null;
      if (!p || !status) throw new ProviderError('bad_response', { httpStatus: res.status, detail: scrubbed(text, token) });
      return replicateResult(requestId, status, p);
    },
  };
}

// ─── Google · Imagen 4 on the Gemini API ──────────────────────────────────────────────────────────────────────────

/** The host lib/veo/geminiTransport.ts uses (that module cannot load here: `server-only` + `@/` imports). */
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const IMAGEN_MODEL = 'imagen-4.0-generate-001';
const IMAGEN_ASPECTS: ReadonlySet<string> = new Set(['1:1', '3:4', '4:3', '9:16', '16:9']);
const IMAGEN_MODEL_RE = /^imagen-[a-z0-9][a-z0-9.-]{0,63}$/;
/** Four 1K images are generated inside the one request. */
const IMAGEN_TIMEOUT_MS = 120_000;

export interface ImagenArtClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Imagen answers the POST with the images themselves (base64): no request to poll, no URL to fetch — the bytes go
 * straight to disk. ⚠️ The key travels ONLY in the `x-goog-api-key` header, never `?key=` (a URL ends up in logs,
 * traces and error reports), with `redirect: 'manual'` so it is never carried to another host.
 */
export function createImagenArtClient(o: ImagenArtClientOptions): ArtClient {
  const doFetch = o.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const apiKey = o.apiKey.trim();

  return {
    provider: 'imagen',

    prepare(endpoint, input) {
      const s = plainSoulShot(endpoint, input);
      if (!IMAGEN_ASPECTS.has(s.aspectRatio)) throw refuse(`Imagen has no ${s.aspectRatio} aspect ratio`);
      // No seed: the Gemini API's Imagen takes none. 'allow_all' as lib/ai/geminiImagen.ts sends it (the key's provisioning).
      return {
        endpoint: IMAGEN_MODEL,
        input: { instances: [{ prompt: s.prompt }], parameters: { sampleCount: s.images, aspectRatio: s.aspectRatio, personGeneration: 'allow_all' } },
      };
    },

    async estimate(endpoint, input) {
      return staticQuote(endpoint, (input.parameters as { sampleCount?: unknown } | undefined)?.sampleCount);
    },

    /** POST /models/<model>:predict — EXACTLY ONCE; the answer IS the finished take. */
    async submit(endpoint, input) {
      if (!IMAGEN_MODEL_RE.test(endpoint) || priceOf(endpoint) === null) {
        throw new ProviderError('bad_request', { detail: `${endpoint} is not a priced Imagen model` });
      }
      if (!apiKey) throw new ProviderError('not_configured');
      let res: Response;
      try {
        res = await doFetch(`${GEMINI_API_BASE}/models/${endpoint}:predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-goog-api-key': apiKey },
          body: JSON.stringify(input),
          cache: 'no-store',
          redirect: 'manual',
          signal: AbortSignal.timeout(o.timeoutMs ?? IMAGEN_TIMEOUT_MS),
        });
      } catch (e) {
        throw new ProviderError(isTimeout(e) ? 'timeout' : 'network', { ambiguous: true, detail: scrubbed(e instanceof Error ? e.message : String(e), apiKey) });
      }
      const text = await res.text().catch(() => '');
      if (res.status < 200 || res.status >= 300) throw submitHttpError(res.status, scrubbed(text, apiKey));
      const p = parseJson(text);
      if (!p) throw new ProviderError('bad_response', { httpStatus: res.status, ambiguous: true, detail: scrubbed(text, apiKey) });

      const inline: InlineOutput[] = [];
      for (const pred of Array.isArray(p.predictions) ? p.predictions : []) {
        const { bytesBase64Encoded: b64, mimeType } = (pred ?? {}) as { bytesBase64Encoded?: unknown; mimeType?: unknown };
        if (typeof b64 !== 'string' || !b64) continue; // a filtered sample carries a reason, not bytes
        const bytes = Buffer.from(b64, 'base64');
        if (bytes.byteLength) inline.push({ bytes, mimeType: typeof mimeType === 'string' && mimeType ? mimeType : 'image/png' });
      }
      // There is no provider request id: a local one marks the attempt as submitted (and so counted).
      const requestId = `imagen-${randomUUID()}`;
      const status: ProviderStatus = inline.length ? 'completed' : 'nsfw';
      const error = inline.length ? null : 'every sample was filtered — no image returned';
      return { requestId, status, correlationId: null, result: { requestId, status, outputUrls: [], inline, error, correlationId: null } };
    },

    async status() {
      throw new ProviderError('not_found', { detail: 'Imagen answers inline — there is no request to poll' });
    },
  };
}
