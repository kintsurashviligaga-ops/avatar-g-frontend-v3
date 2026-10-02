/**
 * lib/genjutsu/types.ts — the vocabulary of the VFX ("Genjutsu") module. Pure types and tiny constants; client-safe.
 *
 * THREE OPS, ONE PER REAL MECHANISM (docs in lib/genjutsu/engines.ts say which engine and how many photos each takes):
 *   scene  — a NEW 8 s VFX scene built from the preset and the reference photos (Google Veo 3.1 reference-to-video).
 *   motion — the motion of a 3–30 s SOURCE VIDEO is carried onto the character photo and a new scene is built around
 *            it (Higgsfield Kling 3 Motion Control, through the studio saga).
 *   swap   — an object / location / style is swapped in a source video while the rest of the shot stays
 *            (Higgsfield Genjutsu object-swap — not in the model registry yet, so it is shown LOCKED).
 */

export type GenjutsuOp = 'scene' | 'motion' | 'swap';
export const GENJUTSU_OPS: readonly GenjutsuOp[] = ['scene', 'motion', 'swap'];

export const isGenjutsuOp = (v: unknown): v is GenjutsuOp => v === 'scene' || v === 'motion' || v === 'swap';

/** What a reference photo IS. It decides which photo an engine with room for only a few is given (selection.ts). */
export type ReferenceRole = 'character' | 'product' | 'wardrobe';
/** Priority order: the character is the one thing every op needs, the product next, the clothing last. */
export const REFERENCE_ROLES: readonly ReferenceRole[] = ['character', 'product', 'wardrobe'];

export const isReferenceRole = (v: unknown): v is ReferenceRole => v === 'character' || v === 'product' || v === 'wardrobe';

/** One reference photo as the selection rule sees it: opaque id + role. `ref` is a storage path on the wire. */
export interface ReferenceItem {
  id: string;
  role: ReferenceRole;
}

/** The quality tier. scene: fast | standard (Veo 3.1 Fast / Standard). motion: standard | pro (Kling 3 MC std / pro). */
export type GenjutsuQuality = 'fast' | 'standard' | 'pro';

/** The native frames Veo renders. (1:1 and 4:5 would be post-crops, which this module does not do.) */
export type GenjutsuAspect = '16:9' | '9:16';

export type L10n = { ka: string; en: string; ru: string };
export type Lang = 'ka' | 'en' | 'ru';
export const toLang = (locale: string | null | undefined): Lang => (locale === 'en' || locale === 'ru' ? locale : 'ka');
