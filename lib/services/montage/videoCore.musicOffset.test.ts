/** @jest-environment node */
/**
 * Video Core v1.0 §7 — the owner's two audio clocks, pinned on the plan (T2; the same cases run on the real ffmpeg in
 * lib/agent/media/mediaStudio.ffmpeg.test, E2E-22/23):
 *   · Music SOURCE offset („სიმღერა 0:58-დან") ≠ music TIMELINE start (the master's first frame): 70 s from 0:58 on a
 *     2:10 track is planned (0:58 + 70 s = 2:08 ≤ 2:10); on a 2:00 track it is REFUSED — 62 s of music are left, the
 *     track is never looped, the edit never shortened.
 *   · A source selection („შვიდი კლიპიდან მხოლოდ ბოლო ხუთი") is a subset of the pictures, named: the two left out
 *     are in no shot (the contribution manifest, lib/agent/media/montageExec).
 */
import { planBeatCuts, type BeatGrid } from './beatPlan';
import { MAX_SHOTS, MAX_SHOT_SEC, MAX_TOTAL_SEC, MIN_SHOT_SEC } from './montagePlan';
import { selectSources } from '@/lib/agent/media/sourceSelect';

const LIMITS = { maxShots: MAX_SHOTS, maxTotalSec: MAX_TOTAL_SEC, minShotSec: MIN_SHOT_SEC, maxShotSec: MAX_SHOT_SEC };
const FIVE_CLIPS = [20, 20, 20, 20, 20];
const G120: BeatGrid = { bpm: 120, periodSec: 0.5, phaseSec: 0.2, confidence: 3 };

describe('§7 · music source offset vs timeline start', () => {
  test('70 s from 0:58 on a 2:10 track: the master is 70 s (2100 frames), the track heard from exactly 58 s at frame 0', () => {
    const p = planBeatCuts({ clipDurationsSec: FIVE_CLIPS, musicSec: 130, grid: null, targetSec: 70, musicFromSec: 58, ...LIMITS });
    expect(p.ok).toBe(true);
    expect(p.musicStartSec).toBe(58);
    expect(p.leadInSec).toBe(0);
    expect(p.totalSec).toBe(70);
    expect(Math.round(p.totalSec * 30)).toBe(2100);
    expect(p.cuts.reduce((s, c) => s + (c.endSec - c.startSec) / (c.speed ?? 1), 0)).toBeCloseTo(70, 6);
  });

  test('the same ask on a 2:00 track is refused: 62 s of music from 0:58 < 70 s asked — no loop, no shorter master', () => {
    const p = planBeatCuts({ clipDurationsSec: FIVE_CLIPS, musicSec: 120, grid: null, targetSec: 70, musicFromSec: 58, ...LIMITS });
    expect(p.ok).toBe(false);
    expect(p.problem).toEqual({ kind: 'music_too_short', clips: 5, musicSec: 62, fromSec: 58, neededSec: expect.any(Number), targetSec: 70 });
    expect(p.cuts).toEqual([]);
    expect(p.totalSec).toBe(0);
    expect(p.error).toMatch(/music from 58s lasts 62s, shorter than the 70s asked/);
  });

  test('on a beat grid the user\'s offset is still exactly 58; only the lead-in to the next beat rides on the first shot', () => {
    const p = planBeatCuts({ clipDurationsSec: FIVE_CLIPS, musicSec: 130, grid: G120, targetSec: 70, musicFromSec: 58, ...LIMITS });
    expect(p.ok).toBe(true);
    expect(p.musicStartSec).toBe(58);
    expect(p.leadInSec).toBeCloseTo(0.2, 6); // 58.0 → the next beat at 58.2
    expect(p.totalSec).toBe(70);
  });

  test('a start past the end of the track is refused, not clamped', () => {
    const p = planBeatCuts({ clipDurationsSec: FIVE_CLIPS, musicSec: 50, grid: null, targetSec: 10, musicFromSec: 58, ...LIMITS });
    expect(p.ok).toBe(false);
    expect(p.problem).toMatchObject({ kind: 'music_too_short', fromSec: 58, musicSec: 0 });
  });
});

describe('§7 · a source selection names the pictures left out', () => {
  test.each([
    'შვიდი კლიპიდან გამოიყენე მხოლოდ ბოლო ხუთი',
    'მარტო ბოლო ხუთი გამოიყენე',
    'use only the last five of the seven clips',
    'из семи клипов используй только последние пять',
  ])('%s · 7 pictures → clips 3–7 used, 1–2 left out', (text) => {
    expect(selectSources(text, 7)).toEqual({ mode: 'subset', keep: [2, 3, 4, 5, 6], excluded: [0, 1], phrase: expect.any(String) });
  });

  test('„ბოლო ხუთი" of five is every picture; of three names clips that are not there', () => {
    expect(selectSources('მარტო ბოლო ხუთი', 5)).toEqual({ mode: 'all' });
    expect(selectSources('მარტო ბოლო ხუთი', 3)).toMatchObject({ mode: 'invalid' });
  });
});
