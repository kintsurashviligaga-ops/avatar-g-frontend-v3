/**
 * lib/agent/media/assemblyAsk.ts — does a montage message ask for an intro + body + outro edit, and which video is which?
 * Pure, safe in the browser (the chat card reads it before the quote is back) and on the server (montageExec turns the
 * words into an AssemblyAsk when the caller sent none).
 *
 * GG 2026-11-05 10:21Z, two clips and „პირველი ვიდეო დაამონტაჟე, მეორე ვიდეოდან ინტრო და ბოლო ლოგოს სცენა ამოიღე": the
 * chat sent the message straight to the montage route, which only knew the beat/join edit, so both clips were joined
 * whole and the intro/outro words were lost (the card even read „ლოგო" as a logo overlay it could not draw). The words
 * now carry the roles:
 *
 *   · an INTRO word („ინტრო", „შესავალი", „intro", „opening", „интро", „заставка") and/or an OUTRO word („აუტრო",
 *     „ბოლო … სცენა", „ლოგოს სცენა", „outro", „end card", „ending", „концовка", „финальная заставка");
 *   · exactly two videos (an assembly gives every clip a role; with three or more the roles cannot be read safely);
 *   · the SOURCE of the intro/outro is the video named with „-დან" / „from" / „из" („მეორე ვიდეოდან", „from the second
 *     video", „из второго видео") or named right before the intro/outro word; the BODY is the other one. With no number
 *     at all the source is decided by length on the server (a bumper is the shorter clip): `source` is then absent.
 */

export interface AssemblyWords {
  intro: boolean;
  outro: boolean;
  /** 0-based among the VIDEOS in the order sent; absent = not named (the shorter clip is the bumper). */
  source?: number;
  /** 0-based among the videos; absent = the other video. */
  body?: number;
}

const INTRO = new RegExp([
  'ინტრო|შესავალ|დასაწყის\\p{L}*\\s+(?:\\p{L}+\\s+)?(?:სცენ|კადრ|ნაწილ|ეპიზოდ|ზასტავკ)',
  '\\bintros?\\b|\\bopening\\s+(?:scene|shot|sequence|titles?|bumper)|\\bbumper\\b',
  'интро|вступлени|заставк(?!\\p{L}*\\s+в\\s+конц)',
].join('|'), 'iu');

const OUTRO = new RegExp([
  'აუტრო|ფინალ\\p{L}*\\s+(?:\\p{L}+\\s+)?(?:სცენ|კადრ|ნაწილ|ეპიზოდ|ზასტავკ)',
  'ბოლო\\p{L}*\\s+(?:\\p{L}+\\s+){0,2}(?:სცენ|კადრ|ნაწილ|ეპიზოდ|ზასტავკ|ეკრან)',
  'ლოგო\\p{L}*\\s+(?:\\p{L}+\\s+)?(?:სცენ|კადრ|ნაწილ|ანიმაცი|ეკრან|ზასტავკ)',
  '\\boutros?\\b|\\bend(?:ing)?\\s*(?:card|screen|scene|slate|logo|bumper)|\\blogo\\s+(?:scene|ending|animation|reveal|card|screen|outro|sting)|\\bclosing\\s+(?:scene|shot|card)',
  'аутро|концовк|финальн\\p{L}*\\s+(?:сцен|кадр|заставк)|конечн\\p{L}*\\s+заставк|сцен\\p{L}*\\s+с\\s+логотип',
].join('|'), 'iu');

/** „პირველი" … „მეხუთე", „first" … „fifth", „первый" … „пятый" → 0..4. */
const ORDINALS: Array<[RegExp, number]> = [
  [/^(?:პირველ|first|1st|перв)/iu, 0],
  [/^(?:მეორ|second|2nd|втор)/iu, 1],
  [/^(?:მესამ|third|3rd|трет)/iu, 2],
  [/^(?:მეოთხ|fourth|4th|четв[её]рт)/iu, 3],
  [/^(?:მეხუთ|fifth|5th|пят)/iu, 4],
];
const ORD = 'პირველ\\p{L}*|მეორ\\p{L}*|მესამ\\p{L}*|მეოთხ\\p{L}*|მეხუთ\\p{L}*|first|second|third|fourth|fifth|[1-5](?:st|nd|rd|th)|перв\\p{L}*|втор\\p{L}*|трет\\p{L}*|четв[её]рт\\p{L}*|пят\\p{L}*|[1-5]\\s*-?\\s*(?:ლ|ე|ი)';
const MEDIA = '(?:ვიდეო|კლიპ|ფაილ|video|clip|file|видео|клип|ролик|файл)\\p{L}*';

