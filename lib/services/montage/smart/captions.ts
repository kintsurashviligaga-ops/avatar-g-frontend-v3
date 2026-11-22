/**
 * lib/services/montage/smart/captions.ts — automatic captions from Chirp 3 word times (Phase 8.7). PURE + TOTAL: the
 * request body, the answer's parsing, how a long video is split into calls, how words become on-screen cards in each
 * style, Georgian-safe line breaking, the per-frame plan the renderer draws, and an SRT export. The HTTP call and the
 * PNG drawing are server code (PR B); everything here is tested against fixtures, with no key and no network.
 *
 * VERIFIED (Google's Chirp 3 page, read 2026-11-15): word-level timestamps are optional in Speech.Recognize (audio
 * shorter than one minute) and Speech.BatchRecognize (needs Cloud Storage, which we do not use); ka-GE is Preview; with
 * timestamps on "some transcription degradation is expected". So a video longer than CHUNK_MAX_SEC is split at its OWN
 * silences (lib/services/montage/segmentDetect, ffmpeg silencedetect) into pieces under a minute, each recognised on
 * its own, and the word times are shifted back by the piece's start. Same price per minute, no bucket.
 *
 * GEORGIAN: it is written left to right, so no RTL handling is needed. What matters is (1) a font that has the
 * letters — FiraGO, the one the renderer embeds; (2) breaking lines only BETWEEN words (Georgian words run long, and a
 * break inside one reads as two words); and (3) never "uppercasing" Mkhedruli: a browser turns text-transform:
 * uppercase into Mtavruli capitals, the server drawing would not, and the preview would lie. `displayText` keeps
 * Georgian as written and only uppercases Latin/Cyrillic in the styles that ask for it.
 */
import type { CaptionWord } from '@/lib/pipeline/compositing/word-synced-captions';

export type CaptionLang = 'ka' | 'en' | 'ru';
export const CAPTION_LANGS: readonly CaptionLang[] = ['ka', 'en', 'ru'];
const LANG_CODE: Record<CaptionLang, string> = { ka: 'ka-GE', en: 'en-US', ru: 'ru-RU' };

export const CHIRP_CAPTION_MODEL = 'chirp_3';
/** Sync Recognize takes audio "shorter than one minute"; pieces stay well under it. */
export const CHUNK_MAX_SEC = 55;
/** A piece is never cut shorter than this when a silence comes early: a 3 s piece would waste a call. */
export const CHUNK_MIN_SEC = 20;

// ── CHIRP REQUEST / ANSWER ────────────────────────────────────────────────────────────────────────────────────────

export function chirpCaptionBody(wavBase64: string, lang: CaptionLang): Record<string, unknown> {
  return {
    config: {
      autoDecodingConfig: {},
      model: CHIRP_CAPTION_MODEL,
      languageCodes: [LANG_CODE[lang] ?? 'ka-GE'],
      features: { enableWordTimeOffsets: true, enableAutomaticPunctuation: true },
    },
    content: wavBase64,
  };
}

/** "1.250s" or { seconds, nanos } → seconds; absent = 0 (Google omits a zero offset); anything else = null. */
export function offsetSec(v: unknown): number | null {
  if (v === undefined) return 0;
  if (typeof v === 'string') {
    const m = /^(\d+(?:\.\d+)?)s$/.exec(v.trim());
    return m ? Number(m[1]) : null;
  }
  if (v && typeof v === 'object') {
    const o = v as { seconds?: unknown; nanos?: unknown };
    const s = Number(o.seconds ?? 0), n = Number(o.nanos ?? 0);
    return Number.isFinite(s) && Number.isFinite(n) ? s + n / 1e9 : null;
  }
  return null;
}

/** The words of one Recognize answer, shifted by `offset` (the piece's start in the video). */
export function parseChirpWords(raw: unknown, offset = 0): { words: CaptionWord[]; transcript: string } {
  const results = Array.isArray((raw as { results?: unknown })?.results) ? (raw as { results: unknown[] }).results : [];
  const words: CaptionWord[] = [];
  const texts: string[] = [];
  for (const r of results) {
    const alt = (r as { alternatives?: Array<{ transcript?: unknown; words?: unknown }> })?.alternatives?.[0];
    if (typeof alt?.transcript === 'string' && alt.transcript.trim()) texts.push(alt.transcript.trim());
    for (const w of Array.isArray(alt?.words) ? (alt!.words as unknown[]) : []) {
      const o = w as { word?: unknown; startOffset?: unknown; endOffset?: unknown };
      const a = offsetSec(o.startOffset), b = offsetSec(o.endOffset);
      const text = typeof o.word === 'string' ? o.word.trim() : '';
      if (!text || a === null || b === null) continue;
      words.push({ text, startSec: r3(a + offset), endSec: r3(Math.max(a, b) + offset) });
    }
  }
  return { words, transcript: texts.join(' ').replace(/\s+/g, ' ').trim() };
}

