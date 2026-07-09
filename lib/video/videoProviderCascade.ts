/**
 * lib/video/videoProviderCascade.ts
 * =================================
 * A structured VideoProvider abstraction + an ORDERED fallback cascade for image→video (i2v)
 * generation. The cascade tries each configured provider in priority order and falls through on a
 * connection drop / rate-limit / API error to the next tier:
 *
 *   1. kling-native    — Kling AI native API (api.klingai.com), JWT (AccessKey/SecretKey) auth   [PRIMARY]
 *   2. luma            — Luma Dream Machine (api.lumalabs.ai/dream-machine/v1)                    [2nd tier]
 *   3. ltx             — LTX / Lightricks async API (api.ltx.video/v2)                           [3rd tier]
 *   4. replicate-kling — Kling via Replicate (REPLICATE_API_TOKEN) — the VERIFIED production path [FINAL]
 *
 * Endpoints/headers/bodies are taken from each provider's CURRENT official API reference (2026-07):
 *   Kling  POST /v1/videos/image2video  → data.task_id ;  GET /v1/videos/image2video/{id} → data.task_status
 *          ('submitted'|'processing'|'succeed'|'failed'), url at data.task_result.videos[0].url. JWT bearer:
 *          HS256, claims { iss: accessKey, exp: now+1800, nbf: now-5 }.
 *   Luma   POST /dream-machine/v1/generations → id ; GET /dream-machine/v1/generations/{id} → state
 *          ('queued'|'dreaming'|'completed'|'failed'), url at assets.video. Image-to-video via keyframes.frame0.
 *   LTX    POST /v2/image-to-video (or /v2/text-to-video) → id ; GET /v2/{endpoint}/{id} → status
 *          ('pending'|'processing'|'completed'|'failed'), url at result.video_url.
 *   Replicate  POST /v1/models/{model}/predictions → id ; GET /v1/predictions/{id} → status, url at output.
 *
 * ARCHITECTURE — the cascade happens at SUBMIT time only (each submit is a fast, bounded POST). It returns
 * the winning provider + its opaque task id; the caller POLLS separately via pollVideoProvider(). This
 * preserves the non-blocking submit→poll pattern that fixed the 504 gateway timeouts — no provider is ever
 * awaited to completion inside a single request.
 *
 * Kept free of `server-only`/Next/Supabase and with an injectable fetch + env so the whole cascade (incl. the
 * Kling→Luma→LTX→Replicate fall-through) is unit-testable without network or a live key. Keys are read ONLY
 * from env; a value is never logged or returned to callers except as the outbound bearer/JWT secret.
 */
import { createHmac } from 'crypto';
import { resolveLtxApiKey } from '@/lib/chat/ltxKey';

export type Aspect = '9:16' | '16:9' | '1:1';
export interface VideoGenInput {
  prompt: string;
  /** i2v anchor frame (public URL). Absent → text-to-video where the provider supports it. */
  imageUrl?: string;
  negativePrompt?: string;
  aspectRatio?: Aspect;
  durationSec?: 5 | 10;
}

export type VideoPollStatus = 'processing' | 'succeeded' | 'failed';
export interface VideoPollResult { status: VideoPollStatus; url: string | null; error?: string }

export type FetchLike = typeof fetch;

export interface VideoProvider {
  readonly name: 'kling-native' | 'luma' | 'ltx' | 'replicate-kling';
  /** True iff this provider's credentials are present in env — an unconfigured provider is skipped. */
  isConfigured(env: NodeJS.ProcessEnv): boolean;
  /**
   * Non-blocking submit → an opaque provider task id (the string pollVideoProvider needs to poll THIS
   * provider). THROWS on a connection drop / rate-limit / non-2xx / missing id so the cascade falls through.
   */
  submit(input: VideoGenInput, env: NodeJS.ProcessEnv, fetchImpl: FetchLike): Promise<string>;
  /** Poll one task once → normalized status. A transient fetch miss reports 'processing' (keep polling). */
  poll(taskId: string, env: NodeJS.ProcessEnv, fetchImpl: FetchLike): Promise<VideoPollResult>;
}

const SUBMIT_TIMEOUT_MS = 20_000;
const POLL_TIMEOUT_MS = 20_000;

function firstNonEmpty(env: NodeJS.ProcessEnv, ...names: string[]): string | null {
  for (const n of names) { const v = env[n]; if (typeof v === 'string' && v.trim()) return v.trim(); }
  return null;
}
function b64url(s: string): string { return Buffer.from(s, 'utf8').toString('base64url'); }

