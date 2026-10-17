/**
 * lib/chat/filmVoiceCheck.ts — does the film's voice say the film's words? (the owner's audit, 2026-10-17, item 3: "the
 * Georgian voice / subtitle check"). ElevenLabs reads the narration; Scribe, ElevenLabs' own speech-to-text, listens to what
 * came back; this module compares the two, reads it once more when they disagree, and, from Scribe's word timings, times the
 * narration's OWN words for the subtitles a user may ask for. Pure: the reading, the listening and the upload are injected.
 *
 * ⚠️ WHY A SECOND READ AND NOT A HARD GATE. eleven_v3 (the only ElevenLabs model with native Georgian) is generative: the
 * same text can come back clean on one request and skip a sentence or slur a phrase on the next. One more read fixes most of
 * those. Scribe's own Georgian is good but not perfect, so a transcript is never held to an exact match: the score is the
 * character-level similarity of the two texts once case, punctuation and spacing are taken out, a clean read lands well above
 * VOICE_PASS, and only a read that lost most of its words (below VOICE_REFUSE after both reads) is refused. A Scribe that does
 * not answer (no key, an outage) never blocks a film: the voice goes on unverified, as it always did.
 */
import type { CaptionWord } from '@/lib/pipeline/compositing/word-synced-captions';

/** At or above: the voice says its words. Below: it is read once more. */
export const VOICE_PASS = 0.7;
/** Below this after both reads, the voice lost most of what it was to say: the film is not made with it. */
export const VOICE_REFUSE = 0.5;
/** Longest text compared (a 4-minute narration is ~2 400 characters): bounds the comparison's cost. */
const MAX_COMPARE_CHARS = 3000;

/** A word Scribe heard, with when it was said in the audio (seconds). */
export interface HeardWord {
  text: string;
  startSec: number;
  endSec: number;
}

/** What Scribe heard in one read. */
export interface Heard {
  text: string;
  words: HeardWord[];
}

/** Lower-case letters and digits only, every other run of characters one space (Georgian has no case; this is harmless). */
export function normalizeSpoken(text: string): string {
  return (text ?? '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const squeeze = (s: string): string => normalizeSpoken(s).replace(/ /g, '');

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Uint32Array(b.length + 1);
  let cur = new Uint32Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length]!;
}

/** 1 = the same words, 0 = nothing in common. Spacing is ignored, so a word Scribe split or joined costs nothing. */
export function spokenSimilarity(expected: string, heard: string): number {
  const a = squeeze(expected).slice(0, MAX_COMPARE_CHARS);
  const b = squeeze(heard).slice(0, MAX_COMPARE_CHARS);
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

export type VoiceVerdict = 'pass' | 'weak' | 'fail';

export function voiceVerdict(score: number): VoiceVerdict {
  return score >= VOICE_PASS ? 'pass' : score >= VOICE_REFUSE ? 'weak' : 'fail';
}

const wordSimilarity = (a: string, b: string): number => (a === b ? 1 : 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1));

/**
 * Time the narration's own words from what Scribe heard. The two word lists are aligned (a longest common subsequence where
 * "the same word" allows a misheard letter or two); each matched word takes the time it was heard at, and every word between
 * two matches is placed by its position in the text between them. The subtitles show the words the user wrote, never
 * Scribe's spelling of them. null when nothing could be matched (no subtitles beat subtitles at guessed times).
 */
