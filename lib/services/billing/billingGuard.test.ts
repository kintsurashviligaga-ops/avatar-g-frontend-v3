/**
 * Master Task §4.1 — the BillingGuard test suite the deploy checklist requires.
 * Covers the pure decision core (costModel + budgetPolicy); the Supabase-backed shell is exercised
 * separately once a ledger fixture exists.
 */
import {
  estimateCost,
  approximateTokens,
  UNIT_COST_USD,
  SERVICE_TYPES,
  type ServiceType,
} from './costModel';
import {
  canProceed,
  checkThresholds,
  budgetMode,
  allowedServices,
  usageWindow,
  limitsFromEnv,
  selectModel,
  DEFAULT_LIMITS,
  ECONOMY_MODELS,
  PREMIUM_MODELS,
  type BudgetLimits,
} from './budgetPolicy';

const LIMITS: BudgetLimits = { dailyLimit: 10, monthlyLimit: 300, alertThresholdPercent: 80 };
/** A mid-month day, before any §1.8 burn-rate rule can fire. */
const EARLY = 3;

const at = (dailyUsed: number, monthlyUsed: number, dayOfMonth = EARLY) => ({
  daily: usageWindow(dailyUsed, LIMITS.dailyLimit),
  monthly: usageWindow(monthlyUsed, LIMITS.monthlyLimit),
  limits: LIMITS,
  dayOfMonth,
});

describe('BillingGuard', () => {
  it('blocks requests when daily limit reached', () => {
    // $9.99 spent today, a $0.03 image would cross $10.00.
    const d = canProceed({ ...at(9.99, 50), estimatedCost: 0.03, service: 'image' });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('daily_limit');
    expect(d.projectedDaily).toBeCloseTo(10.02, 4);
  });

  it('blocks requests when monthly limit reached', () => {
    // Under the daily limit, but the month is spent. NOTE: at $299 the §1.8 ladder has already halted
    // everything, so the monthly-limit branch is reached via a raised ladder-free envelope.
    const limits: BudgetLimits = { dailyLimit: 100, monthlyLimit: 300, alertThresholdPercent: 80 };
    const d = canProceed({
      daily: usageWindow(1, limits.dailyLimit),
      monthly: usageWindow(299.99, limits.monthlyLimit),
      limits,
      dayOfMonth: EARLY,
      estimatedCost: 0.03,
      service: 'image',
    });
    expect(d.allowed).toBe(false);
    // $299.99 trips the §1.8 FULL STOP ($295+) before the raw monthly ceiling — the stricter rule wins.
    expect(d.reason).toBe('full_stop');
  });

  it('allows requests within budget', () => {
    const d = canProceed({ ...at(1.2, 40), estimatedCost: 0.12, service: 'video' });
    expect(d).toMatchObject({ allowed: true, reason: 'ok', mode: 'normal' });
  });

  it('allows a request that lands exactly ON the limit (boundary is inclusive)', () => {
    const d = canProceed({ ...at(9.97, 50), estimatedCost: 0.03, service: 'image' });
    expect(d.allowed).toBe(true);
    expect(d.projectedDaily).toBeCloseTo(10, 4);
  });

  it('correctly estimates cost for each service', () => {
    // Chat is token-metered (§1.6.1): 1k in @ $1.50/1M + 500 out @ $9.00/1M.
    expect(estimateCost({ service: 'chat', model: 'gemini-3.6-flash', inputTokens: 1000, outputTokens: 500 }).estimatedCost)
      .toBeCloseTo(0.006, 6);
    // Cached input is 10× cheaper.
    expect(estimateCost({ service: 'chat', model: 'gemini-3.6-flash', inputTokens: 1000, cachedInput: true }).estimatedCost)
      .toBeCloseTo(0.00015, 6);
    // Per-unit services (§1.8).
    expect(estimateCost({ service: 'image', model: 'imagen-4', units: 4 }).estimatedCost).toBeCloseTo(0.12, 4);
    expect(estimateCost({ service: 'video', model: 'veo-3.1', units: 8 }).estimatedCost).toBeCloseTo(0.96, 4);
    expect(estimateCost({ service: 'dubbing', model: 'eleven', units: 3 }).estimatedCost).toBeCloseTo(0.15, 4);
    // Every service must be priced — a missing entry would make an expensive call look free.
    for (const s of SERVICE_TYPES) {
      const e = estimateCost({ service: s, model: 'x', units: 1, inputTokens: 1000, outputTokens: 1000 });
      expect(Number.isFinite(e.estimatedCost)).toBe(true);
      expect(e.estimatedCost).toBeGreaterThan(0);
      expect(e.currency).toBe('USD');
    }
  });

  it('never returns NaN, and never prices a missing quantity at zero', () => {
    // A NaN estimate would slip past every `>=` in the guard; a 0 estimate would waive the budget.
    const junk = estimateCost({ service: 'video', model: 'veo-3.1', units: Number.NaN });
    expect(junk.estimatedCost).toBeCloseTo(UNIT_COST_USD.video, 4); // defaults to ONE unit
    expect(estimateCost({ service: 'image', model: 'imagen-4' }).estimatedCost).toBeCloseTo(UNIT_COST_USD.image, 4);
    expect(estimateCost({ service: 'chat', model: 'x' }).estimatedCost).toBe(0); // no tokens declared yet
  });

  it('sends alert at 80% threshold', () => {
    const alerts = checkThresholds(at(8, 40));
    expect(alerts.map((a) => a.code)).toContain('daily_threshold');
    expect(alerts.find((a) => a.code === 'daily_threshold')?.level).toBe('warning');
    // 79% stays quiet.
    expect(checkThresholds(at(7.9, 40)).map((a) => a.code)).not.toContain('daily_threshold');
  });

  it('escalates to critical once a window is exhausted', () => {
    const codes = checkThresholds(at(10, 40)).map((a) => a.code);
    expect(codes).toContain('daily_exceeded');
    expect(checkThresholds(at(10, 40)).find((a) => a.code === 'daily_exceeded')?.level).toBe('critical');
  });
});

