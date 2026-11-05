/**
 * lib/services/montage/segmentDetect.ts — where a clip's intro, outro and spoken part start and end (the pure half).
 *
 * GG 2026-11-05 09:03Z: the montage joined clips whole ("a plain concat"), so an intro/outro bumper played with its dead
 * black frames and silences, and the edit had no idea where the real content of a clip begins. One ffmpeg pass over a
 * clip (./beatAnalysis detectSegments) prints three kinds of evidence, and this module reads them:
 *
 *   blackdetect     intervals of black picture (a bumper's fade to black, the dead frames at a clip's ends);
 *   select(scene)   the frames where the picture changes completely (a hard cut inside the clip);
 *   silencedetect   intervals of no sound; their complement is where something is heard (the voice activity).
 *
 * VOICE ACTIVITY: an energy gate (silencedetect at SILENCE_DB) rather than Silero VAD. Silero needs onnxruntime and a
 * model file in the lambda, a new dependency the montage lane does not carry; the gate is the same decision for the
 * question asked here (where does the sound of a talking clip start and stop), and the seam (`speech`) takes a real VAD's
 * spans unchanged if one is added later.
 *
 * Pure and total: parses text, does arithmetic, never throws, never does I/O.
 */

/** The master's frame rate (lib/video/surgicalOps conforms every segment to it): every boundary lands on its grid. */
export const DETECT_FPS = 30;
/** Quieter than this is silence (dBFS). Speech and music sit well above; room tone and AAC noise below. */
export const SILENCE_DB = -35;
/** Shorter gaps are breaths between words, not silence. */
export const MIN_SILENCE_SEC = 0.35;
/** Shorter black runs are a dark frame, not a bumper's black. */
export const MIN_BLACK_SEC = 0.1;
/** Picture-change score (0–1) above which a frame is a hard cut. */
export const SCENE_THRESHOLD = 0.3;
/** A pause this long inside a clip counts as a break between parts when it has no black or cut to go by. */
export const BREAK_SILENCE_SEC = 0.6;
/** Kept before the first and after the last heard sound of a trimmed clip, so a word's attack and release survive. */
export const SPEECH_PAD_SEC = 0.15;
/** A clip's last frames can be missing in a real file: never plan to read its very end. */
export const TAIL_GUARD_SEC = 0.05;
/** The shortest intro or outro worth a shot (a bumper is never a single frame). */
export const MIN_PART_SEC = 0.5;
/** How much of a clip's start or end counts as "at the edge" (a black at 0.03 s is a leading black). */
const EDGE_SEC = 0.05;
/** Analysis stops here: an intro/outro bumper and the start and end of a body are inside it (detectSegments `-t`). */
export const MAX_DETECT_SEC = 600;

export interface Span {
  startSec: number;
  endSec: number;
}

/** What one detection pass found in a clip. */
export interface ClipSignals {
  durationSec: number;
  hasAudio: boolean;
  blacks: Span[];
  silences: Span[];
  /** Times of hard cuts in the picture, ascending. */
  scenes: number[];
}

const r3 = (n: number) => Number(n.toFixed(3));
const num = (s: string | undefined): number => (s === undefined ? Number.NaN : Number.parseFloat(s));

/** The argv of the detection pass (no shell): picture at 160 px for speed, both detectors, the null muxer. */
export function buildDetectArgs(source: string, maxSec = MAX_DETECT_SEC): string[] {
  return [
    '-hide_banner', '-nostats', '-i', source, '-t', String(maxSec),
    '-map', '0:v:0?', '-map', '0:a:0?',
    '-vf', `scale=160:-2,blackdetect=d=${MIN_BLACK_SEC}:pix_th=0.10,select='gt(scene\\,${SCENE_THRESHOLD})',showinfo`,
    '-af', `silencedetect=noise=${SILENCE_DB}dB:d=${MIN_SILENCE_SEC}`,
    '-f', 'null', '-',
  ];
}

/**
 * The detection pass's stderr → the signals. `durationSec` is the clip's real length from its probe (the stderr of a
 * `-t` capped pass knows only the part read). An open silence (started, never ended) runs to the end of the clip.
 */
