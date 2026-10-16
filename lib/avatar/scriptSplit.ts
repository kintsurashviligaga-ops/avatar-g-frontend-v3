/**
 * An avatar request is two things: the words the avatar SAYS and how it BEHAVES while saying them.
 *
 * ⚠️ PRODUCTION 2026-10-16 (GG's iPhone): "ავატარი ემოციურად, ჟესტებით და ეფექტურად ამბობს: გადადი მაიავატარ.ჯიზე და
 * შექმენი შენი ავატარი" went to text-to-speech whole — the avatar would have read its own stage directions aloud, and
 * Agent G's card quoted them as the script. The direction is split off here: only `speech` is ever spoken; `direction`
 * is shown on the card and goes to an engine that can act on it.
 *
 * Client-safe, pure.
 */
export interface AvatarScript {
  /** The words to speak, verbatim. Never empty when the input had text. */
  speech: string;
  /** Emotion, gestures, movement — never spoken. '' when the request held none. */
  direction: string;
}

// "… says: <words>" / "… ამბობს: <words>" / "… говорит: <words>". The colon (or a quote right after) is what marks the
// words, so "the avatar says hello to everyone" stays a plain script.
const SAYS = /^(.*?)(?:^|\s)(ამბობს|იტყვის|თქვას|ეუბნება|ამბობდეს|says|say|saying|tells|говорит|скажет|произносит|скажи)\s*(?:[:：]|(?=["“„«]))\s*(.+)$/isu;
const QUOTED = /["“„«]([^"“”„«»]{2,})["”“»]/u;
const PAREN = /\(([^()]{2,})\)|\*([^*]{2,})\*/gu;

const unquote = (s: string): string => s.trim().replace(/^["“„«]\s*/u, '').replace(/\s*["”“»]$/u, '').trim();
const tidy = (s: string): string => s.replace(/\s+/gu, ' ').replace(/^[\s,;:—–-]+|[\s,;:—–-]+$/gu, '').trim();

export function splitAvatarScript(raw: string): AvatarScript {
  const text = (raw ?? '').trim();
  if (!text) return { speech: '', direction: '' };
  const directions: string[] = [];
  // Stage directions in (…) or *…* are never spoken, wherever they stand.
  const bare = text.replace(PAREN, (_m, a: string | undefined, b: string | undefined) => { directions.push((a ?? b ?? '').trim()); return ' '; });
  const m = SAYS.exec(bare);
  if (m && m[3] && unquote(m[3])) {
    const before = tidy(m[1] ?? '');
    if (before) directions.unshift(before);
    return { speech: unquote(m[3]), direction: tidy(directions.join('; ')) };
  }
  const q = QUOTED.exec(bare);
  if (q && q[1]) {
    const rest = tidy(bare.replace(q[0], ' '));
    if (rest) directions.unshift(rest);
    return { speech: q[1].trim(), direction: tidy(directions.join('; ')) };
  }
  return { speech: tidy(bare) || text, direction: tidy(directions.join('; ')) };
}
