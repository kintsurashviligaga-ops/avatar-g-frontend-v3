/**
 * lib/video/longform/plan.ts — the long-form (8 s … 240 s) film grid: durations, scene count, acts, cost, limits.
 *
 * A long-form film is N consecutive 8 s Veo clips (the only length that renders above 720p — capabilities.ts §1),
 * planned by the Director in ACTS of at most 12 scenes and rendered by a server-side queue (stateMachine.ts), never
 * by one request. This module is the arithmetic every other piece agrees on, in one place.
 *
 * ⚠️ Deliberately SEPARATE from lib/video/sceneGrid.ts (VIDEO_DURATIONS = [8, 24, 48], the ≤ 48 s composer) and from
 * lib/chat/filmPipeline.planFilmGrid (clamped to 12 scenes): those drive the existing one-request film path, whose
 * 12-scene ceiling is a real limit of that path (one 300 s request, one director call, one assembler pass). Raising
 * them would silently change the short-film product. Long-form gets its own constants and its own pipeline.
 *
 * Pure and client-safe (imports only the dependency-free capabilities table, the pure pricing leaf and the env flag
 * parser) so the UI duration selector and the cost preview read the same numbers the server bills by.
 */
import { costPerSecondUsd, resolveModel } from '@/lib/veo/capabilities';
import type { VeoResolution, VeoTier, VeoTransport } from '@/lib/veo/types';
import { CREDIT_VALUE_GEL } from '@/lib/credits/pricing';
import { GEL_PER_USD } from '@/lib/billing/fx';
import { isTruthyFlag } from '@/lib/env/flag';

/** One scene = one 8 s Veo clip. 8 s is the only Veo length that renders 1080p (capabilities.resolutionFor). */
export const LONGFORM_SCENE_SEC = 8;
export const LONGFORM_MIN_SEC = 8;
/** Four minutes. */
export const LONGFORM_MAX_SEC = 240;
export const LONGFORM_MAX_SCENES = LONGFORM_MAX_SEC / LONGFORM_SCENE_SEC;
/**
 * Scenes per act = scenes per Director call. ⚠️ 12 is not arbitrary: promptAgent budgets its output at
 * min(8000, 1500 + 400·n) tokens, which is already at the 8000 ceiling for 12–13 scenes. A 30-scene film in one call
 * would be truncated mid-JSON; three acts of 10 each fit with room to spare.
 */
export const LONGFORM_ACT_MAX_SCENES = 12;
export const LONGFORM_MAX_ACTS = Math.ceil(LONGFORM_MAX_SCENES / LONGFORM_ACT_MAX_SCENES);

/** Every offered length, 8 s steps — the UI selector's options (8, 16, …, 240). */
export const LONGFORM_DURATIONS: readonly number[] = Object.freeze(
  Array.from({ length: LONGFORM_MAX_SCENES }, (_, i) => (i + 1) * LONGFORM_SCENE_SEC),
);

/** Resolutions long-form renders. 4k is excluded: 1.5× Standard price and a master no upload path can carry. */
export const LONGFORM_RESOLUTIONS: readonly VeoResolution[] = Object.freeze(['720p', '1080p'] as VeoResolution[]);

const TIERS: readonly VeoTier[] = ['standard', 'fast', 'lite'];

/** LONGFORM_VIDEO_ENABLED — the whole feature is dark unless this is truthy ('1' | 'true' | 'yes' | 'on'). */
export function isLongformEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return isTruthyFlag(env.LONGFORM_VIDEO_ENABLED);
}

/** True for exactly the offered lengths (an integer multiple of 8 in [8, 240]). */
export function isLongformDuration(seconds: unknown): seconds is number {
  return (
    typeof seconds === 'number' &&
    Number.isInteger(seconds) &&
    seconds >= LONGFORM_MIN_SEC &&
    seconds <= LONGFORM_MAX_SEC &&
    seconds % LONGFORM_SCENE_SEC === 0
  );
}

