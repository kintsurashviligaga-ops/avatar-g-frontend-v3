/**
 * lib/ai/geminiImagen.ts — Google **Imagen 4** via the Gemini API (generativelanguage), the Master Task's
 * specified image engine (§1.6.2 / §3.2.2).
 *
 * Mirrors the shape of lib/ai/geminiVeo.ts on purpose: same key resolution, same live-by-default flag with a
 * one-env kill-switch, and the same NEVER-THROWS contract. Every function returns null on any miss (no key,
 * no access, quota, timeout, contract drift) so `ServiceManager.runTextToImage` falls straight through to the
 * proven FLUX → NanoBanana cascade. Adding a primary engine must not be able to break image generation.
 *
 * WIRE CONTRACT (the `:predict` surface, NOT `:generateContent`):
 *   POST /v1beta/models/<model>:predict?key=…
 *   { instances: [{ prompt }], parameters: { sampleCount, aspectRatio, personGeneration, negativePrompt? } }
 *   → { predictions: [{ bytesBase64Encoded, mimeType }] }
 * Imagen returns base64 IMAGE BYTES inline — there is no operation to poll and no URL to fetch, so the
 * result is hosted here and the caller gets a normal https asset URL.
 */
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { isEnabledByDefault } from '@/lib/env/flag';

const GL_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 60_000;

/** Imagen 4 tiers. `-fast-` trades fidelity for latency; `-ultra-` is the highest quality, one image only. */
export function geminiImagenModel(): string {
  return (process.env.GEMINI_IMAGEN_MODEL || 'imagen-4.0-generate-001').trim();
}

/** True iff a Gemini key is present AND Imagen isn't explicitly killed (GEMINI_IMAGEN_ENABLED=0). */
export function hasGeminiImagenProvider(): boolean {
  return isEnabledByDefault(process.env.GEMINI_IMAGEN_ENABLED) && !!resolveGeminiKey();
}

/** Imagen accepts these five ratios; anything else (4:5, 2:3, …) is snapped to the nearest supported one. */
export type ImagenAspect = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

export function mapImagenAspect(aspect: string | null | undefined): ImagenAspect {
  const a = String(aspect ?? '').trim();
  if (a === '16:9' || a === '9:16' || a === '4:3' || a === '3:4' || a === '1:1') return a;
  // Portrait-ish and landscape-ish fallbacks, so an unsupported ratio never becomes a square surprise.
  if (a === '4:5' || a === '2:3' || a === '3:5') return '3:4';
  if (a === '5:4' || a === '3:2' || a === '21:9') return '4:3';
  return '1:1';
}

export interface ImagenGenerateArgs {
  prompt: string;
  aspectRatio?: string;
  /** 1–4 (the ultra model caps at 1; we clamp rather than let the API 400). */
  numberOfImages?: number;
  negativePrompt?: string;
}

export interface ImagenImage {
  /** Raw bytes — the caller hosts them (this module does no storage I/O). */
  buffer: Buffer;
  mimeType: string;
}

/**
 * Generate 1–4 images. Returns null on ANY miss so the caller can fall through to the existing cascade.
 */
export async function generateImagenImages(args: ImagenGenerateArgs): Promise<ImagenImage[] | null> {
  const key = resolveGeminiKey();
  const prompt = String(args.prompt ?? '').trim();
  if (!key || !prompt) return null;

  const model = geminiImagenModel();
  // The ultra tier returns exactly one sample; asking for more is a 400.
  const maxSamples = /ultra/i.test(model) ? 1 : 4;
  const sampleCount = Math.min(maxSamples, Math.max(1, Math.round(Number(args.numberOfImages) || 1)));

  const parameters: Record<string, unknown> = {
    sampleCount,
    aspectRatio: mapImagenAspect(args.aspectRatio),
    // Match the Veo integration: 'allow_all' is the value this project's key is provisioned for.
    personGeneration: 'allow_all',
  };
  const negative = String(args.negativePrompt ?? '').trim();
  if (negative) parameters.negativePrompt = negative.slice(0, 480);

  try {
    const res = await fetch(`${GL_BASE}/models/${model}:predict?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ instances: [{ prompt: prompt.slice(0, 2000) }], parameters }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.warn(`[imagen] http_${res.status} → falling back to FLUX/NanoBanana. body: ${body.slice(0, 240)}`);
      return null;
    }
    const j = (await res.json().catch(() => ({}))) as {
      predictions?: { bytesBase64Encoded?: unknown; mimeType?: unknown }[];
    };
    const preds = Array.isArray(j.predictions) ? j.predictions : [];
    const out: ImagenImage[] = [];
    for (const p of preds) {
      const b64 = typeof p?.bytesBase64Encoded === 'string' ? p.bytesBase64Encoded : '';
      if (!b64) continue;
      const buffer = Buffer.from(b64, 'base64');
      if (!buffer.byteLength) continue;
      out.push({ buffer, mimeType: typeof p?.mimeType === 'string' && p.mimeType ? p.mimeType : 'image/png' });
    }
    return out.length ? out : null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[imagen] threw → falling back to FLUX/NanoBanana:', e instanceof Error ? e.message : e);
    return null;
  }
}
