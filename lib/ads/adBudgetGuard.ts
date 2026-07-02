/**
 * Ad session budget guard — STEP 2.5. A SERVER-SIDE spend gate checked at the point where
 * paid work (Kling clips, ElevenLabs TTS, music) is about to happen — NOT just in the UI.
 * It protects the 2.6 ⛔ paid gate: a generation whose estimate exceeds the session cap (or
 * whose single scene alone exceeds it) returns a "top-up needed" verdict and never spends.
 *
 * Pure + framework-free → unit-testable. Costs are ESTIMATES; the per-scene Kling price MUST
 * be re-confirmed against live Replicate pricing before enabling any real render (2.6).
 */

/** Estimated wholesale USD per 6s Kling v2.1 i2v clip on Replicate. CONFIRM before 2.6. */
export const KLING_USD_PER_SCENE = 0.35;
/** ElevenLabs with-timestamps TTS for a short ad narration (whole ad, not per scene). */
export const TTS_USD_PER_AD = 0.1;
/** ElevenLabs Music / MusicGen bed for the ad (whole ad). */
export const MUSIC_USD_PER_AD = 0.05;
/** Hard session cap for this upgrade's paid test generations. */
export const AD_SESSION_BUDGET_USD = 5;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function estimateAdCostUsd(o: { scenes: number; withTts?: boolean; withMusic?: boolean }): number {
  const scenes = Math.max(0, Math.floor(o.scenes || 0));
  return round2(
    scenes * KLING_USD_PER_SCENE + (o.withTts ? TTS_USD_PER_AD : 0) + (o.withMusic ? MUSIC_USD_PER_AD : 0),
  );
}

export type BudgetVerdict =
  | { ok: true; estimatedUsd: number; capUsd: number; remainingUsd: number }
  | { ok: false; reason: 'per_scene_over_cap' | 'over_budget'; estimatedUsd: number; capUsd: number; message: string };

/**
 * Gate a would-be ad render against the session cap. `alreadySpentUsd` lets a caller thread
 * cumulative session spend so repeated tests can't collectively blow the cap.
 */
export function checkAdBudget(
  o: { scenes: number; withTts?: boolean; withMusic?: boolean },
  opts?: { capUsd?: number; alreadySpentUsd?: number },
): BudgetVerdict {
  const capUsd = opts?.capUsd ?? AD_SESSION_BUDGET_USD;
  const spent = Math.max(0, opts?.alreadySpentUsd ?? 0);

  // Per-scene guard: if even a SINGLE scene's cost exceeds the cap, STOP (never spend).
  if (KLING_USD_PER_SCENE > capUsd) {
    return {
      ok: false,
      reason: 'per_scene_over_cap',
      estimatedUsd: KLING_USD_PER_SCENE,
      capUsd,
      message: `A single scene ($${KLING_USD_PER_SCENE}) exceeds the $${capUsd} cap — halted.`,
    };
  }

  const estimatedUsd = estimateAdCostUsd(o);
  if (spent + estimatedUsd > capUsd) {
    return {
      ok: false,
      reason: 'over_budget',
      estimatedUsd,
      capUsd,
      message: `Estimated $${estimatedUsd} (＋$${round2(spent)} already spent) exceeds the $${capUsd} session cap — top-up needed.`,
    };
  }
  return { ok: true, estimatedUsd, capUsd, remainingUsd: round2(capUsd - spent - estimatedUsd) };
}
