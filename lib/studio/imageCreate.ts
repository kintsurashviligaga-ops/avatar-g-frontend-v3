/**
 * lib/studio/imageCreate.ts — what the Image tool's Create screen offers, and what a press of it costs.
 * Pure and isomorphic: no React, no env, no I/O (the panel is components/studio/create/ImageCreatePanel).
 *
 * ⚠️ EVERYTHING HERE DESCRIBES /api/nanobanana/image, THE ONE ROUTE THE STUDIO'S IMAGE TOOL CALLS (runImageJob /
 * runImageBatch / regenerate in OmniStudio). The facts below were read off that route, and lib/studio/imageCreate.test.ts
 * keeps them pinned to it, so a route change that is not mirrored here fails a test instead of the screen lying:
 *
 *   · PRICE — the route reserves `creditCostFor('image')` per request, for EVERY size (1K, 2K and 4K cost the same), and a
 *     ×2 / ×4 batch is N separate requests. `imageCredits` is lib/credits/quote.ts's `quoteCredits`, so the number on the
 *     Generate button is the number on the bill.
 *   · ENGINE — NanoBanana, at the endpoint the picked MODEL renders the size at (lib/providers/catalogue: Auto is the old
 *     size map — standard → v2-1k, high → v2-2k, ultra → pro-4k — and V2 / Pro pin the family). The request names the model
 *     (`model`, lib/studio/modelPick imageModelField) and the route validates it against the catalogue before any charge.
 *     If NanoBanana misses (or its breaker is open) the route answers 502 provider_unavailable and refunds — there is no
 *     Grok / FLUX leg any more (PROJECT_MASTER R7, no silent fallback).
 *   · REFERENCE — the route reads ONE `referenceImage` (a data: upload or an https URL); the send path takes the first image
 *     attachment. So the real limit is ONE reference, not the 14 a competitor's screen shows.
 */
import { quoteCredits } from '@/lib/credits/quote';
import { DEFAULT_MODEL, catalogueEntry, imageEndpointFor, type CatalogueEntry } from '@/lib/providers/catalogue';
import type { NanoBananaEndpoint } from '@/lib/nanobanana/endpoints';

/**
 * ⚠️ THE UI OFFERED SIX OF THE ELEVEN RATIOS THAT WORK. /api/nanobanana/image applies NO allowlist — it forwards
 * `body.aspectRatio` straight through (the removed FLUX 1.1 Pro fallback accepted the same eleven, lib/ai/fluxImage.ts:16).
 * The four added here are the ones people actually ask for and could not select: 4:5 is the Instagram feed ratio, 3:4 the
 * standard portrait print, 5:4 its landscape counterpart, and 21:9 cinemascope. Every one already rendered correctly end to
 * end; nothing but this list stood between the user and them.
 *
 * Ordered by how often they are wanted, not numerically, because the picker shows the first row first.
 */
export const IMG_ASPECTS = ['1:1', '16:9', '9:16', '4:5', '4:3', '3:4', '3:2', '2:3', '5:4', '21:9'] as const;
export type ImgAspect = (typeof IMG_ASPECTS)[number];

export const IMG_QUALITIES = [['standard', '1K'], ['high', '2K'], ['ultra', '4K']] as const;
export type ImgQuality = (typeof IMG_QUALITIES)[number][0];

export const IMG_STYLES = ['Auto', 'Photorealistic', 'Cinematic', 'Digital Art', 'Anime', '3D Render', 'Oil Painting', 'Watercolor', 'Cyberpunk', 'Fantasy', 'Minimalist', 'Line Art', 'Pixel Art'] as const;
export type ImgStyle = (typeof IMG_STYLES)[number];

/** 'Digital Art' → 'digital-art': a style's file name (the swatch, the art pack's `style/<slug>` shot). */
export const imageStyleSlug = (style: string): string => style.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * The style chip's swatch: one cat on one Tbilisi balcony, drawn in that style (scripts/site-art/shots.md `style/…`, built
 * to 96×96 by scripts/site-art/build-site-art.mjs), so thirteen chips compare like for like. 'Auto' is no look of its own
 * — it has no swatch (null) and keeps an icon. lib/studio/imageCreate.test.ts pins that every other file exists.
 */
export function imageStyleSwatch(style: string): string | null {
  if (style === 'Auto' || !(IMG_STYLES as readonly string[]).includes(style)) return null;
  return `/styles/image/${imageStyleSlug(style)}.jpg`;
}

/** Variations per press: each one is its own billed request (OmniStudio.runImageBatch). */
export const IMG_COUNTS = [1, 2, 4] as const;
export type ImgCount = (typeof IMG_COUNTS)[number];

