/**
 * lib/speech/chunk.ts — cut a message into speech requests that cover every character exactly once (§5.2, §5.3.1).
 *
 * The old chunker (lib/audio/ttsChunks) returns strings only. It collapses whitespace first, so paragraphs are lost and
 * nothing maps back to the message. It ends a sentence at every '.', so "3.5" was read as "three. five", "Mr. Smith"
 * and "т.е." were cut in two, and a list number became a chunk of its own. A sentence over the limit was cut
 * mid-word. A failed chunk could not say where in the message the read stopped.
 *
 * Here each chunk is a span [start, end) of the SOURCE string (UTF-16 offsets). The spans are contiguous and cover the
 * source exactly: the first starts at 0, each starts where the one before ended, the last ends at source.length.
 * `text` is what is sent to TTS: that span with its whitespace collapsed and trimmed, never empty and never longer
 * than `maxChars`. So nothing is dropped and nothing is read twice, and a player can pause at, and resume from, the
 * exact offset of a failed chunk.
 *
 * Sentences end at a run of . ! ? … 。 ！ ？ (with any closing quotes or brackets) followed by whitespace, and at line
 * breaks. A single '.' does not end one after a known abbreviation (ka/en/ru), an initial (one letter), or a number
 * (a list item or ordinal); "3.5" never splits, since its '.' is not followed by whitespace. Leaving a sentence end
 * unsplit only makes a chunk longer; splitting a non-end would break the reading, so the rules lean that way.
 * A blank line (paragraph) is a hard end: two paragraphs never share a chunk. Sentences within a paragraph are packed
 * up to `maxChars`. A sentence longer than that is cut at a clause mark (, ; : — –), else at a space, and only a run
 * with no space at all is cut at the limit (never inside a surrogate pair).
 *
 * Pure and deterministic: no I/O, no locale APIs, the same input always gives the same chunks.
 */
import { SPEECH_MAX_CHARS } from './contract';

export interface SpeechChunk {
  readonly index: number;
  /** UTF-16 offset in the source where this chunk starts (inclusive). */
  readonly start: number;
  /** UTF-16 offset in the source where this chunk ends (exclusive). */
  readonly end: number;
  /** What is read: source.slice(start, end) with whitespace collapsed and trimmed. Never empty. */
  readonly text: string;
}

export interface SpeechChunkOptions {
  /** Longest `text` of one chunk. Default SPEECH_CHUNK_MAX_CHARS; clamped to [SPEECH_CHUNK_MIN_CHARS, SPEECH_MAX_CHARS]. */
  maxChars?: number;
  /**
   * Speak sooner: the first sentence is a chunk of its own when it is at most `leadMax` characters. A short first
   * request returns its audio sooner, and the rest is synthesised while it plays.
   */
  leadSentence?: boolean;
  /** Default 220. */
  leadMax?: number;
  /**
   * Let the chunks grow instead of jumping to `maxChars` (see SPEECH_CHUNK_RAMP). Chunk k (k ≥ 1) holds at most
   * `ramp` × the spoken length of the two chunks before it (at least SPEECH_CHUNK_MIN_CHARS, at most `maxChars`), and
   * with `leadSentence` the first chunk holds at most `leadMax`. A sentence longer than its chunk may hold is cut at
   * its last clause mark (, ; : — –) that fits and leaves at least SPEECH_CHUNK_MIN_CHARS after it, and read whole
   * when it has none (up to `maxChars`; past that it is cut as without the ramp).
   */
  ramp?: number;
}

export const SPEECH_CHUNK_MAX_CHARS = 600;
export const SPEECH_CHUNK_MIN_CHARS = 40;