export function parseDetectLog(stderr: string, durationSec: number, hasAudio: boolean): ClipSignals {
  const log = typeof stderr === 'string' ? stderr : '';
  const dur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  const blacks: Span[] = [];
  for (const m of log.matchAll(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)/g)) {
    const a = num(m[1]), b = num(m[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) blacks.push({ startSec: r3(a), endSec: r3(Math.min(b, dur || b)) });
  }
  const silences: Span[] = [];
  let open: number | null = null;
  for (const m of log.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
    const t = Math.max(0, num(m[2]));
    if (!Number.isFinite(t)) continue;
    if (m[1] === 'start') open = t;
    else if (open !== null) {
      if (t > open) silences.push({ startSec: r3(open), endSec: r3(dur ? Math.min(t, dur) : t) });
      open = null;
    }
  }
  if (open !== null && dur > open) silences.push({ startSec: r3(open), endSec: r3(dur) });
  const scenes: number[] = [];
  for (const m of log.matchAll(/Parsed_showinfo[^\n]*?pts_time:\s*([\d.]+)/g)) {
    const t = num(m[1]);
    // A "change" on the very first frame is the clip starting, not a cut.
    if (Number.isFinite(t) && t > EDGE_SEC && (!dur || t < dur - EDGE_SEC)) scenes.push(r3(t));
  }
  return {
    durationSec: r3(dur),
    hasAudio,
    blacks: blacks.sort((x, y) => x.startSec - y.startSec),
    silences: silences.sort((x, y) => x.startSec - y.startSec),
    scenes: [...new Set(scenes)].sort((x, y) => x - y),
  };
}

/** Where sound is heard (the voice activity): the complement of the silences, gaps under 0.15 s dropped. */
export function speechSpans(sig: ClipSignals): Span[] {
  if (!sig.hasAudio || !(sig.durationSec > 0)) return [];
  const out: Span[] = [];
  let t = 0;
  for (const s of sig.silences) {
    if (s.startSec - t >= 0.15) out.push({ startSec: r3(t), endSec: r3(s.startSec) });
    t = Math.max(t, s.endSec);
  }
  if (sig.durationSec - t >= 0.15) out.push({ startSec: r3(t), endSec: r3(sig.durationSec) });
  return out;
}

/**
 * First frame at or after `t`, last frame at or before it: a window never reads a frame it was not meant to. The slack
 * (1/50 frame) absorbs the millisecond rounding of a time already on the grid (8.933 s is frame 268, not 267).
 */
export const frameUp = (t: number) => r3(Math.ceil(t * DETECT_FPS - 0.02) / DETECT_FPS);
export const frameDown = (t: number) => r3(Math.floor(t * DETECT_FPS + 0.02) / DETECT_FPS);

/** The clip's last usable second (the tail guard), on the frame grid. */
export const usableEnd = (sig: Pick<ClipSignals, 'durationSec'>) => frameDown(Math.max(0, sig.durationSec - TAIL_GUARD_SEC));

/** The black at the very start / end of the clip, if any: where its picture really begins / ends. */
function leadingBlackEnd(sig: ClipSignals): number {
  const b = sig.blacks.find((x) => x.startSec <= EDGE_SEC);
  return b ? b.endSec : 0;
}
function trailingBlackStart(sig: ClipSignals): number {
  const end = sig.durationSec;
  const b = [...sig.blacks].reverse().find((x) => x.endSec >= end - EDGE_SEC - TAIL_GUARD_SEC);
  return b ? b.startSec : end;
}

/** Why a window was chosen, in words the card and the model can say. */
export type WindowBasis = 'whole' | 'black' | 'scene' | 'silence' | 'speech' | 'asked';

export interface DetectedWindow extends Span {
  /** What decided the start and the end. */
  startBy: WindowBasis;
  endBy: WindowBasis;
}

