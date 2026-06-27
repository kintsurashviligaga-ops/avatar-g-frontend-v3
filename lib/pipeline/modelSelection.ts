/**
 * lib/pipeline/modelSelection.ts — preview-tier i2v model selection (Pipeline
 * Iteration, Phase 4A).
 *
 * The film pipeline defaults to the cheap LTX clip engine; the Cinema panel can
 * upgrade a render to a premium image-to-video model (Kling / Hailuo, ~5× the per-clip
 * cost). This gate ensures the premium upgrade is only honored for a SIGNED-IN, non-
 * preview render — so anonymous trials and explicit preview-quality requests always
 * fall through to the cheap LTX default and never burn the premium budget. Additive +
 * conservative: a non-premium request is returned unchanged (undefined → LTX).
 */
export type PremiumVideoModel = 'kling' | 'hailuo';

export function selectClipVideoModel(opts: {
  /** The Cinema-panel request: 'kling' | 'hailuo' | anything else/undefined. */
  requested?: string | null;
  /** True when a real, authenticated user owns the render. */
  isSignedIn: boolean;
  /** True for an explicit preview/draft-quality render. */
  preview?: boolean;
}): PremiumVideoModel | undefined {
  const premium = opts.requested === 'kling' || opts.requested === 'hailuo';
  if (!premium) return undefined; // default → LTX (cheap)
  if (!opts.isSignedIn || opts.preview) return undefined; // anon / preview → cheap LTX
  return opts.requested as PremiumVideoModel;
}
