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
 *   · ENGINE — Google's image model on Vertex AI (lib/ai/geminiImage), the catalogue's one Google row (`nb/auto`). The render
 *     takes no size, so the screen offers none (GG 2026-10-23, "Hide": the Nano Banana V2 / Pro rows and the 1K / 2K / 4K chip
 *     are gone until a size is verified to reach it). The request still names the model (`model`, lib/studio/modelPick
 *     imageModelField) and a `quality` (the studio's state, which a template sets), which the route files it under; it
 *     validates the model against the catalogue before any charge. A miss is a 502 provider_unavailable and a refund — there
 *     is no Grok / FLUX leg any more (PROJECT_MASTER R7, no silent fallback).
 *   · REFERENCE — the route reads ONE `referenceImage` (a data: upload or an https URL); the send path takes the first image
 *     attachment. So the real limit is ONE reference, not the 14 a competitor's screen shows.
 */
import { quoteCredits } from '@/lib/credits/quote';
import { DEFAULT_MODEL, catalogueEntry, type CatalogueEntry } from '@/lib/providers/catalogue';

/**
 * ⚠️ THE UI OFFERED SIX OF THE ELEVEN RATIOS THAT WORK. /api/nanobanana/image applies NO allowlist — it forwards
 * `body.aspectRatio` straight through (the removed FLUX 1.1 Pro fallback accepted the same eleven).
 * The four added here are the ones people actually ask for and could not select: 4:5 is the Instagram feed ratio, 3:4 the
 * standard portrait print, 5:4 its landscape counterpart, and 21:9 cinemascope. Every one already rendered correctly end to
 * end; nothing but this list stood between the user and them.
 *
 * Ordered by how often they are wanted, not numerically, because the picker shows the first row first.
 */
export const IMG_ASPECTS = ['1:1', '16:9', '9:16', '4:5', '4:3', '3:4', '3:2', '2:3', '5:4', '21:9'] as const;
export type ImgAspect = (typeof IMG_ASPECTS)[number];

/**
 * The qualities a request may carry, with the size each once named. No screen offers them any more (the render takes no size);
 * the studio still holds one, a template sets it, and the route files the request under it (lib/providers/catalogue nb/auto).
 */
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
export const imageLang = (locale: string | null | undefined): Lang => (locale === 'en' || locale === 'ru' ? locale : 'ka');

/**
 * The image model a pick resolves to on THIS tool: a catalogue entry the image route runs, else the default Google row. (A
 * Studio β pick, a retired Nano Banana V2 / Pro id or a stale one never reaches /api/nanobanana/image as itself.)
 */
export function imageModelFor(id: string | null | undefined): CatalogueEntry {
  const e = catalogueEntry(id);
  return e && e.wire.runner === 'image' ? e : catalogueEntry(DEFAULT_MODEL.image)!;
}