export function timeScriptWords(script: string, heard: readonly HeardWord[], audioSec?: number | null): CaptionWord[] | null {
  // The script's words as written (punctuation kept for display); a token with no letters rides on the word before it.
  const shown: string[] = [];
  for (const raw of (script ?? '').split(/\s+/)) {
    if (!raw) continue;
    if (!squeeze(raw) && shown.length) shown[shown.length - 1] = `${shown[shown.length - 1]}${raw}`;
    else shown.push(raw);
  }
  const keys = shown.map(squeeze);
  const said = heard.filter((w) => squeeze(w.text) && Number.isFinite(w.startSec) && Number.isFinite(w.endSec) && w.endSec >= w.startSec);
  const saidKeys = said.map((w) => squeeze(w.text));
  if (!shown.length || !said.length) return null;

  // LCS over fuzzy-equal words.
  const n = keys.length;
  const m = saidKeys.length;
  const same = (i: number, j: number): boolean => wordSimilarity(keys[i]!, saidKeys[j]!) >= 0.6;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = same(i, j) ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const match = new Array<number>(n).fill(-1);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (same(i, j) && dp[i]![j] === dp[i + 1]![j + 1]! + 1) { match[i] = j; i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  if (!match.some((j) => j >= 0)) return null;

  // A piecewise-linear clock over the script's characters: a matched word's start and end are fixed points, the rest follow.
  const startAt: number[] = [];
  let pos = 0;
  for (const k of keys) { startAt.push(pos); pos += Math.max(1, k.length); }
  const total = pos;
  const end = Math.max(said[said.length - 1]!.endSec, Number.isFinite(audioSec) && (audioSec as number) > 0 ? (audioSec as number) : 0);
  const points: Array<[number, number]> = [[0, 0]];
  for (let i = 0; i < n; i++) {
    const j = match[i]!;
    if (j < 0) continue;
    const w = said[j]!;
    const last = points[points.length - 1]![1];
    points.push([startAt[i]!, Math.max(last, w.startSec)]);
    points.push([startAt[i]! + Math.max(1, keys[i]!.length), Math.max(last, w.startSec, w.endSec)]);
  }
  points.push([total, Math.max(points[points.length - 1]![1], end)]);
  const clock = (c: number): number => {
    for (let p = 1; p < points.length; p++) {
      const [x1, t1] = points[p]!;
      const [x0, t0] = points[p - 1]!;
      if (c <= x1) return x1 === x0 ? t1 : t0 + ((c - x0) / (x1 - x0)) * (t1 - t0);
    }
    return points[points.length - 1]![1];
  };
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return shown.map((text, i) => {
    const j = match[i]!;
    const s = j >= 0 ? said[j]!.startSec : clock(startAt[i]!);
    const e = j >= 0 ? said[j]!.endSec : clock(startAt[i]! + Math.max(1, keys[i]!.length));
    return { text, startSec: r(s), endSec: r(Math.max(s, e)) };
  });
}

/** One read of the narration: its audio, and how long it plays when known. */
export interface VoiceRead<A> {
  audio: A;
  seconds: number | null;
}

export interface VoiceCheckOutcome<A> {
  /** The read to use (the better of the two when it was read twice). */
  read: VoiceRead<A>;
  /** null = Scribe did not answer: the voice is unverified, never refused for that. */
  score: number | null;
  verdict: VoiceVerdict | null;
  reads: number;
  /** The narration's own words, timed from what Scribe heard (for subtitles); null when they could not be timed. */
  words: CaptionWord[] | null;
}

/**
 * Read the narration, listen to it, and read it once more when it does not say its words. Returns null when no read came
 * back at all (the caller's existing "no voice" path). The outcome's verdict says whether to use it: 'fail' = both reads lost
 * most of the words.
 */
export async function checkFilmVoice<A>(opts: {
  script: string;
  read: () => Promise<VoiceRead<A> | null>;
  listen: (audio: A) => Promise<Heard | null>;
}): Promise<VoiceCheckOutcome<A> | null> {
  const first = await opts.read();
  if (!first) return null;
  const firstHeard = await opts.listen(first.audio).catch(() => null);
  if (!firstHeard) return { read: first, score: null, verdict: null, reads: 1, words: null };
  const firstScore = spokenSimilarity(opts.script, firstHeard.text);
  let best = { read: first, heard: firstHeard, score: firstScore };
  let reads = 1;
  if (firstScore < VOICE_PASS) {
    const second = await opts.read().catch(() => null);
    if (second) {
      reads = 2;
      const secondHeard = await opts.listen(second.audio).catch(() => null);
      const secondScore = secondHeard ? spokenSimilarity(opts.script, secondHeard.text) : -1;
      if (secondHeard && secondScore > best.score) best = { read: second, heard: secondHeard, score: secondScore };
    }
  }
  const rounded = Math.round(best.score * 1000) / 1000;
  return {
    read: best.read,
    score: rounded,
    verdict: voiceVerdict(best.score),
    reads,
    words: timeScriptWords(opts.script, best.heard.words, best.read.seconds),
  };
}

/**
 * The user asked for subtitles in so many words (ka / en / ru), and did not ask to go without them. Subtitles are the user's
 * choice (the owner's word, 2026-10-17 14:27Z): never on by default, on when the panel's switch or the brief says so.
 */
export function wantsSubtitles(message: string | null | undefined): boolean {
  if (typeof message !== 'string' || !message) return false;
  const t = message.toLowerCase();
  // \b is ASCII-only in JS regexes, so the Georgian "no" is bounded by hand.
  if (/(სუბტიტრ|ტიტრ)\S*\s+(გარეშე|არა?(?=[\s.,!?]|$))|(without|no)\s+(sub-?titles?|closed captions)|без\s+(субтитр|титр)/u.test(t)) return false;
  // Not a bare "caption": a post's caption is something else.
  return /სუბტიტრ|ტიტრებით|sub-?titles?|closed captions|субтитр/u.test(t);
}
