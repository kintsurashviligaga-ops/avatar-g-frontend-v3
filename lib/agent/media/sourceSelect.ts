/**
 * lib/agent/media/sourceSelect.ts — WHICH of the user's pictures an edit may use, read from their words (Media Studio
 * v2.0 §C, owner 2026-10-11): „მარტო ბოლო შვიდი", „პირველი სამი", „მესამის გარდა", „მხოლოდ მე-2 და მე-5",
 * „only the last 7", „except clip 3", „только последние семь", „кроме третьего".
 *
 * Numbers count the PICTURES (videos and photos) in the order sent; the music track is never counted. A selection
 * replaces the allowed source list: what it leaves out is EXCLUDED, and an excluded file is never resolved, probed or
 * put in the render graph (./montageExec applies it before anything reads a file). A selection that names a picture
 * that is not there („ბოლო შვიდი" of five) is refused by name, never trimmed to fit.
 *
 * Deterministic and pure: no model guesses which files the user meant. Words that are not a selection (a music start
 * „58-ე წამიდან", „the last 5 seconds", „პირველი ვიდეოს ხმა") leave the selection at `all`.
 */

export type SourceSelection =
  /** No selection in the words: every picture sent is used. */
  | { mode: 'all' }
  /** `keep` / `excluded`: 0-based indices into the pictures, in the order sent. */
  | { mode: 'subset'; keep: number[]; excluded: number[]; phrase: string }
  /** The words name a picture that is not there, or leave none: refused, never guessed. */
  | { mode: 'invalid'; reason: 'out_of_range' | 'nothing_left'; phrase: string; asked: number[]; pictures: number };

/** The parsed words, before they meet a count of pictures. Positions are 1-based; `last` counts from the end. */
export type SelectionAsk =
  | { kind: 'last'; n: number; phrase: string }
  | { kind: 'first'; n: number; phrase: string }
  | { kind: 'only'; picks: Pick[]; phrase: string }
  | { kind: 'except'; picks: Pick[]; phrase: string };

/** One named picture: its 1-based position, or `fromEnd` (1 = the last). */
export type Pick = { at: number } | { fromEnd: number };

const CARDINAL: ReadonlyArray<[string, number]> = [
  ['ერთ', 1], ['ორ', 2], ['სამ', 3], ['ოთხ', 4], ['ხუთ', 5], ['ექვს', 6], ['შვიდ', 7], ['რვ', 8], ['ცხრ', 9], ['ათ', 10],
  ['თერთმეტ', 11], ['თორმეტ', 12], ['ცამეტ', 13], ['თოთხმეტ', 14], ['თხუთმეტ', 15], ['ოც', 20],
  ['one', 1], ['two', 2], ['three', 3], ['four', 4], ['five', 5], ['six', 6], ['seven', 7], ['eight', 8], ['nine', 9],
  ['ten', 10], ['eleven', 11], ['twelve', 12],
  ['один', 1], ['одн', 1], ['дв', 2], ['тр', 3], ['четыр', 4], ['пят', 5], ['шест', 6], ['сем', 7], ['восем', 8],
  ['девят', 9], ['десят', 10],
];
/** Georgian case endings a cardinal takes („შვიდი", „შვიდს", „შვიდით", „ორიც"); Russian/English take theirs below. */
const KA_CARD_END = '(?:ი|ს|ით|იც|ისა|ის|ა|ე|ეს)?';
const RU_CARD_END = '(?:а|е|и|ух|ёх|ех|ь|и|ую|ой|ём|ем|ми|мь|ью)?';

const ORDINAL: ReadonlyArray<[RegExp, number]> = [
  [/^პირველ/u, 1], [/^მეორ/u, 2], [/^მესამ/u, 3], [/^მეოთხ/u, 4], [/^მეხუთ/u, 5], [/^მეექვს/u, 6], [/^მეშვიდ/u, 7],
  [/^მერვ/u, 8], [/^მეცხრ/u, 9], [/^მეათ/u, 10], [/^მეთერთმეტ/u, 11], [/^მეთორმეტ/u, 12],
  [/^first$/u, 1], [/^second$/u, 2], [/^third$/u, 3], [/^fourth$/u, 4], [/^fifth$/u, 5], [/^sixth$/u, 6],
  [/^seventh$/u, 7], [/^eighth$/u, 8], [/^ninth$/u, 9], [/^tenth$/u, 10],
  [/^перв/u, 1], [/^втор/u, 2], [/^трет/u, 3], [/^четв[её]рт/u, 4], [/^пят(?:ый|ого|ой|ую|ом)$/u, 5],
  [/^шест(?:ой|ого|ую|ом)$/u, 6], [/^седьм/u, 7], [/^восьм/u, 8], [/^девят(?:ый|ого|ую|ом)$/u, 9], [/^десят(?:ый|ого|ую|ом)$/u, 10],
];

