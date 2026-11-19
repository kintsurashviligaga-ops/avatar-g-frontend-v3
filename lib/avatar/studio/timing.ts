/**
 * lib/avatar/studio/timing.ts — the Presenter Card's karaoke transcript and the take check. Pure, client-safe.
 *
 * WHERE WORD TIMES COME FROM (best first):
 *  1. Chirp 3 word offsets on the scene's own audio (Cloud Speech-to-Text V2, `enableWordTimeOffsets`, ka-GE Preview;
 *     sync/batch only). Used for Omni scenes and for any dub. The recognized words are ALIGNED back onto the script
 *     (`alignTimings`), so the card always shows the script's own spelling, never the recognizer's.
 *  2. Live's own output transcription: the relay records when each transcript chunk arrived (`fromChunks`). Free, and
 *     close enough to drive a highlight — chunks arrive as the audio is produced.
 *  3. Nothing measured: words are spread over the clip by syllable weight (`estimateWordTimings`). Georgian syllables
 *     follow its five vowels closely, so this is a usable fallback, labelled as approximate in the UI.
 *
 * The lip-sync of a DUBBED scene (a named voice over an Omni mouth) is planned by lib/avatar/speechMatch.planDub; the
 * dub's word times are the TTS line's times moved by the same pieces (`shiftByDub`).
 */
import type { DubPiece } from '@/lib/avatar/speechMatch';

export interface WordTiming {
  /** The word as the script spells it (punctuation kept, for display). */
  word: string;
  start: number;
  end: number;
  /** false when the time is estimated, not measured. */
  measured: boolean;
}

export interface RecognizedWord { word: string; start: number; end: number }

const VOWELS = /[აეიოუaeiouyаеёиоуыэюяії]/giu;

/** Display words: split on whitespace, punctuation stays on its word. */
export function scriptWords(text: string): string[] {
  return text.split(/\s+/u).map((w) => w.trim()).filter((w) => /[\p{L}\p{N}]/u.test(w));
}

