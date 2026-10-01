/**
 * Colour grading for the culling workspace — the SAME four values and the same one-tap looks as the Surgical
 * Editor's photo grade (components/studio/SurgicalEditor.tsx `FILTERS` / `gradeFilter`), applied to pixels on the
 * user's device: the workspace's live preview and the exported copies both come out of `applyGrade`, so what the
 * preview shows is what the export writes. Pure (no DOM, no I/O).
 */
import type { Rgba } from './cullMetrics';

export interface Grade {
  /** % — 100 is neutral. */
  saturation: number;
  /** % — 100 is neutral. */
  contrast: number;
  /** % — 100 is neutral. */
  brightness: number;
  /** −100 (cool) … 100 (warm); 0 is neutral. */
  temperature: number;
}

type L10n = { ka: string; en: string; ru: string };

export const NEUTRAL_GRADE: Readonly<Grade> = Object.freeze({ saturation: 100, contrast: 100, brightness: 100, temperature: 0 });

/** The sliders' ranges — the Surgical Editor's, so a grade means the same thing in both places. */
export const GRADE_RANGE: Readonly<Record<keyof Grade, readonly [number, number]>> = {
  saturation: [0, 200],
  contrast: [0, 200],
  brightness: [0, 200],
  temperature: [-100, 100],
};

/**
 * One-tap looks, ported value for value from the Surgical Editor's Filters tab (grade.test.ts pins them to it, so a
 * look retuned there fails CI here instead of drifting). Each is a preset of the four sliders and stays adjustable.
 */
export const GRADE_PRESETS: readonly { id: string; label: L10n; grade: Readonly<Grade> }[] = [
  { id: 'original', label: { ka: 'ორიგინალი', en: 'Original', ru: 'Оригинал' }, grade: NEUTRAL_GRADE },
  { id: 'vivid', label: { ka: 'ცოცხალი', en: 'Vivid', ru: 'Яркий' }, grade: { saturation: 150, contrast: 118, brightness: 104, temperature: 8 } },
  { id: 'dramatic', label: { ka: 'დრამატული', en: 'Dramatic', ru: 'Драматичный' }, grade: { saturation: 88, contrast: 155, brightness: 94, temperature: -12 } },
  { id: 'warm', label: { ka: 'თბილი', en: 'Warm', ru: 'Тёплый' }, grade: { saturation: 118, contrast: 105, brightness: 104, temperature: 55 } },
  { id: 'cool', label: { ka: 'ცივი', en: 'Cool', ru: 'Холодный' }, grade: { saturation: 105, contrast: 108, brightness: 100, temperature: -55 } },
  { id: 'mono', label: { ka: 'შავ-თეთრი', en: 'Mono', ru: 'Ч/б' }, grade: { saturation: 0, contrast: 120, brightness: 102, temperature: 0 } },
  { id: 'noir', label: { ka: 'ნუარი', en: 'Noir', ru: 'Нуар' }, grade: { saturation: 0, contrast: 160, brightness: 88, temperature: 0 } },
  { id: 'silver', label: { ka: 'ვერცხლისფერი', en: 'Silvertone', ru: 'Серебро' }, grade: { saturation: 30, contrast: 125, brightness: 104, temperature: -18 } },
];

const clampTo = (v: unknown, [lo, hi]: readonly [number, number], fallback: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
};

/** Any input → a valid grade: missing or non-finite values are neutral, everything is held to GRADE_RANGE. */
export function clampGrade(g: Partial<Grade> | null | undefined): Grade {
  return {
    saturation: clampTo(g?.saturation, GRADE_RANGE.saturation, 100),
    contrast: clampTo(g?.contrast, GRADE_RANGE.contrast, 100),
    brightness: clampTo(g?.brightness, GRADE_RANGE.brightness, 100),
    temperature: clampTo(g?.temperature, GRADE_RANGE.temperature, 0),
  };
}

export const sameGrade = (a: Grade, b: Grade) =>
  a.saturation === b.saturation && a.contrast === b.contrast && a.brightness === b.brightness && a.temperature === b.temperature;
export const isNeutralGrade = (g: Grade) => sameGrade(g, NEUTRAL_GRADE);

