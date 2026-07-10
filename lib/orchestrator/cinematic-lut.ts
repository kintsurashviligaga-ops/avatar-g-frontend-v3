/**
 * Cinematic 3D LUT generator (.cube) for the FFmpeg `lut3d` master grade.
 *
 * The legacy grade is a `colorbalance + eq + vignette` chain — fine, but not a
 * true film LUT. This module emits a real Adobe/Resolve-compatible `.cube` 3D LUT
 * so the assembler can apply `lut3d=file=…` for a proper colour transform, and
 * picks the LOOK from the film brief (night/neon → purple-gold, golden-hour →
 * warm amber, otherwise a neutral teal-orange).
 *
 * Pure + deterministic (no IO) → unit-testable. The caller writes the returned
 * string to a temp `.cube` and feeds the path to ffmpeg.
 */

export type LutLook = 'cinematic' | 'night_neon' | 'warm_golden';

/** Filename stem reported in logs / proofs for each look. */
export const LUT_FILENAME: Record<LutLook, string> = {
  cinematic: 'myavatar-cinematic-teal-orange.cube',
  night_neon: 'myavatar-night-neon-purple-gold.cube',
  warm_golden: 'myavatar-warm-golden-hour.cube',
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Smooth 0→1 luma weight used to blend shadow vs. highlight tints. */
const smooth = (x: number) => x * x * (3 - 2 * x);

/** A look maps a linear-ish RGB triple (0..1) to a graded triple (0..1). */
type LookFn = (r: number, g: number, b: number) => [number, number, number];

const LOOKS: Record<LutLook, LookFn> = {
  // Subtle Hollywood teal-orange: cool the shadows, GENTLY warm the highlights, mild
  // contrast. Safe default for any film. V8-F3 — the highlight warm push was halved
  // (+0.05→+0.02 R, −0.04→−0.02 B, +0.015→+0.008 G) because the old amounts cast a
  // visible YELLOW tint on ordinary footage; the teal shadows (the intended half of
  // teal-orange) are kept.
  cinematic: (r, g, b) => {
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const hi = smooth(luma);
    const sh = 1 - hi;
    const nr = r + 0.02 * hi - 0.02 * sh;
    const ng = g + 0.008 * hi - 0.005 * sh;
    const nb = b - 0.02 * hi + 0.06 * sh;
    // mild S-curve contrast around 0.5
    const contrast = (v: number) => clamp01(0.5 + (v - 0.5) * 1.08);
    return [contrast(nr), contrast(ng), contrast(nb)];
  },
  // Moody music-video grade: purple/magenta-blue shadows, gold/amber highlights,
  // lifted contrast, slightly desaturated mids. Matches "purple and gold tones,
  // moody lighting, night rooftop, neon".
  night_neon: (r, g, b) => {
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const hi = smooth(clamp01((luma - 0.15) / 0.85)); // highlights ramp
    const sh = 1 - hi;
    // shadows → purple (lift R+B, drop G); highlights → gold (lift R+G, drop B)
    let nr = r + 0.08 * sh + 0.10 * hi;
    let ng = g - 0.05 * sh + 0.05 * hi;
    let nb = b + 0.12 * sh - 0.10 * hi;
    // punchier contrast for the music-video pop
    const contrast = (v: number) => clamp01(0.5 + (v - 0.5) * 1.16);
    nr = contrast(nr); ng = contrast(ng); nb = contrast(nb);
    return [clamp01(nr), clamp01(ng), clamp01(nb)];
  },
  // Warm golden-hour: amber lift across the board, warm highlights, soft contrast.
  warm_golden: (r, g, b) => {
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const hi = smooth(luma);
    const nr = clamp01(r + 0.07 * hi + 0.03);
    const ng = clamp01(g + 0.03 * hi + 0.01);
    const nb = clamp01(b - 0.06 * hi - 0.02);
    const contrast = (v: number) => clamp01(0.5 + (v - 0.5) * 1.06);
    return [contrast(nr), contrast(ng), contrast(nb)];
  },
};

/**
 * Classify a brief into the best LUT look. Keyword-driven and language-aware
 * (English + a few Georgian cues), so a night/neon/moody brief gets the purple-
 * gold grade and a golden-hour/warm brief gets amber. Default: neutral cinematic.
 */
export function pickLutLook(brief: string | null | undefined): LutLook {
  const b = (brief ?? '').toLowerCase();
  if (!b) return 'cinematic';
  const night = /\b(night|neon|moody|purple|violet|magenta|midnight|rooftop at night|nightclub|club|rgb|cyberpunk|dark)\b/.test(b)
    || /ღამ|ნეონ|იისფერ|მუქ/.test(brief ?? '');
  if (night) return 'night_neon';
  const warm = /\b(golden hour|sunset|sunrise|warm|amber|dawn|dusk|candle|firelight)\b/.test(b)
    || /ოქროსფერ|მზის ჩასვლ|თბილ/.test(brief ?? '');
  if (warm) return 'warm_golden';
  return 'cinematic';
}

/**
 * Grade a single 0..1 RGB pixel through a look. Exported for tint regression tests
 * (the LOOKS table itself stays private).
 */
export function gradePixel(look: LutLook, r: number, g: number, b: number): [number, number, number] {
  return (LOOKS[look] ?? LOOKS.cinematic)(r, g, b);
}

/**
 * Build a `.cube` 3D LUT string for the given look at the given grid size
 * (17 is the studio default — smooth, ~5k lines, trivial for ffmpeg to load).
 * Standard .cube ordering: red varies fastest, then green, then blue.
 */
export function buildCubeFile(look: LutLook, size = 17): string {
  const fn = LOOKS[look] ?? LOOKS.cinematic;
  const n = size - 1;
  const lines: string[] = [
    `TITLE "${LUT_FILENAME[look].replace('.cube', '')}"`,
    `LUT_3D_SIZE ${size}`,
    'DOMAIN_MIN 0.0 0.0 0.0',
    'DOMAIN_MAX 1.0 1.0 1.0',
  ];
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const [or, og, ob] = fn(ri / n, gi / n, bi / n);
        lines.push(`${or.toFixed(5)} ${og.toFixed(5)} ${ob.toFixed(5)}`);
      }
    }
  }
  return lines.join('\n') + '\n';
}
