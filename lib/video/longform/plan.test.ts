/** @jest-environment node */
/**
 * plan.ts — the long-form grid: the 8 s step list the UI offers, scene count, balanced acts of ≤ 12, the wholesale
 * cost read from capabilities' table (never a hand-copied number), credits at a caller-supplied margin, and the
 * validation that reports EVERY failed rule. Pure: no mocks, except the env for the feature flag.
 */
import {
  actIndexOf,
  creditsForUsd,
  isLongformDuration,
  isLongformEnabled,
  LONGFORM_ACT_MAX_SCENES,
  LONGFORM_DURATIONS,
  LONGFORM_MAX_ACTS,
  LONGFORM_MAX_SCENES,
  longformCost,
  longformCostTable,
  longformSceneCount,
  planActs,
  validateLongformRequest,
  type LongformLimits,
} from './plan';

const OPEN: LongformLimits = { maxSeconds: 240 };

describe('the duration grid', () => {
  test('LONGFORM_DURATIONS is 8 … 240 in 8 s steps (30 options) and is frozen', () => {
    expect(LONGFORM_DURATIONS).toHaveLength(30);
    expect(LONGFORM_DURATIONS[0]).toBe(8);
    expect(LONGFORM_DURATIONS[29]).toBe(240);
    LONGFORM_DURATIONS.forEach((d, i) => expect(d).toBe((i + 1) * 8));
    expect(Object.isFrozen(LONGFORM_DURATIONS)).toBe(true);
    expect(LONGFORM_MAX_SCENES).toBe(30);
    expect(LONGFORM_MAX_ACTS).toBe(3);
  });

  test('isLongformDuration accepts exactly the offered lengths', () => {
    for (const d of LONGFORM_DURATIONS) expect(isLongformDuration(d)).toBe(true);
    for (const bad of [0, 4, 7, 9, 12, 236, 248, 256, -8, 8.5, NaN, Infinity, '8', null, undefined]) {
      expect(isLongformDuration(bad)).toBe(false);
    }
  });

  test('longformSceneCount is seconds / 8, null off-grid', () => {
    expect(longformSceneCount(8)).toBe(1);
    expect(longformSceneCount(96)).toBe(12);
    expect(longformSceneCount(240)).toBe(30);
    expect(longformSceneCount(100)).toBeNull();
    expect(longformSceneCount(248)).toBeNull();
  });
});