interface Mention { video: number; at: number; end: number; from: boolean }

function ordinalOf(word: string): number | null {
  const w = word.trim();
  const digit = /^([1-5])/.exec(w);
  if (digit) return Number(digit[1]) - 1;
  for (const [re, n] of ORDINALS) if (re.test(w)) return n;
  return null;
}

/** Every „N-th video" / „video N" in the words, with whether it is the one something is taken FROM. */
function mentions(text: string): Mention[] {
  const out: Mention[] = [];
  const ordFirst = new RegExp(`(?<!\\p{L})(${ORD})\\s+(?:\\p{L}+\\s+)?(${MEDIA})`, 'giu');
  for (const m of text.matchAll(ordFirst)) {
    const n = ordinalOf(m[1]!);
    if (n === null) continue;
    out.push({ video: n, at: m.index!, end: m.index! + m[0].length, from: isFrom(text, m.index!, m[2]!) });
  }
  const numAfter = new RegExp(`(?<!\\p{L})(${MEDIA})\\s*(?:№|#|n\\.?\\s*)?([1-5])(?!\\d)`, 'giu');
  for (const m of text.matchAll(numAfter)) {
    if (out.some((o) => m.index! >= o.at && m.index! < o.end)) continue;
    out.push({ video: Number(m[2]) - 1, at: m.index!, end: m.index! + m[0].length, from: isFrom(text, m.index!, m[1]!) });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** „ვიდეოდან", „from the second video", „из второго видео", „со второго ролика", „the second video's intro". */
function isFrom(text: string, at: number, mediaWord: string): boolean {
  if (/დან$/u.test(mediaWord)) return true;
  const before = text.slice(Math.max(0, at - 12), at).toLowerCase();
  if (/(?:^|\s)(?:from|out\s+of|of)\s+(?:the\s+)?$/u.test(before)) return true;
  if (/(?:^|\s)(?:из|с|со|от)\s+$/u.test(before)) return true;
  const after = text.slice(at, at + 60);
  return new RegExp(`^.*?${MEDIA}'s\\s`, 'iu').test(after);
}

/**
 * The roles the words give, or null when this is not an intro/outro edit. `videos` = how many videos were sent.
 */
export function assemblyWords(text: string, videos: number): AssemblyWords | null {
  const t = (text || '').slice(0, 2000);
  if (videos !== 2) return null;
  const intro = INTRO.test(t);
  const outro = OUTRO.test(t);
  if (!intro && !outro) return null;
  const ms = mentions(t).filter((m) => m.video < videos);
  const roleWord = new RegExp(`${INTRO.source}|${OUTRO.source}`, 'iu');
  // A video named just before the intro/outro word („მეორე ვიდეოს ინტრო", „the second video intro") is its source too.
  const sourceMention = ms.find((m) => m.from) ?? ms.find((m) => roleWord.test(t.slice(m.end, m.end + 25)));
  const source = sourceMention?.video;
  const bodyMention = ms.find((m) => m !== sourceMention && m.video !== source);
  let body = bodyMention?.video;
  if (source !== undefined && body === undefined) body = source === 0 ? 1 : 0;
  if (body !== undefined && source === undefined) return { intro, outro, source: body === 0 ? 1 : 0, body };
  if (source !== undefined && body === source) return null;
  return { intro, outro, ...(source !== undefined ? { source } : {}), ...(body !== undefined ? { body } : {}) };
}

/** The roles as file positions: `videoFiles` are the 0-based file indices of the videos, `videoSec` their lengths. */
export function assemblyRoles(w: AssemblyWords, videoFiles: readonly number[], videoSec: readonly number[]): { intro?: number; body: number; outro?: number } | null {
  if (videoFiles.length !== 2) return null;
  // Not named: the bumper is the shorter clip (the body is what the edit is about).
  const source = w.source ?? (w.body !== undefined ? 1 - w.body : (videoSec[0] ?? 0) <= (videoSec[1] ?? 0) ? 0 : 1);
  const body = w.body ?? 1 - source;
  if (source === body) return null;
  const src = videoFiles[source]!, bod = videoFiles[body]!;
  return { ...(w.intro ? { intro: src } : {}), body: bod, ...(w.outro ? { outro: src } : {}) };
}
