/**
 * lib/ai/klingClient.ts
 * =====================
 * Kling AI via Replicate (pay-as-you-go on the existing REPLICATE_API_TOKEN). The
 * native api.klingai.com path was dropped (needs AK/SK JWT) and Atlas has no video —
 * Replicate is the only working Kling for us, and it already powers the film pipeline.
 *
 * Discovered live on Replicate (2026-06-28):
 *   kwaivgi/kling-v2.1-master ✅ BEST — inputs: prompt, duration, start_image,
 *     aspect_ratio, negative_prompt (NO cfg_scale / reference_images).
 *   kwaivgi/kling-v1.6-pro    ✅ — adds cfg_scale, end_image, reference_images.
 *   kling-v2-master / v2.0-pro → 404 (don't exist on Replicate).
 *   TRUE video2video motion transfer → NONE exist → V2V falls back to I2V.
 *
 * Env: REPLICATE_API_TOKEN (required), KLING_MODEL (override the default model).
 */
import 'server-only';
import Replicate from 'replicate';

export const KLING_MODELS = {
  BEST: (process.env.KLING_MODEL || 'kwaivgi/kling-v2.1-master') as `${string}/${string}`,
  V21_MASTER: 'kwaivgi/kling-v2.1-master' as const,
  V16_PRO: 'kwaivgi/kling-v1.6-pro' as const,
  V16_STD: 'kwaivgi/kling-v1.6-standard' as const,
} as const;

export const KLING_NEGATIVE = [
  'blur', 'distortion', 'low quality', 'watermark', 'text overlay',
  'bad anatomy', 'deformed face', 'different person', 'extra people',
  'inconsistent clothing', 'glitch', 'artifact', 'overexposed', 'underexposed',
].join(', ');

function token(): string { return String(process.env.REPLICATE_API_TOKEN || '').trim(); }
export function klingConfigured(): boolean { return token().length > 0; }

function pickUrl(output: unknown): string | null {
  // Replicate Kling returns a URL string; the SDK may wrap it as a FileOutput
  // (has .url()) or an array. Normalise all shapes to a plain https URL.
  if (!output) return null;
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return pickUrl(output[0]);
  const o = output as { url?: unknown };
  if (typeof o.url === 'function') { try { return String((o.url as () => unknown)()); } catch { return null; } }
  if (typeof o.url === 'string') return o.url;
  return null;
}

export interface KlingI2VInput {
  imageUrl: string;
  prompt: string;
  negativePrompt?: string;
  modelName?: `${string}/${string}`;
  duration?: 5 | 10;
  aspectRatio?: '9:16' | '16:9' | '1:1';
  cfgScale?: number;
  onProgress?: (msg: string) => void;
}

export interface KlingV2VInput extends KlingI2VInput {
  /** Motion reference video. NOTE: Replicate Kling has no true V2V, so this is
   *  currently informational — generation falls back to motion-prompt I2V. */
  videoUrl: string;
}

/** Image → Video. Returns a hosted MP4 URL; throws on failure (caller decides). */
export async function klingImageToVideo(p: KlingI2VInput): Promise<string> {
  if (!klingConfigured()) throw new Error('REPLICATE_API_TOKEN not configured');
  const model = (p.modelName || KLING_MODELS.BEST);
  const isV16 = /v1[.\-]6/.test(model);
  const input: Record<string, unknown> = {
    start_image: p.imageUrl,
    prompt: p.prompt,
    negative_prompt: p.negativePrompt ?? KLING_NEGATIVE,
    duration: p.duration ?? 5,
    aspect_ratio: p.aspectRatio ?? '9:16',
    // cfg_scale ONLY exists on v1.6 — sending it to v2.1-master 422s (not in schema).
    ...(isV16 ? { cfg_scale: typeof p.cfgScale === 'number' ? p.cfgScale : 0.5 } : {}),
  };
  p.onProgress?.(`[kling] ${model} i2v — rendering…`);
  const replicate = new Replicate({ auth: token() });
  const output = await replicate.run(model, { input });
  const url = pickUrl(output);
  if (!url) throw new Error(`kling i2v: no output url from ${model}`);
  p.onProgress?.('[kling] i2v done');
  return url;
}

/**
 * Video → Video (Motion Control). Replicate Kling has NO true motion-transfer model,
 * so this honestly degrades to motion-prompt I2V (animate the character image with a
 * movement-rich prompt). The reference video is accepted for API symmetry but not used.
 */
export async function klingVideoToVideo(p: KlingV2VInput): Promise<string> {
  p.onProgress?.('[kling] no native V2V on Replicate → motion-prompt I2V');
  return klingImageToVideo({
    ...p,
    prompt: `${p.prompt}, dynamic fluid movement, identity preserved, photorealistic`,
  });
}

/** Cheap connectivity probe. */
export async function klingAuthOk(): Promise<boolean> {
  if (!klingConfigured()) return false;
  try {
    const replicate = new Replicate({ auth: token() });
    await replicate.models.get('kwaivgi', 'kling-v2.1-master');
    return true;
  } catch {
    return false;
  }
}
