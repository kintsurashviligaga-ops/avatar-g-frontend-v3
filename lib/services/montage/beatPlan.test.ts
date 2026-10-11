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
  energyBetween,
  energyEnvelope,
  rampSpeeds,
  RAMP_FAST,
  RAMP_SLOW,
  type BeatGrid,
  type EnergyEnvelope,
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
    // The master's own end is where the user asked it to be (90 s, below); every cut before it is on a beat.
    expect(plan.totalSec).toBe(90);
    plan.cuts.slice(0, -1).forEach((c, i) => {
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
    expect(planBeatCuts({ clipDurationsSec: [60, 60], musicSec: 200, grid: G120, targetSec: 15, ...LIMITS }).totalSec).toBe(15);
  });

  test('a short clip still appears with a shorter whole-beat shot', () => {
    const plan = planBeatCuts({ clipDurationsSec: [10, 1.2, 10], musicSec: 120, grid: G120, ...LIMITS });
    expect(plan.ok).toBe(true);
    const short = plan.cuts.filter((c) => c.clip === 1);
    expect(short).toHaveLength(1);
    expect(short[0]!.beats).toBe(2);
    expect(plan.unusedClips).toEqual([]);
  });

  // The owner's invariant (2026-10-11): "If 3 videos are required, an output made from only 1 or 2 is not a completed
  // task." A clip that cannot get a shot fails the plan by name; it is never left out of a plan that says ok.
  test('a clip too short for any shot fails the plan and is named (never left out of an ok plan)', () => {
    const plan = planBeatCuts({ clipDurationsSec: [10, 1.2, 0.3, 10], musicSec: 120, grid: G120, ...LIMITS });
    expect(plan.ok).toBe(false);
    expect(plan.cuts).toEqual([]);
    expect(plan.problem).toEqual({ kind: 'clip_too_short', clips: [2], minShotSec: expect.any(Number) });
    expect(plan.error).toMatch(/^clip 3 shorter than one/);
  });

  test('every clip gets a shot, in the user order, even when the first clips are long and the length is tight', () => {
    for (const durations of [[60, 60, 2.5], [3, 3, 3], [40, 1.5, 40, 1.5, 40], [9, 9, 9, 9, 9, 9, 9, 9]]) {
      for (const targetSec of [6, 10, 20, 60]) {
        const plan = planBeatCuts({ clipDurationsSec: durations, musicSec: 120, grid: G120, targetSec, ...LIMITS });
        if (!plan.ok) {
          // Only a length too short for one shot per clip, or longer than the footage, may refuse, in numbers.
          expect(['target_too_short', 'footage_too_short']).toContain(plan.problem?.kind);
          continue;
        }
        expect(new Set(plan.cuts.map((c) => c.clip))).toEqual(new Set(durations.map((_, i) => i)));
        // The user's order: all of the first clip's shots, then the second's, … (never a later clip before an earlier one).
        const order = plan.cuts.map((c) => c.clip);
        expect(order).toEqual([...order].sort((x, y) => x - y));
        expect(plan.unusedClips).toEqual([]);
      }
    }
  });

  test('music, asked length or shot ceiling too short for one shot per clip: refused with the numbers, no clip dropped', () => {
    const music = planBeatCuts({ clipDurationsSec: [10, 10, 10], musicSec: 1.6, grid: G120, ...LIMITS });
    expect(music.ok).toBe(false);
    expect(music.problem).toMatchObject({ kind: 'music_too_short', clips: 3 });
    expect((music.problem as { neededSec: number }).neededSec).toBeGreaterThan((music.problem as { musicSec: number }).musicSec);
    const target = planBeatCuts({ clipDurationsSec: [10, 10, 10, 10], musicSec: 120, grid: G120, targetSec: 1, ...LIMITS });
    expect(target.ok).toBe(false);
    expect(target.problem).toMatchObject({ kind: 'target_too_short', clips: 4, targetSec: 1 });
    const many = planBeatCuts({ clipDurationsSec: Array.from({ length: LIMITS.maxShots + 1 }, () => 10), musicSec: 600, grid: G120, ...LIMITS });
    expect(many.problem).toEqual({ kind: 'too_many_clips', clips: LIMITS.maxShots + 1, maxShots: LIMITS.maxShots });
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

  test('the plan starts EXACTLY there, the first shot carries the lead-in, later cuts land on the beat', () => {
    const plan = planBeatCuts({ clipDurationsSec: [20, 20, 20], musicSec: 40, grid: G120, musicFromSec: 5, ...LIMITS });
    expect(plan.ok).toBe(true);
    expect(plan.musicStartSec).toBe(5);
    expect(plan.leadInSec).toBe(0.2);
    expect(plan.totalSec).toBeLessThanOrEqual(40 - 5);
    // Cut positions in the TRACK (start + position in the master) sit on the 120 BPM grid (beats at 0.2 + k·0.5).
    for (const at of cutPositions(plan).slice(0, -1)) {
      const inTrack = 5 + at;
      expect(Math.abs((inTrack - 0.2) / 0.5 - Math.round((inTrack - 0.2) / 0.5))).toBeLessThan(0.05);
    }
    // The montage body carries the start into the render.
    const plain = planBeatCuts({ clipDurationsSec: [20, 20, 20], musicSec: 40, grid: G120, ...LIMITS });
    expect(plain.musicStartSec).toBe(0.2);
  });

  test('an asked length is binding: 0:58 + 70 s needs the track to 2:08, else refused (never looped, never shorter)', () => {
    const clips = [20, 20, 20, 20, 20];
    const ok = planBeatCuts({ clipDurationsSec: clips, musicSec: 130, grid: G120, musicFromSec: 58, targetSec: 70, ...LIMITS });
    expect(ok.ok).toBe(true);
    expect(ok.musicStartSec).toBe(58);
    expect(ok.totalSec).toBe(70);
    expect(new Set(ok.cuts.map((c) => c.clip))).toEqual(new Set([0, 1, 2, 3, 4]));
    const short = planBeatCuts({ clipDurationsSec: clips, musicSec: 120, grid: G120, musicFromSec: 58, targetSec: 70, ...LIMITS });
    expect(short.ok).toBe(false);
    expect(short.problem).toMatchObject({ kind: 'music_too_short', fromSec: 58, musicSec: 62, targetSec: 70 });
    const footage = planBeatCuts({ clipDurationsSec: [10, 10, 10], musicSec: 300, grid: G120, targetSec: 70, ...LIMITS });
    expect(footage.problem).toMatchObject({ kind: 'footage_too_short', clips: 3, targetSec: 70 });
    const long = planBeatCuts({ clipDurationsSec: [200, 200], musicSec: 900, grid: G120, targetSec: 400, ...LIMITS });
    expect(long.problem).toEqual({ kind: 'target_too_long', targetSec: 400, maxSec: LIMITS.maxTotalSec });
  });

  test('60, 70, 80 and 90 s asked are met to the frame on a real-looking set of clips', () => {
    for (const targetSec of [60, 70, 80, 90]) {
      const plan = planBeatCuts({ clipDurationsSec: [31.2, 17.9, 44, 12.6, 25.5, 19.1, 8.4], musicSec: 240, grid: { bpm: 97, periodSec: 60 / 97, phaseSec: 0.31, confidence: 1 }, musicFromSec: 32, targetSec, ...LIMITS });
      expect(plan.ok).toBe(true);
      expect(plan.totalSec).toBe(targetSec);
      expect(new Set(plan.cuts.map((c) => c.clip)).size).toBe(7);
      for (const c of plan.cuts) expect(c.endSec - c.startSec).toBeLessThanOrEqual(MAX_SHOT_SEC);
    }
  });

  test('a start past the end of the track is refused by name, not silently moved', () => {
    const plan = planBeatCuts({ clipDurationsSec: [20, 20], musicSec: 30, grid: null, musicFromSec: 45, ...LIMITS });
    expect(plan).toMatchObject({ ok: false, error: 'the track ends before 45s' });
  });
});

