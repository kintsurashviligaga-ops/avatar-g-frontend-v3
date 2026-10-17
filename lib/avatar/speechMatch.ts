/**
 * lib/avatar/speechMatch.ts — fit the talking avatar's ElevenLabs line onto the mouth Veo drew (GG's tap, 2026-10-17
 * 10:22Z: „Veo ლაპარაკობს").
 *
 * WHY. The first voiced avatar (09:49Z) asked Veo for a SILENT clip of someone "talking for about 2.5 seconds" and laid
 * the line over it. Veo never heard the line, so the mouth moved on its own: GG, 10:15Z, "the lip sync does not match at
 * all". Neither Google (Gemini Omni: "uploading audio references is unsupported") nor ElevenLabs (avatars: "API access
 * not available") takes a voice to drive a mouth. So Veo SAYS the line itself — in Latin letters, because its Georgian
 * is garbled (the 2026-10-16 film) — and its native lip sync follows its own voice. That voice is then thrown away and
 * the ElevenLabs line, the same syllables in a native Georgian voice, is cut at its pauses and each phrase stretched
 * onto the span where Veo's mouth said it.
 *
 * Pure and client-safe: the levels come from ffmpeg in lib/video/remixOps (muxVoiceOntoClip), which runs the filter
 * built here.
 */
import { atempoChain } from '@/lib/video/editFilters';

// ─── The line Veo says ───────────────────────────────────────────────────────

/** Georgian letters in Latin, by the national romanization without the ejective apostrophes (Veo reads them as pauses). */
const LATIN: Readonly<Record<string, string>> = {
  ა: 'a', ბ: 'b', გ: 'g', დ: 'd', ე: 'e', ვ: 'v', ზ: 'z', თ: 't', ი: 'i', კ: 'k', ლ: 'l', მ: 'm', ნ: 'n', ო: 'o',
  პ: 'p', ჟ: 'zh', რ: 'r', ს: 's', ტ: 't', უ: 'u', ფ: 'p', ქ: 'k', ღ: 'gh', ყ: 'q', შ: 'sh', ჩ: 'ch', ც: 'ts', ძ: 'dz',
  წ: 'ts', ჭ: 'ch', ხ: 'kh', ჯ: 'j', ჰ: 'h', ჱ: 'e', ჲ: 'i', ჳ: 'u', ჴ: 'q', ჵ: 'o', ჶ: 'f', ჷ: 'e',
};
/** Mtavruli capitals (U+1C90…) sit 0xBC0 above the Mkhedruli letters they capitalise. */
const MTAVRULI_OFFSET = 0x1c90 - 0x10d0;

