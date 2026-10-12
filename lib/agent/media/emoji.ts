/**
 * lib/agent/media/emoji.ts — colour emoji for Agent G's text layers („myavatar.ge🚀"). resvg cannot draw a colour emoji
 * font (CBDT bitmaps come out blank, measured 2026-10-11), so an emoji is drawn as its Twemoji SVG, set in the line where
 * the character stands (./layerRender). The set is every Twemoji without a skin-tone modifier (./emoji-data-twemoji,
 * bundled, no network); an emoji outside it (a skin tone, a sequence Twemoji does not have) stays a missing glyph and the
 * edit names it at the quote, never draws a blank or a box.
 *
 * Twemoji graphics (c) Twitter, Inc and other contributors, CC-BY 4.0: ./TWEMOJI-LICENSE.txt.
 */
import 'server-only';
import { brotliDecompressSync } from 'node:zlib';
import { TWEMOJI_BR_B64 } from './emoji-data-twemoji';

let set: Record<string, string> | null = null;
function emojiSet(): Record<string, string> {
  if (!set) set = JSON.parse(brotliDecompressSync(Buffer.from(TWEMOJI_BR_B64, 'base64')).toString('utf8')) as Record<string, string>;
  return set;
}

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** The characters of a text as a person sees them: an emoji with its joiners, selectors and keycap is one. */
export function clusters(text: string): string[] {
  if (!segmenter) return [...text];
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

const hex = (s: string): string[] => [...s].map((c) => c.codePointAt(0)!.toString(16));
const VS16 = 'fe0f';
const ZWJ = '200d';

/**
 * The Twemoji file name (code points in hex, „-"-joined) of one character cluster, when the set has it; null otherwise.
 * Twemoji drops U+FE0F from a name unless the sequence has a joiner; both spellings are tried.
 */
export function twemojiKey(cluster: string): string | null {
  if (!cluster || cluster.length > 32) return null;
  const cps = hex(cluster);
  const all = emojiSet();
  const exact = cps.join('-');
  if (all[exact] !== undefined) return exact;
  const bare = cps.filter((c) => c !== VS16).join('-');
  if (bare && all[bare] !== undefined) return bare;
  return null;
}

/** The cluster asks for the emoji picture by itself (a selector, a joiner, a keycap, a flag), not only by its code point. */
export function emojiPresentation(cluster: string): boolean {
  const cps = hex(cluster);
  return cps.length > 1 && (cps.includes(VS16) || cps.includes(ZWJ) || cps.includes('20e3') || cps.every((c) => /^1f1e[6-9a-f]$|^1f1f[0-9a-f]$/.test(c)));
}

/**
 * One emoji as SVG markup on the line: the 36×36 Twemoji scaled to `size` px with its top-left at (x, y). Ids inside
 * (a few Twemoji clip) get `prefix`, so two emoji on one canvas never share one.
 */
export function twemojiSvg(key: string, x: number, y: number, size: number, prefix: string): string {
  const inner = emojiSet()[key];
  if (inner === undefined) return '';
  const safe = /id="/.test(inner)
    ? inner.replace(/id="([^"]+)"/g, `id="${prefix}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`).replace(/href="#([^"]+)"/g, `href="#${prefix}$1"`)
    : inner;
  const k = Math.round((size / 36) * 10_000) / 10_000;
  return `<g transform="translate(${x} ${y}) scale(${k})">${safe}</g>`;
}
