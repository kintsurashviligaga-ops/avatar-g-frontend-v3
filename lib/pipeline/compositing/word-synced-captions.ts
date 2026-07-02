/**
 * Word-synced caption timing — STEP 2.3.
 *
 * ElevenLabs `/v1/text-to-speech/{voice}/with-timestamps` returns character-level
 * `alignment` (characters[], character_start_times_seconds[], character_end_times_seconds[]).
 * This module turns that into timed CAPTION SEGMENTS (≤N words per on-screen card),
 * each with a real [startSec, endSec] — NO estimation.
 *
 * Rendering is deliberately NOT here: the prod `ffmpeg-static` has no libfreetype, so
 * `drawtext`/`.ass`/libass all produce tofu. Captions are burned as SVG→PNG strips via
 * resvg + embedded FiraGO (`renderSubtitleCardPng` in ffmpeg-overlay.ts) and overlaid
 * with `enable='between(t,startSec,endSec)'`. This file is PURE + framework-free so it is
 * unit-testable on a fixture alignment (no live, paid TTS call needed to prove the logic).
 */

export interface ElevenAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface CaptionWord {
  text: string;
  startSec: number;
  endSec: number;
}

export interface CaptionSegment {
  text: string;
  startSec: number;
  endSec: number;
  words: CaptionWord[];
}

export interface SegmentOptions {
  /** Max words shown on one caption card (default 3 — matches splitIntoSubtitleLines). */
  maxWords?: number;
  /** Max characters on one card before forcing a break (default 24 for legibility on 9:16). */
  maxChars?: number;
  /** Break a card at sentence punctuation even below maxWords (default true). */
  breakOnPunctuation?: boolean;
}

const SENTENCE_END = /[.!?…。！？]$/;

/** Group the character stream into words using whitespace boundaries, carrying the
 *  first char's start time and the last char's end time as the word's timing. */
export function alignmentToWords(a: ElevenAlignment): CaptionWord[] {
  const chars = a?.characters ?? [];
  const starts = a?.character_start_times_seconds ?? [];
  const ends = a?.character_end_times_seconds ?? [];
  const n = Math.min(chars.length, starts.length, ends.length);
  const words: CaptionWord[] = [];
  let buf = '';
  let wStart: number | null = null;
  let wEnd = 0;
  const flush = () => {
    const text = buf.trim();
    if (text && wStart != null) words.push({ text, startSec: wStart, endSec: Math.max(wEnd, wStart) });
    buf = '';
    wStart = null;
    wEnd = 0;
  };
  for (let i = 0; i < n; i++) {
    const ch = chars[i]!;
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    if (wStart == null) wStart = starts[i]!;
    wEnd = ends[i]!;
    buf += ch;
  }
  flush();
  return words;
}

/** Turn words into on-screen caption cards (≤maxWords / ≤maxChars each), each timed to
 *  its words' real start/end. A card ends early at sentence punctuation. */
export function wordsToSegments(words: CaptionWord[], opts: SegmentOptions = {}): CaptionSegment[] {
  const maxWords = Math.max(1, opts.maxWords ?? 3);
  const maxChars = Math.max(1, opts.maxChars ?? 24);
  const breakPunct = opts.breakOnPunctuation ?? true;
  const segments: CaptionSegment[] = [];
  let cur: CaptionWord[] = [];
  const flush = () => {
    if (!cur.length) return;
    segments.push({
      text: cur.map((w) => w.text).join(' '),
      startSec: cur[0]!.startSec,
      endSec: cur[cur.length - 1]!.endSec,
      words: cur,
    });
    cur = [];
  };
  for (const w of words) {
    const candidateChars = cur.reduce((s, x) => s + x.text.length + 1, 0) + w.text.length;
    if (cur.length >= maxWords || (cur.length > 0 && candidateChars > maxChars)) flush();
    cur.push(w);
    if (breakPunct && SENTENCE_END.test(w.text)) flush();
  }
  flush();
  return segments;
}

/** Convenience: alignment → caption segments in one call. */
export function alignmentToCaptionSegments(a: ElevenAlignment, opts?: SegmentOptions): CaptionSegment[] {
  return wordsToSegments(alignmentToWords(a), opts);
}

/** Build the ffmpeg `enable` expression for one segment (each PNG overlay is gated to its
 *  own time window). `between` is inclusive; we clamp to non-negative and keep 3-dp so the
 *  filtergraph string stays short. */
export function enableBetween(seg: { startSec: number; endSec: number }): string {
  const s = Math.max(0, seg.startSec);
  const e = Math.max(s, seg.endSec);
  const r = (x: number) => x.toFixed(3).replace(/\.?0+$/, '') || '0';
  return `between(t,${r(s)},${r(e)})`;
}

/**
 * Build the `filter_complex` that overlays ONE bottom-strip PNG per caption segment,
 * each gated to its own [start,end] window. Input mapping (the caller supplies inputs in
 * this exact order): [0:v] = the master video, [1:v..N:v] = the segment strips (in
 * `segments` order). Chained so only one caption is visible at a time; output is `[vout]`.
 * Overlaid at y = H-h (the strip's own height) so it sits flush on the bottom edge and
 * never covers more than the strip. Returns '' when there are no segments (no-op burn).
 */
export function buildCaptionOverlayFilter(segments: Array<{ startSec: number; endSec: number }>): string {
  if (!segments.length) return '';
  const parts: string[] = [];
  let prev = '0:v';
  segments.forEach((seg, i) => {
    const input = `${i + 1}:v`;
    const out = i === segments.length - 1 ? 'vout' : `cap${i}`;
    parts.push(`[${prev}][${input}]overlay=0:H-h:enable='${enableBetween(seg)}'[${out}]`);
    prev = out;
  });
  return parts.join(';');
}
