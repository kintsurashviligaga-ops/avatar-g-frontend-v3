/**
 * lib/services/montage/beatPlan.ts — "cut my clips to this music": find the track's beat, then lay the clips on it.
 *
 * PURE + TOTAL, like ./montagePlan: no imports, no I/O, never throws. The caller decodes the track to mono 16-bit PCM
 * (lib/services/montage/beatAnalysis, ffmpeg) and probes each clip's length; everything here is arithmetic on those
 * numbers, so it is unit-tested against synthetic click tracks without ffmpeg, a network or a key.
 *
 * HOW THE BEAT IS FOUND (no model, no library):
 *   1 onset strength   per 256-sample hop at 11.025 kHz (~23 ms): the rise in log energy, on the full signal and on its
 *                      first difference (which weights the high, percussive part), each with its local mean removed;
 *   2 tempo            the autocorrelation of that curve over 60–200 BPM, weighted toward 120 BPM by one octave (a
 *                      plain autocorrelation cannot tell 80 from 160 BPM; the prior picks the danceable one);
 *   3 phase            the offset whose beat grid collects the most onset strength.
 * A track without a clear pulse (speech, ambient, silence) gets `null`, and the plan falls back to even cuts that it
 * reports as such: an edit is never sold as "on the beat" when no beat was found.
 *
 * HOW THE CLIPS ARE LAID: every shot is a whole number of beats (1, 2, 4, 6, 8 … — halves and multiples of a bar), the
 * music starts on the first beat, and every cut is a hard cut, so each cut lands on a beat. The clips keep the order
 * the user gave them; a clip's shots are spread across its length rather than all taken from its first seconds. A clip
 * too short for even one beat is left out BY NAME (`unusedClips`), never silently.
 */

/** The rate the track is decoded at for analysis. Beats need no more; it keeps a 5-minute track under 7 MB. */
export const ANALYSIS_RATE = 11_025;
/** Samples per onset frame (~23 ms at ANALYSIS_RATE). */
export const ANALYSIS_HOP = 256;
/** The longest stretch of a track that is analysed: the master can never be longer (MAX_TOTAL_SEC) plus slack. */
export const MAX_ANALYSIS_SEC = 330;

export const MIN_BPM = 60;
export const MAX_BPM = 200;
/** Below this normalized autocorrelation at the beat lag there is no pulse worth cutting to (noise sits near 0). */
export const MIN_BEAT_CONFIDENCE = 0.12;

/** A montage of clips to a song with no length asked for: a Reel. */
export const DEFAULT_TARGET_SEC = 30;
/** Cuts faster than this read as flicker rather than rhythm. */
export const MIN_CUT_SEC = 1.5;
/** The beat unit used when the track has no pulse: even cuts on a half-second grid. */
export const FALLBACK_UNIT_SEC = 0.5;
/** Whole beats per shot the planner may choose: a beat, half a bar, a bar, a bar and a half, two bars … */
export const BEATS_PER_SHOT: readonly number[] = [1, 2, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128];
/** A source is never read up to its very last frame: decoders disagree on it by a frame or two. */
const TAIL_GUARD_SEC = 0.05;
/** ⚠️ MIRRORS the `fps=30` every segment gets in lib/video/surgicalOps `runSequence`. Change both together. */
export const OUTPUT_FPS = 30;

export interface BeatGrid {
  bpm: number;
  /** Seconds between beats. */
  periodSec: number;
  /** Time of the first beat, in [0, periodSec). */
  phaseSec: number;
  /** Normalized autocorrelation of the onset curve at the beat lag, in (0, 1]; ≥ MIN_BEAT_CONFIDENCE, or no grid. */
  confidence: number;
}

/**
 * Onset strength per hop: how sharply the energy rises. Two bands (the signal, and its first difference, which is the
 * crude high-pass a hi-hat or snare lives in), each on a log scale, rectified, with the slow swell under it removed.
 */