/**
 * ⚠️ THE READ STOPPED IN THE MIDDLE AND THEN WENT ON (GG, Production 2026-10-24). With the lead sentence on its own,
 * the next chunk took up to 600 characters: "გამარჯობა!" (under a second of audio) was followed by a request for half a
 * minute of it, which could not be ready when the lead ended, so the read waited. The player asks for chunk k when
 * chunk k − SPEECH_AHEAD starts (lib/speech/player), and chunk k must be ready when chunk k − 1 ends. Growing each
 * chunk to at most 1.5 × the two before it keeps every request small next to the audio already on its way, whatever
 * fixed cost each request has. UNCERTAIN: no TTS model's speed is measured (the owner's trial card, lib/speech/trial,
 * measures it); this is the value to change once it is.
 */
export const SPEECH_CHUNK_RAMP = 1.5;

/**
 * Words whose '.' does not end a sentence, lower-cased, with their inner dots ("т.е." is "т.е"). Georgian has no
 * letter case; Russian and English are matched lower-cased.
 */
const ABBREVIATIONS = new Set([
  // Georgian (single letters such as წ. or ქ. are initials, below)
  'ა.შ', 'მაგ', 'ე.ი', 'ე.წ', 'ძვ.წ', 'ახ.წ', 'წწ', 'გვ', 'საუკ', 'ათ', 'მლნ', 'მლრდ', 'დაახ', 'იხ', 'შდრ', 'სთ', 'წთ',
  'კმ', 'სმ', 'კგ', 'ბ-ნ', 'ქ-ნ', 'პროფ', 'აკად', 'დოც', 'დოქტ',
  // English
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'mt', 'vs', 'etc', 'e.g', 'i.e', 'cf', 'al', 'no', 'nos', 'fig',
  'figs', 'vol', 'pp', 'approx', 'est', 'inc', 'ltd', 'co', 'corp', 'dept', 'univ', 'gen', 'gov', 'sen', 'rep',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'a.m', 'p.m', 'u.s', 'u.k',
  'u.s.a', 'ph.d', 'b.a', 'm.a',
  // Russian
  'т.е', 'т.д', 'т.п', 'т.к', 'т.н', 'т.о', 'и.о', 'н.э', 'гг', 'вв', 'ул', 'пр', 'кв', 'стр', 'см', 'им', 'проф',
  'акад', 'доц', 'др', 'тыс', 'млн', 'млрд', 'руб', 'коп', 'напр', 'ок', 'прим', 'рис', 'табл', 'гл', 'ст', 'обл', 'р-н',
  'г-н', 'г-жа', 'тел', 'мин', 'сек', 'км', 'кг',
]);

