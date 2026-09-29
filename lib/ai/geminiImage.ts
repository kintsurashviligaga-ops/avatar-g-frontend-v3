/**
 * lib/ai/geminiImage.ts — Gemini's native image model ("Nano Banana") called DIRECTLY on the Gemini API.
 *
 * The storyboard used Google's image model through Replicate (google/nano-banana) and fell back to FLUX, a
 * non-Google model. Under the Google-only video pipeline (docs/VEO_ENGINE.md §3) the frames come straight from
 * Google: `generateContent` with `responseModalities: ['IMAGE']`, the character photo passed as an inline image
 * part so the SAME person appears in every frame (this is what makes the frame a usable Veo first frame).
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

export interface GeminiImageArgs {
  prompt: string;
  /** Character photos (https or data: URLs), at most 3 — each becomes an inline image part before the text. */
  referenceImages?: string[];
  aspectRatio?: string;
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
export function buildGeminiImageBody(prompt: string, inlineRefs: Array<{ inlineData: { mimeType: string; data: string } }>, aspectRatio?: string): Record<string, unknown> {
  const aspect = aspectRatio && ASPECTS.has(aspectRatio) ? aspectRatio : undefined;
  return {
    contents: [{ role: 'user', parts: [...inlineRefs, { text: prompt.slice(0, 4000) }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      ...(aspect ? { imageConfig: { aspectRatio: aspect } } : {}),
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
    const res = await fetch(`${GL_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      // Header auth: the key never lands in a URL (logs, traces, error messages).
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      cache: 'no-store',
      body: JSON.stringify(buildGeminiImageBody(args.prompt, refs, args.aspectRatio)),
      signal: AbortSignal.timeout(args.timeoutMs ?? 90_000),
    });
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
