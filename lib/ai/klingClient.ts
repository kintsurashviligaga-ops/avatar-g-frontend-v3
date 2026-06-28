/**
 * lib/ai/klingClient.ts
 * =====================
 * OFFICIAL Kling AI API client (api.klingai.com) — direct integration, NOT the
 * Replicate proxy. The official API authenticates with a short-lived **HS256 JWT**
 * signed from an Access Key (AccessKey → `iss`) + Secret Key (the HMAC secret), NOT a
 * single bearer "apikey-…" token (that returns `{"code":1000,"message":"Auth failed"}`).
 *
 * Credentials (server-only env):
 *   KLING_ACCESS_KEY  — the Access Key (becomes the JWT `iss`)
 *   KLING_SECRET_KEY  — the Secret Key (HMAC-SHA256 signing secret)
 *   KLING_API_BASE    — default https://api.klingai.com
 *   KLING_MODEL       — default kling-v1-6 (set kling-v2-master when entitled)
 *
 * STRICTLY ADDITIVE: nothing imports this yet. The video pipeline keeps using the
 * proven Replicate Kling path until auth is verified; then i2v is wired here with a
 * Replicate fallback so a Kling miss can never break a render.
 */
import 'server-only';
import { createHmac } from 'node:crypto';

const KLING_API_BASE = (process.env.KLING_API_BASE || 'https://api.klingai.com').replace(/\/$/, '');

export const KLING_MODELS = {
  V2_MASTER: 'kling-v2-master',
  V2_1_MASTER: 'kling-v2-1-master',
  V1_6: 'kling-v1-6',
  V1_5: 'kling-v1-5',
} as const;

function accessKey(): string { return String(process.env.KLING_ACCESS_KEY || '').trim(); }
function secretKey(): string { return String(process.env.KLING_SECRET_KEY || '').trim(); }

/** True only when BOTH halves of the official credential pair are present. */
export function klingConfigured(): boolean {
  return accessKey().length > 0 && secretKey().length > 0;
}

const b64url = (buf: Buffer | string): string =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Sign the official Kling JWT (HS256). Header {alg:HS256,typ:JWT}; payload
 * {iss: accessKey, exp: now+30min, nbf: now-5s}. Returns null when unconfigured.
 */
export function signKlingJwt(nowSec?: number): string | null {
  const ak = accessKey(); const sk = secretKey();
  if (!ak || !sk) return null;
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: ak, exp: now + 1800, nbf: now - 5 }));
  const sig = b64url(createHmac('sha256', sk).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

async function klingFetch(path: string, init: RequestInit & { nowSec?: number } = {}): Promise<{ ok: boolean; status: number; json: any }> {
  const jwt = signKlingJwt(init.nowSec);
  if (!jwt) return { ok: false, status: 0, json: { error: 'KLING_ACCESS_KEY / KLING_SECRET_KEY not configured' } };
  const res = await fetch(`${KLING_API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export interface KlingI2VParams {
  imageUrl: string;
  prompt: string;
  negativePrompt?: string;
  modelName?: string;
  duration?: '5' | '10';
  aspectRatio?: '9:16' | '16:9' | '1:1';
  mode?: 'std' | 'pro';
  cfgScale?: number;
  signal?: AbortSignal;
  onProgress?: (msg: string) => void;
}

export interface KlingV2VParams extends Omit<KlingI2VParams, 'imageUrl'> {
  /** Identity anchor (character portrait). */
  imageUrl: string;
  /** Motion anchor (reference video URL) whose movement is transferred. */
  videoUrl: string;
}

/** Image → Video. Resolves to a hosted MP4 URL, or null on any miss (fail-open). */
export async function klingImageToVideo(p: KlingI2VParams): Promise<string | null> {
  const { json, ok, status } = await klingFetch('/v1/videos/image2video', {
    method: 'POST',
    body: JSON.stringify({
      model_name: p.modelName || process.env.KLING_MODEL || KLING_MODELS.V1_6,
      image: p.imageUrl,
      prompt: p.prompt,
      negative_prompt: p.negativePrompt ?? '',
      duration: p.duration ?? '5',
      aspect_ratio: p.aspectRatio ?? '9:16',
      mode: p.mode ?? 'pro',
      cfg_scale: typeof p.cfgScale === 'number' ? p.cfgScale : 0.5,
    }),
    signal: p.signal,
  });
  const taskId = json?.data?.task_id ?? json?.task_id;
  if (!ok || !taskId) {
    // eslint-disable-next-line no-console
    console.warn('[kling] i2v dispatch failed:', status, JSON.stringify(json).slice(0, 200));
    return null;
  }
  return pollKlingTask(taskId, '/v1/videos/image2video', p.signal, p.onProgress);
}

/** Video → Video (motion transfer onto the character). Fail-open → null. */
export async function klingVideoToVideo(p: KlingV2VParams): Promise<string | null> {
  const { json, ok, status } = await klingFetch('/v1/videos/video2video', {
    method: 'POST',
    body: JSON.stringify({
      model_name: p.modelName || process.env.KLING_MODEL || KLING_MODELS.V2_MASTER,
      image: p.imageUrl,
      video_url: p.videoUrl,
      prompt: p.prompt,
      negative_prompt: p.negativePrompt ?? '',
      duration: p.duration ?? '5',
      aspect_ratio: p.aspectRatio ?? '9:16',
      mode: p.mode ?? 'pro',
    }),
    signal: p.signal,
  });
  const taskId = json?.data?.task_id ?? json?.task_id;
  if (!ok || !taskId) {
    // eslint-disable-next-line no-console
    console.warn('[kling] v2v dispatch failed:', status, JSON.stringify(json).slice(0, 200));
    return null;
  }
  return pollKlingTask(taskId, '/v1/videos/video2video', p.signal, p.onProgress);
}

/** Poll a Kling task to completion → first video URL, or null (fail-open). */
export async function pollKlingTask(
  taskId: string,
  endpoint: string,
  signal?: AbortSignal,
  onProgress?: (msg: string) => void,
  maxAttempts = 60,
  intervalMs = 5000,
): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i += 1) {
    if (signal?.aborted) return null;
    await new Promise((r) => setTimeout(r, intervalMs));
    const { json } = await klingFetch(`${endpoint}/${taskId}`, { method: 'GET', signal });
    const task = json?.data ?? json;
    const status = task?.task_status;
    onProgress?.(`[kling] ${i + 1}/${maxAttempts}: ${status ?? 'polling'}`);
    if (status === 'succeed') {
      const url = task?.task_result?.videos?.[0]?.url;
      return typeof url === 'string' && url.length > 0 ? url : null;
    }
    if (status === 'failed') {
      // eslint-disable-next-line no-console
      console.warn('[kling] task failed:', JSON.stringify(task).slice(0, 200));
      return null;
    }
  }
  return null;
}

/** Lightweight auth probe — dispatches nothing; returns whether the JWT is accepted. */
export async function klingAuthOk(): Promise<{ ok: boolean; status: number; message: string }> {
  if (!klingConfigured()) return { ok: false, status: 0, message: 'not configured (need KLING_ACCESS_KEY + KLING_SECRET_KEY)' };
  // /account/costs is the cheapest authenticated read on the official API.
  const { ok, status, json } = await klingFetch('/account/costs', { method: 'GET' });
  return { ok, status, message: ok ? 'auth ok' : String(json?.message || json?.error || `HTTP ${status}`) };
}
