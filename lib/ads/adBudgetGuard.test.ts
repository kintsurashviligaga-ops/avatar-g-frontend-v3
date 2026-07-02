import {
  estimateAdCostUsd,
  checkAdBudget,
  AD_SESSION_BUDGET_USD,
  KLING_USD_PER_SCENE,
} from './adBudgetGuard';

describe('ad budget guard (STEP 2.5 — server-side spend gate)', () => {
  it('estimates cost from scenes + optional TTS/music', () => {
    expect(estimateAdCostUsd({ scenes: 4 })).toBe(4 * KLING_USD_PER_SCENE);
    expect(estimateAdCostUsd({ scenes: 2, withTts: true, withMusic: true })).toBeCloseTo(2 * KLING_USD_PER_SCENE + 0.1 + 0.05, 2);
    expect(estimateAdCostUsd({ scenes: 0 })).toBe(0);
  });

  it('passes a within-cap generation and reports remaining', () => {
    const v = checkAdBudget({ scenes: 5, withTts: true, withMusic: true });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.capUsd).toBe(AD_SESSION_BUDGET_USD);
      expect(v.remainingUsd).toBeGreaterThan(0);
    }
  });

  it('BLOCKS an over-cap generation with a top-up message (never spends)', () => {
    // way more scenes than $5 allows
    const v = checkAdBudget({ scenes: 40 });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toBe('over_budget');
      expect(v.message).toMatch(/top-?up/i);
      expect(v.estimatedUsd).toBeGreaterThan(AD_SESSION_BUDGET_USD);
    }
  });

  it('honors cumulative session spend (repeated tests cannot collectively blow the cap)', () => {
    // 12 scenes ≈ $4.2; with $4 already spent → over cap
    const v = checkAdBudget({ scenes: 12 }, { alreadySpentUsd: 4 });
    expect(v.ok).toBe(false);
  });

  it('respects a custom cap', () => {
    expect(checkAdBudget({ scenes: 2 }, { capUsd: 0.5 }).ok).toBe(false); // 2*0.35=0.7 > 0.5
    expect(checkAdBudget({ scenes: 1 }, { capUsd: 0.5 }).ok).toBe(true); // 0.35 < 0.5
  });
});
