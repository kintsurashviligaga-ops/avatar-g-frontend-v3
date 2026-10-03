/**
 * lib/ai/geminiImage.ts — Gemini's native image model ("Nano Banana") called DIRECTLY on the Gemini API.
 *
 * The storyboard used Google's image model through Replicate (google/nano-banana) and fell back to FLUX, a
 * non-Google model. Under the Google-only video pipeline (docs/VEO_ENGINE.md §3) the frames come straight from
 * Google: `generateContent` with `responseModalities: ['IMAGE']`, the character photo passed as an inline image
 * part so the SAME person appears in every frame (this is what makes the frame a usable Veo first frame).
 * Since 2026-10-03 it is also the image studio's first engine (app/api/nanobanana/image — the image tool, the
 * photographer and the interior designer): the same Nano Banana models, asked on Google instead of a reseller.
 *
 * Models available to this project's key (listed 2026-09-29): gemini-3.1-flash-image (GA, default),
 * gemini-3-pro-image (GA, higher fidelity), gemini-2.5-flash-image. Override with GEMINI_FRAME_MODEL.
 *
 * NEVER THROWS: null on any miss (no key, 4xx/5xx, safety block, no image part, timeout).
 */
import 'server-only';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { isPublicHttpUrl } from '@/lib/security/allowlistedAudioFetch';

const GL_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_REF_BYTES = 12 * 1024 * 1024;

export function geminiFrameModel(): string {
  return (process.env.GEMINI_FRAME_MODEL || 'gemini-3.1-flash-image').trim();
}

/** Ratios Gemini image models accept via imageConfig.aspectRatio. */
const ASPECTS = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);

export type GeminiImageSize = '1K' | '2K' | '4K';

/** Nano Banana Pro — the catalogue's `nb/pro` (lib/providers/catalogue), called on Google directly. */
export const GEMINI_PRO_IMAGE_MODEL = 'gemini-3-pro-image';

/**
 * The image studio's NanoBanana endpoint (lib/nanobanana/endpoints, picked by lib/providers/catalogue) → the SAME Google
 * model, called directly: `pro-*` is Nano Banana Pro, everything else Nano Banana 2 (geminiFrameModel). The size is the
 * endpoint's own (`*-2k`, `*-4k`; Pro's smallest renders 2K); the rest is 1K.
 */
export function geminiImageForEndpoint(endpoint: string): { model: string; imageSize: GeminiImageSize } {
  const e = String(endpoint || '').toLowerCase();
  const model = e.startsWith('pro-') ? GEMINI_PRO_IMAGE_MODEL : geminiFrameModel();
  const imageSize: GeminiImageSize = e.endsWith('4k') ? '4K' : e.endsWith('2k') || e === 'pro-1k2k' ? '2K' : '1K';
  return { model, imageSize };
}

export interface GeminiImageArgs {
  prompt: string;
  /** Character photos (https or data: URLs), at most 3 — each becomes an inline image part before the text. */
  referenceImages?: string[];
  aspectRatio?: string;
  /** Output size. A model that refuses it (400) is asked once more at its default size, so a size never costs the image. */
  imageSize?: GeminiImageSize;
  model?: string;
  timeoutMs?: number;
}

export interface GeminiImageResult {
  base64: string;
  mimeType: string;
  model: string;
}

async function toInlinePart(src: string): Promise<{ inlineData: { mimeType: string; data: string } } | null> {
  try {
    if (src.startsWith('data:')) {
      const m = src.match(/^data:([^;,]+);base64,(.+)$/);
      return m && m[1] && m[2] ? { inlineData: { mimeType: m[1], data: m[2] } } : null;
    }
    if (!isPublicHttpUrl(src)) return null;
    const res = await fetch(src, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const mimeType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0]!.trim();
    if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.byteLength || buf.byteLength > MAX_REF_BYTES) return null;
    return { inlineData: { mimeType, data: buf.toString('base64') } };
  } catch {
    return null;
  }
}

/** Build the generateContent body (exported for tests). */
export function buildGeminiImageBody(
  prompt: string,
  inlineRefs: Array<{ inlineData: { mimeType: string; data: string } }>,
  aspectRatio?: string,
  imageSize?: GeminiImageSize,
): Record<string, unknown> {
  const aspect = aspectRatio && ASPECTS.has(aspectRatio) ? aspectRatio : undefined;
  // 1K is every model's default — only a larger size is asked for.
  const size = imageSize === '2K' || imageSize === '4K' ? imageSize : undefined;
  const imageConfig = { ...(aspect ? { aspectRatio: aspect } : {}), ...(size ? { imageSize: size } : {}) };
  return {
    contents: [{ role: 'user', parts: [...inlineRefs, { text: prompt.slice(0, 4000) }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      ...(Object.keys(imageConfig).length ? { imageConfig } : {}),
    },
  };
}

export async function generateGeminiImage(args: GeminiImageArgs): Promise<GeminiImageResult | null> {
  const key = resolveGeminiKey();
  if (!key || !args.prompt?.trim()) return null;
  const model = (args.model || geminiFrameModel()).trim();
  const refs = (await Promise.all((args.referenceImages ?? []).slice(0, 3).map(toInlinePart)))
    .filter((p): p is { inlineData: { mimeType: string; data: string } } => !!p);
  try {
    const call = (size: GeminiImageSize | undefined) => fetch(`${GL_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      // Header auth: the key never lands in a URL (logs, traces, error messages).
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      cache: 'no-store',
      body: JSON.stringify(buildGeminiImageBody(args.prompt, refs, args.aspectRatio, size)),
      signal: AbortSignal.timeout(args.timeoutMs ?? 90_000),
    });
    let res = await call(args.imageSize);
    // A 400 renders nothing and bills nothing: a model that does not take the size is asked again at its default.
    if (res.status === 400 && (args.imageSize === '2K' || args.imageSize === '4K')) {
      // eslint-disable-next-line no-console
      console.warn(`[gemini-image] ${model} refused imageSize=${args.imageSize} — retrying at the default size`);
      res = await call(undefined);
    }
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[gemini-image] ${model} ${res.status}`);
      return null;
    }
    const j = (await res.json().catch(() => ({}))) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> }; finishReason?: string }>;
    };
    const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) {
      // eslint-disable-next-line no-console
      console.warn(`[gemini-image] ${model} returned no image (finishReason=${j.candidates?.[0]?.finishReason ?? 'n/a'})`);
      return null;
    }
    return { base64: part.inlineData.data, mimeType: part.inlineData.mimeType || 'image/png', model };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[gemini-image] ${model} error:`, e instanceof Error ? e.name : 'unknown');
    return null;
  }
}
