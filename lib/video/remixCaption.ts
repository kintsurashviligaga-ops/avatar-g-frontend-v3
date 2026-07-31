/**
 * Pull the caption OUT of a free-text edit request, for the remix ops that burn text onto a video.
 *
 * ⚠️ WHY. In chat the user attaches a video and types an instruction; the whole message is forwarded to
 * /api/video/remix as `text`, and the caption ops burn `text` onto the frame. The intent classifier never
 * extracts a caption — its params are `{}` for add_subtitles and add_text_overlay — so the INSTRUCTION
 * itself became the caption. The ✏️ Text and 📝 Subtitles quick-action chips pre-fill exactly such an
 * instruction ("add a text overlay"), so tapping a chip and sending burned the literal words
 * "add a text overlay" across the video. A user who typed their own caption got something plausible,
 * which is why this survived: the chip-driven path is the one that is always wrong.
 *
 * The rule is deliberately conservative. A caption is returned only when the message actually CARRIES one
 * — quoted, or after a colon — or when the message is plainly not a command. Otherwise null, and the
 * caller asks for the words instead of inventing them. Guessing wrong here is expensive: it burns
 * permanent pixels onto a paid render.
 *
 * Pure and dependency-free so the matching can be tested on its own.
 */

/** Verbs and nouns that mark a message as an INSTRUCTION rather than the caption itself (ka · en · ru). */
const COMMAND_WORDS = [
  // en
  'add', 'put', 'overlay', 'burn', 'write', 'insert', 'place', 'subtitle', 'subtitles', 'caption',
  'captions', 'text', 'title', 'lower third',
  // ru
  'добав', 'налож', 'впиш', 'напиш', 'встав', 'субтитр', 'текст', 'надпис', 'титр',
  // ka
  'დაამატ', 'ჩაამატ', 'დააწერ', 'დაწერ', 'სუბტიტრ', 'ტექსტ', 'წარწერ', 'დაადე',
];

/** Longest caption we will burn. The overlay renderer draws a single line; more is not readable anyway. */
export const MAX_CAPTION_CHARS = 120;

/**
 * Collapse whitespace, strip decorative edges, and bound the length.
 *
 * The edge strip is not cosmetic. Without it `""` (empty quotes, which rule 1 cannot match) and
 * `": orphaned"` both fell through to rule 3 and were returned verbatim — so a caption of two quote marks,
 * or one carrying a stray leading colon, would have been burned permanently onto a paid render.
 */
function tidy(s: string): string {
  const cleaned = s
    .replace(/\s+/g, ' ')
    .replace(/^[\s"“”«»„'’:：—–-]+/, '')
    .replace(/[\s"“”«»„'’:：]+$/, '')
    .trim();
  return cleaned.slice(0, MAX_CAPTION_CHARS);
}

/** tidy(), but an empty result is null — nothing left to burn is not a caption. */
function tidyOrNull(s: string): string | null {
  const out = tidy(s);
  return out ? out : null;
}

function looksLikeCommand(s: string): boolean {
  const m = s.toLowerCase();
  return COMMAND_WORDS.some((w) => m.includes(w));
}

/**
 * The caption the user wants burned, or null when the message is only an instruction.
 *
 * Recognised, in order:
 *   1. Quoted text — "hello" · «hello» · „hello" · 'hello'. The most explicit signal, so it wins outright
 *      and is accepted even when it looks like a command word (the user asked for those exact letters).
 *   2. Text after a colon — `add a subtitle: hello there`.
 *   3. The whole message, but ONLY when it carries no instruction word at all.
 */
export function extractOverlayText(message: unknown): string | null {
  const raw = typeof message === 'string' ? message.trim() : '';
  if (!raw) return null;

  // 1. Quoted — straight, curly, guillemets, low-9 German, and single quotes.
  const quoted = /["“”«»„]([^"“”«»„]{1,200})["“”«»„]|'([^']{2,200})'/.exec(raw);
  const inQuotes = quoted?.[1] ?? quoted?.[2];
  if (inQuotes && inQuotes.trim()) return tidyOrNull(inQuotes);

  // 2. After a colon — only when something precedes it, so a bare ":text" is not treated as a caption.
  const colon = /^[^:：]{1,80}[:：]\s*(.+)$/s.exec(raw);
  const after = colon?.[1];
  if (after && after.trim()) return tidyOrNull(after);

  // 3. No instruction word anywhere → the message IS the caption.
  if (!looksLikeCommand(raw)) return tidyOrNull(raw);

  return null;
}