/** Comparison form: lower case, letters and digits only. */
export function normWord(w: string): string {
  return w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** Relative speaking weight of a word: its vowels (≈ syllables), at least 1; a sentence end adds a breath. */
export function syllableWeight(word: string): number {
  const v = (normWord(word).match(VOWELS) ?? []).length;
  return Math.max(1, v) + (/[.!?…]["»”’)]?$/u.test(word) ? 0.8 : /[,;:—–]$/u.test(word) ? 0.3 : 0);
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Spread `words` over [start, end] by syllable weight. */
export function estimateWordTimings(words: readonly string[], start: number, end: number): WordTiming[] {
  if (words.length === 0 || !(end > start)) return [];
  const weights = words.map(syllableWeight);
  const total = weights.reduce((s, w) => s + w, 0);
  const span = end - start;
  const out: WordTiming[] = [];
  let t = start;
  words.forEach((word, i) => {
    const d = (weights[i]! / total) * span;
    out.push({ word, start: r3(t), end: r3(t + d), measured: false });
    t += d;
  });
  out[out.length - 1]!.end = r3(end);
  return out;
}

// ── Alignment of recognized words onto the script ───────────────────────────────────────────────────────────

/** Levenshtein distance of two strings (small: words). */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/** Two words match when they are close: Chirp's Georgian may drop or swap a letter in a long inflected word. */
export function wordsMatch(a: string, b: string): boolean {
  const x = normWord(a), y = normWord(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const len = Math.max(x.length, y.length);
  return len >= 4 && editDistance(x, y) <= Math.floor(len / 4);
}

/**
 * Pair script words with recognized words by a word-level alignment (LCS on `wordsMatch`), then give every script word
 * a time: a matched word takes its recognized time; a run of unmatched words is spread by syllable weight over the gap
 * between its matched neighbours (the clip's start and end at the edges).
 */
export function alignTimings(script: readonly string[], recognized: readonly RecognizedWord[], clipSec: number): WordTiming[] {
  const n = script.length, m = recognized.length;
  if (n === 0) return [];
  if (m === 0) return estimateWordTimings(script, 0, clipSec);
  const L: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i]![j] = wordsMatch(script[i]!, recognized[j]!.word) ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
    }
  }
  const match: Array<RecognizedWord | null> = Array(n).fill(null);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (wordsMatch(script[i]!, recognized[j]!.word)) { match[i] = recognized[j]!; i++; j++; }
    else if (L[i + 1]![j]! >= L[i]![j + 1]!) i++;
    else j++;
  }
  const out: WordTiming[] = [];
  let i = 0;
  while (i < n) {
    const hit = match[i];
    if (hit) {
      out.push({ word: script[i]!, start: r3(hit.start), end: r3(Math.max(hit.end, hit.start)), measured: true });
      i++;
      continue;
    }
    let k = i;
    while (k < n && !match[k]) k++;
    const from = out.length ? out[out.length - 1]!.end : 0;
    const to = k < n ? match[k]!.start : Math.max(from, clipSec);
    const gap = estimateWordTimings(script.slice(i, k), from, to > from ? to : from + 0.05 * (k - i));
    out.push(...gap);
    i = k;
  }
  return out;
}

/** Live: transcript chunks with their arrival time in the recording. Each chunk's words fill until the next chunk. */
export function fromChunks(chunks: ReadonlyArray<{ text: string; atSec: number }>, clipSec: number): WordTiming[] {
  const out: WordTiming[] = [];
  const sorted = [...chunks].filter((c) => c.text.trim()).sort((a, b) => a.atSec - b.atSec);
  sorted.forEach((c, k) => {
    const start = Math.max(0, c.atSec, out.length ? out[out.length - 1]!.end : 0);
    const end = k + 1 < sorted.length ? Math.max(start, sorted[k + 1]!.atSec) : Math.max(start, clipSec);
    out.push(...estimateWordTimings(scriptWords(c.text), start, end > start ? end : start + 0.3));
  });
  return out;
}

/** The word lit at time t (binary search), or -1 before the first / in a gap after the last word. */
export function activeWordAt(timings: readonly WordTiming[], t: number): number {
  let lo = 0, hi = timings.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timings[mid]!.start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (ans < 0) return -1;
  // Stay lit through a short pause; after the last word's end, go dark.
  return ans === timings.length - 1 && t > timings[ans]!.end + 0.5 ? -1 : ans;
}

/** A dubbed line's word times moved onto the clip by the dub's pieces (each piece: line [from,to] → clip at, × tempo). */
export function shiftByDub(timings: readonly WordTiming[], pieces: readonly DubPiece[]): WordTiming[] {
  const map = (t: number): number => {
    const p = pieces.find((x) => t >= x.from - 1e-6 && t <= x.to + 1e-6) ?? pieces.reduce<DubPiece | null>((best, x) => (x.from <= t ? x : best), null) ?? pieces[0];
    if (!p) return t;
    return p.at + (Math.min(Math.max(t, p.from), p.to) - p.from) / (p.tempo || 1);
  };
  return timings.map((w) => ({ ...w, start: r3(map(w.start)), end: r3(map(w.end)) }));
}

/** Scene timings laid end to end on the stitched presentation's timeline. */
export function presentationTimeline(scenes: ReadonlyArray<{ timings: readonly WordTiming[]; durationSec: number }>): Array<WordTiming & { scene: number }> {
  const out: Array<WordTiming & { scene: number }> = [];
  let offset = 0;
  scenes.forEach((s, scene) => {
    for (const w of s.timings) out.push({ ...w, start: r3(w.start + offset), end: r3(w.end + offset), scene });
    offset += s.durationSec;
  });
  return out;
}

// ── Subtitles ──────────────────────────────────────────────────────────────────────────────────────────────

export const SRT_MAX_CHARS = 42;
export const SRT_MAX_SEC = 6;

export interface Cue { start: number; end: number; text: string }

/** Cues of ≤ 42 characters and ≤ 6 s, ending early at a sentence end. */
export function toCues(timings: readonly WordTiming[]): Cue[] {
  const cues: Cue[] = [];
  let cur: WordTiming[] = [];
  const flush = () => {
    if (cur.length) cues.push({ start: cur[0]!.start, end: cur[cur.length - 1]!.end, text: cur.map((w) => w.word).join(' ') });
    cur = [];
  };
  for (const w of timings) {
    const text = [...cur, w].map((x) => x.word).join(' ');
    if (cur.length && (text.length > SRT_MAX_CHARS || w.end - cur[0]!.start > SRT_MAX_SEC)) flush();
    cur.push(w);
    if (/[.!?…]["»”’)]?$/u.test(w.word)) flush();
  }
  flush();
  return cues;
}

const srtTime = (sec: number): string => {
  const ms = Math.max(0, Math.round(sec * 1000));
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

export function toSrt(cues: readonly Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
}

// ── Did the presenter say the script? ────────────────────────────────────────────────────────────────────────

/** Word error rate of what was heard against the script (0 = verbatim), with `wordsMatch` as equality. */
export function wordErrorRate(script: string, heard: string): number {
  const ref = scriptWords(script), hyp = scriptWords(heard);
  if (ref.length === 0) return hyp.length ? 1 : 0;
  const prev = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= hyp.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (wordsMatch(ref[i - 1]!, hyp[j - 1]!) ? 0 : 1));
      diag = tmp;
    }
  }
  return Math.round((prev[hyp.length]! / ref.length) * 1000) / 1000;
}

/**
 * Above this the take is redone once, free (the model skipped or invented words). ⚠️ ESTIMATED from Chirp's Georgian
 * Preview accuracy on our clean studio audio; the paid probe (decision D4) sets the real number.
 */
export const RETAKE_WER = 0.15;

export type TakeVerdict = { ok: true; wer: number } | { ok: false; wer: number; reason: 'not_verbatim' | 'silent' };

export function checkTake(script: string, heard: string | null): TakeVerdict {
  if (!heard || !heard.trim()) return { ok: false, wer: 1, reason: 'silent' };
  const wer = wordErrorRate(script, heard);
  return wer <= RETAKE_WER ? { ok: true, wer } : { ok: false, wer, reason: 'not_verbatim' };
}
