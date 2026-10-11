/**
 * Transitions between a montage's shots (GG 2026-10-11 17:38Z: „ქაფქათს და სხვა ფუნქციებს რაც აკლია"): every overlap is
 * paid for with footage the shots did not use, so the beat and an asked length hold; what cannot be drawn is counted.
 */
import { MAX_SHOT_SEC, timelineDuration, transitionOverlap, type MontageShot } from './montagePlan';
import { DEFAULT_TRANSITION_SEC, MIXED_STYLES, planTransitions, type CutWindow, type TransitionInput } from './transitionPlan';

const plan = (over: Partial<TransitionInput> & Pick<TransitionInput, 'cuts' | 'clipDurationsSec'>) =>
  planTransitions({ ask: { styles: ['crossfade'] }, keepLength: true, maxShotSec: MAX_SHOT_SEC, ...over });
const len = (c: CutWindow) => (c.endSec - c.startSec) / (c.speed ?? 1);
const sum = (cs: readonly CutWindow[]) => Number(cs.reduce((s, c) => s + len(c), 0).toFixed(3));

/** The result as request shots, folded by the lane's own arithmetic (montagePlan timelineDuration). */
function asShots(cuts: readonly CutWindow[], r: ReturnType<typeof planTransitions>, stills: readonly boolean[] = []): MontageShot[] {
  return r.shots.map((s, k) => ({
    url: `https://x/${k}`, kind: stills[cuts[k]!.clip] ? 'image' : 'video', startSec: s.startSec, endSec: s.endSec, muted: false,
    transition: s.transition, ...(s.transitionSec !== undefined ? { transitionSec: s.transitionSec } : {}),
    ...(cuts[k]!.speed ? { speed: cuts[k]!.speed } : {}),
  }));
}

