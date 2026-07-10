/**
 * renderProviders — the IMPURE provider-adapter layer for the async render worker.
 *
 * Each adapter implements the same tiny contract the worker loop drives: `submit()` kicks off an
 * external provider job and returns its task id; `poll()` checks that task and maps the provider's
 * state onto a ProviderResolution the pure state machine understands. Real adapters call Replicate
 * (MusicGen / Kling / Hailuo) and ElevenLabs; the mock adapter completes deterministically after N
 * polls so the WHOLE pipeline is provable end-to-end in tests without keys, credits, or network.
 *
 * Webhooks are supported the SAFE way: `verifyReplicateWebhook` HMAC-verifies the signature before
 * trusting a payload, so a webhook receiver (if mounted) can't be spoofed into ingesting fake assets.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ProviderResolution, RenderJobKind } from './asyncRenderQueue';
import { VIDEO_PRIMARY_MODEL } from '@/lib/video/modelLock';

export interface SubmitResult {
  ok: boolean;
  taskId?: string;
  error?: string;
}

export interface ProviderAdapter {
  readonly kind: RenderJobKind;
  readonly model: string;
  submit(params: Record<string, unknown>): Promise<SubmitResult>;
  poll(taskId: string): Promise<ProviderResolution>;
}

const REPLICATE_CREATE = 'https://api.replicate.com/v1/models';
const CREATE_TIMEOUT_MS = 20_000;

/** Map a Replicate prediction status → our resolution. */
function fromReplicateStatus(status: string | undefined, output: unknown): ProviderResolution {
  if (status === 'succeeded') {
    const url = extractUrl(output);
    return url ? { status: 'completed', url } : { status: 'failed', error: 'succeeded but no output url' };
  }
  if (status === 'failed' || status === 'canceled') return { status: 'failed', error: `provider ${status}` };
  return { status: 'processing' };
}

/** Replicate outputs are a url string, or an array/object whose first url-ish value we want. */
export function extractUrl(output: unknown): string | null {
  if (typeof output === 'string' && /^https?:\/\//.test(output)) return output;
  if (Array.isArray(output)) {
    for (const o of output) { const u = extractUrl(o); if (u) return u; }
  }
  if (output && typeof output === 'object') {
    for (const v of Object.values(output as Record<string, unknown>)) { const u = extractUrl(v); if (u) return u; }
  }
  return null;
}

/**
 * A generic Replicate adapter — powers music (MusicGen), video (Kling / Hailuo i2v), and any TTS
 * model exposed on Replicate. `buildInput` shapes the model-specific request body from the shot params.
 */
export function replicateAdapter(opts: {
  kind: RenderJobKind;
  model: string;
  token: string;
  buildInput: (params: Record<string, unknown>) => Record<string, unknown>;
}): ProviderAdapter {
  const { kind, model, token, buildInput } = opts;
  return {
    kind,
    model,
    async submit(params) {
      try {
        const r = await fetch(`${REPLICATE_CREATE}/${model}/predictions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: buildInput(params) }),
          signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
        });
        if (!r.ok) return { ok: false, error: `create ${r.status}` };
        const j = (await r.json().catch(() => ({}))) as { id?: string };
        return j.id ? { ok: true, taskId: j.id } : { ok: false, error: 'no prediction id' };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'submit error' };
      }
    },
    async poll(taskId) {
      try {
        const r = await fetch(`https://api.replicate.com/v1/predictions/${taskId}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
        });
        if (!r.ok) return { status: 'processing' }; // transient — keep polling, the job timeout is the backstop
        const j = (await r.json().catch(() => ({}))) as { status?: string; output?: unknown };
        return fromReplicateStatus(j.status, j.output);
      } catch {
        return { status: 'processing' };
      }
    },
  };
}

/** Wire the real providers from env. A kind is only available if its key + model resolve. */
export function realProviders(env: NodeJS.ProcessEnv = process.env): Partial<Record<RenderJobKind, ProviderAdapter>> {
  const token = env.REPLICATE_API_TOKEN;
  if (!token) return {};
  const musicModel = env.REPLICATE_MUSIC_MODEL || 'meta/musicgen';
  const videoModel = env.REPLICATE_VIDEO_MODEL || VIDEO_PRIMARY_MODEL; // hard-locked Kling v2.1 default
  const ttsModel = env.REPLICATE_TTS_MODEL || 'jaaari/kokoro-82m';
  return {
    music: replicateAdapter({ kind: 'music', model: musicModel, token, buildInput: (p) => ({ prompt: String(p.prompt ?? ''), duration: Number(p.durationSec ?? 30) }) }),
    video: replicateAdapter({ kind: 'video', model: videoModel, token, buildInput: (p) => ({ prompt: String(p.prompt ?? ''), ...(p.startImage ? { start_image: p.startImage } : {}), aspect_ratio: String(p.aspect ?? '9:16') }) }),
    voiceover: replicateAdapter({ kind: 'voiceover', model: ttsModel, token, buildInput: (p) => ({ text: String(p.text ?? ''), voice: String(p.voice ?? 'af_heart') }) }),
  };
}

/**
 * A deterministic MOCK adapter. `submit` yields a fake task id; `poll` returns 'processing' for the
 * first `completeAfterPolls` checks, then 'completed' with a synthetic URL. Lets the full worker loop
 * be proven end-to-end (submit → many polls → asset delivered) with zero network / keys / credits.
 */
export function mockAdapter(opts: { kind: RenderJobKind; completeAfterPolls?: number; failAfterPolls?: number; urlFor?: (slot: string) => string }): ProviderAdapter {
  const completeAfter = opts.completeAfterPolls ?? 3;
  const polled = new Map<string, number>();
  return {
    kind: opts.kind,
    model: `mock:${opts.kind}`,
    async submit(params) {
      return { ok: true, taskId: `mock_${opts.kind}_${String((params as Record<string, unknown>).slot ?? 'x')}` };
    },
    async poll(taskId) {
      const n = (polled.get(taskId) ?? 0) + 1;
      polled.set(taskId, n);
      if (opts.failAfterPolls && n >= opts.failAfterPolls) return { status: 'failed', error: 'mock failure' };
      if (n >= completeAfter) return { status: 'completed', url: `https://mock.local/${taskId}.out` };
      return { status: 'processing' };
    },
  };
}

/**
 * Verify + parse a Replicate (svix-style) webhook. HMAC-SHA256 over `${id}.${timestamp}.${body}`,
 * base64, compared in constant time against the provided signature(s). Returns the resolution ONLY
 * on a valid signature — an unsigned / forged payload yields null (never ingested).
 */
export function verifyReplicateWebhook(
  rawBody: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  secret: string,
): { taskId: string; resolution: ProviderResolution } | null {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !secret) return null;
  // Replicate/svix secrets are base64 with a `whsec_` prefix.
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  const provided = signature.split(' ').map((s) => s.split(',').pop() ?? s); // "v1,<sig> v1,<sig>"
  const ok = provided.some((p) => {
    try { return timingSafeEqual(Buffer.from(expected), Buffer.from(p)); } catch { return false; }
  });
  if (!ok) return null;
  let payload: { id?: string; status?: string; output?: unknown };
  try { payload = JSON.parse(rawBody); } catch { return null; }
  if (!payload.id) return null;
  return { taskId: payload.id, resolution: fromReplicateStatus(payload.status, payload.output) };
}