/** The temperature model, shared by the CSS string and the matrix: warm adds sepia, cool rotates the hue. */
function temperatureParts(t: number): { sepia: number; hueDeg: number } {
  const warm = t / 100;
  return { sepia: warm > 0 ? warm * 0.35 : 0, hueDeg: warm < 0 ? warm * 18 : 0 };
}

/** The grade as a CSS `filter` — the Surgical Editor's string, for cheap previews on thumbnails. */
export function gradeCssFilter(g: Grade): string {
  const { sepia, hueDeg } = temperatureParts(g.temperature);
  return `saturate(${g.saturation}%) contrast(${g.contrast}%) brightness(${g.brightness}%) sepia(${sepia.toFixed(2)}) hue-rotate(${hueDeg.toFixed(0)}deg)`;
}

type Affine = [number, number, number, number, number, number, number, number, number, number, number, number];

/** a ∘ b (b first), both 3×4 row-major affine maps on 0–1 RGB. */
function compose(a: Affine, b: Affine): Affine {
  const o = new Array<number>(12).fill(0) as Affine;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 4 + c] = a[r * 4]! * b[c]! + a[r * 4 + 1]! * b[4 + c]! + a[r * 4 + 2]! * b[8 + c]!;
    }
    o[r * 4 + 3] = a[r * 4]! * b[3]! + a[r * 4 + 1]! * b[7]! + a[r * 4 + 2]! * b[11]! + a[r * 4 + 3]!;
  }
  return o;
}

/**
 * The grade as ONE 3×4 affine matrix on 0–1 RGB: the CSS filter chain `saturate · contrast · brightness · sepia ·
 * hue-rotate` (Filter Effects Level 1 matrices) composed into a single step, so a 16-megapixel export is twelve
 * multiply-adds per pixel. (CSS clamps between the steps; composing does not, which differs only at extremes.)
 */
export function gradeMatrix(g: Grade): Affine {
  const s = g.saturation / 100;
  const sat: Affine = [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0,
  ];
  const c = g.contrast / 100;
  const con: Affine = [c, 0, 0, 0.5 - 0.5 * c, 0, c, 0, 0.5 - 0.5 * c, 0, 0, c, 0.5 - 0.5 * c];
  const b = g.brightness / 100;
  const bri: Affine = [b, 0, 0, 0, 0, b, 0, 0, 0, 0, b, 0];
  const { sepia, hueDeg } = temperatureParts(g.temperature);
  const k = 1 - Math.min(1, Math.max(0, sepia));
  const sep: Affine = [
    0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k, 0,
    0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k, 0,
    0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k, 0,
  ];
  const th = (hueDeg * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const hue: Affine = [
    0.213 + 0.787 * cos - 0.213 * sin, 0.715 - 0.715 * cos - 0.715 * sin, 0.072 - 0.072 * cos + 0.928 * sin, 0,
    0.213 - 0.213 * cos + 0.143 * sin, 0.715 + 0.285 * cos + 0.140 * sin, 0.072 - 0.072 * cos - 0.283 * sin, 0,
    0.213 - 0.213 * cos - 0.787 * sin, 0.715 - 0.715 * cos + 0.715 * sin, 0.072 + 0.928 * cos + 0.072 * sin, 0,
  ];
  return compose(hue, compose(sep, compose(bri, compose(con, sat))));
}

/**
 * Grades RGBA pixels into `out` (a new buffer by default; `out === src` grades in place). Alpha is copied untouched.
 * A neutral grade is an exact copy.
 */
export function applyGrade(src: Rgba, grade: Grade, out: Uint8ClampedArray = new Uint8ClampedArray(src.length)): Uint8ClampedArray {
  const g = clampGrade(grade);
  if (isNeutralGrade(g)) {
    if (out !== src) out.set(src);
    return out;
  }
  const m = gradeMatrix(g);
  // 0–255 in and out: the linear terms are scale-free, the offsets scale by 255.
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11] = m;
  const o3 = m3 * 255;
  const o7 = m7 * 255;
  const o11 = m11 * 255;
  const n = src.length - (src.length % 4);
  for (let p = 0; p < n; p += 4) {
    const r = src[p]!;
    const gg = src[p + 1]!;
    const b = src[p + 2]!;
    out[p] = m0 * r + m1 * gg + m2 * b + o3;
    out[p + 1] = m4 * r + m5 * gg + m6 * b + o7;
    out[p + 2] = m8 * r + m9 * gg + m10 * b + o11;
    out[p + 3] = src[p + 3]!;
  }
  return out;
}

