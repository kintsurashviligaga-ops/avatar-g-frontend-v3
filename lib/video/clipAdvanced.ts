/**
 * lib/video/clipAdvanced.ts — the video clip's two "advanced" fields, like Google AI Studio's Veo settings (Phase 7.5):
 * "What to avoid" (Veo's negativePrompt) and a seed (Veo's seed, to repeat a take). Pure and client-safe.
 *
 * ⚠️ BOTH SHIP OFF. Two flags, read separately:
 *   · NEXT_PUBLIC_CLIP_ADVANCED shows the fold in the clip panel (components/studio/create/ClipCreatePanel).
 *   · CLIP_ADVANCED lets POST /api/video/clip read the fields. Off, the route never looks at them, so a request is handled
 *     exactly as before (the derived negative prompt, no seed) whatever the body carries.
 * Both are needed before a user's words reach Veo: the screen alone does nothing, the server alone has nothing to read.
 *
 * ⚠️ VEO ONLY. Gemini Omni Flash (10 s, or a Georgian spoken line) has no negative prompt and no seed field; the panel says
 * so and the route ignores both for an Omni clip. Neither field changes the price: Veo bills by length and tier.
 */

/** How long "What to avoid" may be, after whitespace is folded. Veo's own field is longer; this keeps it a list, not a story. */
export const CLIP_AVOID_MAX = 300;
/** Veo's seed is a uint32. */
export const CLIP_SEED_MAX = 4_294_967_295;

const truthy = (v: string | undefined): boolean => {
  const s = (v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
};

/** The panel shows the "Advanced" fold. Inlined at build time (a NEXT_PUBLIC_ variable). */
export const clipAdvancedUiOn = (): boolean => truthy(process.env.NEXT_PUBLIC_CLIP_ADVANCED);
/** The route reads `avoid` and `seed`. Server only. */
export const clipAdvancedServerOn = (): boolean => truthy(process.env.CLIP_ADVANCED);

/** Folds whitespace and drops control characters; the words themselves are kept. Not capped: the parser refuses a long one. */
export function normalizeClipAvoid(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
  return raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** A seed the user typed → a uint32, or null when the box is empty or holds something that is not a whole number in range. */
export function normalizeClipSeed(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\s*\d+\s*$/.test(raw) ? Number(raw) : Number.NaN;
  return Number.isInteger(n) && n >= 0 && n <= CLIP_SEED_MAX ? n : null;
}

/** A fresh seed for the dice button. */
export const randomClipSeed = (rand: () => number = Math.random): number => Math.floor(rand() * (CLIP_SEED_MAX + 1));

export interface ClipAdvanced { avoid: string; seed: number | null }
export type ClipAdvancedParse =
  | { ok: true; value: ClipAdvanced }
  | { ok: false; field: 'avoid' | 'seed'; code: 'too_long' | 'invalid' };

/**
 * The two fields as POST /api/video/clip reads them (only when CLIP_ADVANCED is on). Strict, like parseDirectClipRequest:
 * a value that is there but wrong is refused before any charge; an absent one is simply none.
 */
export function parseClipAdvanced(raw: unknown): ClipAdvancedParse {
  const b = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  if (b.avoid !== undefined && b.avoid !== null && typeof b.avoid !== 'string') return { ok: false, field: 'avoid', code: 'invalid' };
  const avoid = normalizeClipAvoid(b.avoid);
  if (avoid.length > CLIP_AVOID_MAX) return { ok: false, field: 'avoid', code: 'too_long' };
  const seed = normalizeClipSeed(b.seed);
  if (seed === null && b.seed !== undefined && b.seed !== null && b.seed !== '') return { ok: false, field: 'seed', code: 'invalid' };
  return { ok: true, value: { avoid, seed } };
}

/** The fields a clip's request carries: only the ones set, so a request without them is byte-for-byte today's. */
export function clipAdvancedBody(a: Partial<ClipAdvanced> | undefined): Record<string, unknown> {
  if (!a) return {};
  const avoid = normalizeClipAvoid(a.avoid).slice(0, CLIP_AVOID_MAX);
  const seed = normalizeClipSeed(a.seed);
  return { ...(avoid ? { avoid } : {}), ...(seed !== null ? { seed } : {}) };
}

/** The derived negative prompt (lib/video/clipPrompt clipNegativePrompt) with the user's own, in English, after it. */
export function mergeClipNegative(base: string, userEn: string): string {
  const extra = userEn.trim();
  if (!extra) return base;
  return base.trim() ? `${base.trim()}, ${extra}` : extra;
}
