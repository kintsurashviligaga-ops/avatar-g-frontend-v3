/**
 * lib/voice/orbViz.ts
 * ===================
 * PHASE 33 (VECTOR 3) — pure, unit-testable math for the fluid gradient voice orb equalizer.
 *
 * The old orb drew radial bars straight off `getByteFrequencyData` with a single flat ease (0.4) and a
 * single-hue gradient — raw FFT jitter read as flicker, and the palette was one colour. This module owns
 * the two things that make the new orb feel fluid and premium: an ASYMMETRIC attack/decay envelope per
 * bar (fast rise, slow fall → bars pop on sound and settle smoothly, never flicker or clip) and a rich
 * MULTI-COLOUR gradient (bright cyan → sky blue → white, sharp crimson accent) that flows over time.
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

// The signature palette (Phase 35, LOCKED): bright cyan → sky blue → clean white, with a sharp crimson
// accent. Cyan/white dominate the strip; crimson punctuates. Ordered so a sweep reads as a smooth arc.
export const ORB_PALETTE: readonly RGB[] = [
  [0, 209, 255], //  bright cyan    #00D1FF
  [56, 189, 248], // sky blue       #38BDF8
  [255, 255, 255], // clean white   #FFFFFF
  [255, 0, 60], //   crimson accent #FF003C
] as const;

/**
 * Sample the multi-colour palette at ring position `p` (0..1), rotated by `shift` (0..1) so the gradient
 * FLOWS across the strip over time. Wraps seamlessly (the crimson end blends back into the cyan start). Pure.
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
 * white, error crimson, idle/processing sit cyan. Returns a mix weight (0 = full palette colour, 1 = full accent).
 */
export function stateAccent(state: OrbState): { accent: RGB; mix: number } {
  switch (state) {
    case 'listening': return { accent: [0, 209, 255], mix: 0.35 }; //  bright cyan — you're being heard
    case 'speaking': return { accent: [255, 255, 255], mix: 0.24 }; // clean white — the assistant speaks
    case 'error': return { accent: [255, 0, 60], mix: 0.7 }; //        crimson — something failed
    default: return { accent: [0, 209, 255], mix: 0.12 }; //           cyan wash while idle/thinking
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

// ── PHASE 39 (Master Contract V16) — LIQUID 3D VOICE ORB ──────────────────────────────────────────────
// The flat linear equalizer is replaced by a morphing liquid orb (Siri/Gemini-class). Each conversation
// state locks a two-stop gradient (inner core → outer rim); transitions between states are eased frame-to-
// frame in the draw loop so colour never snaps. These are the mandated brand-locked state colours.

/** Per-state liquid-orb gradient: `inner` = luminous core, `outer` = rim/halo. Master Contract V16 palette. */
export const ORB_STATE_GRADIENT: Record<OrbState, { inner: RGB; outer: RGB }> = {
  listening:  { inner: [0, 209, 255], outer: [0, 102, 255] },    // cyan #00D1FF → blue #0066FF — being heard
  processing: { inner: [255, 255, 255], outer: [176, 188, 214] }, // white → silver — thinking/orbit swirl
  speaking:   { inner: [255, 0, 60], outer: [209, 0, 209] },      // crimson #FF003C → violet #D100D1 — speaking
  error:      { inner: [255, 0, 60], outer: [92, 0, 24] },        // dim steady crimson — a failure
  idle:       { inner: [0, 209, 255], outer: [0, 82, 176] },      // cyan wash — dormant
} as const;

/**
 * Liquid-orb boundary radius MULTIPLIER at one point on the ring. Sums a few harmonic lobes (a metaball-ish
 * morph) plus the live audio amplitude, so the blob breathes softly at rest and swells/ripples with sound.
 * Pure + deterministic (given angle/time/amp/seed) → unit-testable without a canvas. Wraps seamlessly:
 * `angleFrac` 0 and 1 map to the same boundary point. `amp` 0..1 loudness; `lobeSeed` de-phases each layer.
 */
export function orbBlobRadius(angleFrac: number, t: number, amp: number, lobeSeed = 0): number {
  const a = ((angleFrac % 1) + 1) % 1;
  const theta = a * Math.PI * 2;
  const level = amp < 0 ? 0 : amp > 1 ? 1 : amp;
  const wobble =
    0.060 * Math.sin(theta * 3 + t * 1.1 + lobeSeed) +
    0.040 * Math.sin(theta * 5 - t * 0.7 + lobeSeed * 1.7) +
    0.028 * Math.sin(theta * 2 + t * 1.9 + lobeSeed * 0.5);
  const breathe = 0.04 * Math.sin(t * 1.3 + lobeSeed);
  return 1 + wobble * (0.5 + level) + breathe + level * 0.34;
}