describe('planActs', () => {
  const sizes = (n: number) => planActs(n).map((a) => a.sceneCount);

  test('the fewest acts of ≤ 12, balanced with the remainder up front', () => {
    expect(sizes(1)).toEqual([1]);
    expect(sizes(12)).toEqual([12]);
    expect(sizes(13)).toEqual([7, 6]);
    expect(sizes(24)).toEqual([12, 12]);
    expect(sizes(25)).toEqual([9, 8, 8]);
    expect(sizes(30)).toEqual([10, 10, 10]);
  });

  test('every scene count 1…30: contiguous ordinals, no act over the cap, sizes differ by at most one', () => {
    for (let n = 1; n <= LONGFORM_MAX_SCENES; n++) {
      const acts = planActs(n);
      expect(acts.length).toBe(Math.ceil(n / LONGFORM_ACT_MAX_SCENES));
      expect(acts.reduce((s, a) => s + a.sceneCount, 0)).toBe(n);
      let next = 0;
      acts.forEach((a, i) => {
        expect(a.index).toBe(i);
        expect(a.firstOrdinal).toBe(next);
        expect(a.lastOrdinal).toBe(next + a.sceneCount - 1);
        expect(a.sceneCount).toBeLessThanOrEqual(LONGFORM_ACT_MAX_SCENES);
        next = a.lastOrdinal + 1;
      });
      const counts = acts.map((a) => a.sceneCount);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  });

  test('degenerate input never throws', () => {
    expect(planActs(0)).toEqual([]);
    expect(planActs(-3)).toEqual([]);
    expect(planActs(NaN)).toEqual([]);
    expect(planActs(5, 0).map((a) => a.sceneCount)).toEqual([5]); // nonsense cap → the default 12
    expect(planActs(5, 2).map((a) => a.sceneCount)).toEqual([2, 2, 1]);
  });

  test('actIndexOf maps a film-wide ordinal to its act', () => {
    const acts = planActs(25); // 9 / 8 / 8 → 0-8, 9-16, 17-24
    expect(actIndexOf(0, acts)).toBe(0);
    expect(actIndexOf(8, acts)).toBe(0);
    expect(actIndexOf(9, acts)).toBe(1);
    expect(actIndexOf(24, acts)).toBe(2);
    expect(actIndexOf(25, acts)).toBe(-1);
    expect(actIndexOf(-1, acts)).toBe(-1);
  });
});

describe('cost', () => {
  test('the published Gemini-API rates at 1080p with audio: Standard $0.40, Fast $0.12, Lite $0.08 per second', () => {
    expect(longformCost({ seconds: 240, tier: 'standard' })).toEqual({ tier: 'standard', resolution: '1080p', perSecondUsd: 0.4, perSceneUsd: 3.2, totalUsd: 96 });
    expect(longformCost({ seconds: 240, tier: 'fast' }).totalUsd).toBeCloseTo(28.8, 6);
    expect(longformCost({ seconds: 240, tier: 'lite' }).totalUsd).toBeCloseTo(19.2, 6);
  });

  test('the doc cost table (8 / 24 / 48 / 96 / 240 s × three tiers)', () => {
    const table = [8, 24, 48, 96, 240].map((s) => longformCostTable(s).map((c) => c.totalUsd));
    expect(table).toEqual([
      [3.2, 0.96, 0.64],
      [9.6, 2.88, 1.92],
      [19.2, 5.76, 3.84],
      [38.4, 11.52, 7.68],
      [96, 28.8, 19.2],
    ]);
  });

  test('720p and Vertex video-only come from the same table', () => {
    expect(longformCost({ seconds: 8, tier: 'fast', resolution: '720p' }).perSecondUsd).toBe(0.1);
    expect(longformCost({ seconds: 8, tier: 'lite', resolution: '720p' }).perSecondUsd).toBe(0.05);
    expect(longformCost({ seconds: 8, tier: 'standard', transport: 'vertex', generateAudio: false }).perSecondUsd).toBe(0.2);
    // The Gemini API has no audio toggle, so "audio off" is still billed at the audio rate.
    expect(longformCost({ seconds: 8, tier: 'standard', transport: 'gemini', generateAudio: false }).perSecondUsd).toBe(0.4);
  });

  test('creditsForUsd: GEL 2.7 / USD, 0.10 ₾ / credit, rounded UP, no float-noise extra credit', () => {
    expect(creditsForUsd(1, 1)).toBe(27);
    expect(creditsForUsd(3.2, 1)).toBe(87); // 86.4 → 87
    expect(creditsForUsd(3.2, 1.5)).toBe(130); // 129.6 → 130
    expect(creditsForUsd(0.1 * 3, 1)).toBe(9); // 8.1 → 9, not 10 from 0.30000000000000004
    expect(creditsForUsd(0, 2)).toBe(0);
    expect(creditsForUsd(-1, 2)).toBe(0);
    expect(creditsForUsd(1, NaN)).toBe(27); // a nonsense margin reads as 1, never 0
  });
});

describe('validateLongformRequest', () => {
  const codes = (v: ReturnType<typeof validateLongformRequest>) => v.reasons.map((r) => r.code);

  test('a valid request yields the full plan', () => {
    const v = validateLongformRequest({ seconds: 240, tier: 'fast' }, OPEN, { marginMultiplier: 1.5 });
    expect(v.ok).toBe(true);
    expect(v.reasons).toEqual([]);
    expect(v.plan).toMatchObject({ seconds: 240, sceneCount: 30, tier: 'fast', resolution: '1080p', generateAudio: true, transport: 'gemini' });
    expect(v.plan?.acts.map((a) => a.sceneCount)).toEqual([10, 10, 10]);
    // 0.96 $/scene × 2.7 / 0.1 × 1.5 = 38.88 → 39 per scene; the total is per-scene × count (exact refunds).
    expect(v.plan?.credits).toEqual({ perScene: 39, total: 39 * 30, marginMultiplier: 1.5 });
  });

  test('no pricing → no credit block', () => {
    expect(validateLongformRequest({ seconds: 8, tier: 'lite' }, OPEN).plan?.credits).toBeNull();
  });

  test('off-grid, too short, too long and non-integer lengths are refused with no plan', () => {
    expect(codes(validateLongformRequest({ seconds: 100, tier: 'fast' }, OPEN))).toEqual(['off_grid']);
    expect(codes(validateLongformRequest({ seconds: 4, tier: 'fast' }, OPEN))).toEqual(['below_minimum', 'off_grid']);
    expect(codes(validateLongformRequest({ seconds: 248, tier: 'fast' }, { maxSeconds: 999 }))).toEqual(['above_maximum']);
    expect(codes(validateLongformRequest({ seconds: 8.5, tier: 'fast' }, OPEN))).toEqual(['invalid_duration']);
    expect(codes(validateLongformRequest({ seconds: NaN, tier: 'fast' }, OPEN))).toEqual(['invalid_duration']);
    expect(validateLongformRequest({ seconds: 100, tier: 'fast' }, OPEN).plan).toBeNull();
  });

  test('the subscription ceiling is an input, not a constant', () => {
    expect(codes(validateLongformRequest({ seconds: 96, tier: 'fast' }, { maxSeconds: 48 }))).toEqual(['above_tier_limit']);
    const none = validateLongformRequest({ seconds: 8, tier: 'fast' }, { maxSeconds: 0 });
    expect(codes(none)).toEqual(['above_tier_limit']);
    expect(none.reasons[0]?.message).toMatch(/does not include/);
    expect(validateLongformRequest({ seconds: 48, tier: 'fast' }, { maxSeconds: 48 }).ok).toBe(true);
    // A tier-limit miss still prices the request (the UI can show what an upgrade would cost).
    expect(validateLongformRequest({ seconds: 96, tier: 'fast' }, { maxSeconds: 48 }).plan?.sceneCount).toBe(12);
  });

  test('quality tier and resolution gates', () => {
    expect(codes(validateLongformRequest({ seconds: 8, tier: 'standard' }, { maxSeconds: 240, allowedTiers: ['fast', 'lite'] }))).toEqual(['tier_not_allowed']);
    expect(codes(validateLongformRequest({ seconds: 8, tier: 'ultra' as never }, OPEN))).toEqual(['tier_not_allowed']);
    expect(codes(validateLongformRequest({ seconds: 8, tier: 'standard', resolution: '4k' }, OPEN))).toEqual(['resolution_not_allowed']);
  });

  test('cost caps: a per-job ceiling, and the whole platform day refuses; the remaining day only warns', () => {
    expect(codes(validateLongformRequest({ seconds: 240, tier: 'standard' }, { maxSeconds: 240, maxJobCostUsd: 50 }))).toEqual(['over_job_cost_cap']);
    // The audit's breakpoint: a 240 s Standard film ($96) against the default $10 DAILY_COST_LIMIT.
    const day = validateLongformRequest({ seconds: 240, tier: 'standard' }, { maxSeconds: 240, platformDailyLimitUsd: 10 });
    expect(codes(day)).toEqual(['over_platform_daily_budget']);
    const paced = validateLongformRequest({ seconds: 96, tier: 'fast' }, { maxSeconds: 240, platformDailyLimitUsd: 50, platformBudgetRemainingUsd: 5 });
    expect(paced.ok).toBe(true);
    expect(paced.warnings.map((w) => w.code)).toEqual(['platform_budget_pacing']);
  });

  test('the whole film must be affordable up front (acts are then reserved one at a time)', () => {
    const v = validateLongformRequest({ seconds: 24, tier: 'lite' }, { maxSeconds: 240, balanceCredits: 10 }, { marginMultiplier: 1 });
    // 0.64 $/scene → 17.28 → 18 credits/scene × 3 = 54.
    expect(v.plan?.credits?.total).toBe(54);
    expect(codes(v)).toEqual(['insufficient_credits']);
    expect(validateLongformRequest({ seconds: 24, tier: 'lite' }, { maxSeconds: 240, balanceCredits: 54 }, { marginMultiplier: 1 }).ok).toBe(true);
  });

  test('every failed rule is reported at once', () => {
    const v = validateLongformRequest(
      { seconds: 240, tier: 'standard', resolution: '4k' },
      { maxSeconds: 48, allowedTiers: ['lite'], maxJobCostUsd: 1, platformDailyLimitUsd: 10, balanceCredits: 0 },
      { marginMultiplier: 1 },
    );
    expect(codes(v).sort()).toEqual(
      ['above_tier_limit', 'insufficient_credits', 'over_job_cost_cap', 'over_platform_daily_budget', 'resolution_not_allowed', 'tier_not_allowed'].sort(),
    );
  });
});

test('isLongformEnabled reads LONGFORM_VIDEO_ENABLED tolerantly and is off by default', () => {
  expect(isLongformEnabled({})).toBe(false);
  expect(isLongformEnabled({ LONGFORM_VIDEO_ENABLED: '' })).toBe(false);
  expect(isLongformEnabled({ LONGFORM_VIDEO_ENABLED: '0' })).toBe(false);
  expect(isLongformEnabled({ LONGFORM_VIDEO_ENABLED: 'false' })).toBe(false);
  expect(isLongformEnabled({ LONGFORM_VIDEO_ENABLED: '1' })).toBe(true);
  expect(isLongformEnabled({ LONGFORM_VIDEO_ENABLED: ' TRUE ' })).toBe(true);
});
