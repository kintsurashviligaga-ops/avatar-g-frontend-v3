/**
 * lib/genjutsu/engines.ts — what each op RUNS ON, and the numbers that follow from it. Pure and client-safe, so the
 * panel can say the same thing the server enforces: "Using 3 of 12 — this engine takes up to 3".
 *
 * REALITY, VERIFIED AGAINST THE CODE AND THE PROVIDERS' OWN DOCS (2026-10-02) — the table the whole module rests on:
 *
 *   op      engine                                           takes                         source video  who prices it
 *   ──────  ───────────────────────────────────────────────  ────────────────────────────  ────────────  ─────────────────
 *   scene   Google Veo 3.1 (Fast | Standard), reference-to-  ≤ 3 asset images, 8 s only,   none          lib/genjutsu/pricing
 *           video — lib/veo/engine (Vertex, else Gemini API) no first/last frame with them
 *   motion  Higgsfield Kling 3 Motion Control (std | pro),   1 image + a 3–30 s video +    3–30 s        the studio saga's live
 *           through the studio saga (lib/studio/saga)        a prompt                                    /estimate (STUDIO_V2)
 *   swap    Higgsfield Genjutsu object-swap v1.0             video 1–30 s + image_urls     1–30 s        the saga's live /estimate
 *           (NOT in lib/providers/registry yet → locked)     (count unspecified; policy 5)
 *
 * WHAT IS *NOT* HERE ON PURPOSE. `/api/motion-control` looks like the motion-transfer route and is not: it accepts a
 * reference video and then NEVER SENDS IT (lib/ai/klingClient: "TRUE video2video motion transfer → NONE exist → V2V
 * falls back to I2V") — it animates the photo from a prompt on Replicate's Kling 1.6/2.1, which also has no credit.
 * `/api/video/remix` `restyle` regenerates ONE keyframe and re-animates it (a new ~5 s clip, not the user's motion),
 * and `character` is a face swap only. Routing "motion transfer" to any of them would be a silent fallback to a
 * different product, so none of them is used. Veo has no video input at all (docs/VEO_ENGINE.md §1: no motion vector).
 */
import { DEFAULT_MODEL_IDS, capsFor } from '@/lib/veo/capabilities';
import { SCENE_SECONDS } from './limits';
import type { GenjutsuAspect, GenjutsuOp, GenjutsuQuality, L10n } from './types';

/**
 * Veo's asset-reference ceiling, READ from the engine's own capability table (never retyped): the minimum over the
 * tiers this module offers on both transports, so a Google change is one edit in lib/veo/capabilities.
 */
export const VEO_REFERENCE_CAP: number = Math.min(
  capsFor(DEFAULT_MODEL_IDS.gemini.standard, 'gemini').maxReferenceImages,
  capsFor(DEFAULT_MODEL_IDS.gemini.fast, 'gemini').maxReferenceImages,
  capsFor(DEFAULT_MODEL_IDS.vertex.standard, 'vertex').maxReferenceImages,
  capsFor(DEFAULT_MODEL_IDS.vertex.fast, 'vertex').maxReferenceImages,
);

/** Kling 3 Motion Control's schema has ONE `image_url` (lib/providers/higgsfield/models → klingMotionInput). */
export const MOTION_REFERENCE_CAP = 1;

/**
 * Genjutsu's studio-wide reference policy: lib/providers/higgsfield/models MAX_REFS (5) — below the provider's own
 * documented maximum for motion-transfer (8); the object-swap page states no maximum at all.
 */
export const SWAP_REFERENCE_CAP = 5;

export type EngineProvider = 'veo' | 'higgsfield';

export interface EngineSpec {
  op: GenjutsuOp;
  provider: EngineProvider;
  /** The engine's name for the "Using N of M — … takes up to K" line and the engines list. */
  label: L10n;
  /** How many reference photos the engine really receives. */
  maxRefs: number;
  /** A source video is part of the request. */
  needsVideo: boolean;
  /** At least one reference must have this role (motion needs a person to move). */
  requiresRole: 'character' | null;
  qualities: readonly GenjutsuQuality[];
  defaultQuality: GenjutsuQuality;
  /** The frames the engine renders; null = it follows the source video. */
  aspects: readonly GenjutsuAspect[] | null;
  /** A fixed clip length in seconds; null = the length of the source video. */
  fixedSeconds: number | null;
  /** 'local' = lib/genjutsu/pricing prices it; 'provider-quote' = the studio saga's live estimate does. */
  pricing: 'local' | 'provider-quote';
}

export const ENGINES: Readonly<Record<GenjutsuOp, EngineSpec>> = {
  scene: {
    op: 'scene',
    provider: 'veo',
    label: { ka: 'Google Veo 3.1', en: 'Google Veo 3.1', ru: 'Google Veo 3.1' },
    maxRefs: VEO_REFERENCE_CAP,
    needsVideo: false,
    requiresRole: null,
    qualities: ['fast', 'standard'],
    defaultQuality: 'fast',
    aspects: ['16:9', '9:16'],
    fixedSeconds: SCENE_SECONDS,
    pricing: 'local',
  },
  motion: {
    op: 'motion',
    provider: 'higgsfield',
    label: { ka: 'Kling 3 Motion Control', en: 'Kling 3 Motion Control', ru: 'Kling 3 Motion Control' },
    maxRefs: MOTION_REFERENCE_CAP,
    needsVideo: true,
    requiresRole: 'character',
    qualities: ['standard', 'pro'],
    defaultQuality: 'standard',
    aspects: null,
    fixedSeconds: null,
    pricing: 'provider-quote',
  },
  swap: {
    op: 'swap',
    provider: 'higgsfield',
    label: { ka: 'Genjutsu — ობიექტის ჩანაცვლება', en: 'Genjutsu object swap', ru: 'Genjutsu — замена объекта' },
    maxRefs: SWAP_REFERENCE_CAP,
    needsVideo: true,
    requiresRole: null,
    qualities: ['standard'],
    defaultQuality: 'standard',
    aspects: null,
    fixedSeconds: null,
    pricing: 'provider-quote',
  },
};

/** The quality the engine offers, or its default when the request names one it does not (never a silent upgrade). */
export function qualityFor(op: GenjutsuOp, q: GenjutsuQuality | null | undefined): GenjutsuQuality {
  const e = ENGINES[op];
  return q && e.qualities.includes(q) ? q : e.defaultQuality;
}

/** The model's name for one op + quality, for the engines list and the result card. */
export function modelLabel(op: GenjutsuOp, quality: GenjutsuQuality | null | undefined, locale: keyof L10n): string {
  const q = qualityFor(op, quality);
  if (op === 'scene') return q === 'standard' ? 'Veo 3.1' : 'Veo 3.1 Fast';
  if (op === 'motion') return q === 'pro' ? 'Kling 3 Motion Control Pro' : 'Kling 3 Motion Control';
  return ENGINES.swap.label[locale];
}