/** Scenes for an offered length; null for anything else (callers validate first — never guess a count). */
export function longformSceneCount(seconds: unknown): number | null {
  return isLongformDuration(seconds) ? seconds / LONGFORM_SCENE_SEC : null;
}

export interface LongformAct {
  /** 0-based act index. */
  index: number;
  /** 0-based ordinal of the act's first scene (ordinals are film-wide). */
  firstOrdinal: number;
  lastOrdinal: number;
  sceneCount: number;
}

/**
 * Split `sceneCount` scenes into the FEWEST acts of ≤ maxPerAct, as evenly as possible (earlier acts take the
 * remainder): 30 → 10/10/10, 13 → 7/6, 25 → 9/8/8. ⚠️ Balanced, not greedy: 13 → 12/1 would give the Director a
 * one-scene act with no room for an arc, and the per-act reservation would bill a sliver.
 */
export function planActs(sceneCount: number, maxPerAct: number = LONGFORM_ACT_MAX_SCENES): LongformAct[] {
  const n = Number.isFinite(sceneCount) ? Math.max(0, Math.floor(sceneCount)) : 0;
  const cap = Number.isFinite(maxPerAct) && maxPerAct >= 1 ? Math.floor(maxPerAct) : LONGFORM_ACT_MAX_SCENES;
  if (n === 0) return [];
  const actCount = Math.ceil(n / cap);
  const base = Math.floor(n / actCount);
  const extra = n % actCount;
  const acts: LongformAct[] = [];
  let first = 0;
  for (let index = 0; index < actCount; index++) {
    const size = base + (index < extra ? 1 : 0);
    acts.push({ index, firstOrdinal: first, lastOrdinal: first + size - 1, sceneCount: size });
    first += size;
  }
  return acts;
}

/** The act a film-wide ordinal belongs to, or -1 when it is outside every act. */
export function actIndexOf(ordinal: number, acts: readonly LongformAct[]): number {
  const act = acts.find((a) => ordinal >= a.firstOrdinal && ordinal <= a.lastOrdinal);
  return act ? act.index : -1;
}

// ── Cost ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface LongformCostInput {
  seconds: number;
  tier: VeoTier;
  resolution?: VeoResolution;
  /** Vertex only can turn it off (cheaper video-only rate); the Gemini API always bills audio. Default true. */
  generateAudio?: boolean;
  /** Which Google API renders. Default 'gemini' — the production path until the GCP env exists. */
  transport?: VeoTransport;
}

export interface LongformCost {
  tier: VeoTier;
  resolution: VeoResolution;
  perSecondUsd: number;
  perSceneUsd: number;
  totalUsd: number;
}

const usd = (n: number): number => Math.round(n * 1e6) / 1e6;

/**
 * WHOLESALE Google cost (what we pay Veo), from capabilities' price table — never a hand-copied number. A
 * resolution the model does not render is priced as normalisation would render it (capabilities.costPerSecondUsd).
 */
export function longformCost(input: LongformCostInput): LongformCost {
  const resolution: VeoResolution = input.resolution ?? '1080p';
  const transport: VeoTransport = input.transport ?? 'gemini';
  const audio = input.generateAudio ?? true;
  const perSecondUsd = costPerSecondUsd(resolveModel(transport, input.tier), resolution, audio, transport);
  const seconds = Number.isFinite(input.seconds) && input.seconds > 0 ? input.seconds : 0;
  return {
    tier: input.tier,
    resolution,
    perSecondUsd,
    perSceneUsd: usd(perSecondUsd * LONGFORM_SCENE_SEC),
    totalUsd: usd(perSecondUsd * seconds),
  };
}

/** The same length priced on every quality tier, Standard → Lite (the cost table the UI and the doc show). */
export function longformCostTable(seconds: number, opts: Omit<LongformCostInput, 'seconds' | 'tier'> = {}): LongformCost[] {
  return TIERS.map((tier) => longformCost({ ...opts, seconds, tier }));
}

