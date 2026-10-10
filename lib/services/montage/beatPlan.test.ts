/**
 * The beat planner, against synthetic tracks whose beat is known exactly: clicks at a set tempo and phase, with and
 * without off-beat hats, and tracks with no pulse at all (noise, silence), which must NOT come back as "on the beat".
 */
import {
  ANALYSIS_HOP,
  ANALYSIS_RATE,
  OUTPUT_FPS,
  estimateBeatGrid,
  onsetStrength,
  musicStartOnBeat,
  planBeatCuts,
  type BeatGrid,
} from './beatPlan';
import { MAX_SHOTS, MAX_SHOT_SEC, MAX_TOTAL_SEC, MIN_SHOT_SEC, validateMontageRequest, timelineDuration } from './montagePlan';

/** A deterministic pseudo-random generator, so the noise tests never flake. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Clicks (a 15 ms decaying noise burst) every beat from `phaseSec`, optional quieter hats half a beat later. */
function clickTrack(bpm: number, phaseSec: number, seconds: number, opts: { hats?: boolean; noise?: number } = {}): Int16Array {
  const n = Math.round(seconds * ANALYSIS_RATE);
  const out = new Float32Array(n);
  const rand = rng(7);
  const period = 60 / bpm;
  const burst = (at: number, amp: number) => {
    const start = Math.round(at * ANALYSIS_RATE);
    const len = Math.round(0.015 * ANALYSIS_RATE);
    for (let i = 0; i < len && start + i < n; i += 1) out[start + i]! += amp * (rand() * 2 - 1) * Math.exp(-i / (len / 4));
  };
  for (let t = phaseSec; t < seconds; t += period) {
    burst(t, 0.8);
    if (opts.hats) burst(t + period / 2, 0.25);
  }
  if (opts.noise) for (let i = 0; i < n; i += 1) out[i]! += opts.noise * (rand() * 2 - 1);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i += 1) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(out[i]! * 32767)));
  return pcm;
}

const HOP_SEC = ANALYSIS_HOP / ANALYSIS_RATE;
const grid = (pcm: Int16Array) => estimateBeatGrid(onsetStrength(pcm), HOP_SEC);

describe('estimateBeatGrid finds the tempo and the first beat', () => {
  test.each([
    [120, 0.2],
    [95, 0.41],
    [128, 0.05],
    [140, 0.3],
    [76, 0.6],
  ])('%s BPM, first beat at %ss', (bpm, phase) => {
    const g = grid(clickTrack(bpm, phase, 30));
    expect(g).not.toBeNull();
    expect(Math.abs(g!.bpm - bpm)).toBeLessThan(1.5);
    // The phase is the first beat: within two onset frames of where the clicks start.
    const period = 60 / bpm;
    const off = Math.abs(((g!.phaseSec - phase) % period + period) % period);
    expect(Math.min(off, period - off)).toBeLessThan(2 * HOP_SEC + 1e-9);
  });

  test('off-beat hats do not double the tempo, and a little noise does not hide the beat', () => {
    const g = grid(clickTrack(100, 0.1, 30, { hats: true, noise: 0.02 }));
    expect(g).not.toBeNull();
    expect(Math.abs(g!.bpm - 100)).toBeLessThan(1.5);
  });

  test('a track with no pulse has no grid: noise, silence, and too little audio', () => {
    const rand = rng(3);
    const noise = new Int16Array(ANALYSIS_RATE * 20).map(() => Math.round((rand() * 2 - 1) * 8000));
    expect(grid(noise)).toBeNull();
    expect(grid(new Int16Array(ANALYSIS_RATE * 20))).toBeNull();
    expect(grid(new Int16Array(100))).toBeNull();
  });
});

const G120: BeatGrid = { bpm: 120, periodSec: 0.5, phaseSec: 0.2, confidence: 3 };
const LIMITS = { maxShots: MAX_SHOTS, maxTotalSec: MAX_TOTAL_SEC, minShotSec: MIN_SHOT_SEC, maxShotSec: MAX_SHOT_SEC };

/** Every cut's position in the master, from the plan's own shot lengths. */
function cutPositions(plan: ReturnType<typeof planBeatCuts>): number[] {
  const out: number[] = [];
  let t = 0;
  for (const c of plan.cuts) {
    t += c.endSec - c.startSec;
    out.push(t);
  }
  return out;
}

