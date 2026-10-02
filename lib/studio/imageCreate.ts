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
 *   · ENGINE — NanoBanana, at an endpoint chosen by the size: standard → v2-1k, high → v2-2k, ultra → pro-4k. If it
 *     misses (or its breaker is open) a TEXT-ONLY prompt falls through to Grok, then FLUX 1.1 Pro, at the same price; those
 *     two are prompt-only, so an edit of the user's own picture never leaves NanoBanana (it refunds instead). The client
 *     cannot choose an engine: there is nothing to pick but "Auto", which is why the model row has ONE entry today.
 *   · REFERENCE — the route reads ONE `referenceImage` (a data: upload or an https URL); the send path takes the first image
 *     attachment. So the real limit is ONE reference, not the 14 a competitor's screen shows.
 */
import { quoteCredits } from '@/lib/credits/quote';

/**
 * ⚠️ THE UI OFFERED SIX OF THE ELEVEN RATIOS THAT WORK. /api/nanobanana/image applies NO allowlist — it forwards
 * `body.aspectRatio` straight through — and the FLUX 1.1 Pro fallback accepts eleven (FLUX_ASPECTS, lib/ai/fluxImage.ts:16).
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
  /** NanoBanana's own endpoint id (app/api/nanobanana/image QUALITY_ENDPOINT). */
  endpoint: 'v2-1k' | 'v2-2k' | 'pro-4k';
  /** The model family at that endpoint — V2 up to 2K, Pro at 4K. */
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

export type ImageEngineId = 'auto';

export interface ImageEngine {
  id: ImageEngineId;
  name: L10n;
  /** What this entry uses, in plain words — shown under its name in the model picker. */
  summary: L10n;
  /** Credits per image at every size (read from the quote, never typed here). */
  perImage: () => number;
}

/**
 * The engines a user can PICK. Exactly one today: the route has no engine switch, only the size-driven NanoBanana endpoint
 * and an automatic backup, so "Auto" is the whole list. A second entry appears here only when a route can really take it
 * (the Higgsfield Soul route behind STUDIO_V2 is not wired to this tool), and the picker and the Models & prices list grow
 * with this array — nothing else changes.
 */
export const IMAGE_ENGINES: readonly ImageEngine[] = [
  {
    id: 'auto',
    name: { ka: 'ავტო', en: 'Auto', ru: 'Авто' },
    summary: {
      ka: 'ძრავას ირჩევს სისტემა: 1K და 2K — Nano Banana V2, 4K — Nano Banana Pro. თუ მთავარი ძრავა დაკავებულია, ტექსტური მოთხოვნა შეიძლება იმავე ფასად სარეზერვო ძრავაზე გადავიდეს; შენი სურათის რედაქტირება — არასდროს.',
      en: 'Picks the engine for you: Nano Banana V2 at 1K and 2K, Nano Banana Pro at 4K. If the main engine is busy, a text-only prompt may move to a backup engine at the same price; an edit of your own picture never does.',
      ru: 'Движок выбирается автоматически: Nano Banana V2 для 1K и 2K, Nano Banana Pro для 4K. Если основной движок занят, текстовый запрос может уйти на резервный по той же цене; правка вашей картинки — никогда.',
    },
    perImage: () => imageCredits(1),
  },
];

export const engineFor = (id: string | null | undefined): ImageEngine => IMAGE_ENGINES.find((e) => e.id === id) ?? IMAGE_ENGINES[0]!;

/** "Nano Banana V2 · 2K" — the model variant a size runs on. */
export const tierModelLabel = (t: ImageTier): string => `Nano Banana ${t.family} · ${t.res}`;