export function onsetStrength(pcm: ArrayLike<number>, hop = ANALYSIS_HOP): Float32Array {
  const frames = Math.floor(pcm.length / hop);
  if (frames < 3) return new Float32Array(0);
  const full = new Float32Array(frames);
  const high = new Float32Array(frames);
  let prev = 0;
  for (let f = 0; f < frames; f += 1) {
    let e = 0;
    let eh = 0;
    const base = f * hop;
    for (let i = 0; i < hop; i += 1) {
      const x = (pcm[base + i] ?? 0) / 32768;
      const d = x - prev;
      prev = x;
      e += x * x;
      eh += d * d;
    }
    // log1p(C·rms) behaves like a log with a floor: near-silence does not turn into large random differences.
    full[f] = Math.log1p(1000 * Math.sqrt(e / hop));
    high[f] = Math.log1p(1000 * Math.sqrt(eh / hop));
  }
  const out = new Float32Array(frames);
  for (let f = 1; f < frames; f += 1) {
    out[f] = Math.max(0, full[f]! - full[f - 1]!) + Math.max(0, high[f]! - high[f - 1]!);
  }
  // Remove the local mean (~0.35 s either side) so a crescendo is not read as a long run of onsets.
  const win = Math.max(1, Math.round(0.35 / (hop / ANALYSIS_RATE)));
  const prefix = new Float64Array(frames + 1);
  for (let f = 0; f < frames; f += 1) prefix[f + 1] = prefix[f]! + out[f]!;
  const res = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) {
    const lo = Math.max(0, f - win);
    const hi = Math.min(frames, f + win + 1);
    const mean = (prefix[hi]! - prefix[lo]!) / (hi - lo);
    res[f] = Math.max(0, out[f]! - mean);
  }
  return res;
}

/** The onset curve at a fractional frame, linearly interpolated (0 outside it). */
function at(onset: Float32Array, t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  return (onset[i] ?? 0) * (1 - f) + (onset[i + 1] ?? 0) * f;
}

/** Mean onset strength on the grid with this period and phase (both in frames, fractional). */
function gridScore(onset: Float32Array, lag: number, phase: number): number {
  let s = 0;
  let n = 0;
  for (let t = phase; t < onset.length - 1; t += lag) {
    s += at(onset, t);
    n += 1;
  }
  return n ? s / n : 0;
}

/**
 * The track's beat grid, or null when it has no pulse worth cutting to. `hopSec` is the onset frame length.
 *
 * The onset curve is smoothed first: a click is one or two frames wide and a beat period is rarely a whole number of
 * frames, so an unsmoothed autocorrelation prefers whichever multiple of the period happens to fall on a whole frame
 * (it read 120 BPM as 60). The coarse tempo is then refined with a fine comb search over period and phase together,
 * because a period off by a tenth of a frame is a beat off after fifty beats.
 */
export function estimateBeatGrid(onset: Float32Array, hopSec = ANALYSIS_HOP / ANALYSIS_RATE): BeatGrid | null {
  const n = onset.length;
  if (!(hopSec > 0) || n < 8) return null;
  const minLag = Math.max(2, Math.floor(60 / MAX_BPM / hopSec));
  const maxLag = Math.min(Math.floor(n / 3), Math.ceil(60 / MIN_BPM / hopSec));
  if (maxLag <= minLag + 2) return null;

  const KERNEL = [1, 2, 3, 2, 1];
  const smooth = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    let s = 0;
    for (let k = 0; k < KERNEL.length; k += 1) s += KERNEL[k]! * (onset[i + k - 2] ?? 0);
    smooth[i] = s / 9;
  }
  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += smooth[i]!;
  mean /= n;
  const centered = new Float64Array(n);
  let ac0 = 0;
  for (let i = 0; i < n; i += 1) {
    centered[i] = smooth[i]! - mean;
    ac0 += centered[i]! * centered[i]!;
  }
  ac0 /= n;
  if (!(ac0 > 1e-12)) return null;

  // Normalized autocorrelation r ∈ [-1, 1]: about 0 for noise at every lag, high at the beat for a pulse.
  let best = -1;
  let bestScore = 0;
  let bestR = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let ac = 0;
    for (let i = 0; i + lag < n; i += 1) ac += centered[i]! * centered[i + lag]!;
    const r = ac / (n - lag) / ac0;
    const octaves = Math.log2(60 / (lag * hopSec) / 120);
    const score = Math.max(0, r) * Math.exp(-0.5 * octaves * octaves);
    if (score > bestScore) {
      bestScore = score;
      best = lag;
      bestR = r;
    }
  }
  if (best < 0 || !(bestR >= MIN_BEAT_CONFIDENCE)) return null;

  // Fine comb search: periods within a frame of the coarse lag, phases across one period, both in steps of a tenth
  // of a frame where it matters (the period) and a quarter where it is cheap to be close (the phase).
  let lag = best;
  let phase = 0;
  let top = -1;
  for (let l = best - 1; l <= best + 1 + 1e-9; l += 0.02) {
    if (l < minLag - 0.5) continue;
    for (let p = 0; p < l; p += 0.25) {
      const s = gridScore(smooth, l, p);
      if (s > top) {
        top = s;
        lag = l;
        phase = p;
      }
    }
  }
  const periodSec = lag * hopSec;
  return {
    bpm: Number((60 / periodSec).toFixed(2)),
    periodSec: Number(periodSec.toFixed(4)),
    phaseSec: Number((phase * hopSec).toFixed(4)),
    confidence: Number(bestR.toFixed(3)),
  };
}

