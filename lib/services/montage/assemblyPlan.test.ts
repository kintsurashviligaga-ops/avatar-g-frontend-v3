/** lib/services/montage/assemblyPlan — [intro] + [body] + [outro], frame-exact (pure). */
import { OUTPUT_FPS } from './beatPlan';
import { MAX_SHOTS, MAX_SHOT_SEC, MAX_TOTAL_SEC, MIN_SHOT_SEC } from './montagePlan';
import { planAssembly, type AssemblyInput } from './assemblyPlan';
import type { ClipSignals } from './segmentDetect';

const LIMITS = { maxShots: MAX_SHOTS, maxTotalSec: MAX_TOTAL_SEC, minShotSec: MIN_SHOT_SEC, maxShotSec: MAX_SHOT_SEC };
const sig = (durationSec: number, over: Partial<ClipSignals> = {}): ClipSignals => ({ durationSec, hasAudio: true, blacks: [], silences: [], scenes: [], ...over });
// A: [intro 0–2][black 2–2.5][outro 2.5–4.5]; B: 0.4 s black, the voice from 1.0 s to 7.0 s of 8.
const A = sig(4.5, { blacks: [{ startSec: 2, endSec: 2.5 }] });
const B = sig(8, { blacks: [{ startSec: 0, endSec: 0.4 }], silences: [{ startSec: 0, endSec: 1 }, { startSec: 7, endSec: 8 }] });
const base: AssemblyInput = { clips: [{ durationSec: 4.5, signals: A }, { durationSec: 8, signals: B }], intro: 0, body: 1, outro: 0, ...LIMITS };

const onGrid = (t: number) => Math.abs(t * OUTPUT_FPS - Math.round(t * OUTPUT_FPS)) < 1e-6 * OUTPUT_FPS + 0.02;

test('A + B + A: the intro to the black, the body from voice to voice, the outro after the black', () => {
  const p = planAssembly(base);
  expect(p.ok).toBe(true);
  expect(p.parts.map((x) => [x.role, x.clip, x.startSec, x.endSec, x.startBy, x.endBy])).toEqual([
    ['intro', 0, 0, 2, 'whole', 'black'],
    ['body', 1, 0.867, 7.133, 'speech', 'speech'],
    ['outro', 0, 2.5, 4.433, 'black', 'whole'],
  ]);
  expect(p.cuts.map((c) => c.clip)).toEqual([0, 1, 0]);
  for (const c of p.cuts) { expect(onGrid(c.startSec)).toBe(true); expect(onGrid(c.endSec)).toBe(true); }
  // The master is exactly the parts' frames: nothing lost, nothing doubled.
  const frames = p.cuts.reduce((s, c) => s + Math.round((c.endSec - c.startSec) * OUTPUT_FPS), 0);
  expect(p.totalSec).toBeCloseTo(frames / OUTPUT_FPS, 3);
});

test('the user\'s times win over detection, bound by bound', () => {
  const p = planAssembly({ ...base, cuts: { intro: { endSec: 1.5 }, body: { startSec: 2, endSec: 5 } } });
  expect(p.parts[0]).toMatchObject({ startSec: 0, endSec: 1.5, endBy: 'asked' });
  expect(p.parts[1]).toMatchObject({ startSec: 2, endSec: 5, startBy: 'asked', endBy: 'asked' });
});

test('a body only (no intro/outro) is just the trimmed body', () => {
  const p = planAssembly({ ...base, intro: undefined, outro: undefined });
  expect(p.parts.map((x) => x.role)).toEqual(['body']);
});

test('separate intro and outro files: each whole, minus its black ends', () => {
  const I = sig(3, { blacks: [{ startSec: 0, endSec: 0.3 }] });
  const O = sig(2, { blacks: [{ startSec: 1.7, endSec: 2 }] });
  const p = planAssembly({ clips: [{ durationSec: 3, signals: I }, { durationSec: 8, signals: B }, { durationSec: 2, signals: O }], intro: 0, body: 1, outro: 2, ...LIMITS });
  expect(p.parts.map((x) => [x.role, x.startSec, x.endSec])).toEqual([['intro', 0.3, 2.933], ['body', 0.867, 7.133], ['outro', 0, 1.7]]);
});

test('a body longer than one shot plays on, cut where nothing changes', () => {
  const long = sig(130);
  const p = planAssembly({ clips: [{ durationSec: 130, signals: long }], body: 0, ...LIMITS });
  expect(p.ok).toBe(true);
  expect(p.cuts.length).toBe(3);
  for (let k = 1; k < p.cuts.length; k += 1) expect(p.cuts[k]!.startSec).toBe(p.cuts[k - 1]!.endSec);
  expect(p.cuts.every((c) => c.endSec - c.startSec <= MAX_SHOT_SEC)).toBe(true);
});

test('refusals name the cause: no break, bad times, bad roles, not analysed, too long', () => {
  expect(planAssembly({ ...base, clips: [{ durationSec: 4.5, signals: sig(4.5) }, base.clips[1]!] }).assemblyProblem).toEqual({ kind: 'no_boundary', clip: 0 });
  expect(planAssembly({ ...base, cuts: { body: { startSec: 9 } } }).assemblyProblem).toEqual({ kind: 'bad_cut', role: 'body', durationSec: 8 });
  expect(planAssembly({ ...base, body: 0 }).assemblyProblem).toEqual({ kind: 'bad_roles' });
  expect(planAssembly({ ...base, clips: [base.clips[0]!, { durationSec: 8, signals: null }] }).assemblyProblem).toEqual({ kind: 'not_analysed', clip: 1, role: 'body' });
  // Every bound given: nothing needs analysing.
  expect(planAssembly({ ...base, clips: [base.clips[0]!, { durationSec: 8, signals: null }], cuts: { body: { startSec: 1, endSec: 6 } } }).ok).toBe(true);
  expect(planAssembly({ ...base, intro: undefined, outro: undefined, clips: [base.clips[0]!, { durationSec: 400, signals: sig(400) }] }).assemblyProblem)
    .toMatchObject({ kind: 'too_long', maxSec: MAX_TOTAL_SEC });
});
