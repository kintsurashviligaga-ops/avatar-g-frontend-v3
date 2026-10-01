/** @jest-environment node */
/**
 * The workspace's grade: neutral is the identity, the looks are the Surgical Editor's (pinned to its source), and
 * „auto" corrects without ever inventing a look.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GRADE_PRESETS, GRADE_RANGE, NEUTRAL_GRADE, applyGrade, autoGrade, clampGrade, gradeCssFilter, gradeMatrix,
  isNeutralGrade, type Grade,
} from './grade';

function pixels(n: number, f: (i: number) => [number, number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) d.set(f(i), i * 4);
  return d;
}

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const meanLuma = (d: Uint8ClampedArray) => {
  let s = 0;
  for (let p = 0; p < d.length; p += 4) s += 0.2126 * d[p]! + 0.7152 * d[p + 1]! + 0.0722 * d[p + 2]!;
  return s / (d.length / 4) / 255;
};

describe('applyGrade', () => {
  const rnd = lcg(9);
  const src = pixels(4096, () => [rnd() * 256, rnd() * 256, rnd() * 256, rnd() * 256].map(Math.floor) as [number, number, number, number]);

  it('a neutral grade is the identity — the fast path AND the matrix itself', () => {
    expect(Array.from(applyGrade(src, NEUTRAL_GRADE))).toEqual(Array.from(src));
    const m = gradeMatrix(NEUTRAL_GRADE);
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    m.forEach((v, i) => expect(v).toBeCloseTo(identity[i]!, 9));
    // Grading in place with a neutral grade leaves the buffer as it was.
    const copy = new Uint8ClampedArray(src);
    expect(applyGrade(copy, { ...NEUTRAL_GRADE }, copy)).toBe(copy);
    expect(Array.from(copy)).toEqual(Array.from(src));
  });

  it('never touches alpha, and writes into the buffer it is given', () => {
    const out = new Uint8ClampedArray(src.length);
    const res = applyGrade(src, { saturation: 160, contrast: 140, brightness: 90, temperature: 40 }, out);
    expect(res).toBe(out);
    for (let p = 3; p < src.length; p += 4) expect(out[p]).toBe(src[p]);
  });

  it('mono is grey, brightness brightens, contrast 0 is flat mid-grey', () => {
    const colour = pixels(3, (i) => [[200, 40, 90, 255], [10, 220, 30, 255], [60, 70, 250, 255]][i] as [number, number, number, number]);
    const mono = applyGrade(colour, GRADE_PRESETS.find((p) => p.id === 'mono')!.grade);
    for (let p = 0; p < mono.length; p += 4) {
      expect(Math.abs(mono[p]! - mono[p + 1]!)).toBeLessThanOrEqual(1);
      expect(Math.abs(mono[p + 1]! - mono[p + 2]!)).toBeLessThanOrEqual(1);
    }
    const grey = pixels(1, () => [100, 100, 100, 255]);
    expect(applyGrade(grey, { ...NEUTRAL_GRADE, brightness: 150 })[0]).toBe(150);
    expect(applyGrade(grey, { ...NEUTRAL_GRADE, contrast: 0 })[0]).toBe(128);
  });

  it('warm pushes red over blue; cool pulls a colour the other way', () => {
    const px = pixels(1, () => [150, 120, 110, 255]);
    const warm = applyGrade(px, { ...NEUTRAL_GRADE, temperature: 80 });
    expect(warm[0]! - warm[2]!).toBeGreaterThan(150 - 110);
    const cool = applyGrade(px, { ...NEUTRAL_GRADE, temperature: -80 });
    expect(Array.from(cool.slice(0, 3))).not.toEqual([150, 120, 110]);
  });

  it('an out-of-range or broken grade is clamped, never NaN pixels', () => {
    const out = applyGrade(src, { saturation: Number.NaN, contrast: 1e9, brightness: -5, temperature: 400 } as Grade);
    expect(out.every((v) => Number.isFinite(v))).toBe(true);
    expect(clampGrade({ saturation: Number.NaN, contrast: 1e9, brightness: -5, temperature: 400 }))
      .toEqual({ saturation: 100, contrast: 200, brightness: 0, temperature: 100 });
    expect(clampGrade(undefined)).toEqual(NEUTRAL_GRADE);
  });
});

describe('presets — ported from the Surgical Editor', () => {
  it('match its FILTERS value for value (a look retuned there must be retuned here)', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'components', 'studio', 'SurgicalEditor.tsx'), 'utf8');
    const block = /const FILTERS[^=]*=\s*\[([\s\S]*?)\];/.exec(src)?.[1] ?? '';
    const theirs = [...block.matchAll(/id:\s*'(\w+)'[^}]*?grade:\s*(NEUTRAL|\{[^}]*\})/g)].map(([, id, g]) => {
      if (g === 'NEUTRAL') return { id, grade: { ...NEUTRAL_GRADE } };
      const num = (k: string) => Number(new RegExp(`${k}:\\s*(-?\\d+)`).exec(g!)?.[1]);
      return { id, grade: { saturation: num('saturation'), contrast: num('contrast'), brightness: num('brightness'), temperature: num('temperature') } };
    });
    expect(theirs.length).toBe(8);
    expect(GRADE_PRESETS.map((p) => ({ id: p.id, grade: { ...p.grade } }))).toEqual(theirs);
  });

  it('every preset has a label in all three languages and sits inside the sliders’ ranges', () => {
    for (const p of GRADE_PRESETS) {
      for (const l of ['ka', 'en', 'ru'] as const) expect(p.label[l].trim().length).toBeGreaterThan(0);
      expect(clampGrade(p.grade)).toEqual(p.grade);
    }
    expect(isNeutralGrade(GRADE_PRESETS[0]!.grade)).toBe(true);
  });

  it('the CSS filter is the Surgical Editor’s string', () => {
    expect(gradeCssFilter({ saturation: 118, contrast: 105, brightness: 104, temperature: 55 }))
      .toBe('saturate(118%) contrast(105%) brightness(104%) sepia(0.19) hue-rotate(0deg)');
    expect(gradeCssFilter({ saturation: 105, contrast: 108, brightness: 100, temperature: -55 }))
      .toBe('saturate(105%) contrast(108%) brightness(100%) sepia(0.00) hue-rotate(-10deg)');
  });
});

describe('autoGrade', () => {
  const W = 128;
  const H = 96;
  const n = W * H;

  it('lifts a dark, flat frame: more contrast, more brightness, and the mean moves towards mid-grey', () => {
    const rnd = lcg(3);
    const dark = pixels(n, () => { const v = 30 + rnd() * 40; return [v + 6, v, v - 4, 255]; });
    const g = autoGrade(dark, W, H);
    expect(g.contrast).toBeGreaterThan(100);
    expect(g.brightness).toBeGreaterThan(100);
    const before = meanLuma(dark);
    const after = meanLuma(applyGrade(dark, g));
    expect(Math.abs(after - 0.46)).toBeLessThan(Math.abs(before - 0.46));
  });

  it('leaves a well-exposed, full-range, colourful frame (almost) alone', () => {
    // Black to white across the frame, alternating a warm and a cool pixel: full range, balanced, colourful.
    const good = pixels(n, (i) => {
      const v = (i % W) / (W - 1) * 255;
      return i % 2 ? [v * 0.7, v * 0.85, v, 255] : [v, v * 0.85, v * 0.7, 255];
    });
    const g = autoGrade(good, W, H);
    expect(g.contrast).toBe(100);
    expect(Math.abs(g.brightness - 100)).toBeLessThanOrEqual(12);
    expect(Math.abs(g.temperature)).toBeLessThanOrEqual(10);
    expect(g.saturation).toBe(100);
  });

  it('counters a colour cast: blue → warmer, amber → cooler', () => {
    const blue = pixels(n, (i) => { const v = 60 + (i % 120); return [v * 0.7, v * 0.9, v * 1.25, 255]; });
    const amber = pixels(n, (i) => { const v = 60 + (i % 120); return [v * 1.25, v * 0.95, v * 0.6, 255]; });
    expect(autoGrade(blue, W, H).temperature).toBeGreaterThan(0);
    expect(autoGrade(amber, W, H).temperature).toBeLessThan(0);
  });

  it('is always a valid grade inside the sliders’ ranges — on noise, on black, on white, on nothing', () => {
    const rnd = lcg(11);
    for (let k = 0; k < 5; k++) {
      const noise = pixels(n, () => [rnd() * 255, rnd() * 255, rnd() * 255, 255]);
      const g = autoGrade(noise, W, H);
      for (const key of Object.keys(GRADE_RANGE) as (keyof Grade)[]) {
        expect(g[key]).toBeGreaterThanOrEqual(GRADE_RANGE[key][0]);
        expect(g[key]).toBeLessThanOrEqual(GRADE_RANGE[key][1]);
      }
    }
    expect(Object.values(autoGrade(pixels(n, () => [0, 0, 0, 255]), W, H)).every(Number.isFinite)).toBe(true);
    expect(Object.values(autoGrade(pixels(n, () => [255, 255, 255, 255]), W, H)).every(Number.isFinite)).toBe(true);
    expect(autoGrade(new Uint8ClampedArray(0), 0, 0)).toEqual(NEUTRAL_GRADE);
  });
});