/**
 * A clip played whole, minus its dead ends: the black at its start and end, and (`trimSilence`, a talking body) the
 * silence before the first and after the last heard sound, less SPEECH_PAD_SEC. Never shorter than MIN_PART_SEC: a
 * clip that is nothing but black or silence keeps its whole length (nothing is cut on no evidence).
 */
export function trimmedWindow(sig: ClipSignals, trimSilence: boolean): DetectedWindow {
  const end = usableEnd(sig);
  let a = leadingBlackEnd(sig), aBy: WindowBasis = a > 0 ? 'black' : 'whole';
  let b = Math.min(end, trailingBlackStart(sig)), bBy: WindowBasis = b < end ? 'black' : 'whole';
  if (trimSilence) {
    const heard = speechSpans(sig).filter((s) => s.endSec > a && s.startSec < b);
    if (heard.length) {
      const first = Math.max(0, heard[0]!.startSec - SPEECH_PAD_SEC);
      const last = Math.min(end, heard[heard.length - 1]!.endSec + SPEECH_PAD_SEC);
      if (first > a) { a = first; aBy = 'speech'; }
      if (last < b) { b = last; bBy = 'speech'; }
    }
  }
  const startSec = frameUp(a), endSec = frameDown(b);
  if (!(endSec - startSec >= MIN_PART_SEC)) return { startSec: 0, endSec: end, startBy: 'whole', endBy: 'whole' };
  return { startSec, endSec, startBy: aBy, endBy: bBy };
}

/** A place inside a clip where one part ends and the next begins (a black run, a hard cut, a long pause). */
interface Break extends Span {
  by: Exclude<WindowBasis, 'whole' | 'speech' | 'asked'>;
}

/**
 * The breaks INSIDE the clip (not at its edges), strongest kind first: black runs, else hard cuts, else long silences.
 * Only one kind is used, so a cut inside the intro's own animation never outranks the black that ends it.
 */
export function interiorBreaks(sig: ClipSignals): Break[] {
  const lo = leadingBlackEnd(sig) + MIN_PART_SEC, hi = Math.min(sig.durationSec, trailingBlackStart(sig)) - MIN_PART_SEC;
  const inside = (s: Span) => s.startSec >= lo && s.endSec <= hi;
  const blacks = sig.blacks.filter((x) => x.startSec > EDGE_SEC && inside(x)).map((x): Break => ({ ...x, by: 'black' }));
  if (blacks.length) return blacks;
  const scenes = sig.scenes.filter((t) => t >= lo && t <= hi).map((t): Break => ({ startSec: t, endSec: t, by: 'scene' }));
  if (scenes.length) return scenes;
  return sig.hasAudio
    ? sig.silences.filter((x) => x.endSec - x.startSec >= BREAK_SILENCE_SEC && inside(x)).map((x): Break => ({ ...x, by: 'silence' }))
    : [];
}

export type SplitResult =
  | { ok: true; intro: DetectedWindow; outro: DetectedWindow; breaks: number }
  | { ok: false; error: 'no_boundary' };

/**
 * ONE clip that carries both the intro and the outro ([intro … outro], the A of A+B+A): the intro runs from the clip's
 * first real frame to the FIRST break, the outro from the LAST break to its last real frame. One break splits the clip
 * in two. No break at all is a refusal, never a guess: the user then gives the times (cut_timestamps).
 */
export function splitIntroOutro(sig: ClipSignals): SplitResult {
  const breaks = interiorBreaks(sig);
  if (!breaks.length) return { ok: false, error: 'no_boundary' };
  const whole = trimmedWindow(sig, false);
  const first = breaks[0]!, last = breaks[breaks.length - 1]!;
  const intro: DetectedWindow = { startSec: whole.startSec, endSec: frameDown(first.startSec), startBy: whole.startBy, endBy: first.by };
  const outro: DetectedWindow = { startSec: frameUp(last.endSec), endSec: whole.endSec, startBy: last.by, endBy: whole.endBy };
  if (intro.endSec - intro.startSec < MIN_PART_SEC || outro.endSec - outro.startSec < MIN_PART_SEC) return { ok: false, error: 'no_boundary' };
  return { ok: true, intro, outro, breaks: breaks.length };
}