// ── LONG AUDIO → PIECES UNDER A MINUTE ───────────────────────────────────────────────────────────────────────────

export interface Span { startSec: number; endSec: number }

/**
 * Split [0, duration] into pieces ≤ CHUNK_MAX_SEC, each ending in the middle of a silence when one falls in the
 * allowed window (so no word is cut in half), else at CHUNK_MAX_SEC hard. Total: always covers the whole audio.
 */
export function planCaptionChunks(durationSec: number, silences: readonly Span[], maxSec = CHUNK_MAX_SEC, minSec = CHUNK_MIN_SEC): Span[] {
  const total = Math.max(0, fin(durationSec));
  if (total <= 0) return [];
  const mids = silences
    .filter((s) => s.endSec > s.startSec)
    .map((s) => (s.startSec + s.endSec) / 2)
    .filter((m) => m > 0 && m < total)
    .sort((a, b) => a - b);
  const out: Span[] = [];
  let start = 0;
  while (total - start > maxSec) {
    const lo = start + Math.min(minSec, maxSec), hi = start + maxSec;
    const inWindow = mids.filter((m) => m >= lo && m <= hi);
    const cut = inWindow.length ? inWindow[inWindow.length - 1]! : hi; // the latest pause in the window
    out.push({ startSec: r3(start), endSec: r3(cut) });
    start = cut;
  }
  out.push({ startSec: r3(start), endSec: r3(total) });
  return out;
}

/** Merge the pieces' words into one ascending, non-overlapping list (a word on a seam is kept once). */
export function mergeChunkWords(pieces: ReadonlyArray<readonly CaptionWord[]>): CaptionWord[] {
  const all = pieces.flat().filter((w) => w.text && w.endSec >= w.startSec).sort((a, b) => a.startSec - b.startSec);
  const out: CaptionWord[] = [];
  for (const w of all) {
    const prev = out[out.length - 1];
    if (prev && prev.text === w.text && Math.abs(prev.startSec - w.startSec) < 0.15) continue;
    if (prev && w.startSec < prev.endSec) out.push({ ...w, startSec: prev.endSec, endSec: Math.max(prev.endSec, w.endSec) });
    else out.push(w);
  }
  return out;
}

/**
 * Remap word times through a cut list (silence removal): a word inside a removed stretch is dropped; a later one
 * moves left by everything removed before it. `cuts` are ascending, non-overlapping spans of the ORIGINAL timeline.
 */
export function remapWords(words: readonly CaptionWord[], cuts: readonly Span[]): CaptionWord[] {
  const out: CaptionWord[] = [];
  for (const w of words) {
    const mid = (w.startSec + w.endSec) / 2;
    if (cuts.some((c) => mid >= c.startSec && mid < c.endSec)) continue;
    const shift = (t: number) => t - cuts.reduce((s, c) => s + (t >= c.endSec ? c.endSec - c.startSec : t > c.startSec ? t - c.startSec : 0), 0);
    out.push({ ...w, startSec: r3(shift(w.startSec)), endSec: r3(shift(w.endSec)) });
  }
  return out;
}

// ── STYLES ───────────────────────────────────────────────────────────────────────────────────────────────────────

export type CaptionStyleId = 'bold-word' | 'standard' | 'karaoke' | 'boxed' | 'minimal';
export const CAPTION_STYLE_IDS: readonly CaptionStyleId[] = ['bold-word', 'standard', 'karaoke', 'boxed', 'minimal'];
export type CaptionPos = 'bottom' | 'middle' | 'top';

export interface CaptionStyle {
  id: CaptionStyleId;
  /** Words on one card, and characters on one LINE (a card has at most `maxLines`). */
  maxWords: number;
  maxLineChars: number;
  maxLines: number;
  /** Font size as a share of the frame's SHORT side. */
  sizeShare: number;
  weight: 400 | 600 | 800;
  fill: string;
  stroke: string | null;
  /** The word being spoken: drawn in this colour (bold-word, karaoke) — null = no per-word state. */
  activeFill: string | null;
  /** karaoke: words already said keep the active colour (a fill that advances); bold-word: only the current one. */
  fillAdvances: boolean;
  box: string | null;
  /** Latin/Cyrillic shown in capitals. Georgian never (see the file header). */
  upper: boolean;
  defaultPos: CaptionPos;
}