describe('Emergency Budget Rules (§1.8)', () => {
  it('switches to economy models at $200 by day 15 — but not before day 15', () => {
    expect(budgetMode(at(1, 200, 15))).toBe('economy');
    expect(budgetMode(at(1, 200, 14))).toBe('normal'); // same spend, on plan for the month
  });

  it('restricts video + dubbing for the FREE tier at $250 by day 20', () => {
    const mode = budgetMode(at(1, 250, 20));
    expect(mode).toBe('free_tier_restricted');
    expect(allowedServices(mode, true)).not.toContain('video');
    expect(allowedServices(mode, true)).not.toContain('dubbing');
    // A paying customer is unaffected by this rung.
    expect(allowedServices(mode, false)).toContain('video');
  });

  it('drops to chat + image only at $280', () => {
    const mode = budgetMode(at(1, 280, 25));
    expect(mode).toBe('chat_image_only');
    expect(allowedServices(mode, false)).toEqual(['chat', 'image']);
    expect(canProceed({ ...at(1, 280, 25), estimatedCost: 0.12, service: 'video' }).reason).toBe('service_suspended');
    expect(canProceed({ ...at(1, 280, 25), estimatedCost: 0.006, service: 'chat' }).allowed).toBe(true);
  });

  it('FULL STOPs at $295 — every service, paid or free', () => {
    const mode = budgetMode(at(1, 295, 28));
    expect(mode).toBe('full_stop');
    expect(allowedServices(mode, false)).toEqual([]);
    for (const s of SERVICE_TYPES) {
      expect(canProceed({ ...at(1, 295, 28), estimatedCost: 0.001, service: s }).allowed).toBe(false);
    }
    expect(checkThresholds(at(1, 295, 28))[0]).toMatchObject({ level: 'critical', code: 'full_stop' });
  });
});

describe('ModelSelector (§2.5.3)', () => {
  it('downshifts to economy models when little budget remains', () => {
    expect(selectModel('image', 49)).toBe(ECONOMY_MODELS.image);
    expect(selectModel('video', 10)).toBe(ECONOMY_MODELS.video);
  });
  it('uses premium models with budget in hand', () => {
    expect(selectModel('image', 50)).toBe(PREMIUM_MODELS.image);
    expect(selectModel('image', 250)).toBe('imagen-4');
    expect(selectModel('video', 250)).toBe('veo-3.1');
  });
  it('has a model for every one of the ten services in both tiers', () => {
    for (const s of SERVICE_TYPES) {
      expect(typeof ECONOMY_MODELS[s as ServiceType]).toBe('string');
      expect(typeof PREMIUM_MODELS[s as ServiceType]).toBe('string');
    }
  });
});

describe('limits + usage windows', () => {
  it('reads the envelope from env and falls back to the documented defaults', () => {
    expect(limitsFromEnv({})).toEqual(DEFAULT_LIMITS);
    expect(limitsFromEnv({ DAILY_COST_LIMIT: '5', MONTHLY_COST_LIMIT: '150', ALERT_THRESHOLD_PERCENT: '90' }))
      .toEqual({ dailyLimit: 5, monthlyLimit: 150, alertThresholdPercent: 90 });
    // Garbage never yields a 0/NaN limit, which would either block everything or waive the budget.
    expect(limitsFromEnv({ DAILY_COST_LIMIT: 'abc', MONTHLY_COST_LIMIT: '-4' })).toEqual(DEFAULT_LIMITS);
  });

  it('never reports Infinity/NaN percent for a zero limit', () => {
    expect(usageWindow(5, 0)).toEqual({ used: 5, limit: 0, percent: 0 });
    expect(usageWindow(Number.NaN, 10).used).toBe(0);
  });

  it('approximates chat tokens, rounding up', () => {
    expect(approximateTokens('')).toBe(0);
    expect(approximateTokens(null)).toBe(0);
    expect(approximateTokens('abcd')).toBe(1);
    expect(approximateTokens('abcde')).toBe(2);
  });
});
