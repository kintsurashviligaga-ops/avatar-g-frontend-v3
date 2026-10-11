/**
 * A montage with no music (GG 2026-10-11 17:38Z: „თუ მუსიკა არ ავტვირთე, ვიდეოს დამონტაჟებას არ იწყებს"): every clip
 * one stretch in the order sent, every photo STILL_SHOT_SEC, an asked length binding, nothing left out.
 */
import { OUTPUT_FPS } from './beatPlan';
import { STILL_SHOT_SEC, planJoin, type JoinInput } from './joinPlan';
import { MAX_SHOTS, MAX_SHOT_SEC, MAX_TOTAL_SEC, MIN_SHOT_SEC } from './montagePlan';

const LIMITS = { maxShots: MAX_SHOTS, maxTotalSec: MAX_TOTAL_SEC, minShotSec: MIN_SHOT_SEC, maxShotSec: MAX_SHOT_SEC };
const plan = (input: Omit<JoinInput, keyof typeof LIMITS> & Partial<typeof LIMITS>) => planJoin({ ...LIMITS, ...input });
const len = (c: { startSec: number; endSec: number }) => c.endSec - c.startSec;
/** Every shot boundary on a whole output frame (to the millisecond the plan is written in). */
const onFrames = (n: number) => Math.abs(n * OUTPUT_FPS - Math.round(n * OUTPUT_FPS)) < 0.02;

describe('planJoin', () => {
  test('no length asked: every clip whole (less the tail guard), in order, one shot each', () => {
    const p = plan({ clipDurationsSec: [8, 5, 3] });
    expect(p.ok).toBe(true);
    expect(p.cuts.map((c) => c.clip)).toEqual([0, 1, 2]);
    expect(p.cuts.map((c) => c.startSec)).toEqual([0, 0, 0]);
    // 7.95 s, 4.95 s, 2.95 s in whole frames, never past the end of the clip.
    expect(p.cuts.map(len).map((x) => Number(x.toFixed(3)))).toEqual([7.933, 4.933, 2.933]);
    expect(p.totalSec).toBe(15.8);
    expect(p).toMatchObject({ beatSynced: false, bpm: null, musicStartSec: 0, unusedClips: [] });
    expect(p.shortened).toBeUndefined();
    expect(p.cuts.every((c) => onFrames(c.startSec) && onFrames(c.endSec))).toBe(true);
  });

  test('photos: STILL_SHOT_SEC each, in their place among the clips', () => {
    const p = plan({ clipDurationsSec: [6, 0, 4], stills: [false, true, false] });
    expect(p.ok).toBe(true);
    expect(p.cuts.map((c) => c.clip)).toEqual([0, 1, 2]);
    expect(len(p.cuts[1]!)).toBe(STILL_SHOT_SEC);
    const photos = plan({ clipDurationsSec: [0, 0, 0, 0], stills: [true, true, true, true] });
    expect(photos).toMatchObject({ ok: true, totalSec: 12 });
    expect(photos.cuts.map(len)).toEqual([3, 3, 3, 3]);
  });

  test('a clip longer than one shot plays on as consecutive shots, cut where nothing changes', () => {
    const p = plan({ clipDurationsSec: [130, 10] });
    expect(p.ok).toBe(true);
    const first = p.cuts.filter((c) => c.clip === 0);
    expect(first.length).toBe(3);
    expect(first.every((c) => len(c) <= MAX_SHOT_SEC)).toBe(true);
    for (let k = 1; k < first.length; k += 1) expect(first[k]!.startSec).toBe(first[k - 1]!.endSec);
  });

  test('past one edit with no length asked: every clip gives the same share from its middle, and the plan says so', () => {
    const p = plan({ clipDurationsSec: [200, 200] });
    expect(p.ok).toBe(true);
    expect(p.totalSec).toBe(MAX_TOTAL_SEC);
    expect(p.shortened).toMatchObject({ maxSec: MAX_TOTAL_SEC });
    expect(p.shortened!.share).toBeCloseTo(0.75, 2);
    const a = p.cuts.filter((c) => c.clip === 0);
    const b = p.cuts.filter((c) => c.clip === 1);
    expect(a.reduce((s, c) => s + len(c), 0)).toBeCloseTo(150, 1);
    expect(b.reduce((s, c) => s + len(c), 0)).toBeCloseTo(150, 1);
    // From its middle: about 25 s left out at each end.
    expect(a[0]!.startSec).toBeCloseTo(25, 0);
  });

  test('an asked length is binding: met to the frame, the clips sharing it alike, photos keeping their time', () => {
    const p = plan({ clipDurationsSec: [10, 0, 20], stills: [false, true, false], targetSec: 15 });
    expect(p).toMatchObject({ ok: true, totalSec: 15 });
    const sum = p.cuts.reduce((s, c) => s + len(c), 0);
    expect(sum).toBeCloseTo(15, 3);
    expect(len(p.cuts.find((c) => c.clip === 1)!)).toBe(STILL_SHOT_SEC);
    const v0 = p.cuts.filter((c) => c.clip === 0).reduce((s, c) => s + len(c), 0);
    const v2 = p.cuts.filter((c) => c.clip === 2).reduce((s, c) => s + len(c), 0);
    expect(v2 / v0).toBeCloseTo(2, 1);
  });

  test('photos alone stretch to an asked length (a narration\'s), within one shot each', () => {
    const p = plan({ clipDurationsSec: [0, 0, 0], stills: [true, true, true], targetSec: 12 });
    expect(p).toMatchObject({ ok: true, totalSec: 12 });
    expect(p.cuts.map(len)).toEqual([4, 4, 4]);
  });

  test('refusals name the cause with the numbers, never a shorter master', () => {
    expect(plan({ clipDurationsSec: [10, 0.3] })).toMatchObject({ ok: false, problem: { kind: 'clip_too_short', clips: [1] } });
    expect(plan({ clipDurationsSec: [10, 10], targetSec: 400 })).toMatchObject({ ok: false, problem: { kind: 'target_too_long', targetSec: 400, maxSec: MAX_TOTAL_SEC } });
    expect(plan({ clipDurationsSec: [10, 10], targetSec: 30 })).toMatchObject({ ok: false, problem: { kind: 'footage_too_short', clips: 2 } });
    expect(plan({ clipDurationsSec: [10, 10, 10], targetSec: 1 })).toMatchObject({ ok: false, problem: { kind: 'target_too_short', clips: 3 } });
    expect(plan({ clipDurationsSec: Array(MAX_SHOTS + 1).fill(5) })).toMatchObject({ ok: false, problem: { kind: 'too_many_clips' } });
    expect(plan({ clipDurationsSec: [] })).toMatchObject({ ok: false });
  });

  test('never throws on garbage lengths', () => {
    expect(() => plan({ clipDurationsSec: [Number.NaN, -1, Infinity] })).not.toThrow();
    expect(plan({ clipDurationsSec: [Number.NaN, 5] })).toMatchObject({ ok: false, problem: { kind: 'clip_too_short', clips: [0] } });
  });
});