/** A run of sentence-final marks, any closing quotes or brackets, then whitespace or the end. */
const TERMINATOR = /[.!?…。！？]+[)\]}"'”’»›]*(?=\s|$)/gu;
/** A whitespace run with at least one line break. */
const LINE_BREAK = /[^\S\n]*\n\s*/g;
const OPENERS = /^[(\[{"'“‘«‹„]+/u;
const CLAUSE_MARK = /[,;:—–]/;

const spoken = (s: string) => s.replace(/\s+/g, ' ').trim();
const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c);

/** The word right before `at` (back to whitespace), without leading quotes or brackets, lower-cased. */
function wordBefore(source: string, at: number): string {
  let i = at;
  while (i > 0 && !isSpace(source[i - 1])) i--;
  return source.slice(i, at).replace(OPENERS, '').toLowerCase();
}

/** Whether a lone '.' at `dotAt` closes the word before it rather than the sentence. */
function dotIsNotAnEnd(source: string, dotAt: number): boolean {
  const word = wordBefore(source, dotAt);
  if (!word) return false;
  if (/^\d+$/.test(word)) return true; // "1. Item", "the 3. place", "2020."
  if (/^\p{L}$/u.test(word)) return true; // an initial: "J. R. R. Tolkien", "ი. ჭავჭავაძე", "2024 წ."
  return ABBREVIATIONS.has(word);
}

/** First index at or after `i` that is not whitespace (source.length if none). */
function skipSpace(source: string, i: number): number {
  while (i < source.length && isSpace(source[i])) i++;
  return i;
}

interface Span { start: number; end: number; hardEnd: boolean }

/** The sentences of `source` as contiguous spans covering it; `hardEnd` marks a paragraph end. */
export function speechSentences(source: string): Span[] {
  const cuts = new Map<number, boolean>(); // position → is a paragraph end
  const mark = (at: number, hard: boolean) => {
    if (at <= 0 || at >= source.length) return;
    cuts.set(at, (cuts.get(at) ?? false) || hard);
  };

  for (const m of source.matchAll(TERMINATOR)) {
    const run = m[0];
    const at = m.index!;
    const marks = run.replace(/[)\]}"'”’»›]+$/u, '');
    if (marks === '.' && dotIsNotAnEnd(source, at)) continue;
    const next = skipSpace(source, at + run.length);
    const gap = source.slice(at + run.length, next);
    mark(next, (gap.match(/\n/g)?.length ?? 0) >= 2);
  }
  for (const m of source.matchAll(LINE_BREAK)) {
    const next = m.index! + m[0].length;
    mark(next, (m[0].match(/\n/g)?.length ?? 0) >= 2);
  }

  const points = [...cuts.keys()].sort((a, b) => a - b);
  const spans: Span[] = [];
  let start = 0;
  for (const p of points) {
    spans.push({ start, end: p, hardEnd: cuts.get(p)! });
    start = p;
  }
  spans.push({ start, end: source.length, hardEnd: true });

  // Every cut is at a non-space character, so only the first span can be blank (leading whitespace or a blank first
  // line). It forms no sentence of its own: it joins the one after it.
  if (spans.length > 1 && !spoken(source.slice(spans[0]!.start, spans[0]!.end))) {
    const [blank, first] = spans.splice(0, 2) as [Span, Span];
    spans.unshift({ start: blank.start, end: first.end, hardEnd: first.hardEnd });
  }
  return spans;
}

/** Cut one over-long span [start, end) into pieces whose spoken text is at most `max`. */
function splitLong(source: string, start: number, end: number, max: number): Array<{ start: number; end: number }> {
  const pieces: Array<{ start: number; end: number }> = [];
  let pos = start;
  while (spoken(source.slice(pos, end)).length > max) {
    // Raw length bounds spoken length (whitespace only shrinks), so a cut within `max` raw characters of the first
    // word always fits; cutting past 40% of the window keeps pieces from getting tiny and always takes a word with it.
    const from = skipSpace(source, pos);
    const windowEnd = Math.min(end, from + max);
    const floor = from + Math.floor(max * 0.4);
    let cut = -1;
    for (let k = windowEnd - 1; k > floor; k--) {
      if (CLAUSE_MARK.test(source[k]!) && isSpace(source[k + 1])) { cut = k + 1; break; }
    }
    if (cut < 0) {
      for (let k = windowEnd - 1; k > floor; k--) {
        if (isSpace(source[k])) { cut = k; break; }
      }
    }
    if (cut < 0) {
      cut = windowEnd;
      const code = source.charCodeAt(cut - 1);
      if (code >= 0xd800 && code <= 0xdbff) cut -= 1; // never split a surrogate pair
    }
    pieces.push({ start: pos, end: cut });
    pos = cut;
  }
  pieces.push({ start: pos, end });
  // A cut right before trailing whitespace leaves a piece with nothing to say: it joins the piece before it.
  const out: Array<{ start: number; end: number }> = [];
  for (const p of pieces) {
    if (out.length && !spoken(source.slice(p.start, p.end))) out[out.length - 1] = { start: out[out.length - 1]!.start, end: p.end };
    else out.push(p);
  }
  return out;
}

/**
 * Where to cut [start, end) so that its first piece says at most `limit` characters: after the last clause mark (then
 * a space) that fits, keeps the piece above 40% of `limit` and leaves at least SPEECH_CHUNK_MIN_CHARS after it, or -1
 * when there is none. A sentence only a few characters over is read whole: cutting off a short tail would add a seam
 * in the voice and a request, and save no wait.
 */
function clauseCut(source: string, start: number, end: number, limit: number): number {
  const from = skipSpace(source, start);
  const windowEnd = Math.min(end - 1, from + limit);
  const floor = from + Math.floor(limit * 0.4);
  for (let k = windowEnd - 1; k > floor; k--) {
    if (!CLAUSE_MARK.test(source[k]!) || !isSpace(source[k + 1])) continue;
    if (spoken(source.slice(k + 1, end)).length >= SPEECH_CHUNK_MIN_CHARS) return k + 1;
  }
  return -1;
}

/** The speech chunks of `source`. Whitespace-only text has none. */
export function chunkSpeech(source: string, opts: SpeechChunkOptions = {}): SpeechChunk[] {
  const text = source ?? '';
  if (!spoken(text)) return [];
  const max = Math.min(SPEECH_MAX_CHARS, Math.max(SPEECH_CHUNK_MIN_CHARS, Math.floor(opts.maxChars ?? SPEECH_CHUNK_MAX_CHARS)));
  const leadMax = Math.min(max, opts.leadMax ?? 220);
  const ramp = opts.ramp !== undefined && Number.isFinite(opts.ramp) && opts.ramp > 0 ? opts.ramp : null;

  const ranges: Array<{ start: number; end: number }> = [];
  /** Spoken length of each range, for the ramp. */
  const lens: number[] = [];
  const push = (r: { start: number; end: number }) => {
    ranges.push({ start: r.start, end: r.end });
    lens.push(spoken(text.slice(r.start, r.end)).length);
  };
  /** The most the next chunk may say. With the ramp, the first one says at most `leadMax` when the lead is asked for. */
  const room = (): number => {
    const k = lens.length;
    if (!ramp) return max;
    if (k === 0) return opts.leadSentence ? leadMax : max;
    const before = lens[k - 1]! + (k >= 2 ? lens[k - 2]! : 0);
    return Math.min(max, Math.max(SPEECH_CHUNK_MIN_CHARS, Math.floor(ramp * before)));
  };
  let open: { start: number; end: number; hardEnd: boolean; limit: number } | null = null;
  const flush = () => { if (open) push(open); open = null; };

  speechSentences(text).forEach((sentence, i) => {
    let s: Span = sentence;
    const len = spoken(text.slice(s.start, s.end)).length;
    if (len > max && !ramp) {
      flush();
      for (const piece of splitLong(text, s.start, s.end, max)) push(piece);
      return;
    }
    if (i === 0 && opts.leadSentence && len <= leadMax) {
      push(s);
      return;
    }
    for (;;) {
      if (open && (open.hardEnd || spoken(text.slice(open.start, s.end)).length > open.limit)) flush();
      if (open) {
        open = { ...open, end: s.end, hardEnd: s.hardEnd };
        return;
      }
      const limit = room();
      const rest = spoken(text.slice(s.start, s.end)).length;
      if (rest <= limit) {
        open = { ...s, limit };
        return;
      }
      // Longer than this chunk may say: cut at a clause mark, read the rest as the next chunk(s).
      const cut = clauseCut(text, s.start, s.end, limit);
      if (cut > 0) {
        push({ start: s.start, end: cut });
        s = { start: cut, end: s.end, hardEnd: s.hardEnd };
        continue;
      }
      // No clause mark that fits: whole if the route takes it, else cut as before.
      if (rest <= max) {
        push(s);
      } else {
        for (const piece of splitLong(text, s.start, s.end, max)) push(piece);
      }
      return;
    }
  });
  flush();

  // The sentences are contiguous from 0 to text.length, and each range is a run of whole sentences or a piece of one.
  return ranges.map((r, index) => ({ index, start: r.start, end: r.end, text: spoken(text.slice(r.start, r.end)) }));
}

/** The index of the chunk that holds `offset` (the last chunk for offset ≥ its end), or -1 when there are none. */
export function chunkIndexAt(chunks: readonly SpeechChunk[], offset: number): number {
  if (!chunks.length) return -1;
  let lo = 0;
  let hi = chunks.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (chunks[mid]!.start <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