export const CAPTION_STYLES: Record<CaptionStyleId, CaptionStyle> = {
  'bold-word': { id: 'bold-word', maxWords: 3, maxLineChars: 16, maxLines: 2, sizeShare: 0.085, weight: 800, fill: '#FFFFFF', stroke: '#000000', activeFill: '#FFE14D', fillAdvances: false, box: null, upper: true, defaultPos: 'middle' },
  standard: { id: 'standard', maxWords: 8, maxLineChars: 32, maxLines: 2, sizeShare: 0.05, weight: 600, fill: '#FFFFFF', stroke: '#000000', activeFill: null, fillAdvances: false, box: null, upper: false, defaultPos: 'bottom' },
  karaoke: { id: 'karaoke', maxWords: 6, maxLineChars: 24, maxLines: 2, sizeShare: 0.06, weight: 800, fill: '#FFFFFF', stroke: '#000000', activeFill: '#33D6FF', fillAdvances: true, box: null, upper: false, defaultPos: 'bottom' },
  boxed: { id: 'boxed', maxWords: 6, maxLineChars: 26, maxLines: 2, sizeShare: 0.05, weight: 600, fill: '#FFFFFF', stroke: null, activeFill: null, fillAdvances: false, box: 'rgba(0,0,0,0.72)', upper: false, defaultPos: 'bottom' },
  minimal: { id: 'minimal', maxWords: 8, maxLineChars: 36, maxLines: 1, sizeShare: 0.038, weight: 400, fill: '#FFFFFF', stroke: null, activeFill: null, fillAdvances: false, box: null, upper: false, defaultPos: 'bottom' },
};

export const isCaptionStyle = (v: unknown): v is CaptionStyleId => typeof v === 'string' && (CAPTION_STYLE_IDS as readonly string[]).includes(v);
export const isCaptionLang = (v: unknown): v is CaptionLang => v === 'ka' || v === 'en' || v === 'ru';

const GEORGIAN = /[Ⴀ-ჿᲐ-Ჿⴀ-⴯]/;
export const hasGeorgian = (s: string): boolean => GEORGIAN.test(s);

/** What is drawn for a word: Georgian exactly as written, other scripts uppercased only when the style asks. */
export function displayText(word: string, style: Pick<CaptionStyle, 'upper'>): string {
  if (!style.upper || hasGeorgian(word)) return word;
  return word.toLocaleUpperCase();
}

/**
 * Break words into lines of at most `maxChars`, ONLY between words. A single word longer than the line gets a line of
 * its own (it is never split — a Georgian word cut in two reads as two words). Returns word-index ranges per line.
 */
export function wrapWords(words: readonly string[], maxChars: number): number[][] {
  const lines: number[][] = [];
  let cur: number[] = [];
  let len = 0;
  words.forEach((w, i) => {
    const add = (cur.length ? 1 : 0) + [...w].length;
    if (cur.length && len + add > maxChars) {
      lines.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(i);
    len += (cur.length > 1 ? 1 : 0) + [...w].length;
  });
  if (cur.length) lines.push(cur);
  return lines;
}

export interface CaptionCard {
  startSec: number;
  endSec: number;
  words: CaptionWord[];
  /** Word indices per line (wrapWords). */
  lines: number[][];
}

const SENTENCE_END = /[.!?…]$/;
/** A pause this long ends a card even mid-sentence (a new thought). */
export const CARD_BREAK_GAP_SEC = 0.7;
/** A card stays up this long after its last word unless the next one starts first. */
export const CARD_HOLD_SEC = 0.35;

/** Words → cards for a style: ≤ maxWords words, ≤ maxLines lines of ≤ maxLineChars, broken at sentence ends and pauses. */
export function buildCards(words: readonly CaptionWord[], style: CaptionStyle): CaptionCard[] {
  const cards: CaptionCard[] = [];
  let cur: CaptionWord[] = [];
  const fits = (ws: CaptionWord[]) => wrapWords(ws.map((w) => displayText(w.text, style)), style.maxLineChars).length <= style.maxLines;
  const flush = () => {
    if (!cur.length) return;
    cards.push({
      startSec: cur[0]!.startSec,
      endSec: cur[cur.length - 1]!.endSec,
      words: cur,
      lines: wrapWords(cur.map((w) => displayText(w.text, style)), style.maxLineChars),
    });
    cur = [];
  };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev && w.startSec - prev.endSec >= CARD_BREAK_GAP_SEC) flush();
    if (cur.length >= style.maxWords || (cur.length && !fits([...cur, w]))) flush();
    cur.push(w);
    if (SENTENCE_END.test(w.text)) flush();
  }
  flush();
  // hold each card a little past its last word, never into the next card
  return cards.map((c, i) => {
    const next = cards[i + 1];
    const end = Math.min(c.endSec + CARD_HOLD_SEC, next ? next.startSec : c.endSec + CARD_HOLD_SEC);
    return { ...c, endSec: r3(Math.max(c.endSec, end)) };
  });
}

/** One picture the renderer draws: a card with (optionally) one word lit, shown over [startSec, endSec). */
export interface CaptionFrame {
  startSec: number;
  endSec: number;
  card: number;
  /** Index of the lit word in the card, or -1 (static card). With `fillAdvances`, every word up to it is lit. */
  active: number;
}

