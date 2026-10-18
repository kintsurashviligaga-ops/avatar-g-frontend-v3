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
// words, so "the avatar says hello to everyone" stays a plain script. The language the words are in may stand between
// the verb and the colon — „ამბობს ქართულად:", "says in English:", "говорит по-русски:" (Production 2026-10-17, below).
const LANG = '(?:ქართულად|ინგლისურად|რუსულად|in\\s+(?:georgian|english|russian)|по-грузински|по-английски|по-русски|на\\s+(?:грузинском|английском|русском)(?:\\s+языке)?)';
const SAYS = new RegExp(`^(.*?)(?:^|\\s)(ამბობს|იტყვის|თქვას|ეუბნება|ამბობდეს|says|say|saying|tells|говорит|скажет|произносит|скажи)(?:\\s+${LANG})?\\s*(?:[:：]|(?=["“„«]))\\s*(.+)$`, 'isu');
// ⚠️ PRODUCTION 2026-10-17 (GG): „შექმენი ავატარი რომელიც ამბობს ქართულად: გადადი მაი ავატარ ჯიზე და დაიწყე" — the language
// word hid the colon from SAYS, so the whole order became the script. The order itself („make an avatar that") is not how
// the avatar behaves either: it is dropped from the direction.
const ORDER_LEAD = /^(?:(?:please|pls)\s+)?(?:შემიქმენი|შექმენი|გამიკეთე|გააკეთე|დამიმზადე|make(?:\s+me)?|create(?:\s+me)?|generate|build|создай(?:те)?|сделай(?:те)?|сгенерируй)\s+(?:(?:ერთი|an?|one)\s+)?(?:(?:მოლაპარაკე|talking|говорящ\S*)\s+)?(?:ავატარ\S*|avatar|аватар\S*)\s*,?\s*(?:(?:რომელიც|რომ|that|which|who|который|которая)(?=\s|$)\s*)?/iu;
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
    const before = tidy((m[1] ?? '').replace(ORDER_LEAD, ''));
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
