/**
 * lib/studio/composeImagePrompt.ts — how /api/nanobanana/image turns a brief into the prompt every engine receives.
 *
 * Pulled out of the route so the assembly order is testable without a provider. It is pure: the two network steps
 * that feed it (translating the brief and the negative to English, reading the admin-approved learned directive)
 * stay in the route and hand their results in.
 *
 * The order is the contract:
 *   <brief in English>, <style directive | the un-styled quality boost>[, <template suffix>][. Do NOT include: <neg>.][ <learned directive>]
 *
 * ⚠️ ONLY A KNOWN LABEL IS FORWARDED AS THE PROVIDER'S `style` FIELD (`knownStyle`). Free text still shapes the
 * prompt (already bounded by lib/studio/style.ts) but never becomes a provider parameter. Own keys only: a bare
 * STYLE_SUFFIXES[k] also "knew" 'constructor' and appended a function's source text.
 *
 * ⚠️ THE TEMPLATE SUFFIX IS SERVER TEXT. It comes from lib/studio/templateContext (resolved from the card's id, ≤200
 * characters, only when the request's own aspect/quality/style still select that card); a client can choose WHICH
 * card, never what it says. It follows the style directive, so the style still leads the description.
 */
import { isKnownStyle } from '@/lib/studio/style';

/** The style label → its prompt directive (mirrors lib/replicate/schemas). Moved here from the route unchanged. */
export const STYLE_SUFFIXES: Readonly<Record<string, string>> = {
  'Photorealistic': 'photorealistic, 8k uhd, sharp focus, dslr photography',
  'Digital Art':    'digital art, vibrant colors, artstation, concept art, trending',
  'Oil Painting':   'oil painting, brushstrokes, classical fine art, canvas texture',
  'Watercolor':     'watercolor illustration, soft flowing colors, paper texture, delicate washes',
  'Anime':          'anime style, manga, cel shaded, studio ghibli quality, clean line art',
  'Sketch':         'detailed pencil sketch, graphite drawing, fine line art, cross-hatching',
  '3D Render':      '3D render, octane render, cinema4d, photorealistic CGI, studio lighting',
  'Cinematic':      'cinematic photography, film grain, dramatic lighting, anamorphic, color graded',
  'Cyberpunk':      'cyberpunk, neon-lit futuristic dystopia, blade runner aesthetic, holographic signage, rain-soaked streets',
  'Fantasy':        'epic fantasy art, magical ethereal lighting, detailed concept art, mythical atmosphere, painterly',
  'Minimalist':     'minimalist, clean composition, generous negative space, simple flat design, muted palette',
  'Line Art':       'clean line art, bold confident outlines, monochrome ink illustration, vector style',
  'Pixel Art':      '16-bit pixel art, retro game sprite, dithering, limited palette, crisp pixels',
};

/** A style brings its own quality descriptors; an un-styled ("Auto") prompt gets this light universal boost. */
export const UNSTYLED_BOOST = 'ultra detailed, sharp focus, professional quality';

export interface ComposeImagePromptInput {
  /** The brief, already in English (promptToEnglish fails open to the original). */
  promptEn: string;
  /** The cleaned style label (lib/studio/style.sanitizeStyle) — '' for none. */
  styleLabel: string;
  /** The template card's server-resolved suffix (lib/studio/templateContext) — absent when no card applies. */
  templateSuffix?: string | null;
  /** What to avoid, already in English — NanoBanana has no negative field, so it becomes an exclusion clause. */
  negativeEn?: string | null;
  /** An admin-APPROVED learned directive (getActiveConfig('image')), appended last. */
  learnedDirective?: string | null;
}

export interface ComposedImagePrompt {
  /** The prompt every engine receives (NanoBanana, then the prompt-only Grok and FLUX fallbacks). */
  finalPrompt: string;
  /** The style label when it is a KNOWN one — the only value forwarded as the provider's `style` field; else ''. */
  knownStyle: string;
}

export function composeImagePrompt(input: ComposeImagePromptInput): ComposedImagePrompt {
  const knownStyle = isKnownStyle(STYLE_SUFFIXES, input.styleLabel) ? input.styleLabel : '';
  const styleSuffix = knownStyle ? STYLE_SUFFIXES[knownStyle]! : input.styleLabel;
  const styled = styleSuffix ? `${input.promptEn}, ${styleSuffix}` : `${input.promptEn}, ${UNSTYLED_BOOST}`;
  const suffix = typeof input.templateSuffix === 'string' ? input.templateSuffix.trim() : '';
  const base = suffix ? `${styled}, ${suffix}` : styled;
  const negative = typeof input.negativeEn === 'string' ? input.negativeEn.trim() : '';
  const enriched = negative ? `${base}. Do NOT include: ${negative}.` : base;
  const learned = typeof input.learnedDirective === 'string' ? input.learnedDirective : '';
  return { finalPrompt: learned ? `${enriched} ${learned}` : enriched, knownStyle };
}