/**
 * The frame plan: a static style gives one frame per card; a per-word style gives one frame per word, from the word's
 * start to the next word's start (the last one holds to the card's end), so a word stays lit through the gap after it.
 */
export function captionFrames(cards: readonly CaptionCard[], style: CaptionStyle): CaptionFrame[] {
  const out: CaptionFrame[] = [];
  cards.forEach((c, ci) => {
    if (!style.activeFill) {
      out.push({ startSec: c.startSec, endSec: c.endSec, card: ci, active: -1 });
      return;
    }
    c.words.forEach((w, wi) => {
      const start = wi === 0 ? c.startSec : w.startSec;
      const end = wi + 1 < c.words.length ? c.words[wi + 1]!.startSec : c.endSec;
      if (end - start > 0.001) out.push({ startSec: r3(start), endSec: r3(end), card: ci, active: wi });
    });
  });
  return out;
}

/** The most pictures one export draws: each is a PNG, so a 5-minute bold-word video (~750 words) fits. */
export const MAX_CAPTION_FRAMES = 1200;

/**
 * The ffmpeg concat-demuxer list that turns the frame PNGs into ONE transparent stream (one overlay input instead of
 * hundreds): gaps between cards are a fully transparent `blank`. Paths are written by the server; this only orders
 * them. The last file is repeated, as the concat demuxer needs, so its duration is honoured.
 */
export function concatList(frames: readonly CaptionFrame[], pathOf: (i: number) => string, blankPath: string, totalSec: number): string {
  const lines: string[] = ['ffconcat version 1.0'];
  let t = 0;
  const push = (p: string, d: number) => {
    if (d <= 0.0005) return;
    lines.push(`file '${p.replace(/'/g, "'\\''")}'`, `duration ${d.toFixed(3)}`);
  };
  let last = blankPath;
  frames.forEach((f, i) => {
    if (f.startSec > t) push(blankPath, f.startSec - t);
    push(pathOf(i), f.endSec - Math.max(t, f.startSec));
    last = pathOf(i);
    t = Math.max(t, f.endSec);
  });
  if (totalSec > t) { push(blankPath, totalSec - t); last = blankPath; }
  lines.push(`file '${last.replace(/'/g, "'\\''")}'`);
  return lines.join('\n') + '\n';
}

// ── SRT ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const srtTime = (t: number): string => {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(ms % 1000, 3)}`;
};

/** An .srt file of the cards (lines as wrapped), for YouTube uploads and other editors. */
export function toSrt(cards: readonly CaptionCard[]): string {
  return cards
    .map((c, i) => `${i + 1}\n${srtTime(c.startSec)} --> ${srtTime(c.endSec)}\n${c.lines.map((l) => l.map((wi) => c.words[wi]!.text).join(' ')).join('\n')}\n`)
    .join('\n');
}

/** Seconds of speech audio that are billed: the whole audio sent (Chirp bills audio, not words). */
export const billedAudioSec = (chunks: readonly Span[]): number => r3(chunks.reduce((s, c) => s + Math.max(0, c.endSec - c.startSec), 0));

function fin(n: unknown, d = 0): number { return typeof n === 'number' && Number.isFinite(n) ? n : d; }
function r3(n: number): number { return Math.round(n * 1000) / 1000; }

// ── SOURCE WORDS → THE EDIT ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Captions FOLLOW THE CUTS. Words are recognised once per source, in SOURCE seconds, and laid onto the master here:
 * each timeline clip shows the words that fall inside its own trim window, shifted to where the clip sits on the master
 * and scaled by its speed. Trimming, splitting, reordering or a silence cut afterwards needs no new Chirp call (and no
 * new charge): the editor runs this again.
 */
export function wordsOnMaster(
  clips: ReadonlyArray<{ sourceId: string; startSec: number; endSec: number; speed?: number; muted?: boolean }>,
  wordsBySource: Readonly<Record<string, readonly CaptionWord[]>>,
): CaptionWord[] {
  const out: CaptionWord[] = [];
  let t = 0;
  for (const c of clips) {
    const speed = c.speed && c.speed > 0 ? c.speed : 1;
    const len = Math.max(0, (c.endSec - c.startSec) / speed);
    if (!c.muted) {
      for (const w of wordsBySource[c.sourceId] ?? []) {
        const mid = (w.startSec + w.endSec) / 2;
        if (mid < c.startSec || mid >= c.endSec) continue;
        const a = t + (Math.max(w.startSec, c.startSec) - c.startSec) / speed;
        const b = t + (Math.min(w.endSec, c.endSec) - c.startSec) / speed;
        out.push({ text: w.text, startSec: r3(a), endSec: r3(Math.max(a, b)) });
      }
    }
    t += len;
  }
  return out;
}