/** Words that may sit between a trigger and the numbers („მხოლოდ ბოლო შვიდი ვიდეო", „only the clips 2 and 5"). */
const FILLER = /^(?:the|clips?|videos?|files?|shots?|pictures?|photos?|ones?|of|them|these|ვიდეო\S*|კლიპ\S*|ფაილ\S*|ფოტო\S*|კადრ\S*|ეს\S*|ამ|ის|ვიდეოებ\S*|видео|ролик\S*|клип\S*|файл\S*|фото|эти|из|и)$/u;
/** A unit of time after a number makes it a time („ბოლო 5 წამი", „first 3 seconds"), not a picture count. */
const TIME_UNIT = /^(?:წამ|წმ|წუთ|sec|second|s$|min|minute|сек|мин)/u;
const JOIN = /^(?:და|and|и|,|&|\+)$/u;

const KA_LAST = /^ბოლო(?:ს|ც)?$/u;
const EN_LAST = /^last$/u;
const RU_LAST = /^последн/u;
const ONLY = /^(?:მხოლოდ|მარტო|მარტოოდენ|only|just|только|лишь)$/u;
const EXCEPT_BEFORE = /^(?:გარდა|except|excluding|without|skip|drop|remove|exclude|кроме|без|убери|исключи|ამოიღე|ამოაგდე|მოაშორე|წაშალე|გამოტოვე|ამოაკელი)$/u;
/** Georgian puts „გარდა" AFTER the picture („მესამის გარდა"), and a verb after it too („მესამე ამოიღე"). */
const EXCEPT_AFTER = /^(?:გარდა|ამოიღე|ამოაგდე|მოაშორე|წაშალე|გამოტოვე|ამოაკელი|არ(?:\s|$))/u;

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[„“”"«»().!?;:]/gu, ' ')
    .replace(/,/gu, ' , ')
    .split(/\s+/u)
    .filter(Boolean);
}

/** A cardinal number word or digits → its value („შვიდი" 7, „7" 7, „seven" 7, „семь" 7). */
export function cardinalOf(tok: string): number | null {
  if (/^\d{1,3}$/u.test(tok)) return Number(tok);
  for (const [stem, n] of CARDINAL) {
    const end = /[ა-ჰ]/u.test(stem) ? KA_CARD_END : /[а-яё]/u.test(stem) ? RU_CARD_END : '';
    if (new RegExp(`^${stem}${end}$`, 'u').test(tok)) return n;
  }
  return null;
}

/** An ordinal word or numbered position → its 1-based value („მესამე" 3, „მე-2" 2, „5-ე" 5, „3rd" 3, „третьего" 3). */
export function ordinalOf(tok: string): number | null {
  const m = /^(?:მე-?)?(\d{1,3})(?:-?(?:ე|ის|ისა|ს|th|st|nd|rd|й|го|ой|ий|ый))?$/u.exec(tok);
  if (m) return Number(m[1]);
  for (const [re, n] of ORDINAL) if (re.test(tok)) return n;
  return null;
}

/** Read picks starting at `i` („მე-2 და მე-5", „მესამე", „ბოლო"); returns them and where they stopped. */
function readPicks(t: string[], i: number): { picks: Pick[]; end: number } {
  const picks: Pick[] = [];
  let j = i;
  while (j < t.length) {
    const tok = t[j]!;
    if (FILLER.test(tok) || (picks.length && JOIN.test(tok))) { j += 1; continue; }
    const isLast = KA_LAST.test(tok) || EN_LAST.test(tok) || RU_LAST.test(tok);
    const isFirst = FIRST.test(tok);
    if (isLast || isFirst) {
      // „ბოლო" alone names the last picture; „ბოლო ორი" / „the first three" name a run of them.
      const n = countAt(t, j + 1);
      if (n !== null) {
        for (let k = 1; k <= n; k += 1) picks.push(isLast ? { fromEnd: k } : { at: k });
        j = skipCount(t, j + 1) + 1;
        continue;
      }
      if (isLast) {
        picks.push({ fromEnd: 1 });
        j += 1;
        continue;
      }
    }
    const n = ordinalOf(tok);
    if (n === null) break;
    if (t[j + 1] && TIME_UNIT.test(t[j + 1]!)) return { picks: [], end: j }; // „58-ე წამიდან": a time, not a picture
    picks.push({ at: n });
    j += 1;
  }
  return { picks, end: j };
}

const FIRST = /^(?:პირველ(?:ი|ს)?|first|перв(?:ые|ых|ый|ого|ую))$/u;

/** The index of the count word after `i` (fillers skipped). */
function skipCount(t: string[], i: number): number {
  let j = i;
  while (j < t.length && FILLER.test(t[j]!)) j += 1;
  return j;
}

/** A count after „ბოლო"/„first"/„последние": its value, unless a unit of time follows („ბოლო 5 წამი"). */
function countAt(t: string[], i: number): number | null {
  let j = i;
  while (j < t.length && FILLER.test(t[j]!)) j += 1;
  const n = t[j] ? cardinalOf(t[j]!) : null;
  if (n === null || n < 1) return null;
  const after = t[j + 1];
  if (after && TIME_UNIT.test(after)) return null;
  return n;
}