/** Target mean luma (0–1) for „auto": a touch under middle grey, where most well-exposed frames sit. */
const AUTO_TARGET_MEAN = 0.46;

/**
 * „Auto" — a starting point on the same four sliders, never a commitment:
 *  · a flat histogram (1st→99th luma percentile) is stretched by up to 35 %, around its own mean;
 *  · the exposure is then scaled towards AUTO_TARGET_MEAN, by at most ×1.4 and never so far that the 99th
 *    percentile clips (an affine grade has no curve to protect highlights with);
 *  · temperature counters a blue or amber cast measured on the mid-tones (grey world);
 *  · saturation lifts a muted frame a little.
 * Each is bounded well inside GRADE_RANGE, so auto never produces a look — only a correction.
 *
 * ⚠️ THE SLIDERS ARE NOT THE CORRECTION. CSS contrast pivots at mid-grey, so stretching a dark frame "around its
 * own mean" and then lifting it is one affine map v′ = k·v + o, which the sliders express as brightness = k + 2o and
 * contrast = k ÷ brightness. Computing contrast and brightness separately (stretch at 0.5, then multiply) pushed a
 * dark frame DARKER — the pivot dragged its shadows down faster than the brightness cap could lift them.
 */
export function autoGrade(rgba: Rgba, width: number, height: number): Grade {
  const n = Math.min(width * height, Math.floor(rgba.length / 4));
  if (n <= 0) return { ...NEUTRAL_GRADE };
  // Sample at most ~250k pixels — a preview-size frame is plenty for a histogram.
  const step = Math.max(1, Math.floor(n / 250_000));
  const hist = new Uint32Array(256);
  let count = 0;
  let lumaSum = 0;
  let rMid = 0;
  let bMid = 0;
  let midCount = 0;
  let chromaSum = 0;
  for (let i = 0; i < n; i += step) {
    const p = i * 4;
    const r = rgba[p]!;
    const g = rgba[p + 1]!;
    const b = rgba[p + 2]!;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    hist[Math.min(255, Math.round(y))]! += 1;
    lumaSum += y;
    count++;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 0) chromaSum += (max - min) / max;
    if (y > 40 && y < 215) { rMid += r; bMid += b; midCount++; }
  }
  const pct = (q: number) => {
    const want = q * count;
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= want) return v / 255; }
    return 1;
  };
  const lo = pct(0.01);
  const hi = pct(0.99);
  const spread = Math.max(0.05, hi - lo);
  const mean = lumaSum / count / 255;
  // Stretch around the mean (the mean stays put), then scale the exposure.
  const stretch = spread < 0.8 ? Math.min(1.35, 0.9 / spread) : 1;
  const hiAfter = mean + stretch * (hi - mean);
  let expose = 1;
  if (Math.abs(mean - AUTO_TARGET_MEAN) >= 0.05) {
    expose = AUTO_TARGET_MEAN / Math.max(0.01, mean);
    expose = expose > 1 ? Math.max(1, Math.min(expose, 1.4, 0.98 / Math.max(0.05, hiAfter))) : Math.max(0.75, expose);
  }
  const k = expose * stretch;
  const o = expose * mean * (1 - stretch);
  const brightness = Math.min(1.8, Math.max(0.5, k + 2 * o));
  const contrast = Math.min(1.6, Math.max(0.6, k / brightness));
  let temperature = 0;
  if (midCount > count * 0.05) {
    const cast = (rMid - bMid) / Math.max(1, rMid + bMid); // > 0 amber, < 0 blue
    temperature = Math.min(40, Math.max(-40, -cast * 250));
  }
  // Muted colour gets a lift; a frame with next to no colour (black-and-white, a grey card) is left alone.
  const chroma = chromaSum / count;
  const saturation = chroma > 0.04 && chroma < 0.2 ? 112 : 100;
  return clampGrade({
    saturation,
    contrast: Math.round(contrast * 100),
    brightness: Math.round(brightness * 100),
    temperature: Math.round(temperature),
  });
}
