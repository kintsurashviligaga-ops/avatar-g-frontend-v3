/**
 * lib/services/montage/smart/effects.ts — the Effects track as ffmpeg filters (Phase 8.7). PURE: it returns filter
 * strings; the render (PR B) puts them on the master after the clips are joined and before the captions are laid.
 *
 * Every effect is a SPAN on the master, switched on with `between(t,a,b)`. Only filters that exist in BOTH the cloud
 * container's ffmpeg 6.1 and the production ffmpeg-static 7.0.2 are used, and none of them needs libfreetype:
 *
 *   glitch      rgbashift (red left, blue right) + temporal noise, both timeline-enabled ('T' flag)
 *   flash       eq brightness, timeline-enabled
 *   zoomPunch   scale with eval=frame (its size follows t) then a fixed centre crop back to the frame: a smooth
 *               in-and-out push over the span (sin over [a,b])
 *   shake       a centre crop that is `margin` smaller than the frame whose x/y wobble inside the span, scaled back.
 *               ⚠️ crop has no per-span switch, so with a shake anywhere in the edit the WHOLE master is cropped by the
 *               margin (1.5 % per side) — invisible on a phone, stated here because it is a real side effect.
 *
 * GLITCH TRANSITION: ffmpeg's `xfade` has no glitch (its list: fade, wipes, slides, circles, pixelize, …). A "glitch"
 * transition is therefore a HARD cut plus a short glitch effect centred on it (`glitchAtCuts`), which is also how
 * CapCut's glitch transitions look.
 */
import type { FxItem } from './timeline';

export const GLITCH_TRANSITION_SEC = 0.3;
export const SHAKE_MARGIN_SHARE = 0.015;

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const btw = (a: number, b: number) => `between(t\\,${r3(a)}\\,${r3(b)})`;

/** A glitch effect around every cut that asked for a glitch transition (cut times on the master). */
export function glitchAtCuts(cutTimes: readonly number[], totalSec: number, len = GLITCH_TRANSITION_SEC): FxItem[] {
  return cutTimes
    .filter((t) => t > 0 && t < totalSec)
    .map((t, i) => ({ id: `gx${i}`, kind: 'glitch' as const, t0: r3(Math.max(0, t - len / 2)), t1: r3(Math.min(totalSec, t + len / 2)), amount: 0.8 }));
}

/**
 * The filter chain for the effects, for a master of W×H (even numbers). '' when there are none, so the render can skip
 * the extra pass. The chain is a plain comma-joined list: `[in]<chain>[out]`.
 */
export function buildFxChain(effects: readonly FxItem[], W: number, H: number): string {
  const w = even(W), h = even(H);
  const parts: string[] = [];
  const zooms = effects.filter((e) => e.kind === 'zoomPunch');
  const shakes = effects.filter((e) => e.kind === 'shake');

  if (zooms.length) {
    // z(t) = Σ amount·0.18·sin(π·(t−a)/(b−a)) inside each span; 0 elsewhere
    const z = zooms.map((e) => `${r3(e.amount * 0.18)}*${btw(e.t0, e.t1)}*sin(PI*(t-${r3(e.t0)})/${r3(Math.max(0.01, e.t1 - e.t0))})`).join('+');
    parts.push(`scale=w='2*trunc(${w}*(1+${z})/2)':h='2*trunc(${h}*(1+${z})/2)':eval=frame`, `crop=${w}:${h}:(iw-${w})/2:(ih-${h})/2`);
  }
  if (shakes.length) {
    const m = Math.max(2, Math.round(w * SHAKE_MARGIN_SHARE));
    const amp = (axis: 'x' | 'y') => shakes
      .map((e) => `${r3(m * Math.min(1, Math.max(0, e.amount)))}*${btw(e.t0, e.t1)}*sin(t*${axis === 'x' ? 47 : 61})`)
      .join('+');
    parts.push(`crop=${w - 2 * m}:${h - 2 * m}:x='${m}+${amp('x')}':y='${m}+${amp('y')}'`, `scale=${w}:${h}`);
  }
  for (const e of effects) {
    if (e.kind === 'glitch') {
      const px = Math.max(2, Math.round((w / 100) * (0.5 + e.amount)));
      parts.push(`rgbashift=rh=-${px}:bh=${px}:enable='${btw(e.t0, e.t1)}'`, `noise=alls=${Math.round(20 + 40 * e.amount)}:allf=t:enable='${btw(e.t0, e.t1)}'`);
    } else if (e.kind === 'flash') {
      parts.push(`eq=brightness=${r3(0.2 + 0.5 * e.amount)}:enable='${btw(e.t0, e.t1)}'`);
    }
  }
  return parts.join(',');
}