// ── 1. Kling native (JWT AccessKey/SecretKey) ──────────────────────────────────────────────────────
/** Build a short-lived HS256 JWT from the Kling AccessKey/SecretKey (iss=ak, exp=+30min, nbf=-5s). */
export function klingJwt(accessKey: string, secretKey: string, nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: accessKey, exp: nowSec + 1800, nbf: nowSec - 5 }));
  const sig = createHmac('sha256', secretKey).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export const klingNativeProvider: VideoProvider = {
  name: 'kling-native',
  isConfigured: (env) => !!firstNonEmpty(env, 'KLING_ACCESS_KEY') && !!firstNonEmpty(env, 'KLING_SECRET_KEY'),
  async submit(input, env, fetchImpl) {
    const ak = firstNonEmpty(env, 'KLING_ACCESS_KEY')!;
    const sk = firstNonEmpty(env, 'KLING_SECRET_KEY')!;
    const base = firstNonEmpty(env, 'KLING_API_BASE') ?? 'https://api.klingai.com';
    const model = firstNonEmpty(env, 'KLING_MODEL_NATIVE') ?? 'kling-v2-1';
    const jwt = klingJwt(ak, sk, Math.floor(Date.now() / 1000));
    const body: Record<string, unknown> = {
      model_name: model,
      prompt: input.prompt,
      duration: String(input.durationSec ?? 5),
      aspect_ratio: input.aspectRatio ?? '9:16',
      ...(input.imageUrl ? { image: input.imageUrl } : {}),
      ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
    };
    const res = await fetchImpl(`${base}/v1/videos/image2video`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`kling-native submit ${res.status}`);
    const j = (await res.json().catch(() => ({}))) as { data?: { task_id?: string } };
    const id = j?.data?.task_id;
    if (!id) throw new Error('kling-native submit: no task_id');
    return id;
  },
  async poll(taskId, env, fetchImpl) {
    const ak = firstNonEmpty(env, 'KLING_ACCESS_KEY');
    const sk = firstNonEmpty(env, 'KLING_SECRET_KEY');
    if (!ak || !sk) return { status: 'failed', url: null, error: 'kling-native not configured' };
    const base = firstNonEmpty(env, 'KLING_API_BASE') ?? 'https://api.klingai.com';
    const jwt = klingJwt(ak, sk, Math.floor(Date.now() / 1000));
    try {
      const res = await fetchImpl(`${base}/v1/videos/image2video/${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${jwt}` }, cache: 'no-store', signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
      });
      if (!res.ok) return { status: 'processing', url: null };
      const j = (await res.json().catch(() => ({}))) as { data?: { task_status?: string; task_result?: { videos?: { url?: string }[] } } };
      const st = j?.data?.task_status;
      if (st === 'succeed') {
        const url = j?.data?.task_result?.videos?.[0]?.url ?? null;
        return url ? { status: 'succeeded', url } : { status: 'failed', url: null, error: 'kling-native: no output url' };
      }
      if (st === 'failed') return { status: 'failed', url: null, error: 'kling-native generation failed' };
      return { status: 'processing', url: null };
    } catch { return { status: 'processing', url: null }; }
  },
};

// ── 2. Luma Dream Machine ───────────────────────────────────────────────────────────────────────────
export const lumaProvider: VideoProvider = {
  name: 'luma',
  isConfigured: (env) => !!firstNonEmpty(env, 'LUMA_API_KEY'),
  async submit(input, env, fetchImpl) {
    const key = firstNonEmpty(env, 'LUMA_API_KEY')!;
    const base = firstNonEmpty(env, 'LUMA_API_BASE') ?? 'https://api.lumalabs.ai';
    const model = firstNonEmpty(env, 'LUMA_MODEL') ?? 'ray-2';
    const body: Record<string, unknown> = {
      prompt: input.prompt,
      model,
      aspect_ratio: input.aspectRatio ?? '9:16',
      ...(input.imageUrl ? { keyframes: { frame0: { type: 'image', url: input.imageUrl } } } : {}),
    };
    const res = await fetchImpl(`${base}/dream-machine/v1/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`luma submit ${res.status}`);
    const j = (await res.json().catch(() => ({}))) as { id?: string };
    if (!j?.id) throw new Error('luma submit: no id');
    return j.id;
  },
  async poll(taskId, env, fetchImpl) {
    const key = firstNonEmpty(env, 'LUMA_API_KEY');
    if (!key) return { status: 'failed', url: null, error: 'luma not configured' };
    const base = firstNonEmpty(env, 'LUMA_API_BASE') ?? 'https://api.lumalabs.ai';
    try {
      const res = await fetchImpl(`${base}/dream-machine/v1/generations/${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
      });
      if (!res.ok) return { status: 'processing', url: null };
      const j = (await res.json().catch(() => ({}))) as { state?: string; assets?: { video?: string }; failure_reason?: string };
      if (j?.state === 'completed') {
        const url = j?.assets?.video ?? null;
        return url ? { status: 'succeeded', url } : { status: 'failed', url: null, error: 'luma: no output url' };
      }
      if (j?.state === 'failed') return { status: 'failed', url: null, error: j?.failure_reason || 'luma generation failed' };
      return { status: 'processing', url: null };
    } catch { return { status: 'processing', url: null }; }
  },
};

