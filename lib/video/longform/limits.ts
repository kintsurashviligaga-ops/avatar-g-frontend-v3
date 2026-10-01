/**
 * lib/video/longform/limits.ts — what a long-form create is checked against, and WHO decides each number.
 *
 *   price     LONGFORM_MARGIN (sell price ÷ Veo wholesale) — the owner's. ⚠️ UNSET = the route answers 503: this
 *             code never picks a margin (plan.LongformPricing says why; 1.0 sells Veo at exactly what Google bills).
 *   length    the account's subscription tier (lib/billing/tiers video.maxSeconds — free 8 s … business 240 s),
 *   quality   and its video.veoTiers — the plans own these, not this module (resolveTier: subscription → comp → free).
 *   balance   profiles.credits_balance, checked against the WHOLE film up front (acts are then debited one by one).
 *   platform  DAILY_COST_LIMIT — a film costing more can never finish inside a day — plus today's remainder (warning).
 *   pace      per account: LONGFORM_CREATE_RATE_LIMIT (every create is ~4–8 Director LLM calls, before any credit is
 *             taken) and at most longformMaxActiveJobs() films in flight.
 *
 * The reads take an injected client (the route passes the service role), so this module is testable without one.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RateLimitConfig } from '@/lib/api/rate-limit';
import { resolveUserTier, type ResolveTierOptions } from '@/lib/billing/resolveTier';
import { tierById, type TierId } from '@/lib/billing/tiers';
import type { LongformLimits, LongformPricing } from './plan';
import type { JobStatus } from './stateMachine';

type Env = Readonly<Record<string, string | undefined>>;

// ── Price ────────────────────────────────────────────────────────────────────────────────────────────────────

/** The margins accepted. Outside them the setting is treated as a typo, not a price — see longformPricingFromEnv. */
export const LONGFORM_MARGIN_MIN = 1;
export const LONGFORM_MARGIN_MAX = 10;

export type LongformPricingConfig =
  | { ok: true; pricing: LongformPricing }
  | { ok: false; status: 503; body: { error: 'pricing_unconfigured'; message: string } };

/**
 * LONGFORM_MARGIN → the pricing every credit number is computed from, or a 503 answer.
 *
 * ⚠️ A NUMBER OUTSIDE 1…10 IS REFUSED, NOT CLAMPED. Below 1 sells Veo under what Google charges (a "0.5" meant as
 * "+50 %" would halve the price); above 10 is far more likely "150" meant as "+150 %" than a real price. Either way
 * the right answer is "not configured" — the owner fixes the env — never a guessed price.
 */
export function longformPricingFromEnv(env: Env = process.env): LongformPricingConfig {
  const raw = (env.LONGFORM_MARGIN ?? '').trim();
  const n = /^\d{1,2}(\.\d{1,4})?$/.test(raw) ? Number(raw) : Number.NaN;
  if (!(n >= LONGFORM_MARGIN_MIN && n <= LONGFORM_MARGIN_MAX)) {
    return {
      ok: false,
      status: 503,
      body: { error: 'pricing_unconfigured', message: 'Long-form films are not priced on this deployment yet.' },
    };
  }
  return { ok: true, pricing: { marginMultiplier: n } };
}

// ── Pace ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Creates per ACCOUNT per day (checkRateLimitByKey on the verified userId — rotating IPs buys nothing). A create
 * spends the Director's LLM calls before anything is billed, so this — not the credit debit — bounds that spend.
 */
export const LONGFORM_CREATE_RATE_LIMIT: RateLimitConfig = { maxRequests: 10, windowMs: 24 * 60 * 60_000, keyPrefix: 'rl:longform:create' };

/** Statuses that count as "in flight" for the per-account cap (every non-terminal one). */
export const LONGFORM_ACTIVE_STATUSES: readonly JobStatus[] = ['directing', 'planned', 'rendering', 'stitching'];

/** Films one account may have in flight (LONGFORM_MAX_ACTIVE_JOBS, 1…10, default 2). */
export function longformMaxActiveJobs(env: Env = process.env): number {
  const n = Number((env.LONGFORM_MAX_ACTIVE_JOBS ?? '').trim());
  return Number.isInteger(n) && n >= 1 ? Math.min(10, n) : 2;
}

// ── The account ──────────────────────────────────────────────────────────────────────────────────────────────

/** Only `.from()` is used — the service-role client satisfies it; tests pass a fake. */
export type LongformDb = Pick<SupabaseClient, 'from'>;

export interface LongformAccount {
  tier: TierId;
  /** Null when the balance could not be read — the route then refuses (503), never guesses. */
  balanceCredits: number | null;
  /** Null when the count could not be read — likewise refused. */
  activeJobs: number | null;
}

async function readBalance(db: LongformDb, userId: string): Promise<number | null> {
  try {
    const { data, error } = await db.from('profiles').select('credits_balance').eq('id', userId).maybeSingle();
    if (error) return null;
    // No profile row is a zero balance, not an unknown one: there is nothing to debit an act from.
    const bal = (data as { credits_balance?: unknown } | null)?.credits_balance;
    if (bal === undefined || bal === null) return 0;
    const n = Number(bal);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function countActive(db: LongformDb, userId: string): Promise<number | null> {
  try {
    const { count, error } = await db
      .from('longform_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', [...LONGFORM_ACTIVE_STATUSES]);
    if (error || typeof count !== 'number') return null;
    return count;
  } catch {
    return null;
  }
}

/** Tier, balance and in-flight count, read together. Never throws (resolveUserTier → 'free' on any doubt). */
export async function readLongformAccount(db: LongformDb, userId: string, opts: ResolveTierOptions = {}): Promise<LongformAccount> {
  const [tier, balanceCredits, activeJobs] = await Promise.all([
    resolveUserTier(db, userId, opts),
    readBalance(db, userId),
    countActive(db, userId),
  ]);
  return { tier, balanceCredits, activeJobs };
}

export interface PlatformBudget {
  /** DAILY_COST_LIMIT (budgetPolicy.limitsFromEnv). */
  dailyLimitUsd: number;
  /** What is left of today's envelope, when it could be read. */
  remainingUsd?: number | null;
}

/** LONGFORM_MAX_JOB_COST_USD — an optional per-film wholesale ceiling (unset = none). */
export function longformMaxJobCostUsd(env: Env = process.env): number | undefined {
  const n = Number((env.LONGFORM_MAX_JOB_COST_USD ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** The account + the platform → plan.validateLongformRequest's limits. */
export function longformLimitsFor(account: LongformAccount, platform: PlatformBudget, env: Env = process.env): LongformLimits {
  const t = tierById(account.tier);
  const maxJobCostUsd = longformMaxJobCostUsd(env);
  const remaining = platform.remainingUsd;
  return {
    maxSeconds: t.video.maxSeconds,
    allowedTiers: t.video.veoTiers,
    platformDailyLimitUsd: platform.dailyLimitUsd,
    ...(typeof remaining === 'number' && Number.isFinite(remaining) ? { platformBudgetRemainingUsd: Math.max(0, remaining) } : {}),
    ...(maxJobCostUsd !== undefined ? { maxJobCostUsd } : {}),
    ...(account.balanceCredits !== null ? { balanceCredits: account.balanceCredits } : {}),
  };
}