export interface CutInput {
  /** Each clip's real length in seconds, in the order the user gave them. */
  clipDurationsSec: readonly number[];
  /** The track's length in seconds. */
  musicSec: number;
  grid: BeatGrid | null;
  /** The length the user asked for; DEFAULT_TARGET_SEC when absent. */
  targetSec?: number;
  /**
   * Where the user asked the music to start („მუსიკა 5 წამიდან დაიწყე"), in seconds into the track. The edit starts on
   * the first beat at or after it, so the first cut still lands on a beat; with no beat grid, exactly there.
   */
  musicFromSec?: number;
  maxShots: number;
  maxTotalSec: number;
  /** The shortest shot the renderer takes (montagePlan MIN_SHOT_SEC). */
  minShotSec: number;
  /** The longest shot the renderer takes (montagePlan MAX_SHOT_SEC). */
  maxShotSec: number;
}

export interface PlannedCut {
  /** Index into the clip list. */
  clip: number;
  startSec: number;
  endSec: number;
  beats: number;
}

export interface CutPlan {
  ok: boolean;
  error?: string;
  cuts: PlannedCut[];
  /** Where in the track the first frame lands: the first beat (at or after the asked start; 0 with no grid and no start). */
  musicStartSec: number;
  totalSec: number;
  beatSynced: boolean;
  bpm: number | null;
  /** The beat unit every shot is a whole multiple of. */
  unitSec: number;
  beatsPerShot: number;
  /** Clips too short for one beat-unit shot: left out, and the caller says so. */
  unusedClips: number[];
}

const r3 = (n: number) => Number(n.toFixed(3));

function fail(error: string, grid: BeatGrid | null): CutPlan {
  return {
    ok: false, error, cuts: [], musicStartSec: 0, totalSec: 0, beatSynced: false, bpm: grid?.bpm ?? null,
    unitSec: grid?.periodSec ?? FALLBACK_UNIT_SEC, beatsPerShot: 0, unusedClips: [],
  };
}

/** The first beat at or after `fromSec` (the grid's first beat when `fromSec` is before it); `fromSec` itself with no grid. */
export function musicStartOnBeat(grid: BeatGrid | null, fromSec: number): number {
  const from = Number.isFinite(fromSec) && fromSec > 0 ? fromSec : 0;
  if (!grid || !(grid.periodSec > 0)) return from;
  const phase = Math.max(0, grid.phaseSec);
  if (from <= phase) return phase;
  return phase + Math.ceil((from - phase) / grid.periodSec - 1e-9) * grid.periodSec;
}

