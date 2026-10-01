/**
 * lib/studio/style.ts — the ONE gate for the client's free-text `style` field before it reaches a prompt.
 *
 * ⚠️ `style` IS CLIENT TEXT THAT LANDS INSIDE PROVIDER AND DIRECTOR PROMPTS. The studio only ever sends a short label
 * from its own option lists ('Cinematic', 'Anime', 'lo-fi'…), but a direct POST can send anything: the image route
 * appended it verbatim to the paid render prompt AND forwarded it as the provider's `style` field, the film director
 * wrote it into every scene's frame prompt and the Master Prompt Agent's brief, and the music route put it into the
 * engine brief and the cover-art prompt. Uncapped, that was a megabyte of text (or a newline-separated instruction
 * block) shipped to every paid model behind the route. Bidi overrides/isolates make a style read differently in a
 * log or the Library than what the model was given (Trojan-Source shape); tag characters (U+E0000 block, category
 * Cf) are invisible text an LLM still reads.
 *
 * So: whitespace runs (newlines included) become one space FIRST — "anime\nstyle" must not fuse into "animestyle" —
 * then every control (Cc), format (Cf: bidi marks/embeddings/overrides/isolates, zero-width, BOM, soft hyphen, tag
 * characters) and lone surrogate (Cs) is dropped, and the result is capped at STYLE_MAX code points (never half a
 * surrogate pair). The longest real label the studio sends is well under 30 characters.
 *
 * Pure and isomorphic: no env, no I/O. The sibling one-line cleaner for Live tool args is lib/voice/liveTools.ts.
 */

/** The cap, in characters (code points). A label, not a paragraph. */
export const STYLE_MAX = 80;

// Cc = C0/C1 controls + DEL · Cf = format characters (U+061C, U+200B–U+200F, U+202A–U+202E, U+2060–U+2064,
// U+2066–U+2069, U+FEFF, U+00AD, tag characters…) · Cs = lone surrogates (JSON.parse lets "\ud800" through).
const CONTROL_FORMAT_SURROGATE = /[\p{Cc}\p{Cf}\p{Cs}]/gu;

/**
 * The client's `style` as a single, bounded, visible line — or '' when there is nothing left (a non-string, blank,
 * or nothing but controls). Each route applies its own default to ''.
 */
export function sanitizeStyle(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return '';
  const line = raw
    .replace(/\s+/g, ' ')
    .replace(CONTROL_FORMAT_SURROGATE, '')
    .replace(/ {2,}/g, ' ')
    .trim();
  if (line.length <= STYLE_MAX) return line;
  // STYLE_MAX code points span at most 2×STYLE_MAX UTF-16 units, so only that prefix is walked. Array.from walks code
  // points, so the cut can never leave half a surrogate pair behind.
  return Array.from(line.slice(0, STYLE_MAX * 2)).slice(0, STYLE_MAX).join('').trim();
}

/**
 * True only when `style` is an OWN key of `table`. ⚠️ A plain `table[style]` lookup also answers for inherited keys,
 * so 'constructor' / 'toString' / '__proto__' "matched" and the route appended a function's source text to the prompt.
 */
export function isKnownStyle(table: Readonly<Record<string, unknown>>, style: string): boolean {
  return !!style && Object.prototype.hasOwnProperty.call(table, style);
}
