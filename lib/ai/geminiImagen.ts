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
import { reportGeminiFallback } from '@/lib/ai/geminiFallbackReport';
import { isTruthyFlag } from '@/lib/env/flag';

const GL_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 20_000;
/** Short-lived memo of a hard billing/quota wall (402/403/429). An unfunded key must not cost a
 *  round-trip on every generation; the wall expires on its own so a top-up self-heals with no redeploy. */
let quotaWallUntil = 0;
const QUOTA_WALL_MS = 10 * 60_000;

/** Imagen 4 tiers. `-fast-` trades fidelity for latency; `-ultra-` is the highest quality, one image only. */
export function geminiImagenModel(): string {
  return (process.env.GEMINI_IMAGEN_MODEL || 'imagen-4.0-generate-001').trim();
}

/** True iff a Gemini key is present AND Imagen isn't explicitly killed (GEMINI_IMAGEN_ENABLED=0). */
export function hasGeminiImagenProvider(): boolean {
  // OPT-IN, not opt-out. A Gemini key being PRESENT is not evidence that it is FUNDED: with Google's
  // balance empty this leg 429s on every single generation, and because ServiceManager.runTextToImage
  // tries it FIRST, every user waited out that round-trip before NanoBanana/FLUX even started.
  // Re-enable with GEMINI_IMAGEN_ENABLED=1 once billing is topped up — no code push needed.
  return isTruthyFlag(process.env.GEMINI_IMAGEN_ENABLED) && !!resolveGeminiKey();
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
  // A known billing/quota wall → skip WITHOUT a round-trip (the caller falls through to FLUX/NanoBanana).
  if (Date.now() < quotaWallUntil) return null;

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
      // 429 quota / 402 billing / 403 no-access are ACCOUNT-level, not request-level: they will repeat
      // identically for every caller until the operator acts, so arm the wall instead of re-paying the
      // latency on each generation.
      if (res.status === 429 || res.status === 402 || res.status === 403) quotaWallUntil = Date.now() + QUOTA_WALL_MS;
      reportGeminiFallback({ leg: 'imagen', fallbackTo: 'FLUX/NanoBanana', status: res.status, detail: body, model: geminiImagenModel() });
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
    reportGeminiFallback({ leg: 'imagen', fallbackTo: 'FLUX/NanoBanana', detail: e instanceof Error ? e.message : String(e), model: geminiImagenModel() });
    return null;
  }
}