// ── 3. LTX / Lightricks (async v2) ────────────────────────────────────────────────────────────────
// The poll path is endpoint-specific (GET /v2/{endpoint}/{id}), so submit() returns "<endpoint>::<id>".
export const ltxProvider: VideoProvider = {
  name: 'ltx',
  isConfigured: (env) => resolveLtxApiKey(env) !== null,
  async submit(input, env, fetchImpl) {
    const key = resolveLtxApiKey(env);
    if (!key) throw new Error('ltx not configured');
    const base = firstNonEmpty(env, 'LTX_API_BASE') ?? 'https://api.ltx.video';
    const model = firstNonEmpty(env, 'LTX_NATIVE_MODEL') ?? 'ltxv-2';
    const endpoint = input.imageUrl ? 'image-to-video' : 'text-to-video';
    const body: Record<string, unknown> = {
      prompt: input.prompt,
      model,
      duration: input.durationSec ?? 5,
      resolution: '720p',
      ...(input.imageUrl ? { image_uri: input.imageUrl } : {}),
    };
    const res = await fetchImpl(`${base}/v2/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`ltx submit ${res.status}`);
    const j = (await res.json().catch(() => ({}))) as { id?: string };
    if (!j?.id) throw new Error('ltx submit: no id');
    return `${endpoint}::${j.id}`;
  },
  async poll(taskId, env, fetchImpl) {
    const key = resolveLtxApiKey(env);
    if (!key) return { status: 'failed', url: null, error: 'ltx not configured' };
    const base = firstNonEmpty(env, 'LTX_API_BASE') ?? 'https://api.ltx.video';
    const sep = taskId.indexOf('::');
    const endpoint = sep > 0 ? taskId.slice(0, sep) : 'image-to-video';
    const id = sep > 0 ? taskId.slice(sep + 2) : taskId;
    try {
      const res = await fetchImpl(`${base}/v2/${endpoint}/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${key}` }, cache: 'no-store', signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
      });
      if (!res.ok) return { status: 'processing', url: null };
      const j = (await res.json().catch(() => ({}))) as { status?: string; result?: { video_url?: string }; error?: string };
      if (j?.status === 'completed') {
        const url = j?.result?.video_url ?? null;
        return url ? { status: 'succeeded', url } : { status: 'failed', url: null, error: 'ltx: no output url' };
      }
      if (j?.status === 'failed') return { status: 'failed', url: null, error: j?.error || 'ltx generation failed' };
      return { status: 'processing', url: null };
    } catch { return { status: 'processing', url: null }; }
  },
};

// ── 4. Replicate → Kling (the VERIFIED production path) — the absolute final fallback ────────────────
export const replicateKlingProvider: VideoProvider = {
  name: 'replicate-kling',
  isConfigured: (env) => !!firstNonEmpty(env, 'REPLICATE_API_TOKEN'),
  async submit(input, env, fetchImpl) {
    const token = firstNonEmpty(env, 'REPLICATE_API_TOKEN')!;
    const model = firstNonEmpty(env, 'KLING_MODEL', 'REPLICATE_VIDEO_MODEL') ?? 'kwaivgi/kling-v2.1-master';
    const isV16 = /v1[.\-]6/.test(model);
    const input_: Record<string, unknown> = {
      prompt: input.prompt,
      negative_prompt: input.negativePrompt ?? 'blur, distortion, low quality, watermark',
      duration: input.durationSec ?? 5,
      aspect_ratio: input.aspectRatio ?? '9:16',
      ...(input.imageUrl ? { start_image: input.imageUrl } : {}),
      ...(isV16 ? { cfg_scale: 0.5 } : {}),
    };
    const res = await fetchImpl(`https://api.replicate.com/v1/models/${model}/predictions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ input: input_ }),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`replicate-kling submit ${res.status}`);
    const j = (await res.json().catch(() => ({}))) as { id?: string };
    if (!j?.id) throw new Error('replicate-kling submit: no id');
    return j.id;
  },
  async poll(taskId, env, fetchImpl) {
    const token = firstNonEmpty(env, 'REPLICATE_API_TOKEN');
    if (!token) return { status: 'failed', url: null, error: 'replicate not configured' };
    try {
      const res = await fetchImpl(`https://api.replicate.com/v1/predictions/${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
      });
      if (!res.ok) return { status: 'processing', url: null };
      const j = (await res.json().catch(() => ({}))) as { status?: string; output?: unknown; error?: unknown };
      if (j?.status === 'succeeded') {
        const url = normalizeReplicateOutput(j.output);
        return url ? { status: 'succeeded', url } : { status: 'failed', url: null, error: 'replicate: no output url' };
      }
      if (j?.status === 'failed' || j?.status === 'canceled') {
        return { status: 'failed', url: null, error: typeof j.error === 'string' ? j.error : 'replicate generation failed' };
      }
      return { status: 'processing', url: null };
    } catch { return { status: 'processing', url: null }; }
  },
};

function normalizeReplicateOutput(output: unknown): string | null {
  if (!output) return null;
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return normalizeReplicateOutput(output[0]);
  const o = output as { url?: unknown };
  if (typeof o.url === 'string') return o.url;
  return null;
}

/** The ordered fallback array — priority DESC, Replicate→Kling last so the verified path always backstops. */
export const VIDEO_PROVIDER_CASCADE: readonly VideoProvider[] = [
  klingNativeProvider,
  lumaProvider,
  ltxProvider,
  replicateKlingProvider,
];

export interface CascadeAttempt { provider: string; ok: boolean; skipped?: boolean; error?: string }
export interface CascadeSubmitResult { provider: VideoProvider['name']; taskId: string; attempts: CascadeAttempt[] }

export class VideoCascadeError extends Error {
  attempts: CascadeAttempt[];
  constructor(message: string, attempts: CascadeAttempt[]) { super(message); this.name = 'VideoCascadeError'; this.attempts = attempts; }
}

export interface CascadeOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  providers?: readonly VideoProvider[];
}

/**
 * Submit to the FIRST configured provider that accepts the job, cascading on any failure (connection drop,
 * rate-limit, non-2xx) to the next tier. Unconfigured providers are skipped (no key = not attempted). Fast:
 * only submits are made here — never a completion wait. Throws VideoCascadeError if every tier fails/skips.
 */
export async function submitVideoWithFallback(input: VideoGenInput, opts: CascadeOptions = {}): Promise<CascadeSubmitResult> {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const providers = opts.providers ?? VIDEO_PROVIDER_CASCADE;
  const attempts: CascadeAttempt[] = [];
  for (const p of providers) {
    if (!p.isConfigured(env)) { attempts.push({ provider: p.name, ok: false, skipped: true, error: 'not-configured' }); continue; }
    try {
      const taskId = await p.submit(input, env, fetchImpl);
      attempts.push({ provider: p.name, ok: true });
      return { provider: p.name, taskId, attempts };
    } catch (err) {
      attempts.push({ provider: p.name, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  throw new VideoCascadeError('all video providers failed or unconfigured', attempts);
}

/** Poll a task on the provider that won the cascade. Dispatches to that provider's poll(). */
export async function pollVideoProvider(providerName: string, taskId: string, opts: CascadeOptions = {}): Promise<VideoPollResult> {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const providers = opts.providers ?? VIDEO_PROVIDER_CASCADE;
  const p = providers.find((x) => x.name === providerName);
  if (!p) return { status: 'failed', url: null, error: `unknown video provider: ${providerName}` };
  return p.poll(taskId, env, fetchImpl);
}

/**
 * True when a genuinely-NEW cascade provider (native Kling or Luma) is provisioned. The live pipeline
 * already uses Replicate + LTX, so those alone must NOT flip rendering onto the new cascade — this gate
 * keeps the verified production path byte-identical until a native Kling/Luma key is added.
 */
export function shouldUseNativeCascade(env: NodeJS.ProcessEnv = process.env): boolean {
  return klingNativeProvider.isConfigured(env) || lumaProvider.isConfigured(env);
}
