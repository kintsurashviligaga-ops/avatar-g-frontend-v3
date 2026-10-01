/** @jest-environment node */
/**
 * limits.ts — who decides each number. Rules under test: LONGFORM_MARGIN unset / malformed / outside 1…10 → a 503
 * answer (never a guessed price); the per-account active cap; the account read (tier via resolveTier, balance, the
 * in-flight count) fails CLOSED to null, never to a number; and the tier's length + quality reach the plan's limits.
 */
import {
  LONGFORM_ACTIVE_STATUSES,
  LONGFORM_CREATE_RATE_LIMIT,
  longformLimitsFor,
  longformMaxActiveJobs,
  longformPricingFromEnv,
  readLongformAccount,
  type LongformDb,
} from './limits';
import { validateLongformRequest } from './plan';
import { FakeDb } from './testing/fakeDb';

describe('LONGFORM_MARGIN — the owner\'s number, or a 503', () => {
  test('unset, blank, malformed, below 1 or above 10 → 503 pricing_unconfigured', () => {
    for (const v of [undefined, '', '  ', 'abc', '1.5x', '-2', '0', '0.5', '0.99', '11', '150', 'NaN', 'Infinity', '1e3']) {
      const r = longformPricingFromEnv({ LONGFORM_MARGIN: v });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.status).toBe(503);
        expect(r.body.error).toBe('pricing_unconfigured');
      }
    }
  });

  test('1 … 10 is a price', () => {
    for (const [v, n] of [['1', 1], ['1.5', 1.5], [' 2.25 ', 2.25], ['10', 10]] as const) {
      expect(longformPricingFromEnv({ LONGFORM_MARGIN: v })).toEqual({ ok: true, pricing: { marginMultiplier: n } });
    }
  });

  test('the margin is what the plan prices with (Fast 1080p: $0.96 per scene → 39 credits at 1.5)', () => {
    const p = longformPricingFromEnv({ LONGFORM_MARGIN: '1.5' });
    if (!p.ok) throw new Error('unpriced');
    const v = validateLongformRequest({ seconds: 16, tier: 'fast' }, { maxSeconds: 240 }, p.pricing);
    expect(v.plan?.credits).toEqual({ perScene: 39, total: 78, marginMultiplier: 1.5 });
  });
});

describe('pace', () => {
  test('per-account create rate: its own namespace, a daily window', () => {
    expect(LONGFORM_CREATE_RATE_LIMIT).toMatchObject({ keyPrefix: 'rl:longform:create', windowMs: 86_400_000 });
    expect(LONGFORM_CREATE_RATE_LIMIT.maxRequests).toBeGreaterThan(0);
  });

  test('active cap: default 2, LONGFORM_MAX_ACTIVE_JOBS 1…10, anything else the default', () => {
    expect(longformMaxActiveJobs({})).toBe(2);
    expect(longformMaxActiveJobs({ LONGFORM_MAX_ACTIVE_JOBS: '5' })).toBe(5);
    expect(longformMaxActiveJobs({ LONGFORM_MAX_ACTIVE_JOBS: '99' })).toBe(10);
    for (const v of ['0', '-1', '2.5', 'x']) expect(longformMaxActiveJobs({ LONGFORM_MAX_ACTIVE_JOBS: v })).toBe(2);
    expect(LONGFORM_ACTIVE_STATUSES).toEqual(['directing', 'planned', 'rendering', 'stitching']);
  });
});

describe('readLongformAccount', () => {
  const db = (seed: ConstructorParameters<typeof FakeDb>[0]) => new FakeDb(seed);

  test('tier from the comp column, the balance, and only THIS user\'s in-flight films', async () => {
    const d = db({
      profiles: [{ id: 'u1', tier: 'BUSINESS', credits_balance: 1200 }],
      longform_jobs: [
        { id: 'a', user_id: 'u1', status: 'rendering' }, { id: 'b', user_id: 'u1', status: 'directing' },
        { id: 'c', user_id: 'u1', status: 'done' }, { id: 'd', user_id: 'u2', status: 'planned' },
      ],
    });
    expect(await readLongformAccount(d as unknown as LongformDb, 'u1', { env: {} })).toEqual({ tier: 'business', balanceCredits: 1200, activeJobs: 2 });
  });

  test('no profile row = a zero balance (nothing to debit from) and the free tier', async () => {
    expect(await readLongformAccount(db({}) as unknown as LongformDb, 'u1', { env: {} })).toEqual({ tier: 'free', balanceCredits: 0, activeJobs: 0 });
  });

  test('an unreadable balance or count is NULL — the route refuses, it never guesses', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined); // resolveTier logs the miss
    const d = db({ profiles: [{ id: 'u1', credits_balance: 50 }] });
    d.failNext('profiles', 'select'); // the tier read or the balance read — whichever asks first
    d.failNext('profiles', 'select');
    d.failNext('longform_jobs', 'select');
    const a = await readLongformAccount(d as unknown as LongformDb, 'u1', { env: {} });
    expect(a.balanceCredits).toBeNull();
    expect(a.activeJobs).toBeNull();
    expect(a.tier).toBe('free');
  });
});

describe('longformLimitsFor', () => {
  test('the tier decides length and quality; the platform and the balance pass through', () => {
    expect(longformLimitsFor({ tier: 'business', balanceCredits: 900, activeJobs: 0 }, { dailyLimitUsd: 10, remainingUsd: 4.5 }, {})).toEqual({
      maxSeconds: 240, allowedTiers: ['lite', 'fast', 'standard'], platformDailyLimitUsd: 10, platformBudgetRemainingUsd: 4.5, balanceCredits: 900,
    });
    const free = longformLimitsFor({ tier: 'free', balanceCredits: 50, activeJobs: 0 }, { dailyLimitUsd: 10, remainingUsd: null }, { LONGFORM_MAX_JOB_COST_USD: '20' });
    expect(free).toEqual({ maxSeconds: 8, allowedTiers: ['lite', 'fast'], platformDailyLimitUsd: 10, maxJobCostUsd: 20, balanceCredits: 50 });
  });

  test('so a free account is told why a long film or Standard is refused — every reason at once', () => {
    const limits = longformLimitsFor({ tier: 'free', balanceCredits: 10, activeJobs: 0 }, { dailyLimitUsd: 10 }, {});
    const v = validateLongformRequest({ seconds: 48, tier: 'standard' }, limits, { marginMultiplier: 1.5 });
    expect(v.reasons.map((r) => r.code).sort()).toEqual(['above_tier_limit', 'insufficient_credits', 'over_platform_daily_budget', 'tier_not_allowed']);
  });
});