describe('planBeatCuts lays the clips on the beat', () => {
  test('three 20 s clips under a 120 BPM song: a 30 s Reel of 3 s shots, music from the first beat', () => {
    const plan = planBeatCuts({ clipDurationsSec: [20, 20, 20], musicSec: 180, grid: G120, ...LIMITS });
    expect(plan.ok).toBe(true);
    expect(plan.beatSynced).toBe(true);
    expect(plan.bpm).toBe(120);
    expect(plan.musicStartSec).toBe(0.2);
    expect(plan.beatsPerShot).toBe(6);
    expect(plan.totalSec).toBe(30);
    expect(plan.cuts).toHaveLength(10);
    // Clip order is kept, and every clip is used.
    expect(plan.cuts.map((c) => c.clip)).toEqual([0, 0, 0, 0, 1, 1, 1, 2, 2, 2]);
    expect(plan.unusedClips).toEqual([]);
    // Within each clip the shots move forward and spread across it.
    const first = plan.cuts.filter((c) => c.clip === 0);
    for (let i = 1; i < first.length; i += 1) expect(first[i]!.startSec).toBeGreaterThanOrEqual(first[i - 1]!.endSec);
    expect(first[0]!.startSec).toBeGreaterThan(0);
    expect(first[first.length - 1]!.endSec).toBeLessThanOrEqual(20);
  });

  test('every cut lands on a beat and on a frame, with no drift at an awkward tempo', () => {
    const g: BeatGrid = { bpm: 127, periodSec: 60 / 127, phaseSec: 0.13, confidence: 2 };
    const plan = planBeatCuts({ clipDurationsSec: [40, 25, 33, 18], musicSec: 240, grid: g, targetSec: 90, ...LIMITS });
    expect(plan.ok).toBe(true);
    let beats = 0;
    plan.cuts.forEach((c, i) => {
      beats += c.beats;
      const at = cutPositions(plan)[i]!;
      expect(Math.abs(at * OUTPUT_FPS - Math.round(at * OUTPUT_FPS))).toBeLessThan(0.02); // on a frame (3-decimal rounding)
      expect(Math.abs(at - beats * g.periodSec)).toBeLessThanOrEqual(0.5 / OUTPUT_FPS + 0.002); // on the beat
    });
  });

  test('never more than MAX_SHOTS shots, and each shot inside the renderer limits', () => {
    const plan = planBeatCuts({ clipDurationsSec: Array(8).fill(60), musicSec: 600, grid: G120, targetSec: 300, ...LIMITS });
    expect(plan.ok).toBe(true);
    expect(plan.cuts.length).toBeLessThanOrEqual(MAX_SHOTS);
    expect(plan.totalSec).toBeLessThanOrEqual(MAX_TOTAL_SEC);
    for (const c of plan.cuts) {
      expect(c.endSec - c.startSec).toBeGreaterThanOrEqual(MIN_SHOT_SEC);
      expect(c.endSec - c.startSec).toBeLessThanOrEqual(MAX_SHOT_SEC);
    }
  });

  test('footage that cannot fill the length asked for ends a little early rather than on a sliver of a shot', () => {
    const plan = planBeatCuts({ clipDurationsSec: [12, 12, 12], musicSec: 180, grid: G120, ...LIMITS });
    expect(plan.ok).toBe(true);
    expect(plan.totalSec).toBeGreaterThanOrEqual(29);
    expect(plan.totalSec).toBeLessThanOrEqual(30);
    for (const c of plan.cuts) expect(c.beats).toBeGreaterThanOrEqual(3);
  });

  test('the edit is never longer than the footage, the music, or the length asked for', () => {
    expect(planBeatCuts({ clipDurationsSec: [4, 4], musicSec: 200, grid: G120, ...LIMITS }).totalSec).toBeLessThanOrEqual(8);
    expect(planBeatCuts({ clipDurationsSec: [60, 60], musicSec: 12.2, grid: G120, ...LIMITS }).totalSec).toBeLessThanOrEqual(12);
    expect(planBeatCuts({ clipDurationsSec: [60, 60], musicSec: 200, grid: G120, targetSec: 15, ...LIMITS }).totalSec).toBeLessThanOrEqual(15);
  });

  test('a short clip still appears with a shorter whole-beat shot; one too short for any shot is named, not dropped silently', () => {
    const plan = planBeatCuts({ clipDurationsSec: [10, 1.2, 0.3, 10], musicSec: 120, grid: G120, ...LIMITS });
    expect(plan.ok).toBe(true);
    const short = plan.cuts.filter((c) => c.clip === 1);
    expect(short).toHaveLength(1);
    expect(short[0]!.beats).toBe(2);
    expect(plan.unusedClips).toEqual([2]);
  });

  test('no pulse: even cuts on a half-second grid, reported as not beat-synced, music from the top', () => {
    const plan = planBeatCuts({ clipDurationsSec: [10, 10], musicSec: 60, grid: null, ...LIMITS });
    expect(plan.ok).toBe(true);
    expect(plan.beatSynced).toBe(false);
    expect(plan.bpm).toBeNull();
    expect(plan.musicStartSec).toBe(0);
    expect(plan.unitSec).toBe(0.5);
  });

  test('impossible inputs fail with a reason instead of a broken plan', () => {
    expect(planBeatCuts({ clipDurationsSec: [], musicSec: 60, grid: G120, ...LIMITS }).ok).toBe(false);
    expect(planBeatCuts({ clipDurationsSec: [10], musicSec: 0, grid: G120, ...LIMITS }).ok).toBe(false);
    expect(planBeatCuts({ clipDurationsSec: [0.2, 0.1], musicSec: 60, grid: G120, ...LIMITS }).ok).toBe(false);
    expect(planBeatCuts({ clipDurationsSec: [10], musicSec: 0.3, grid: G120, ...LIMITS }).error).toMatch(/shorter/);
  });

  test('the plan, as a montage request, passes the renderer validation and keeps its length', () => {
    const plan = planBeatCuts({ clipDurationsSec: [12.4, 7.9, 21], musicSec: 95, grid: G120, targetSec: 40, ...LIMITS });
    const body = {
      shots: plan.cuts.map((c) => ({ url: `https://x.supabase.co/c${c.clip}.mp4`, kind: 'video', startSec: c.startSec, endSec: c.endSec, transition: 'cut' })),
      aspect: '9:16',
      musicUrl: 'https://x.supabase.co/song.mp3',
      musicStartSec: plan.musicStartSec,
      musicOnly: true,
    };
    const v = validateMontageRequest(body);
    expect(v.ok).toBe(true);
    expect(Math.abs(timelineDuration(v.request!.shots) - plan.totalSec)).toBeLessThan(0.01);
  });
});