/** The selection in the user's words, or null when there is none. */
export function parseSelection(text: string | undefined): SelectionAsk | null {
  const t = tokens(typeof text === 'string' ? text.slice(0, 2000) : '');
  for (let i = 0; i < t.length; i += 1) {
    const tok = t[i]!;
    // ── „(მხოლოდ) ბოლო შვიდი" / „only the last 7" / „только последние семь" ──
    if (KA_LAST.test(tok) || EN_LAST.test(tok) || RU_LAST.test(tok)) {
      const n = countAt(t, i + 1);
      if (n !== null) return { kind: 'last', n, phrase: t.slice(Math.max(0, i - 1), i + 3).join(' ') };
    }
    // ── „(მხოლოდ) პირველი სამი" / „only the first three" / „только первые три" ──
    if (FIRST.test(tok)) {
      const n = countAt(t, i + 1);
      if (n !== null) return { kind: 'first', n, phrase: t.slice(Math.max(0, i - 1), i + 3).join(' ') };
    }
    // ── „მხოლოდ მე-2 და მე-5" / „only clips 2 and 5" / „только 2 и 5" ──
    if (ONLY.test(tok)) {
      // „მხოლოდ ბოლო შვიდი" is the count read at „ბოლო" (next tokens); a list follows otherwise.
      const at = skipCount(t, i + 1);
      const w = t[at] ?? '';
      if ((KA_LAST.test(w) || EN_LAST.test(w) || RU_LAST.test(w) || FIRST.test(w)) && countAt(t, at + 1) !== null) continue;
      const { picks, end } = readPicks(t, i + 1);
      // „მხოლოდ ბოლო" alone would be one pick; „only the last 7" was read above. Two or more, or one named number.
      if (picks.length) return { kind: 'only', picks, phrase: t.slice(i, end).join(' ') };
    }
    // ── „გარდა მესამისა" / „except the third" / „кроме третьего" / „ამოიღე მეორე" ──
    if (EXCEPT_BEFORE.test(tok)) {
      const { picks, end } = readPicks(t, i + 1);
      if (picks.length) return { kind: 'except', picks, phrase: t.slice(i, end).join(' ') };
    }
  }
  // ── Georgian postposition: „მესამის გარდა", „მეორე და მეხუთე ამოიღე", „ბოლო ვიდეო არ გამოიყენო" ──
  for (let i = 0; i < t.length; i += 1) {
    const { picks, end } = readPicks(t, i);
    if (!picks.length) continue;
    const next = t.slice(end, end + 2).join(' ');
    if (EXCEPT_AFTER.test(next)) return { kind: 'except', picks, phrase: t.slice(i, end + 1).join(' ') };
    i = Math.max(i, end - 1);
  }
  return null;
}

const posOf = (p: Pick, count: number): number => ('at' in p ? p.at : count - p.fromEnd + 1);

/** Apply the words to `pictures` (how many videos and photos were sent). */
export function resolveSelection(ask: SelectionAsk | null, pictures: number): SourceSelection {
  if (!ask) return { mode: 'all' };
  const all = Array.from({ length: pictures }, (_, i) => i);
  let keep: number[];
  let asked: number[];
  if (ask.kind === 'last' || ask.kind === 'first') {
    asked = [ask.n];
    if (ask.n > pictures) return { mode: 'invalid', reason: 'out_of_range', phrase: ask.phrase, asked, pictures };
    keep = ask.kind === 'last' ? all.slice(pictures - ask.n) : all.slice(0, ask.n);
  } else {
    const at = ask.picks.map((p) => posOf(p, pictures));
    asked = at;
    if (at.some((p) => p < 1 || p > pictures)) return { mode: 'invalid', reason: 'out_of_range', phrase: ask.phrase, asked, pictures };
    const named = new Set(at.map((p) => p - 1));
    keep = ask.kind === 'only' ? all.filter((i) => named.has(i)) : all.filter((i) => !named.has(i));
  }
  if (!keep.length) return { mode: 'invalid', reason: 'nothing_left', phrase: ask.phrase, asked, pictures };
  if (keep.length === pictures) return { mode: 'all' };
  return { mode: 'subset', keep, excluded: all.filter((i) => !keep.includes(i)), phrase: ask.phrase };
}

/**
 * The words → the selection over `pictures` pictures, in one call. A plan changed in the chat comes back with the change
 * on a later line (lib/agent/intentReply mergeMontagePrompt), and a later line wins, as for the length and the music
 * start (lib/agent/params minePlanParams): „მარტო ბოლო შვიდი" under „გარდა მესამისა" replaces it.
 */
export function selectSources(text: string | undefined, pictures: number): SourceSelection {
  const lines = String(text ?? '').split(/\r?\n/u).filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const ask = parseSelection(lines[i]);
    if (ask) return resolveSelection(ask, pictures);
  }
  return resolveSelection(parseSelection(text), pictures);
}