/** How many pictures the image routes take in as a reference: ONE (`referenceImage`, a string — not a list). */
export const IMAGE_MAX_REFERENCES = 1;

/** Credits for one press of Generate. The SAME function the route charges with (creditCostFor('image') × images). */
export const imageCredits = (count: number): number => quoteCredits({ tool: 'image', count });

type Lang = 'ka' | 'en' | 'ru';
type L10n = Record<Lang, string>;
export const imageLang = (locale: string | null | undefined): Lang => (locale === 'en' || locale === 'ru' ? locale : 'ka');

/** One size of the engine: the quality the user picks, and the NanoBanana endpoint the route sends it to. */
export interface ImageTier {
  quality: ImgQuality;
  res: '1K' | '2K' | '4K';
  /** Auto's NanoBanana endpoint at this size (lib/providers/catalogue `nb/auto`; another model: `imageVariant`). */
  endpoint: 'v2-1k' | 'v2-2k' | 'pro-4k';
  /** Auto's model family at that endpoint — V2 up to 2K, Pro at 4K. */
  family: 'V2' | 'Pro';
  /** One line on what the size is for. */
  note: L10n;
}

export const IMAGE_TIERS: readonly ImageTier[] = [
  { quality: 'standard', res: '1K', endpoint: 'v2-1k', family: 'V2', note: { ka: 'ყველაზე სწრაფი', en: 'Fastest', ru: 'Быстрее всего' } },
  { quality: 'high', res: '2K', endpoint: 'v2-2k', family: 'V2', note: { ka: 'უფრო მკვეთრი — ნაგულისხმევი', en: 'Sharper — the default', ru: 'Чётче — по умолчанию' } },
  { quality: 'ultra', res: '4K', endpoint: 'pro-4k', family: 'Pro', note: { ka: 'მაქსიმალური დეტალი, ყველაზე ნელი', en: 'Maximum detail, slowest', ru: 'Максимум деталей, дольше всего' } },
];

export const tierFor = (quality: string): ImageTier => IMAGE_TIERS.find((t) => t.quality === quality) ?? IMAGE_TIERS[1]!;

/**
 * The image model a pick resolves to on THIS tool: a catalogue entry the image route runs, else Auto. (A Studio β pick, or
 * a stale id, never reaches /api/nanobanana/image — lib/studio/modelPick keeps the two memories apart anyway.)
 */
export function imageModelFor(id: string | null | undefined): CatalogueEntry {
  const e = catalogueEntry(id);
  return e && e.wire.runner === 'image' ? e : catalogueEntry(DEFAULT_MODEL.image)!;
}

/** One size of one model: the endpoint it renders on, the family and the real resolution — and whether the model has it. */
export interface ImageVariant {
  quality: ImgQuality;
  endpoint: NanoBananaEndpoint;
  family: 'V2' | 'Pro';
  res: '1K' | '2K' | '4K';
  /** False where the model has no such size (Nano Banana Pro starts at 2K): the chip offers it disabled. */
  native: boolean;
}

const RES: Readonly<Partial<Record<NanoBananaEndpoint, ImageVariant['res']>>> = {
  'v2-1k': '1K', 'v2-2k': '2K', 'v2-4k': '4K', 'pro-1k2k': '2K', 'pro-4k': '4K', 'text-to-image': '1K',
};

export function imageVariant(modelId: string | null | undefined, quality: string): ImageVariant {
  const entry = imageModelFor(modelId);
  const q = tierFor(quality).quality;
  const endpoint = imageEndpointFor(entry, q) ?? tierFor(q).endpoint;
  const native = entry.wire.runner === 'image' && !!entry.wire.endpoints[q];
  return { quality: q, endpoint, family: endpoint.startsWith('pro') ? 'Pro' : 'V2', res: RES[endpoint] ?? tierFor(q).res, native };
}

/** The size to fall back to when a model does not have the one on screen: the nearest it has, larger first. */
export function nativeQuality(modelId: string | null | undefined, quality: ImgQuality): ImgQuality {
  if (imageVariant(modelId, quality).native) return quality;
  const order: ImgQuality[] = quality === 'standard' ? ['high', 'ultra'] : quality === 'high' ? ['ultra', 'standard'] : ['high', 'standard'];
  return order.find((q) => imageVariant(modelId, q).native) ?? quality;
}

/** "Nano Banana V2 · 2K" — the model variant a size runs on. */
export const tierModelLabel = (t: ImageTier): string => `Nano Banana ${t.family} · ${t.res}`;