describe('the music starts where the user asked (Agent G PART 1, „მუსიკა 5 წამიდან დაიწყე")', () => {
  test('on the first beat at or after the asked second', () => {
    expect(musicStartOnBeat(G120, 5)).toBeCloseTo(5.2, 6);
    expect(musicStartOnBeat(G120, 5.2)).toBeCloseTo(5.2, 6);
    expect(musicStartOnBeat(G120, 0)).toBe(0.2);
    expect(musicStartOnBeat(G120, 0.1)).toBe(0.2);
    expect(musicStartOnBeat(null, 5)).toBe(5);
    expect(musicStartOnBeat(null, -3)).toBe(0);
  });

  test('the plan starts there, still cuts on the beat, and has less music to fill', () => {
    const plan = planBeatCuts({ clipDurationsSec: [20, 20, 20], musicSec: 40, grid: G120, musicFromSec: 5, ...LIMITS });
    expect(plan.ok).toBe(true);
    expect(plan.musicStartSec).toBe(5.2);
    expect(plan.totalSec).toBeLessThanOrEqual(40 - 5.2);
    // The montage body carries the start into the render.
    const plain = planBeatCuts({ clipDurationsSec: [20, 20, 20], musicSec: 40, grid: G120, ...LIMITS });
    expect(plain.musicStartSec).toBe(0.2);
  });

  test('a start past the end of the track is refused by name, not silently moved', () => {
    const plan = planBeatCuts({ clipDurationsSec: [20, 20], musicSec: 30, grid: null, musicFromSec: 45, ...LIMITS });
    expect(plan).toMatchObject({ ok: false, error: 'the track ends before 45s' });
  });
});