export interface LongformPricing {
  /**
   * Sell price ÷ wholesale cost. ⚠️ REQUIRED, no default: 1.0 sells a Veo second at exactly what Google charges,
   * and the flat credit ladder already loses money on video (lib/credits/pricing.ts). The number is a commercial
   * decision, so this module refuses to pick one.
   */
  marginMultiplier: number;
}

/** Credits for a USD amount at a margin (1 credit = CREDIT_VALUE_GEL ₾), rounded UP — never under-charge a cent. */
export function creditsForUsd(amountUsd: number, marginMultiplier: number): number {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return 0;
  const margin = Number.isFinite(marginMultiplier) && marginMultiplier > 0 ? marginMultiplier : 1;
  // Rounded to 1e-9 first so float noise (0.1 × 3 = 0.30000000000000004) cannot ceil a whole extra credit.
  const exact = Math.round(((amountUsd * GEL_PER_USD) / CREDIT_VALUE_GEL) * margin * 1e9) / 1e9;
  return Math.ceil(exact);
}

// ── Validation ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What the caller's account may do. Everything is PASSED IN: the subscription → seconds mapping is a product
 * decision that lives with the plans (lib/billing/pricingConfig), not here.
 */
export interface LongformLimits {
  /** The account's subscription ceiling in seconds (0 = long-form not included). */
  maxSeconds: number;
  /** Quality tiers this account may render. Absent = all three. */
  allowedTiers?: readonly VeoTier[];
  /** Per-job wholesale ceiling, USD. Absent = none. */
  maxJobCostUsd?: number;
  /**
   * The platform's WHOLE daily provider envelope (DAILY_COST_LIMIT, default $10). A job costing more can never
   * finish inside its 24 h deadline, because the budget guard pauses it once the day's money is gone.
   */
  platformDailyLimitUsd?: number;
  /** What is left of today's envelope. A job costing more still runs, paced: it pauses until the budget frees. */
  platformBudgetRemainingUsd?: number;
  /** The user's balance in credits — checked against the WHOLE film up front (acts are then reserved one by one). */
  balanceCredits?: number;
}

export interface LongformRequest {
  seconds: number;
  tier: VeoTier;
  resolution?: VeoResolution;
  generateAudio?: boolean;
  transport?: VeoTransport;
}

export type LongformIssueCode =
  | 'invalid_duration'
  | 'below_minimum'
  | 'above_maximum'
  | 'off_grid'
  | 'above_tier_limit'
  | 'tier_not_allowed'
  | 'resolution_not_allowed'
  | 'over_job_cost_cap'
  | 'over_platform_daily_budget'
  | 'insufficient_credits'
  | 'platform_budget_pacing';

export interface LongformIssue {
  code: LongformIssueCode;
  message: string;
}

export interface LongformPlan {
  seconds: number;
  sceneCount: number;
  acts: LongformAct[];
  tier: VeoTier;
  resolution: VeoResolution;
  generateAudio: boolean;
  transport: VeoTransport;
  cost: LongformCost;
  /** Present when pricing was supplied. total = perScene × sceneCount, so a per-scene refund is always exact. */
  credits: { perScene: number; total: number; marginMultiplier: number } | null;
}

export interface LongformValidation {
  /** True when `reasons` is empty. Warnings never block. */
  ok: boolean;
  reasons: LongformIssue[];
  warnings: LongformIssue[];
  /** Null only when the duration itself is unusable (nothing to price). */
  plan: LongformPlan | null;
}

const money = (n: number): string => `$${n.toFixed(2)}`;

/**
 * Validate a request against the grid and the caller's limits. Every failed rule is reported (not just the first),
 * so the UI can explain all of them at once. Never throws.
 */
