/**
 * lib/studio3d/price.ts — what a 3D Studio action costs in credits, and why. Pure, client-safe.
 *
 * COST MODEL (the plan doc's Prices + Infra sections; Cloud Run pricing read 2026-11-15, europe-west4 = Tier 1, no zonal
 * redundancy, instance billing):
 *   RTX PRO 6000 GPU $0.00036522/s + 20 vCPU × $0.000018 + 80 GiB × $0.000002  = $0.00088522 per GPU-second
 *   TRELLIS.2 needs ≥ 24 GB VRAM; the L4 has exactly 24 GB, so the RTX PRO 6000 (96 GB) is the one that does not fail on
 *   "high detail". A Cloud Run JOB is billed only while it runs: no idle GPU tail.
 *
 * GPU SECONDS ARE ESTIMATES (start + weights ~60 s, shape, texture bake + exports + turntable). TRELLIS.2 publishes ~17 s per
 * 1024³ shape on an H100; the paid probe (decision D3) measures ours. `gate` (econ.enforceMargin from #343 once wired) may
 * only RAISE a price, so a slower measured run can never sell under 65 %.
 *
 * Full cost = GPU × (1 + retry share 10 %) + hosting $0.005 (≈25 MB kept a month, downloaded twice) + the Gemini safety check
 * $0.0005; credits = ⌈full cost × 104.38⌉ — 104.38 credits per $1 is #343's 65 % point at the 0.08 ₾ floor credit.
 */

export const GPU_USD_PER_SEC = 0.00036522 + 20 * 0.000018 + 80 * 0.000002;
export const RETRY_SHARE = 0.1;
export const HOSTING_USD = 0.005;
export const SAFETY_CHECK_USD = 0.0005;
/** #343 econ: credits needed per $1 of full cost for 65 % gross margin at the floor credit. */
export const CREDITS_PER_USD = 104.38;

/** Estimated billed seconds of one worker run. */
export const GPU_SECONDS = { model: 130, model_high: 190, retexture: 120 } as const;

/** The reference picture is a normal 1K gemini-3.1-flash-image call; GG approved ✦8 for it in Phase 8.4. */
export const REFERENCE_CREDITS = 8;
export const REFERENCE_COST_USD = (0.067 + 0.00015) * 1.05;

export type Studio3dAction = 'reference' | 'model' | 'model_high' | 'retexture';

export type MarginGate = (credits: number, costUsd: number) => { credits: number; raised: boolean };
const noGate: MarginGate = (credits) => ({ credits, raised: false });

export interface Studio3dQuote {
  action: Studio3dAction;
  credits: number;
  costUsd: number;
  gpuSeconds: number;
}

export function fullCostUsd(action: Studio3dAction): number {
  if (action === 'reference') return REFERENCE_COST_USD;
  return GPU_SECONDS[action] * GPU_USD_PER_SEC * (1 + RETRY_SHARE) + HOSTING_USD + SAFETY_CHECK_USD;
}

export function creditsForCost(costUsd: number): number {
  // Round the product first: 0.1321 × 104.38 must not become 13.790000000000001 → 14 by float noise alone.
  return Math.ceil(Math.round(costUsd * CREDITS_PER_USD * 1e6) / 1e6);
}

export function quote3d(action: Studio3dAction, gate: MarginGate = noGate): Studio3dQuote {
  const costUsd = fullCostUsd(action);
  const base = action === 'reference' ? REFERENCE_CREDITS : creditsForCost(costUsd);
  return { action, credits: gate(base, costUsd).credits, costUsd, gpuSeconds: action === 'reference' ? 0 : GPU_SECONDS[action] };
}

/** What the card shows before the user taps: every paid step of the request, in order. */
export function journeyQuote(mode: 'image' | 'text' | 'retexture', high = false, gate?: MarginGate): Studio3dQuote[] {
  if (mode === 'retexture') return [quote3d('reference', gate), quote3d('retexture', gate)];
  const model = quote3d(high ? 'model_high' : 'model', gate);
  return mode === 'text' ? [quote3d('reference', gate), model] : [model];
}

/** Gross margin of selling `credits` at `creditGel` (₾) for an action that costs `costUsd` (mirror of #343's maths). */
export function grossMargin(credits: number, costUsd: number, creditGel = 0.08): number {
  const net = credits * creditGel * (1 - 0.03); // BOG card fee 3 %, VAT 0
  const cost = costUsd * 2.7 * 1.05; // $1 = 2.7 ₾ + 5 % FX reserve
  return net > 0 ? 1 - cost / net : 0;
}
