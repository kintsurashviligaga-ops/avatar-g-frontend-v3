/**
 * lib/voice/orbViz.ts
 * ===================
 * PHASE 33 (VECTOR 3) — pure, unit-testable math for the fluid gradient voice orb equalizer.
 *
 * The old orb drew radial bars straight off `getByteFrequencyData` with a single flat ease (0.4) and a
 * single-hue gradient — raw FFT jitter read as flicker, and the palette was one colour. This module owns
 * the two things that make the new orb feel fluid and premium: an ASYMMETRIC attack/decay envelope per
 * bar (fast rise, slow fall → bars pop on sound and settle smoothly, never flicker or clip) and a rich
 * MULTI-COLOUR gradient (deep purple → electric blue → neon pink) that flows around the ring over time.
 *
 * Kept free of the DOM/canvas so the envelope + colour maths are testable without a browser.
 */

export type OrbState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export type RGB = readonly [number, number, number];

/**
 * One step of an asymmetric attack/decay envelope, clamped to [0,1]. A bar RISES quickly toward a louder
 * target (attack) and FALLS slowly when the sound drops (decay), so transients pop but never strobe. Pure.
 */
export function smoothBar(prev: number, target: number, attack = 0.5, decay = 0.12): number {
  const p = Number.isFinite(prev) ? prev : 0;
  const t = Number.isFinite(target) ? Math.max(0, Math.min(1, target)) : 0;
  const rate = t > p ? attack : decay;
  const next = p + (t - p) * rate;
  return next < 0 ? 0 : next > 1 ? 1 : next;
}

/** Linear-interpolate two RGB colours. `t` is clamped to [0,1]. Pure. */
export function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

// The signature palette — deep purple, electric blue, neon pink. Ordered so a sweep across them reads as
// a continuous cool→warm arc.
export const ORB_PALETTE: readonly RGB[] = [
  [124, 58, 237], // deep purple  #7c3aed
  [37, 99, 235], //  electric blue #2563eb
  [34, 211, 238], // cyan glow     #22d3ee
  [236, 72, 153], // neon pink     #ec4899
] as const;

/**
 * Sample the multi-colour palette at ring position `p` (0..1), rotated by `shift` (0..1) so the gradient
 * FLOWS around the orb over time. Wraps seamlessly (the pink end blends back into the purple start). Pure.
 */
export function orbColorAt(p: number, shift = 0, palette: readonly RGB[] = ORB_PALETTE): RGB {
  const n = palette.length;
  if (n === 0) return [255, 255, 255];
  if (n === 1) return palette[0]!;
  // Position around a seamless loop of n colours (…→last→first→…).
  const frac = (((p + shift) % 1) + 1) % 1;
  const scaled = frac * n; // 0..n
  const i = Math.floor(scaled) % n;
  const j = (i + 1) % n;
  return lerpRgb(palette[i]!, palette[j]!, scaled - Math.floor(scaled));
}

/**
 * A per-state tint bias applied over the flowing palette: listening leans cool/bright, speaking leans
 * warm/pink, idle/processing sit neutral. Returns a mix weight (0 = full palette colour, 1 = full accent).
 */
export function stateAccent(state: OrbState): { accent: RGB; mix: number } {
  switch (state) {
    case 'listening': return { accent: [34, 211, 238], mix: 0.35 }; // cyan — you're being heard
    case 'speaking': return { accent: [236, 72, 153], mix: 0.3 }; //  pink — the assistant talks
    case 'error': return { accent: [244, 63, 94], mix: 0.7 }; //     rose — something failed
    default: return { accent: [124, 58, 237], mix: 0.12 }; //        purple wash while idle/thinking
  }
}

/** Final bar colour: the flowing palette biased toward the state accent, brightened by loudness. Pure. */
export function orbBarColor(p: number, shift: number, loudness: number, state: OrbState): RGB {
  const base = orbColorAt(p, shift);
  const { accent, mix } = stateAccent(state);
  const tinted = lerpRgb(base, accent, mix);
  // brighten slightly with loudness so louder bars glow toward white
  const l = loudness < 0 ? 0 : loudness > 1 ? 1 : loudness;
  return lerpRgb(tinted, [255, 255, 255], l * 0.22);
}

/** Format an RGB triple as an rgba() string. Pure. */
export function rgba(c: RGB, alpha: number): string {
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