export function validateLongformRequest(
  req: LongformRequest,
  limits: LongformLimits,
  pricing?: LongformPricing,
): LongformValidation {
  const reasons: LongformIssue[] = [];
  const warnings: LongformIssue[] = [];
  const s = req.seconds;

  if (typeof s !== 'number' || !Number.isFinite(s) || !Number.isInteger(s)) {
    reasons.push({ code: 'invalid_duration', message: 'Length must be a whole number of seconds.' });
  } else {
    if (s < LONGFORM_MIN_SEC) reasons.push({ code: 'below_minimum', message: `Length must be at least ${LONGFORM_MIN_SEC} s.` });
    if (s > LONGFORM_MAX_SEC) reasons.push({ code: 'above_maximum', message: `Length must be at most ${LONGFORM_MAX_SEC} s.` });
    if (s % LONGFORM_SCENE_SEC !== 0) {
      reasons.push({ code: 'off_grid', message: `Length must be a multiple of ${LONGFORM_SCENE_SEC} s (one Veo clip per ${LONGFORM_SCENE_SEC} s).` });
    }
  }

  const maxSeconds = Number.isFinite(limits.maxSeconds) ? Math.max(0, limits.maxSeconds) : 0;
  if (typeof s === 'number' && Number.isFinite(s) && s > maxSeconds) {
    reasons.push({
      code: 'above_tier_limit',
      message: maxSeconds > 0 ? `Your plan allows films up to ${maxSeconds} s.` : 'Your plan does not include long-form films.',
    });
  }

  const tierOk = TIERS.includes(req.tier);
  if (!tierOk || (limits.allowedTiers && !limits.allowedTiers.includes(req.tier))) {
    reasons.push({ code: 'tier_not_allowed', message: `The ${String(req.tier)} quality tier is not available on your plan.` });
  }
  const resolution: VeoResolution = req.resolution ?? '1080p';
  if (!LONGFORM_RESOLUTIONS.includes(resolution)) {
    reasons.push({ code: 'resolution_not_allowed', message: `Long-form films render at ${LONGFORM_RESOLUTIONS.join(' or ')}.` });
  }

  if (!isLongformDuration(s) || !tierOk) return { ok: false, reasons, warnings, plan: null };

  const sceneCount = s / LONGFORM_SCENE_SEC;
  const transport: VeoTransport = req.transport ?? 'gemini';
  const generateAudio = req.generateAudio ?? true;
  const cost = longformCost({ seconds: s, tier: req.tier, resolution, generateAudio, transport });

  if (limits.maxJobCostUsd !== undefined && Number.isFinite(limits.maxJobCostUsd) && cost.totalUsd > limits.maxJobCostUsd) {
    reasons.push({ code: 'over_job_cost_cap', message: `This film costs ${money(cost.totalUsd)} to render; the limit is ${money(limits.maxJobCostUsd)}.` });
  }
  if (limits.platformDailyLimitUsd !== undefined && Number.isFinite(limits.platformDailyLimitUsd) && cost.totalUsd > limits.platformDailyLimitUsd) {
    reasons.push({
      code: 'over_platform_daily_budget',
      message: `This film costs ${money(cost.totalUsd)}, more than the platform's whole daily video budget (${money(limits.platformDailyLimitUsd)}); it could not finish within a day.`,
    });
  } else if (
    limits.platformBudgetRemainingUsd !== undefined &&
    Number.isFinite(limits.platformBudgetRemainingUsd) &&
    cost.totalUsd > limits.platformBudgetRemainingUsd
  ) {
    warnings.push({
      code: 'platform_budget_pacing',
      message: `Today's remaining video budget (${money(Math.max(0, limits.platformBudgetRemainingUsd))}) is below this film's cost; rendering will pause until it frees.`,
    });
  }

  let credits: LongformPlan['credits'] = null;
  if (pricing) {
    const perScene = creditsForUsd(cost.perSceneUsd, pricing.marginMultiplier);
    credits = { perScene, total: perScene * sceneCount, marginMultiplier: pricing.marginMultiplier };
    if (limits.balanceCredits !== undefined && Number.isFinite(limits.balanceCredits) && limits.balanceCredits < credits.total) {
      reasons.push({ code: 'insufficient_credits', message: `This film needs ${credits.total} credits; the balance is ${Math.max(0, Math.floor(limits.balanceCredits))}.` });
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    warnings,
    plan: { seconds: s, sceneCount, acts: planActs(sceneCount), tier: req.tier, resolution, generateAudio, transport, cost, credits },
  };
}
