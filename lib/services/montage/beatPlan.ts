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
 * the user gave them (all of the first clip's shots, then the second's, …); a clip's shots are spread across its length
 * rather than all taken from its first seconds.
 *
 * EVERY CLIP IS USED (owner, 2026-10-11: "if 3 videos are required, an output made from only 1 or 2 is not a completed
 * task"). The first round gives every clip one shot before any clip gets a second, and it reserves the beats the clips
 * after it still need, so an early clip can never eat the budget of a later one. When that is impossible — a clip
 * shorter than the shortest shot, or a track (or an asked length) too short for one shot per clip — the plan FAILS with
 * a `problem` that names the cause and the clips, instead of leaving any clip out. `unusedClips` is always empty on a
 * plan that is ok.
 *
 * SPEED RAMPS („სადაც საჭიროა ააჩქარე, სადაც საჭიროა შეანელე", owner 2026-10-11): with `ramp`, each shot keeps its
 * length on the master (so every cut stays on its beat) and plays its footage faster or slower, chosen by the music
 * UNDER that shot: the calmest stretches of the track get slow motion (RAMP_SLOW), the strongest get sped up
 * (RAMP_FAST). The music's strength is `energyEnvelope` (loudness and how dense the onsets are, per half second). A
 * sped-up shot reads more of its clip; a clip that has not enough footage for it keeps that shot at normal speed, so
 * the ramp never costs a clip its place. Stills are never ramped.
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

/** The music's strength is measured per block of this many seconds. */
export const ENERGY_BLOCK_SEC = 0.5;
/** A ramped shot plays at this speed: slow motion on the calm parts, faster on the strong ones. */
export const RAMP_SLOW = 0.5;
export const RAMP_FAST = 1.5;
/** With both ways asked, this share of the shots goes each way (at least one each); with one way, RAMP_ONE_WAY_SHARE. */
export const RAMP_SHARE = 0.25;
export const RAMP_ONE_WAY_SHARE = 1 / 3;

/** Which way the words ask the shots to change speed: both (where it fits), only slower, only faster. */
export type RampMode = 'mixed' | 'slow' | 'fast';

export interface EnergyEnvelope {
  blockSec: number;
  /** One value per block from the track's start: above 0 stronger than the track's average, below 0 calmer. */
  values: ArrayLike<number>;
}

/**
 * How strong the music is, block by block: its loudness and how dense its onsets are (a drum fill, a chorus), each
 * standardized over the track and averaged. Pure: `pcm` is the analysis decode (mono 16-bit at ANALYSIS_RATE).
 */
export function energyEnvelope(pcm: ArrayLike<number>, blockSec = ENERGY_BLOCK_SEC, hop = ANALYSIS_HOP): EnergyEnvelope {
  const per = Math.max(1, Math.round((blockSec * ANALYSIS_RATE) / hop));
  const onset = onsetStrength(pcm, hop);
  const frames = Math.floor(pcm.length / hop);
  const blocks = Math.floor(frames / per);
  const loud = new Float64Array(blocks);
  const dense = new Float64Array(blocks);
  for (let b = 0; b < blocks; b += 1) {
    let e = 0;
    let o = 0;
    for (let f = b * per; f < (b + 1) * per; f += 1) {
      const base = f * hop;
      for (let i = 0; i < hop; i += 1) { const x = (pcm[base + i] ?? 0) / 32768; e += x * x; }
      o += onset[f] ?? 0;
    }
    loud[b] = Math.log1p(1000 * Math.sqrt(e / (per * hop)));
    dense[b] = o / per;
  }
  const z = (a: Float64Array): Float64Array => {
    if (!a.length) return a;
    let m = 0;
    for (const v of a) m += v;
    m /= a.length;
    let sd = 0;
    for (const v of a) sd += (v - m) ** 2;
    sd = Math.sqrt(sd / a.length);
    return a.map((v) => (sd > 1e-9 ? (v - m) / sd : 0));
  };
  const zl = z(loud), zd = z(dense);
  const values = new Float32Array(blocks);
  for (let b = 0; b < blocks; b += 1) values[b] = (zl[b]! + zd[b]!) / 2;
  return { blockSec: per * hop / ANALYSIS_RATE, values };
}

/** The music's mean strength between two moments of the track (seconds); 0 where the envelope says nothing. */
export function energyBetween(env: EnergyEnvelope, fromSec: number, toSec: number): number {
  const n = env.values.length;
  if (!n || !(env.blockSec > 0) || !(toSec > fromSec)) return 0;
  const a = Math.max(0, Math.floor(fromSec / env.blockSec));
  const b = Math.min(n, Math.ceil(toSec / env.blockSec));
  if (b <= a) return 0;
  let s = 0;
  for (let i = a; i < b; i += 1) s += env.values[i] ?? 0;
  return s / (b - a);
}

/**
 * Each shot's speed from the music under it (`energies`, one per shot in master order): with `mode` mixed, the calmest
 * RAMP_SHARE of the shots slow down and the strongest RAMP_SHARE speed up (at least one each, never the same shot); with
 * one way asked, that way only, for RAMP_ONE_WAY_SHARE of them. `eligible` false keeps a shot at 1× (a still).
 */
export function rampSpeeds(energies: readonly number[], mode: RampMode, eligible: readonly boolean[] = []): number[] {
  const speeds = energies.map(() => 1);
  const idx = energies.map((_, i) => i).filter((i) => eligible[i] !== false);
  if (idx.length < (mode === 'mixed' ? 2 : 1)) return speeds;
  // Calmest first; ties keep the master order, so the same track always makes the same edit.
  const calm = [...idx].sort((x, y) => energies[x]! - energies[y]! || x - y);
  const strong = [...idx].sort((x, y) => energies[y]! - energies[x]! || x - y);
  const k = Math.max(1, Math.round(idx.length * (mode === 'mixed' ? RAMP_SHARE : RAMP_ONE_WAY_SHARE)));
  if (mode !== 'fast') for (const i of calm.slice(0, mode === 'mixed' ? Math.min(k, Math.floor(idx.length / 2)) : k)) speeds[i] = RAMP_SLOW;
  if (mode !== 'slow') for (const i of strong.slice(0, mode === 'mixed' ? Math.min(k, Math.floor(idx.length / 2)) : k)) if (speeds[i] === 1) speeds[i] = RAMP_FAST;
  return speeds;
}

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
  /**
   * The length the user ASKED for, in seconds; DEFAULT_TARGET_SEC when absent. Asked = binding (Media Studio v2.0 §D,
   * owner 2026-10-11): the plan lasts exactly this long (to the output frame), or it is refused with the reason
   * (music_too_short, footage_too_short, target_too_long). It is never silently shortened. With no length asked, the
   * default is only a wish and shrinks to the music and the footage there are, as before.
   */
  targetSec?: number;
  /**
   * Where the user asked the music to start („მუსიკა 0:58-დან დაიწყე"), in seconds into the track (the audio SOURCE
   * offset). The master's first frame plays the track from EXACTLY there: the user's offset is never moved. When it
   * falls between two beats, the first shot is longer by the lead-in to the next beat (`leadInSec`), so every later cut
   * still lands on a beat.
   */
  musicFromSec?: number;
  maxShots: number;
  maxTotalSec: number;
  /** The shortest shot the renderer takes (montagePlan MIN_SHOT_SEC). */
  minShotSec: number;
  /** The longest shot the renderer takes (montagePlan MAX_SHOT_SEC). */
  maxShotSec: number;
  /**
   * Which clips are PHOTOS (parallel to clipDurationsSec): a still has no length of its own, so it is never too short
   * and gets exactly ONE shot (a full one when the budget allows), shown from its start (the lane turns it into a slow
   * zoom, lib/services/montage/montagePipeline). Its entry in clipDurationsSec is ignored.
   */
  stills?: readonly boolean[];
  /**
   * Speed ramps asked („ააჩქარე და შეანელე სადაც საჭიროა"): which way, and the music's strength to choose by (the
   * track's envelope from its own start, analysis seconds). Absent = every shot at its own speed, as before.
   */
  ramp?: { mode: RampMode; energy: EnergyEnvelope | null };
}

export interface PlannedCut {
  /** Index into the clip list. */
  clip: number;
  /** The window of the CLIP the shot plays (source seconds): `speed` × its length on the master. */
  startSec: number;
  endSec: number;
  beats: number;
  /** The shot's playback speed when it is not 1 (a ramp): 0.5 = slow motion, 1.5 = faster. */
  speed?: number;
}

/** What the ramp did, in numbers the card says. */
export interface RampResult {
  mode: RampMode;
  /** Shots slowed down / sped up (after a clip short of footage kept one at normal speed). */
  slow: number;
  fast: number;
  /** Chosen by the music's strength (true), or the envelope was missing and nothing was ramped. */
  byEnergy: boolean;
  /** Fast shots kept at normal speed because their clip had not enough footage for them. */
  keptForFootage: number;
}

/**
 * Why no plan uses every clip, in numbers the chat can say (lib/agent/media/montageChat). `clips` in clip_too_short are
 * indices into the clip list; everywhere else `clips` is how many clips each need one shot.
 */
export type CutProblem =
  /** These clips are shorter than the shortest shot this edit can cut (`minShotSec`, the beat unit's whole multiple). */
  | { kind: 'clip_too_short'; clips: number[]; minShotSec: number }
  /**
   * The music from `fromSec` lasts `musicSec`: less than the `neededSec` one shot per clip takes, or (with `targetSec`)
   * less than the length the user asked for. The track is never looped or padded to hide it.
   */
  | { kind: 'music_too_short'; clips: number; musicSec: number; fromSec: number; neededSec: number; targetSec?: number }
  /** The length asked for (`targetSec`) is less than the `neededSec` one shot per clip takes. */
  | { kind: 'target_too_short'; clips: number; targetSec: number; neededSec: number }
  /** The clips together (`footageSec`, each used once) are shorter than the length asked for (`targetSec`). */
  | { kind: 'footage_too_short'; clips: number; footageSec: number; targetSec: number }
  /** The length asked for is longer than one edit renders (`maxSec`). */
  | { kind: 'target_too_long'; targetSec: number; maxSec: number }
  /** More clips than the renderer takes shots. */
  | { kind: 'too_many_clips'; clips: number; maxShots: number };

export interface CutPlan {
  ok: boolean;
  error?: string;
  /** Set when the plan failed because not every clip could get a shot. */
  problem?: CutProblem;
  cuts: PlannedCut[];
  /** Where in the track the first frame lands: exactly the asked start; with none, the first beat (0 with no grid). */
  musicStartSec: number;
  /** Seconds from the asked start to the first beat after it (added to the first shot); 0 when on a beat or no grid. */
  leadInSec: number;
  totalSec: number;
  beatSynced: boolean;
  bpm: number | null;
  /** The beat unit every shot is a whole multiple of. */
  unitSec: number;
  beatsPerShot: number;
  /**
   * Clips without a shot. Always empty on a plan that is ok: a clip that cannot get a shot fails the plan (`problem`).
   * Kept for the callers that still read it.
   */
  unusedClips: number[];
  /** Present when ramps were asked: how many shots slow down and speed up. */
  ramp?: RampResult;
}

const r3 = (n: number) => Number(n.toFixed(3));
/** Seconds a person is told, rounded UP to a tenth: a "needs 1.5 s" must never be 1.46 s. */
const up1 = (n: number) => Math.ceil(n * 10 - 1e-6) / 10;

function fail(error: string, grid: BeatGrid | null, problem?: CutProblem): CutPlan {
  return {
    ok: false, error, ...(problem ? { problem } : {}), cuts: [], musicStartSec: 0, leadInSec: 0, totalSec: 0, beatSynced: false, bpm: grid?.bpm ?? null,
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

/** Lay the clips on the beat grid (or on even half-second cuts when there is none). Every clip gets a shot, or no plan. */
export function planBeatCuts(input: CutInput): CutPlan {
  const { grid } = input;
  const unit = grid && grid.periodSec > 0 ? grid.periodSec : FALLBACK_UNIT_SEC;
  const askedFrom = Number.isFinite(input.musicFromSec) && (input.musicFromSec ?? 0) > 0 ? input.musicFromSec! : 0;
  // The user's offset is kept exactly; only an edit with no asked start begins on the track's first beat.
  const musicStartSec = askedFrom > 0 ? askedFrom : musicStartOnBeat(grid, 0);
  const frameSec = 1 / OUTPUT_FPS;
  const rawLead = askedFrom > 0 && grid && grid.periodSec > 0 ? musicStartOnBeat(grid, askedFrom) - askedFrom : 0;
  // A lead-in under half a frame cannot be seen or heard as off the beat: none.
  const leadInSec = rawLead >= frameSec / 2 ? rawLead : 0;
  const still = (c: number): boolean => input.stills?.[c] === true;
  // A still's "length" is the longest shot it could be: it never runs out, and it holds one shot only (below).
  const durations = input.clipDurationsSec.map((d, c) => (still(c) ? input.maxShotSec : Number.isFinite(d) && d > 0 ? d - TAIL_GUARD_SEC : 0));
  const n = durations.length;
  if (!n) return fail('no clips', grid);
  if (n > input.maxShots) {
    return fail(`${n} clips need ${n} shots; an edit takes at most ${input.maxShots}`, grid, { kind: 'too_many_clips', clips: n, maxShots: input.maxShots });
  }

  // The shortest and longest whole-beat shots the renderer accepts, with a frame to spare for the snapping below.
  const frame = 1 / OUTPUT_FPS;
  const minBeats = Math.max(1, Math.ceil((input.minShotSec + frame) / unit));
  const maxBeats = Math.max(minBeats, Math.floor((input.maxShotSec - frame) / unit));
  // One shot per clip is the least every plan must hold.
  const neededSec = up1(n * minBeats * unit);

  // ── every clip must hold one shot ────────────────────────────────────────────────────────────────────────────────
  const capacity = durations.map((d, c) => (still(c) ? maxBeats : Math.floor((Math.max(0, d) + 1e-6) / unit)));
  const short = capacity.flatMap((cap, c) => (cap < minBeats && !still(c) ? [c] : []));
  if (short.length) {
    const minShotSec = up1(minBeats * unit + TAIL_GUARD_SEC);
    return fail(`clip ${short.map((c) => c + 1).join(', ')} shorter than one ${minShotSec}s shot`, grid, { kind: 'clip_too_short', clips: short, minShotSec });
  }

  // ── the music (from where it starts) must hold one shot per clip ─────────────────────────────────────────────────
  const footage = durations.reduce((s, d) => s + Math.max(0, d), 0);
  const music = Number.isFinite(input.musicSec) ? input.musicSec - musicStartSec : 0;
  const musicProblem = (): Extract<CutProblem, { kind: 'music_too_short' }> => ({ kind: 'music_too_short', clips: n, musicSec: r3(Math.max(0, music)), fromSec: r3(musicStartSec), neededSec });
  if (askedFrom > 0 && !(music > 0)) return fail(`the track ends before ${r3(askedFrom)}s`, grid, musicProblem());
  if (!(music > 0)) return fail('the track has no length', grid, musicProblem());

  const explicit = Number.isFinite(input.targetSec) && (input.targetSec ?? 0) > 0;
  const asked = explicit ? input.targetSec! : DEFAULT_TARGET_SEC;
  if (explicit) {
    // An asked length is binding: every reason it cannot be met is said, none is hidden by a shorter master.
    if (asked > input.maxTotalSec + 1e-6) {
      return fail(`the length asked (${r3(asked)}s) is longer than one edit (${input.maxTotalSec}s)`, grid, { kind: 'target_too_long', targetSec: r3(asked), maxSec: input.maxTotalSec });
    }
    if (music + 1e-6 < asked) {
      return fail(`the music from ${r3(musicStartSec)}s lasts ${r3(Math.max(0, music))}s, shorter than the ${r3(asked)}s asked`, grid, { ...musicProblem(), targetSec: r3(asked) });
    }
    if (footage + 1e-6 < asked) {
      return fail(`the clips together last ${r3(footage)}s, shorter than the ${r3(asked)}s asked`, grid, { kind: 'footage_too_short', clips: n, footageSec: r3(footage), targetSec: r3(asked) });
    }
  }
  const target = explicit ? asked : Math.min(asked, music, footage, input.maxTotalSec);

  const wantSec = Math.max(MIN_CUT_SEC, target / Math.max(1, input.maxShots));
  const k = BEATS_PER_SHOT.find((b) => b >= minBeats && b * unit >= wantSec - 1e-9 && b <= maxBeats)
    ?? Math.min(maxBeats, Math.max(minBeats, Math.ceil(wantSec / unit)));

  // Whole beats after the lead-in (the lead-in rides on the first shot).
  let budget = Math.floor((target - leadInSec + 1e-6) / unit);
  if (budget < n * minBeats) {
    // Name what is short: the music (from its start), or the length the user asked for. (The footage cannot be: every
    // clip holds a shot, see above; nor can the renderer's ceiling, which is many shots long.)
    if (music <= asked) {
      return fail(`the music from ${r3(musicStartSec)}s lasts ${r3(Math.max(0, music))}s, shorter than the ${neededSec}s ${n} clip(s) need`, grid, musicProblem());
    }
    return fail(`the length asked (${r3(asked)}s) is shorter than the ${neededSec}s ${n} clip(s) need`, grid,
      { kind: 'target_too_short', clips: n, targetSec: r3(asked), neededSec });
  }

  const shotsOf: number[][] = durations.map(() => []);
  let shots = 0;
  // First round: one shot per clip, in their order. Each takes a full shot when it fits, but never the beats the clips
  // after it still need (`reserve`), so the last clip gets its shot as surely as the first. A shorter whole-beat shot
  // is fine here (a short clip still appears).
  for (let c = 0; c < n; c += 1) {
    const reserve = (n - c - 1) * minBeats;
    const take = Math.min(k, capacity[c]!, budget - reserve, maxBeats);
    // Cannot happen after the checks above; kept so a future change fails loudly instead of dropping a clip.
    if (take < minBeats) return fail(`clip ${c + 1} could not get a shot`, grid, musicProblem());
    shotsOf[c]!.push(take);
    // A photo is shown once: a second shot of the same still reads as a stutter, not as rhythm.
    capacity[c] = still(c) ? 0 : capacity[c]! - take;
    budget -= take;
    shots += 1;
  }
  // Then round-robin over the clips in their order with what is left. After its first shot a clip's next must be at
  // least half a full shot, or the edit ends a little early instead of flashing a sliver.
  for (let progressed = true; progressed && budget >= minBeats && shots < input.maxShots;) {
    progressed = false;
    for (let c = 0; c < n && budget >= minBeats && shots < input.maxShots; c += 1) {
      const left = capacity[c]!;
      let take = Math.min(k, left, budget);
      if (take < minBeats || take < Math.ceil(k / 2)) continue;
      take = Math.min(take, maxBeats);
      shotsOf[c]!.push(take);
      capacity[c] = left - take;
      budget -= take;
      shots += 1;
      progressed = true;
    }
  }

  // Each shot's length comes from where its cut falls in the MASTER, snapped to the output frame grid: the stitch
  // resamples every shot to OUTPUT_FPS, so lengths of raw beats would each round by up to half a frame and the cuts
  // would drift off the beat as they add up. Snapping the cumulative positions keeps every cut within half a frame.
  // A cut after b beats sits at leadInSec + b·unit (the first shot starts at 0 and carries the lead-in).
  const order = durations.flatMap((_, c) => shotsOf[c]!.map((beats) => ({ c, beats })));
  const lens: number[] = [];
  let beatsSoFar = 0;
  for (const { beats } of order) {
    const t0 = beatsSoFar === 0 ? 0 : Math.round((leadInSec + beatsSoFar * unit) * OUTPUT_FPS);
    beatsSoFar += beats;
    lens.push((Math.round((leadInSec + beatsSoFar * unit) * OUTPUT_FPS) - t0) / OUTPUT_FPS);
  }
  if (explicit) {
    // An asked length is met to the frame: what the whole beats leave over (less than a shot) is added to the last
    // shots, last first, within each clip's footage and the renderer's longest shot. Every inner cut stays on its
    // beat; only the master's end moves, to where the user asked it to be.
    const want = Math.round(target * OUTPUT_FPS);
    let rem = want - Math.round(lens.reduce((s, len) => s + len, 0) * OUTPUT_FPS);
    const usedOf = durations.map((_, c) => order.reduce((s, o, i) => (o.c === c ? s + lens[i]! : s), 0));
    for (let i = order.length - 1; i >= 0 && rem > 0; i -= 1) {
      const c = order[i]!.c;
      const roomClip = still(c) ? Number.POSITIVE_INFINITY : Math.floor((durations[c]! - usedOf[c]! + 1e-6) * OUTPUT_FPS);
      const roomShot = Math.floor((input.maxShotSec - frameSec - lens[i]! + 1e-6) * OUTPUT_FPS);
      const add = Math.max(0, Math.min(rem, roomClip, roomShot));
      if (!add) continue;
      lens[i] = (Math.round(lens[i]! * OUTPUT_FPS) + add) / OUTPUT_FPS;
      usedOf[c] = usedOf[c]! + add / OUTPUT_FPS;
      rem -= add;
    }
    if (rem > 0) {
      return fail(`the clips cannot fill the ${r3(target)}s asked within ${input.maxShots} shots`, grid, { kind: 'footage_too_short', clips: n, footageSec: r3(footage), targetSec: r3(target) });
    }
  }

  // ── speed ramps: each shot's speed from the music under it; its length on the master never changes ─────────────────
  const speeds = lens.map(() => 1);
  let ramp: RampResult | undefined;
  if (input.ramp) {
    const env = input.ramp.energy;
    const energies: number[] = [];
    if (env && env.values.length) {
      let t = 0;
      for (const len of lens) { energies.push(energyBetween(env, musicStartSec + t, musicStartSec + t + len)); t += len; }
      const got = rampSpeeds(energies, input.ramp.mode, order.map((o) => !still(o.c)));
      got.forEach((v, i) => { speeds[i] = v; });
    }
    // A faster shot reads more of its clip: a clip without the footage for it keeps its weakest fast shots at 1×.
    let kept = 0;
    durations.forEach((d, c) => {
      if (still(c)) return;
      const mine = order.map((o, i) => (o.c === c ? i : -1)).filter((i) => i >= 0);
      const need = () => mine.reduce((s, i) => s + lens[i]! * speeds[i]!, 0);
      const fast = mine.filter((i) => speeds[i]! > 1).sort((x, y) => (energies[x] ?? 0) - (energies[y] ?? 0) || y - x);
      while (need() > d + 1e-6 && fast.length) { speeds[fast.shift()!] = 1; kept += 1; }
    });
    ramp = {
      mode: input.ramp.mode, slow: speeds.filter((v) => v < 1).length, fast: speeds.filter((v) => v > 1).length,
      byEnergy: Boolean(env && env.values.length), keptForFootage: kept,
    };
  }

  const cuts: PlannedCut[] = [];
  let next = 0;
  durations.forEach((d, c) => {
    const own = shotsOf[c]!;
    if (!own.length) return;
    const mine = lens.slice(next, next + own.length);
    const sp = speeds.slice(next, next + own.length);
    next += own.length;
    // Spread the clip's shots across it with equal gaps, so a long clip is sampled, not just its opening seconds. A
    // still's one shot starts at 0 (the lane renders it for exactly the shot's length). A ramped shot reads its length
    // × its speed of the clip.
    const used = mine.reduce((s, len, j) => s + len * sp[j]!, 0);
    const gap = still(c) ? 0 : Math.max(0, d - used) / (own.length + 1);
    let at = gap;
    own.forEach((beats, j) => {
      const src = mine[j]! * sp[j]!;
      const start = Math.max(0, Math.min(at, d - src));
      cuts.push({ clip: c, startSec: r3(start), endSec: r3(start + src), beats, ...(sp[j] !== 1 ? { speed: sp[j]! } : {}) });
      at = start + src + gap;
    });
  });
  const totalSec = r3(lens.reduce((s, len) => s + len, 0));
  // The invariant, checked on the result itself: a plan that leaves any clip out is not a plan.
  const unused = durations.map((_, c) => c).filter((c) => !cuts.some((cut) => cut.clip === c));
  if (unused.length) return fail(`clip ${unused.map((c) => c + 1).join(', ')} got no shot`, grid, musicProblem());
  return {
    ok: true,
    cuts,
    musicStartSec: r3(musicStartSec),
    leadInSec: r3(leadInSec),
    totalSec,
    beatSynced: Boolean(grid),
    bpm: grid?.bpm ?? null,
    unitSec: r3(unit),
    beatsPerShot: k,
    unusedClips: [],
    ...(ramp ? { ramp } : {}),
  };
}
