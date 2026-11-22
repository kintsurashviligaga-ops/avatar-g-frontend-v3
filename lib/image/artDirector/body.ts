/**
 * lib/image/artDirector/body.ts — the Vertex generateContent body for one Art Director image. Pure.
 *
 * Parts order is the contract composeArtPrompt describes: [base?] [mask?] [references A…N] [text].
 * imageConfig carries aspectRatio (one of the 14) and imageSize ('1K' | '2K' | '4K'); seed goes in generationConfig.
 */
import { ART_RATIOS, ART_SIZES, MAX_REFERENCES, type ArtRatio, type ArtSize } from './spec';

export interface InlineImage { mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; data: string }

export interface ArtBodyInput {
  text: string;
  base?: InlineImage | null;
  mask?: InlineImage | null;
  references: readonly InlineImage[];
  aspectRatio: ArtRatio;
  size: ArtSize;
  seed?: number | null;
}

export function buildArtBody(b: ArtBodyInput): Record<string, unknown> {
  if (!(ART_RATIOS as readonly string[]).includes(b.aspectRatio)) throw new Error(`unsupported ratio ${b.aspectRatio}`);
  if (!(ART_SIZES as readonly string[]).includes(b.size)) throw new Error(`unsupported size ${b.size}`);
  if (b.references.length > MAX_REFERENCES) throw new Error(`at most ${MAX_REFERENCES} references`);
  if (b.mask && !b.base) throw new Error('a mask needs a base image');
  const pics = [b.base, b.mask, ...b.references].filter((x): x is InlineImage => !!x);
  const seed = Number.isInteger(b.seed) && (b.seed as number) >= 0 && (b.seed as number) <= 2_147_483_647 ? b.seed : undefined;
  return {
    contents: [{ role: 'user', parts: [...pics.map((p) => ({ inlineData: p })), { text: b.text }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: b.aspectRatio, imageSize: b.size },
      ...(seed != null ? { seed } : {}),
    },
  };
}

/** The first image part of a generateContent answer, or null (safety block, text-only answer). */
export function imageFromResponse(j: unknown): { mimeType: string; data: string; finishReason: string | null } | null {
  const c = (j as { candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }> })?.candidates?.[0];
  const part = c?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) return null;
  return { mimeType: part.inlineData.mimeType || 'image/png', data: part.inlineData.data, finishReason: c?.finishReason ?? null };
}