/** Lay the clips on the beat grid (or on even half-second cuts when there is none). */
export function planBeatCuts(input: CutInput): CutPlan {
  const { grid } = input;
  const unit = grid && grid.periodSec > 0 ? grid.periodSec : FALLBACK_UNIT_SEC;
  const askedFrom = Number.isFinite(input.musicFromSec) && (input.musicFromSec ?? 0) > 0 ? input.musicFromSec! : 0;
  const musicStartSec = musicStartOnBeat(grid, askedFrom);
  const durations = input.clipDurationsSec.map((d) => (Number.isFinite(d) && d > 0 ? d - TAIL_GUARD_SEC : 0));
  if (!durations.length) return fail('no clips', grid);
  const footage = durations.reduce((s, d) => s + Math.max(0, d), 0);
  const music = Number.isFinite(input.musicSec) ? input.musicSec - musicStartSec : 0;
  if (askedFrom > 0 && !(music > 0)) return fail(`the track ends before ${r3(askedFrom)}s`, grid);
  if (!(music > 0)) return fail('the track has no length', grid);

  const asked = Number.isFinite(input.targetSec) && (input.targetSec ?? 0) > 0 ? input.targetSec! : DEFAULT_TARGET_SEC;
  const target = Math.min(asked, music, footage, input.maxTotalSec);

  // The shortest and longest whole-beat shots the renderer accepts, with a frame to spare for the snapping below.
  const frame = 1 / OUTPUT_FPS;
  const minBeats = Math.max(1, Math.ceil((input.minShotSec + frame) / unit));
  const maxBeats = Math.max(minBeats, Math.floor((input.maxShotSec - frame) / unit));
  const wantSec = Math.max(MIN_CUT_SEC, target / Math.max(1, input.maxShots));
  const k = BEATS_PER_SHOT.find((b) => b >= minBeats && b * unit >= wantSec - 1e-9 && b <= maxBeats)
    ?? Math.min(maxBeats, Math.max(minBeats, Math.ceil(wantSec / unit)));

  let budget = Math.floor((target + 1e-6) / unit);
  if (budget < minBeats) return fail(`the clips or the track are shorter than one ${r3(minBeats * unit)}s shot`, grid);

  const capacity = durations.map((d) => Math.floor((Math.max(0, d) + 1e-6) / unit));
  const shotsOf: number[][] = durations.map(() => []);
  let shots = 0;
  // Round-robin over the clips in their order, so every usable clip appears before any clip appears twice.
  for (let progressed = true; progressed && budget >= minBeats && shots < input.maxShots;) {
    progressed = false;
    for (let c = 0; c < durations.length && budget >= minBeats && shots < input.maxShots; c += 1) {
      const left = capacity[c]!;
      const own = shotsOf[c]!;
      // A full shot when it fits. A shorter whole-beat shot is fine for a clip's first shot (a short clip still
      // appears); after that it must be at least half a full shot, or the edit ends a little early instead of
      // flashing a sliver.
      let take = Math.min(k, left, budget);
      if (take < minBeats) continue;
      if (own.length > 0 && take < Math.ceil(k / 2)) continue;
      take = Math.min(take, maxBeats);
      own.push(take);
      capacity[c] = left - take;
      budget -= take;
      shots += 1;
      progressed = true;
    }
  }
  if (!shots) return fail('no clip is long enough for one shot', grid);

  // Each shot's length comes from where its cut falls in the MASTER, snapped to the output frame grid: the stitch
  // resamples every shot to OUTPUT_FPS, so lengths of raw beats would each round by up to half a frame and the cuts
  // would drift off the beat as they add up. Snapping the cumulative positions keeps every cut within half a frame.
  const order = durations.flatMap((_, c) => shotsOf[c]!.map((beats) => ({ c, beats })));
  const lens: number[] = [];
  let beatsSoFar = 0;
  for (const { beats } of order) {
    const t0 = Math.round(beatsSoFar * unit * OUTPUT_FPS);
    beatsSoFar += beats;
    lens.push((Math.round(beatsSoFar * unit * OUTPUT_FPS) - t0) / OUTPUT_FPS);
  }

  const cuts: PlannedCut[] = [];
  let next = 0;
  durations.forEach((d, c) => {
    const own = shotsOf[c]!;
    if (!own.length) return;
    const mine = lens.slice(next, next + own.length);
    next += own.length;
    // Spread the clip's shots across it with equal gaps, so a long clip is sampled, not just its opening seconds.
    const used = mine.reduce((s, len) => s + len, 0);
    const gap = Math.max(0, d - used) / (own.length + 1);
    let at = gap;
    own.forEach((beats, j) => {
      const len = mine[j]!;
      const start = Math.max(0, Math.min(at, d - len));
      cuts.push({ clip: c, startSec: r3(start), endSec: r3(start + len), beats });
      at = start + len + gap;
    });
  });
  const totalSec = r3(lens.reduce((s, len) => s + len, 0));
  return {
    ok: true,
    cuts,
    musicStartSec: r3(musicStartSec),
    totalSec,
    beatSynced: Boolean(grid),
    bpm: grid?.bpm ?? null,
    unitSec: r3(unit),
    beatsPerShot: k,
    unusedClips: durations.map((_, c) => c).filter((c) => !shotsOf[c]!.length),
  };
}
