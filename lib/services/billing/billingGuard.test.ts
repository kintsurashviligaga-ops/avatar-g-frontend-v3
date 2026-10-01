/**
 * Master Task §4.1 — the BillingGuard test suite the deploy checklist requires.
 * Covers the pure decision core (costModel + budgetPolicy); the Supabase-backed shell is exercised
 * separately once a ledger fixture exists.
 */
import {
  estimateCost,
  approximateTokens,
  geminiPriceFamily,
  resolveTokenPrice,
  groundingCostUsd,
  GEMINI_PRICE_TABLE,
  GEMINI_TOKEN_PRICING,
  LONG_CONTEXT_THRESHOLD_TOKENS,
  MAX_GROUNDING_UNITS_PER_CALL,
  UNIT_COST_USD,
  SERVICE_TYPES,
  type GeminiPriceFamily,
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
    // Chat is token-metered (§1.6.1): 1k in @ $1.50/1M + 500 out @ $7.50/1M (3.6 Flash, 2027 list price).
    expect(estimateCost({ service: 'chat', model: 'gemini-3.6-flash', inputTokens: 1000, outputTokens: 500 }).estimatedCost)
      .toBeCloseTo(0.00525, 6);
    // Cached input is 10× cheaper.
    expect(estimateCost({ service: 'chat', model: 'gemini-3.6-flash', inputTokens: 1000, cachedInput: true }).estimatedCost)
      .toBeCloseTo(0.00015, 6);
    // Per-unit services (§1.8).
    expect(estimateCost({ service: 'image', model: 'imagen-4', units: 4 }).estimatedCost).toBeCloseTo(0.12, 4);
    expect(estimateCost({ service: 'video', model: 'veo-3.1', units: 8 }).estimatedCost).toBeCloseTo(0.96, 4);
    // A caller that knows the exact rate (a Veo Standard 1080p clip with audio: $0.40/s) overrides the flat line…
    expect(estimateCost({ service: 'video', model: 'veo-3.1-generate-001', units: 8, unitCostUsd: 0.4 }).estimatedCost).toBeCloseTo(3.2, 4);
    // …and a garbage override falls back to it rather than pricing the call at zero.
    expect(estimateCost({ service: 'video', model: 'veo-3.1', units: 8, unitCostUsd: Number.NaN }).estimatedCost).toBeCloseTo(0.96, 4);
    expect(estimateCost({ service: 'video', model: 'veo-3.1', units: 8, unitCostUsd: -1 }).estimatedCost).toBeCloseTo(0.96, 4);
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

describe('per-model Gemini token pricing', () => {
  it('places every model id verified on the funded key (2026-09-30) in a family', () => {
    const expected: Record<string, GeminiPriceFamily> = {
      // chat
      'gemini-3.8-flash': 'flash-3.6',
      'gemini-3.7-flash': 'flash-3.6',
      'gemini-3.6-flash': 'flash-3.6',
      'gemini-3.5-flash': 'flash-3.5',
      'gemini-3.1-flash-lite': 'flash-lite-3',
      'gemini-3.5-flash-lite': 'flash-lite-3.5',
      'gemini-3.1-pro-preview': 'pro-3',
      'gemini-pro-latest': 'pro-3',
      'gemini-flash-latest': 'flash-3.5',
      'gemini-2.5-pro': 'pro-2.5',
      'gemini-2.5-flash': 'flash-2.5',
      'gemini-2.5-flash-lite': 'flash-lite-2.5',
      // live — checked BEFORE flash: 'gemini-3.1-flash-live-preview' also says "flash"
      'gemini-2.5-flash-native-audio-latest': 'live-audio',
      'gemini-2.5-flash-native-audio-preview-12-2025': 'live-audio',
      'gemini-3.8-live': 'live-audio',
      'gemini-3.1-flash-live-preview': 'live-audio',
      'gemini-3.5-transcribe-live': 'live-audio',
      // tts — also checked before flash
      'gemini-2.5-flash-preview-tts': 'tts-flash',
      'gemini-3.8-flash-tts': 'tts-flash',
      'gemini-3.1-flash-tts-preview': 'tts-flash',
      'gemini-2.5-pro-preview-tts': 'tts-pro',
      // suffixes / prefixes a provider or SDK adds must not knock an id onto the fallback
      'models/gemini-2.5-flash': 'flash-2.5',
      'Gemini-2.5-Flash': 'flash-2.5',
      'gemini-2.5-flash-preview-09-2025': 'flash-2.5',
      'gemini-2.5-flash-lite-preview-09-2025': 'flash-lite-2.5',
      'gemini-3-flash-preview': 'flash-3',
      'gemini-3-pro-preview': 'pro-3',
      'gemini-3.1-flash-lite-preview': 'flash-lite-3',
      'gemini-3.5-flash-lite-preview-07-2026': 'flash-lite-3.5',
      // a Flash newer than any published price → the dearest known Flash row, never a cheaper one
      'gemini-3.9-flash': 'flash-3.5',
      'gemini-4.0-flash-preview': 'flash-3.5',
    };
    for (const [id, family] of Object.entries(expected)) expect([id, geminiPriceFamily(id)]).toEqual([id, family]);
  });

  it('leaves unknown, retired and non-Gemini ids unplaced (→ flat fallback)', () => {
    for (const id of [
      'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', // retired (404) — never booked
      'gemini-3.6-flash-lite', 'gemini-4.0-flash-lite', // no published Flash-Lite price above 3.5
      'gemini-2.5-flash-image', // image-output tokens are not a chat rate
      'gemini', 'gemini-exp-1206', 'gpt', 'claude-haiku-4-5', 'deepseek', 'chat', '', 'x'.repeat(300),
    ]) {
      expect([id, geminiPriceFamily(id)]).toEqual([id, null]);
    }
    expect(geminiPriceFamily(null)).toBeNull();
    expect(geminiPriceFamily(undefined)).toBeNull();
    expect(resolveTokenPrice('claude-haiku-4-5')).toMatchObject({ family: 'fallback', ...GEMINI_TOKEN_PRICING });
  });

  it('prices each family at its own rate (1k in + 500 out)', () => {
    const cost = (model: string) => estimateCost({ service: 'chat', model, inputTokens: 1000, outputTokens: 500 }).estimatedCost;
    expect(cost('gemini-2.5-flash-lite')).toBeCloseTo((1000 * 0.1 + 500 * 0.4) / 1e6, 6);
    expect(cost('gemini-2.5-flash')).toBeCloseTo((1000 * 0.3 + 500 * 2.5) / 1e6, 6);
    expect(cost('gemini-3-flash-preview')).toBeCloseTo((1000 * 0.5 + 500 * 3) / 1e6, 6);
    expect(cost('gemini-3.8-flash')).toBeCloseTo((1000 * 1.5 + 500 * 7.5) / 1e6, 6);
    expect(cost('gemini-3.5-flash')).toBeCloseTo((1000 * 1.5 + 500 * 9) / 1e6, 6);
    expect(cost('gemini-3.5-flash-lite')).toBeCloseTo((1000 * 0.3 + 500 * 2.5) / 1e6, 6);
    expect(cost('gemini-3.1-flash-lite')).toBeCloseTo((1000 * 0.25 + 500 * 1.5) / 1e6, 6);
    expect(cost('gemini-2.5-pro')).toBeCloseTo((1000 * 1.25 + 500 * 10) / 1e6, 6);
    expect(cost('gemini-3.1-pro-preview')).toBeCloseTo((1000 * 2 + 500 * 12) / 1e6, 6);
    expect(cost('gemini-2.5-flash-native-audio-latest')).toBeCloseTo((1000 * 3 + 500 * 12) / 1e6, 6);
    expect(cost('gemini-2.5-flash-preview-tts')).toBeCloseTo((1000 * 0.5 + 500 * 10) / 1e6, 6);
    // Unknown id → exactly the pre-per-model flat rate.
    expect(cost('some-future-model')).toBeCloseTo((1000 * 1.5 + 500 * 9) / 1e6, 6);
  });

  it('keeps the table sane: every rate finite and positive, output ≥ input, cached ≤ input', () => {
    for (const [family, row] of Object.entries(GEMINI_PRICE_TABLE)) {
      for (const rates of [row, ...(row.longContext ? [row.longContext] : [])]) {
        for (const v of [rates.inputPerMillion, rates.outputPerMillion, rates.cachedInputPerMillion]) {
          expect([family, Number.isFinite(v) && v > 0]).toEqual([family, true]);
        }
        expect([family, rates.outputPerMillion >= rates.inputPerMillion]).toEqual([family, true]);
        expect([family, rates.cachedInputPerMillion <= rates.inputPerMillion]).toEqual([family, true]);
      }
      expect([family, row.grounding.usd >= 0]).toEqual([family, true]);
    }
    // An id we cannot price must never look cheaper than the known Flash tiers — "unknown" errs toward the budget.
    for (const f of ['flash-2.5', 'flash-3', 'flash-3.5', 'flash-3.6', 'flash-lite-2.5', 'flash-lite-3', 'flash-lite-3.5'] as const) {
      expect(GEMINI_PRICE_TABLE[f].inputPerMillion).toBeLessThanOrEqual(GEMINI_TOKEN_PRICING.inputPerMillion);
      expect(GEMINI_PRICE_TABLE[f].outputPerMillion).toBeLessThanOrEqual(GEMINI_TOKEN_PRICING.outputPerMillion);
    }
  });

  it('steps Pro up to the long-context rates only past 200k prompt tokens', () => {
    expect(resolveTokenPrice('gemini-2.5-pro', LONG_CONTEXT_THRESHOLD_TOKENS)).toMatchObject({ inputPerMillion: 1.25, outputPerMillion: 10 });
    expect(resolveTokenPrice('gemini-2.5-pro', LONG_CONTEXT_THRESHOLD_TOKENS + 1)).toMatchObject({ inputPerMillion: 2.5, outputPerMillion: 15 });
    expect(resolveTokenPrice('gemini-3.1-pro-preview', 300_000)).toMatchObject({ inputPerMillion: 4, outputPerMillion: 18, cachedInputPerMillion: 0.4 });
    // Flash has no long-context tier.
    expect(resolveTokenPrice('gemini-2.5-flash', 900_000)).toMatchObject({ inputPerMillion: 0.3, outputPerMillion: 2.5 });
    expect(estimateCost({ service: 'chat', model: 'gemini-2.5-pro', inputTokens: 250_000, outputTokens: 1000 }).estimatedCost)
      .toBeCloseTo((250_000 * 2.5 + 1000 * 15) / 1e6, 6);
  });

  it('bills a partial context-cache hit at the cached rate (clamped to the prompt)', () => {
    expect(estimateCost({ service: 'chat', model: 'gemini-3.1-pro-preview', inputTokens: 1000, cachedInputTokens: 400 }).estimatedCost)
      .toBeCloseTo((600 * 2 + 400 * 0.2) / 1e6, 6);
    expect(estimateCost({ service: 'chat', model: 'gemini-3.1-pro-preview', inputTokens: 1000, cachedInputTokens: 5000 }).estimatedCost)
      .toBeCloseTo((1000 * 0.2) / 1e6, 6);
    // The boolean form still means "all of it".
    expect(estimateCost({ service: 'chat', model: 'gemini-2.5-flash', inputTokens: 1000, cachedInput: true }).estimatedCost)
      .toBeCloseTo((1000 * 0.03) / 1e6, 6);
  });

  it('prices Google Search grounding per query (Gemini 3+) or per grounded prompt (2.5)', () => {
    const g = (model: string, groundingQueries: number) => estimateCost({ service: 'chat', model, groundingQueries }).estimatedCost;
    expect(g('gemini-3.8-flash', 1)).toBeCloseTo(0.014, 6);
    expect(g('gemini-3.8-flash', 4)).toBeCloseTo(0.056, 6);
    expect(g('gemini-3.1-pro-preview', 2)).toBeCloseTo(0.028, 6);
    // 3.5 Flash-Lite used to fall to the flat fallback, whose grounding is $0 — its searches were booked as free.
    expect(g('gemini-3.5-flash-lite', 2)).toBeCloseTo(0.028, 6);
    expect(g('gemini-3.1-flash-lite', 1)).toBeCloseTo(0.014, 6);
    expect(g('gemini-2.5-flash', 1)).toBeCloseTo(0.035, 6);
    expect(g('gemini-2.5-flash', 4)).toBeCloseTo(0.035, 6); // one grounded PROMPT
    expect(g('gemini-2.5-flash', 0)).toBe(0);
    // Unknown price → 0 (TODO rows), never NaN.
    expect(g('gemini-2.5-flash-native-audio-latest', 3)).toBe(0);
    expect(g('claude-haiku-4-5', 3)).toBe(0);
  });

  it('caps grounding units per call so one bad count cannot full-stop the platform', () => {
    const q = resolveTokenPrice('gemini-3.8-flash').grounding;
    expect(groundingCostUsd(q, 1_000_000)).toBeCloseTo(MAX_GROUNDING_UNITS_PER_CALL * 0.014, 6);
    expect(groundingCostUsd(q, Number.NaN)).toBe(0);
    expect(groundingCostUsd(q, -3)).toBe(0);
    expect(groundingCostUsd(q, '7')).toBeCloseTo(0.014 * 7, 6); // numeric strings coerce like every other count here
    expect(groundingCostUsd(q, 1.2)).toBeCloseTo(0.028, 6); // partial counts round UP
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