/** The Georgian words in Latin letters, everything else (punctuation, digits, Latin) as it is. */
export function georgianToLatin(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    const base = code >= 0x1c90 && code <= 0x1cbf ? String.fromCodePoint(code - MTAVRULI_OFFSET) : ch;
    out += LATIN[base] ?? ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

// ─── Where speech is ─────────────────────────────────────────────────────────

/** One level per 10 ms of audio. */
export const LEVEL_FRAME_SEC = 0.01;

export interface Span { start: number; end: number }

/** dBFS per frame of 16-bit mono PCM; digital silence reads -100. */
export function frameLevelsDb(pcm: Int16Array, sampleRate: number, frameSec = LEVEL_FRAME_SEC): number[] {
  const n = Math.max(1, Math.round(sampleRate * frameSec));
  const out: number[] = [];
  for (let i = 0; i + n <= pcm.length; i += n) {
    let sum = 0;
    for (let j = i; j < i + n; j++) sum += pcm[j]! * pcm[j]!;
    const rms = Math.sqrt(sum / n) / 32768;
    out.push(rms > 1e-5 ? 20 * Math.log10(rms) : -100);
  }
  return out;
}

export interface SpanOptions {
  frameSec?: number;
  /** Speech is what comes within this many dB of the loudest moment. */
  belowPeakDb?: number;
  /** Never counts anything quieter than this as speech (room tone, a fade). */
  floorDb?: number;
  /**
   * Nor anything within this many dB of the track's bed: the level it sits at a fifth of the time. Veo puts sound under
   * and after its words (Production 2026-10-17 11:14Z: the whole 8 s read as speech, the mouth stopped at 3.2 s).
   */
  aboveBedDb?: number;
  /** A pause shorter than this is inside a phrase, not between two. */
  minGapSec?: number;
  /** A sound shorter than this is a click or a breath. */
  minSpanSec?: number;
  /** Each phrase keeps this much of its onset and tail. */
  padSec?: number;
}

/** The phrases in a track: runs of frames near its peak, joined across short pauses, dropped when too short. */
export function speechSpans(levels: readonly number[], o: SpanOptions = {}): Span[] {
  const f = o.frameSec ?? LEVEL_FRAME_SEC;
  if (levels.length === 0) return [];
  // A 30 ms average, so one loud frame is not the peak and one quiet frame is not a pause.
  const smooth = levels.map((_, i) => {
    const w = levels.slice(Math.max(0, i - 1), i + 2);
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
  const peak = Math.max(...smooth);
  const floor = o.floorDb ?? -50;
  if (peak < floor) return [];
  // Above the bed, but always within 10 dB of the peak, so a track that is all voice still has its voice.
  const bed = percentile(smooth, 0.2);
  const threshold = Math.min(peak - 10, Math.max(peak - (o.belowPeakDb ?? 24), floor, bed + (o.aboveBedDb ?? 8)));
  const runs: Span[] = [];
  let from = -1;
  smooth.forEach((db, i) => {
    if (db >= threshold && from < 0) from = i;
    if ((db < threshold || i === smooth.length - 1) && from >= 0) {
      runs.push({ start: from * f, end: (db >= threshold ? i + 1 : i) * f });
      from = -1;
    }
  });
  const minGap = o.minGapSec ?? 0.2;
  const joined: Span[] = [];
  for (const r of runs) {
    const last = joined[joined.length - 1];
    if (last && r.start - last.end < minGap) last.end = r.end;
    else joined.push({ ...r });
  }
  const pad = o.padSec ?? 0.03;
  const total = levels.length * f;
  return joined
    .filter((s) => s.end - s.start >= (o.minSpanSec ?? 0.08))
    .map((s) => ({ start: round3(Math.max(0, s.start - pad)), end: round3(Math.min(total, s.end + pad)) }));
}

/** Fewer phrases: the two closest neighbours join first, so the longest pauses — the ones both voices make — stay. */
export function mergeSpansTo(spans: readonly Span[], count: number): Span[] {
  const out = spans.map((s) => ({ ...s }));
  while (out.length > Math.max(1, count)) {
    let at = 0;
    for (let i = 1; i < out.length - 1; i++) {
      if (out[i + 1]!.start - out[i]!.end < out[at + 1]!.start - out[at]!.end) at = i;
    }
    out.splice(at, 2, { start: out[at]!.start, end: out[at + 1]!.end });
  }
  return out;
}

// ─── The dub ─────────────────────────────────────────────────────────────────

/** One phrase of the line: `from`–`to` in the line, played at `at` in the clip, `tempo` times its speed. */
export interface DubPiece { from: number; to: number; at: number; tempo: number }

/**
 * Past these a voice stops sounding like a person (and Veo's phrase was likely another phrase): the piece is clamped
 * and lands on its onset only.
 */
export const DUB_TEMPO_MIN = 0.8;
export const DUB_TEMPO_MAX = 1.7;
/** At most this many phrases are matched one to one; a longer line is matched as one. */
const MAX_PIECES = 12;
/** A silence this long splits Veo's sound into runs: its words, and what came before or after them. */
export const RUN_GAP_SEC = 0.6;

/**
 * The run of Veo's sound that is the line: Veo's phrases split at silences of RUN_GAP_SEC or more, and the run of
 * consecutive ones whose length is closest to the line's (by ratio; the earliest wins a tie). A laugh or a sound well
 * after the words is then not stretched over (Production 2026-10-17 11:14Z), and a pause both voices make stays inside.
 */
export function speechRun(spans: readonly Span[], lineSec: number): Span[] {
  if (spans.length <= 1 || !(lineSec > 0)) return spans.map((s) => ({ ...s }));
  const runs: Span[][] = [];
  for (const s of spans) {
    const last = runs[runs.length - 1];
    if (last && s.start - last[last.length - 1]!.end < RUN_GAP_SEC) last.push({ ...s });
    else runs.push([{ ...s }]);
  }
  let best: [number, number] = [0, runs.length - 1];
  let bestCost = Infinity;
  for (let i = 0; i < runs.length; i++) {
    for (let j = i; j < runs.length; j++) {
      const sec = runs[j]![runs[j]!.length - 1]!.end - runs[i]![0]!.start;
      const cost = Math.abs(Math.log(Math.max(0.05, sec) / lineSec));
      if (cost < bestCost - 1e-9) { bestCost = cost; best = [i, j]; }
    }
  }
  return runs.slice(best[0], best[1] + 1).flat();
}

/**
 * Veo's sounds that are not the line: short and standing apart (a breath, a laugh, a click after the words). Dropped
 * only while Veo has more phrases than the line, and never all of them.
 */
export function dropIsolatedBlips(spans: readonly Span[], keep: number, maxSec = 0.25, apartSec = 0.4): Span[] {
  let out = spans.map((s) => ({ ...s }));
  for (let i = out.length - 1; i >= 0 && out.length > Math.max(1, keep); i--) {
    const s = out[i]!;
    const before = i > 0 ? s.start - out[i - 1]!.end : Infinity;
    const after = i < out.length - 1 ? out[i + 1]!.start - s.end : Infinity;
    if (s.end - s.start <= maxSec && before > apartSec && after > apartSec) out = out.filter((_, j) => j !== i);
  }
  return out;
}

/**
 * Each phrase of the line onto the phrase Veo's mouth said, in order. Veo's run that is the line is picked first
 * (speechRun), then its stray sounds go, then the side with more pauses is merged down to the other's count. Null
 * when either side has no speech: the caller lays the line from the start, as before.
 */
export function planDub(line: readonly Span[], veoSpans: readonly Span[], clipSec: number): DubPiece[] | null {
  if (line.length === 0 || veoSpans.length === 0) return null;
  const said = speechRun(veoSpans, line[line.length - 1]!.end - line[0]!.start);
  const veo = said.length > line.length ? dropIsolatedBlips(said, line.length) : said;
  let n = Math.min(line.length, veo.length);
  if (n > MAX_PIECES) n = 1;
  const l = mergeSpansTo(line, n);
  const v = mergeSpansTo(veo, n);
  const pieces: DubPiece[] = [];
  let free = 0;
  for (let i = 0; i < n; i++) {
    const want = (l[i]!.end - l[i]!.start) / Math.max(0.05, v[i]!.end - v[i]!.start);
    const tempo = round3(Math.min(DUB_TEMPO_MAX, Math.max(DUB_TEMPO_MIN, want)));
    const at = round3(Math.max(v[i]!.start, free));
    if (at >= clipSec) break;
    pieces.push({ from: l[i]!.start, to: l[i]!.end, at, tempo });
    free = at + (l[i]!.end - l[i]!.start) / tempo + 0.02;
  }
  return pieces.length > 0 ? pieces : null;
}

/**
 * The ffmpeg graph that plays `pieces` of input `input` (an audio stream label such as `1:a`) and pads the result to
 * `clipSec`, ending in `[voice]`. Each piece fades in and out over 10 ms, so a cut never clicks.
 */
export function dubFilter(pieces: readonly DubPiece[], input: string, clipSec: number): string {
  const sec = String(Number(clipSec.toFixed(3)));
  const chain = (p: DubPiece, src: string, out: string): string => {
    const dur = (p.to - p.from) / p.tempo;
    const fades = dur > 0.05 ? `,afade=t=in:d=0.01,afade=t=out:st=${(dur - 0.01).toFixed(3)}:d=0.01` : '';
    const ms = Math.round(p.at * 1000);
    // adelay's lead-in after a trim carries no timestamps (ffmpeg 7: the first frames read NOPTS), and an MP4's AAC
    // track then starts the voice at 0 s: renumbered from its samples, the silence before the phrase is kept.
    return `[${src}]atrim=start=${p.from.toFixed(3)}:end=${p.to.toFixed(3)},asetpts=PTS-STARTPTS,${atempoChain(p.tempo)}${fades},adelay=${ms}:all=1,asetpts=N/SR/TB[${out}]`;
  };
  if (pieces.length === 1) return `${chain(pieces[0]!, input, 'p0')};[p0]apad=whole_dur=${sec}[voice]`;
  const split = `[${input}]asplit=${pieces.length}${pieces.map((_, i) => `[s${i}]`).join('')}`;
  const chains = pieces.map((p, i) => chain(p, `s${i}`, `p${i}`));
  // amix's own timestamps make the output's `-t` read the mix as silence (ffmpeg 7): every piece starts at 0 (adelay
  // pads it), so the mix is renumbered from its first sample.
  const mix = `${pieces.map((_, i) => `[p${i}]`).join('')}amix=inputs=${pieces.length}:normalize=0:duration=longest,asetpts=N/SR/TB,apad=whole_dur=${sec}[voice]`;
  return [split, ...chains, mix].join(';');
}

/** A track's loudness every `stepSec`, in whole dB, for the logs: what was under and after the words. */
export function levelProfile(levels: readonly number[], stepSec = 0.5, frameSec = LEVEL_FRAME_SEC): string {
  const per = Math.max(1, Math.round(stepSec / frameSec));
  const out: string[] = [];
  for (let i = 0; i < levels.length; i += per) {
    const w = levels.slice(i, i + per);
    out.push(String(Math.round(w.reduce((a, b) => a + b, 0) / w.length)));
  }
  return out.join(' ');
}

/** One line for the logs: where each voice spoke and how the line was laid. No words, no URLs. */
export function describeDub(line: readonly Span[], veo: readonly Span[], pieces: readonly DubPiece[] | null): string {
  const spans = (s: readonly Span[]) => s.map((x) => `${x.start.toFixed(2)}–${x.end.toFixed(2)}`).join(' ') || 'none';
  const laid = pieces ? pieces.map((p) => `${p.from.toFixed(2)}→${p.at.toFixed(2)}×${p.tempo}`).join(' ') : 'from 0 (no match)';
  return `line ${spans(line)} | veo ${spans(veo)} | laid ${laid}`;
}

/** The value `q` of the way up the sorted levels (0 = quietest). */
function percentile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))]!;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