describe('planTransitions', () => {
  test('on the beat: the incoming shot starts earlier in its clip, so the edit keeps its length and every cut its place', () => {
    const cuts: CutWindow[] = [{ clip: 0, startSec: 2, endSec: 6 }, { clip: 1, startSec: 3, endSec: 7 }, { clip: 2, startSec: 1, endSec: 5 }];
    const r = plan({ cuts, clipDurationsSec: [10, 10, 10] });
    expect(r.summary).toMatchObject({ boundaries: 2, applied: 2, tooShort: 0, noFootage: 0, shortenedSec: 0, sec: DEFAULT_TRANSITION_SEC });
    expect(r.shots.map((s) => s.transition)).toEqual(['cut', 'crossfade', 'crossfade']);
    expect(r.shots.map((s) => [s.startSec, s.endSec])).toEqual([[2, 6], [2.5, 7], [0.5, 5]]);
    expect(r.totalSec).toBe(sum(cuts));
    // The lane folds it to the same length, and every overlap is exactly the planned one.
    const shots = asShots(cuts, r);
    expect(timelineDuration(shots)).toBe(r.totalSec);
    expect(transitionOverlap(4, 4.5, 0.5)).toBe(0.5);
  });

  test('a clip that starts at its first frame gives the outgoing shot a post-roll instead', () => {
    const cuts: CutWindow[] = [{ clip: 0, startSec: 0, endSec: 4 }, { clip: 1, startSec: 0, endSec: 4 }];
    const r = plan({ cuts, clipDurationsSec: [8, 8] });
    expect(r.shots[0]).toMatchObject({ startSec: 0, endSec: 4.5 });
    expect(r.shots[1]).toMatchObject({ startSec: 0, endSec: 4, transition: 'crossfade', transitionSec: 0.5 });
    expect(r.totalSec).toBe(8);
  });

  test('no footage to spare: a held length keeps the cut and says so; a free length overlaps and says how much shorter', () => {
    const cuts: CutWindow[] = [{ clip: 0, startSec: 0, endSec: 3.95 }, { clip: 1, startSec: 0, endSec: 3.95 }];
    const held = plan({ cuts, clipDurationsSec: [4, 4] });
    expect(held.summary).toMatchObject({ boundaries: 1, applied: 0, noFootage: 1 });
    expect(held.shots[1]!.transition).toBe('cut');
    expect(held.totalSec).toBe(7.9);
    const free = plan({ cuts, clipDurationsSec: [4, 4], keepLength: false });
    expect(free.summary).toMatchObject({ applied: 1, noFootage: 0, shortenedSec: 0.5 });
    expect(free.totalSec).toBe(7.4);
    expect(timelineDuration(asShots(cuts, free))).toBe(7.4);
  });

  test('some footage: the longest transition that fits, never under 0.2 s', () => {
    const cuts: CutWindow[] = [{ clip: 0, startSec: 0, endSec: 3.7 }, { clip: 1, startSec: 0.33, endSec: 4 }];
    const r = plan({ cuts, clipDurationsSec: [4, 10] });
    expect(r.shots[1]).toMatchObject({ transitionSec: 0.3, startSec: 0.03 });
    expect(r.summary).toMatchObject({ applied: 1, minSec: 0.3 });
    expect(r.totalSec).toBe(sum(cuts));
  });

  test('short shots: at most 30 % of either shot; under 0.2 s the boundary stays a cut', () => {
    const cuts: CutWindow[] = [{ clip: 0, startSec: 2, endSec: 3 }, { clip: 1, startSec: 2, endSec: 3 }, { clip: 2, startSec: 2, endSec: 2.5 }];
    const r = plan({ cuts, clipDurationsSec: [10, 10, 10] });
    expect(r.shots[1]).toMatchObject({ transition: 'crossfade', transitionSec: 0.3 });
    expect(r.shots[2]!.transition).toBe('cut');
    expect(r.summary).toMatchObject({ boundaries: 2, applied: 1, tooShort: 1, minSec: 0.3 });
  });

  test('styles take turns; „different" is the mix; one clip running on across shots is no boundary', () => {
    const cuts: CutWindow[] = [
      { clip: 0, startSec: 2, endSec: 6 }, { clip: 0, startSec: 6, endSec: 10 }, { clip: 1, startSec: 2, endSec: 6 },
      { clip: 2, startSec: 2, endSec: 6 }, { clip: 3, startSec: 2, endSec: 6 },
    ];
    const r = plan({ cuts, clipDurationsSec: [20, 10, 10, 10], ask: { styles: ['zoom', 'slide'] } });
    expect(r.shots.map((s) => s.transition)).toEqual(['cut', 'cut', 'zoom', 'slide', 'zoom']);
    expect(r.summary.boundaries).toBe(3);
    const mixed = plan({ cuts, clipDurationsSec: [20, 10, 10, 10], ask: { styles: [...MIXED_STYLES], mixed: true } });
    expect(mixed.shots.map((s) => s.transition)).toEqual(['cut', 'cut', ...MIXED_STYLES.slice(0, 3)]);
    expect(mixed.summary.mixed).toBe(true);
  });

  test('a photo has footage to spare: its shot is just longer', () => {
    const cuts: CutWindow[] = [{ clip: 0, startSec: 0, endSec: 3 }, { clip: 1, startSec: 0, endSec: 3 }, { clip: 2, startSec: 0, endSec: 3 }];
    const stills = [true, true, true];
    const r = plan({ cuts, clipDurationsSec: [0, 0, 0], stills, ask: { styles: ['flash'], sec: 0.6 } });
    expect(r.shots.map((s) => [s.startSec, s.endSec])).toEqual([[0, 3], [0, 3.6], [0, 3.6]]);
    expect(r.summary).toMatchObject({ applied: 2, sec: 0.6 });
    expect(r.totalSec).toBe(9);
    expect(timelineDuration(asShots(cuts, r, stills))).toBe(9);
  });

  test('a ramped shot gives its pre-roll at its own speed', () => {
    const cuts: CutWindow[] = [{ clip: 0, startSec: 0, endSec: 4 }, { clip: 1, startSec: 3, endSec: 9, speed: 1.5 }];
    const r = plan({ cuts, clipDurationsSec: [4.05, 20] });
    expect(r.shots[1]).toMatchObject({ startSec: 2.25, endSec: 9, transitionSec: 0.5 });
    expect(r.totalSec).toBe(sum(cuts));
    expect(timelineDuration(asShots(cuts, r))).toBe(r.totalSec);
  });

  test('a roll never shows footage another shot of the same clip already shows', () => {
    const cuts: CutWindow[] = [{ clip: 0, startSec: 0, endSec: 2 }, { clip: 1, startSec: 0, endSec: 2 }, { clip: 0, startSec: 2, endSec: 4 }];
    const r = plan({ cuts, clipDurationsSec: [10, 10], ask: { styles: ['wipe'] } });
    // Clip 0's second shot cannot start earlier (its first shot shows 0–2): clip 1's shot plays on instead.
    expect(r.shots[2]).toMatchObject({ startSec: 2, transition: 'wipe' });
    expect(r.shots[1]!.endSec).toBeGreaterThan(2);
    expect(r.totalSec).toBe(sum(cuts));
  });

  test('a length asked is held to two seconds at most, and garbage never throws', () => {
    const cuts: CutWindow[] = [{ clip: 0, startSec: 5, endSec: 15 }, { clip: 1, startSec: 5, endSec: 15 }];
    expect(plan({ cuts, clipDurationsSec: [30, 30], ask: { styles: ['blur'], sec: 9 } }).shots[1]!.transitionSec).toBe(2);
    expect(() => plan({ cuts: [], clipDurationsSec: [] })).not.toThrow();
    expect(plan({ cuts: [cuts[0]!], clipDurationsSec: [30] }).summary).toMatchObject({ boundaries: 0, applied: 0 });
    expect(() => plan({ cuts, clipDurationsSec: [Number.NaN, -1], ask: { styles: [], sec: Number.NaN } })).not.toThrow();
  });
});