describe('a photo among the clips is one still shot (owner, 2026-10-11 11:37Z: 4 clips + a photo + an MP3)', () => {
  test('the photo gets exactly one shot from 0, on the beat, never refused as too short; every clip still appears', () => {
    // The photo's "length" (0) is ignored: a still has no length of its own.
    const plan = planBeatCuts({ clipDurationsSec: [20, 20, 0, 20, 20], stills: [false, false, true, false, false], musicSec: 120, grid: G120, targetSec: 30, ...LIMITS });
    expect(plan.ok).toBe(true);
    const photo = plan.cuts.filter((c) => c.clip === 2);
    expect(photo).toHaveLength(1);
    expect(photo[0]!.startSec).toBe(0);
    expect(photo[0]!.endSec).toBeGreaterThanOrEqual(MIN_SHOT_SEC);
    expect(photo[0]!.endSec).toBeLessThanOrEqual(MAX_SHOT_SEC);
    expect(new Set(plan.cuts.map((c) => c.clip))).toEqual(new Set([0, 1, 2, 3, 4]));
    // The clips around it get the rest of the length (more than one shot each), the photo never a second.
    expect(plan.cuts.length).toBeGreaterThan(5);
    expect(plan.totalSec).toBeLessThanOrEqual(30);
  });

  test('without `stills` a 0 s entry is still refused as too short (the flag, not the length, makes a photo)', () => {
    const plan = planBeatCuts({ clipDurationsSec: [20, 0, 20], musicSec: 120, grid: G120, ...LIMITS });
    expect(plan).toMatchObject({ ok: false, problem: { kind: 'clip_too_short', clips: [1] } });
  });

  test('as a montage request the photo shot is an image shot the renderer accepts, and the length holds', () => {
    const stills = [false, true, false];
    const plan = planBeatCuts({ clipDurationsSec: [12.4, 0, 21], stills, musicSec: 95, grid: G120, targetSec: 30, ...LIMITS });
    expect(plan.ok).toBe(true);
    const body = {
      shots: plan.cuts.map((c) => ({
        url: `https://x.supabase.co/c${c.clip}.${stills[c.clip] ? 'jpg' : 'mp4'}`, kind: stills[c.clip] ? 'image' : 'video',
        startSec: c.startSec, endSec: c.endSec, transition: 'cut',
      })),
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

// ── speed ramps (owner 2026-10-11: „სადაც საჭიროა ააჩქარე კადრი და სადაც საჭიროა შეანელე") ─────────────────────────────

/** A click track whose loudness steps: quiet for `quietSec`, then loud, so the music's strength is known exactly. */
function quietThenLoud(bpm: number, quietSec: number, seconds: number): Int16Array {
  const pcm = clickTrack(bpm, 0.2, seconds, { hats: true });
  const cut = Math.round(quietSec * ANALYSIS_RATE);
  for (let i = 0; i < cut; i += 1) pcm[i] = Math.round(pcm[i]! * 0.05);
  return pcm;
}

/** Each cut's end on the master: a shot lasts its source window ÷ its speed. */
function masterCuts(plan: ReturnType<typeof planBeatCuts>): number[] {
  let t = 0;
  return plan.cuts.map((c) => (t += (c.endSec - c.startSec) / (c.speed ?? 1)));
}

describe('energyEnvelope reads where the music is calm and where it is strong', () => {
  test('a quiet stretch scores lower than the loud one after it, block by block', () => {
    const env = energyEnvelope(quietThenLoud(120, 10, 20));
    expect(env.blockSec).toBeGreaterThan(0.4);
    expect(env.blockSec).toBeLessThan(0.6);
    expect(env.values.length).toBeGreaterThanOrEqual(38);
    expect(energyBetween(env, 0, 9)).toBeLessThan(energyBetween(env, 11, 20));
  });

  test('silence and nothing are flat (no strength to choose by)', () => {
    const env = energyEnvelope(new Int16Array(ANALYSIS_RATE * 4));
    expect([...env.values].every((v) => v === 0)).toBe(true);
    expect(energyEnvelope(new Int16Array(10)).values.length).toBe(0);
    expect(energyBetween({ blockSec: 0.5, values: new Float32Array(0) }, 0, 3)).toBe(0);
  });
});

describe('rampSpeeds: the calmest shots slow down, the strongest speed up', () => {
  const e = [0.1, -1.2, 0.4, 1.5, -0.3, 0.9, -0.8, 2.0];
  test('mixed: a quarter each way, never the same shot', () => {
    const sp = rampSpeeds(e, 'mixed');
    expect(sp.filter((v) => v === RAMP_SLOW)).toHaveLength(2);
    expect(sp.filter((v) => v === RAMP_FAST)).toHaveLength(2);
    expect(sp[1]).toBe(RAMP_SLOW); // the calmest
    expect(sp[6]).toBe(RAMP_SLOW);
    expect(sp[7]).toBe(RAMP_FAST); // the strongest
    expect(sp[3]).toBe(RAMP_FAST);
  });
  test('one way only: a third of the shots, that way', () => {
    expect(rampSpeeds(e, 'slow').filter((v) => v === RAMP_SLOW)).toHaveLength(3);
    expect(rampSpeeds(e, 'slow').some((v) => v > 1)).toBe(false);
    expect(rampSpeeds(e, 'fast').filter((v) => v === RAMP_FAST)).toHaveLength(3);
    expect(rampSpeeds(e, 'fast').some((v) => v < 1)).toBe(false);
  });
  test('a still is never ramped, and too few shots ramp nothing', () => {
    const sp = rampSpeeds(e, 'mixed', [true, false, true, true, true, true, true, false]);
    expect(sp[1]).toBe(1);
    expect(sp[7]).toBe(1);
    expect(rampSpeeds([0.5], 'mixed')).toEqual([1]);
    expect(rampSpeeds([0.5], 'slow')).toEqual([RAMP_SLOW]);
  });
});

describe('planBeatCuts with ramps: shots change speed, every cut stays on its beat', () => {
  const pcm = quietThenLoud(120, 20, 60);
  const g = grid(pcm)!;
  const energy: EnergyEnvelope = energyEnvelope(pcm);

  test('slow shots in the quiet half, fast ones in the loud half; the master is as long as without ramps', () => {
    const base = planBeatCuts({ clipDurationsSec: [30, 30, 30, 30, 30], musicSec: 60, grid: g, ...LIMITS });
    const plan = planBeatCuts({ clipDurationsSec: [30, 30, 30, 30, 30], musicSec: 60, grid: g, ...LIMITS, ramp: { mode: 'mixed', energy } });
    expect(plan.ok).toBe(true);
    expect(plan.ramp).toMatchObject({ mode: 'mixed', byEnergy: true, keptForFootage: 0 });
    expect(plan.ramp!.slow).toBeGreaterThanOrEqual(1);
    expect(plan.ramp!.fast).toBeGreaterThanOrEqual(1);
    expect(plan.totalSec).toBe(base.totalSec);
    // The same cut points as the plan without ramps: a ramp changes what a shot shows, never where it ends.
    const a = masterCuts(base), b = masterCuts(plan);
    expect(b).toHaveLength(a.length);
    b.forEach((t, i) => expect(Math.abs(t - a[i]!)).toBeLessThan(0.002));
    // Where each ramped shot sits on the master: slow ones before the music turns loud, fast ones after.
    let t = 0;
    for (const c of plan.cuts) {
      const len = (c.endSec - c.startSec) / (c.speed ?? 1);
      const mid = plan.musicStartSec + t + len / 2;
      if (c.speed === RAMP_SLOW) expect(mid).toBeLessThan(20);
      if (c.speed === RAMP_FAST) expect(mid).toBeGreaterThan(20);
      // A shot plays its length × its speed of the clip, inside the clip.
      expect(c.startSec).toBeGreaterThanOrEqual(0);
      expect(c.endSec).toBeLessThanOrEqual(30 + 1e-6);
      t += len;
    }
  });

  test('a clip without the footage for a faster shot keeps it at normal speed, and says so', () => {
    // Two 8 s clips fill a 15 s edit: every shot already uses nearly all of its clip, so none can play 1.5× faster.
    const plan = planBeatCuts({ clipDurationsSec: [8, 8], musicSec: 60, grid: g, musicFromSec: 22, ...LIMITS, ramp: { mode: 'fast', energy } });
    expect(plan.ok).toBe(true);
    expect(plan.ramp!.keptForFootage).toBeGreaterThanOrEqual(1);
    expect(plan.ramp!.fast).toBe(0);
    for (const c of plan.cuts) expect(c.endSec).toBeLessThanOrEqual(8 + 1e-6);
  });

  test('no envelope: nothing is ramped, and the plan says it could not read the music', () => {
    const plan = planBeatCuts({ clipDurationsSec: [30, 30, 30], musicSec: 60, grid: g, ...LIMITS, ramp: { mode: 'mixed', energy: null } });
    expect(plan.ok).toBe(true);
    expect(plan.ramp).toEqual({ mode: 'mixed', slow: 0, fast: 0, byEnergy: false, keptForFootage: 0 });
    expect(plan.cuts.some((c) => c.speed !== undefined)).toBe(false);
  });

  test('photos are never ramped', () => {
    const plan = planBeatCuts({ clipDurationsSec: [30, 0, 30, 0], stills: [false, true, false, true], musicSec: 60, grid: g, ...LIMITS, ramp: { mode: 'mixed', energy } });
    expect(plan.ok).toBe(true);
    for (const c of plan.cuts) if (c.clip === 1 || c.clip === 3) expect(c.speed).toBeUndefined();
  });

  test('the ramped plan is a valid montage request', () => {
    const plan = planBeatCuts({ clipDurationsSec: [30, 30, 30, 30, 30], musicSec: 60, grid: g, ...LIMITS, ramp: { mode: 'mixed', energy } });
    const v = validateMontageRequest({
      shots: plan.cuts.map((c) => ({ url: `https://x.supabase.co/c${c.clip}.mp4`, kind: 'video', startSec: c.startSec, endSec: c.endSec, transition: 'cut', ...(c.speed ? { speed: c.speed } : {}) })),
      aspect: '9:16',
      musicUrl: 'https://x.supabase.co/song.mp3',
      musicStartSec: plan.musicStartSec,
      musicOnly: true,
    });
    expect(v.ok).toBe(true);
    expect(v.request!.shots.filter((x) => x.speed !== undefined).length).toBe(plan.ramp!.slow + plan.ramp!.fast);
    expect(Math.abs(timelineDuration(v.request!.shots) - plan.totalSec)).toBeLessThan(0.01);
  });
});
