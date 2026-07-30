/**
 * lib/services/billing/budgetPolicy.ts
 * ====================================
 * Master Task §2.1 (limits) + §1.8 (Emergency Budget Rules) — the DECISION half of the BillingGuard.
 *
 * PURE + TOTAL. Given "what we've spent" and "what this call would cost", it answers: may it proceed, which
 * model tier should serve it, and what should we alert on. `BillingGuard.ts` supplies the real numbers; this
 * file holds the rules, so every branch of the money logic is unit-testable with no DB and no clock.
 */

import type { ServiceType } from './costModel';

/** Env-overridable budget envelope (Master Task §2.1 `.env.local`). */
export interface BudgetLimits {
  /** Hard ceiling on a single day's provider spend, USD. */
  dailyLimit: number;
  /** Hard ceiling on a calendar month's provider spend, USD. */
  monthlyLimit: number;
  /** Warn at this share of either limit (0-100). */
  alertThresholdPercent: number;
}

export const DEFAULT_LIMITS: BudgetLimits = {
  dailyLimit: 10,
  monthlyLimit: 300,
  alertThresholdPercent: 80,
};

/** Read the envelope from the environment, falling back to the documented defaults. Never throws. */
export function limitsFromEnv(env: Record<string, string | undefined> = process.env): BudgetLimits {
  const num = (raw: string | undefined, fallback: number): number => {
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return {
    dailyLimit: num(env.DAILY_COST_LIMIT, DEFAULT_LIMITS.dailyLimit),
    monthlyLimit: num(env.MONTHLY_COST_LIMIT, DEFAULT_LIMITS.monthlyLimit),
    alertThresholdPercent: num(env.ALERT_THRESHOLD_PERCENT, DEFAULT_LIMITS.alertThresholdPercent),
  };
}

export interface UsageWindow {
  used: number;
  limit: number;
  percent: number;
}

/** Build a usage window, guarding against a zero/absent limit (which would make `percent` Infinity/NaN). */
export function usageWindow(used: number, limit: number): UsageWindow {
  const u = Number.isFinite(used) && used > 0 ? used : 0;
  const l = Number.isFinite(limit) && limit > 0 ? limit : 0;
  return { used: Math.round(u * 10_000) / 10_000, limit: l, percent: l > 0 ? Math.round((u / l) * 1000) / 10 : 0 };
}

export type AlertLevel = 'info' | 'warning' | 'critical';

export interface Alert {
  level: AlertLevel;
  code:
    | 'daily_threshold'
    | 'monthly_threshold'
    | 'daily_exceeded'
    | 'monthly_exceeded'
    | 'economy_mode'
    | 'free_tier_restricted'
    | 'chat_image_only'
    | 'full_stop'
    | 'ledger_unavailable';
  message: string;
  /** The window that triggered it, when applicable. */
  usage?: UsageWindow;
}

/** Master Task §1.8 escalation ladder, most severe first. */
export type BudgetMode = 'normal' | 'economy' | 'free_tier_restricted' | 'chat_image_only' | 'full_stop';

export interface PolicyInput {
  daily: UsageWindow;
  monthly: UsageWindow;
  limits: BudgetLimits;
  /** Day of the month, 1-31. The §1.8 rules are burn-RATE rules: $200 by the 15th is a problem, $200 by the
   *  28th is on plan. Supplied by the caller so this stays a pure function of its inputs. */
  dayOfMonth: number;
}

/**
 * Master Task §1.8 Emergency Budget Rules:
 *   1. by day 15 and $200+ spent → economy models
 *   2. by day 20 and $250+ spent → video/dubbing off for the free tier
 *   3. $280+ → chat + image only
 *   4. $295+ → FULL STOP + admin notification
 * Evaluated most-severe-first so the strictest applicable rule wins.
 */
export function budgetMode(input: PolicyInput): BudgetMode {
  const spent = input.monthly.used;
  const day = Number.isFinite(input.dayOfMonth) ? input.dayOfMonth : 1;
  if (spent >= 295) return 'full_stop';
  if (spent >= 280) return 'chat_image_only';
  if (day >= 20 && spent >= 250) return 'free_tier_restricted';
  if (day >= 15 && spent >= 200) return 'economy';
  return 'normal';
}

/** Services still permitted under a given mode. `free_tier_restricted` only bites for the free tier, so the
 *  caller passes `isFreeTier`; a paying customer keeps the full set until `chat_image_only`. */
export function allowedServices(mode: BudgetMode, isFreeTier: boolean): readonly ServiceType[] {
  const ALL: readonly ServiceType[] = [
    'chat', 'image', 'video', 'music', 'avatar', 'remix', 'montage', 'dubbing', 'model3d', 'presentation',
  ];
  switch (mode) {
    case 'full_stop':
      return [];
    case 'chat_image_only':
      return ['chat', 'image'];
    case 'free_tier_restricted':
      return isFreeTier ? ALL.filter((s) => s !== 'video' && s !== 'dubbing') : ALL;
    case 'economy':
    case 'normal':
    default:
      return ALL;
  }
}

export interface ProceedInput extends PolicyInput {
  /** What this one call would cost, USD. */
  estimatedCost: number;
  service: ServiceType;
  isFreeTier?: boolean;
}

export interface ProceedDecision {
  allowed: boolean;
  mode: BudgetMode;
  /** Machine-readable reason when `allowed` is false — surfaced to the UI as "ბიუჯეტი ამოიწურა". */
  reason: 'ok' | 'daily_limit' | 'monthly_limit' | 'service_suspended' | 'full_stop';
  /** Projected spend if this call goes ahead. */
  projectedDaily: number;
  projectedMonthly: number;
}

/**
 * THE gate. Returns false when the call would cross either hard limit, or when the §1.8 ladder has already
 * suspended that service. Deliberately evaluates the PROJECTED total (used + this call), not the current one:
 * checking after the fact is how a budget gets blown by a single expensive video.
 */
export function canProceed(input: ProceedInput): ProceedDecision {
  const cost = Number.isFinite(input.estimatedCost) && input.estimatedCost > 0 ? input.estimatedCost : 0;
  const mode = budgetMode(input);
  const projectedDaily = Math.round((input.daily.used + cost) * 10_000) / 10_000;
  const projectedMonthly = Math.round((input.monthly.used + cost) * 10_000) / 10_000;
  const base = { mode, projectedDaily, projectedMonthly };

  if (mode === 'full_stop') return { ...base, allowed: false, reason: 'full_stop' };
  if (!allowedServices(mode, input.isFreeTier === true).includes(input.service)) {
    return { ...base, allowed: false, reason: 'service_suspended' };
  }
  if (input.limits.dailyLimit > 0 && projectedDaily > input.limits.dailyLimit) {
    return { ...base, allowed: false, reason: 'daily_limit' };
  }
  if (input.limits.monthlyLimit > 0 && projectedMonthly > input.limits.monthlyLimit) {
    return { ...base, allowed: false, reason: 'monthly_limit' };
  }
  return { ...base, allowed: true, reason: 'ok' };
}

/** Master Task §2.1.1 `checkThresholds()` — everything worth telling an operator, most severe first. */
export function checkThresholds(input: PolicyInput): Alert[] {
  const alerts: Alert[] = [];
  const mode = budgetMode(input);
  const t = input.limits.alertThresholdPercent;

  if (mode === 'full_stop') {
    alerts.push({ level: 'critical', code: 'full_stop', message: `FULL STOP — $${input.monthly.used.toFixed(2)} of the $${input.limits.monthlyLimit} monthly budget spent. All paid services are halted; admin notification required.`, usage: input.monthly });
  } else if (mode === 'chat_image_only') {
    alerts.push({ level: 'critical', code: 'chat_image_only', message: `$280+ spent — only chat and image remain enabled.`, usage: input.monthly });
  } else if (mode === 'free_tier_restricted') {
    alerts.push({ level: 'warning', code: 'free_tier_restricted', message: `$250+ spent by day ${input.dayOfMonth} — video and dubbing are disabled for the free tier.`, usage: input.monthly });
  } else if (mode === 'economy') {
    alerts.push({ level: 'warning', code: 'economy_mode', message: `$200+ spent by day ${input.dayOfMonth} — switched to economy models.`, usage: input.monthly });
  }

  if (input.daily.limit > 0 && input.daily.used >= input.daily.limit) {
    alerts.push({ level: 'critical', code: 'daily_exceeded', message: `Daily budget exhausted: $${input.daily.used.toFixed(2)} / $${input.daily.limit}.`, usage: input.daily });
  } else if (input.daily.percent >= t) {
    alerts.push({ level: 'warning', code: 'daily_threshold', message: `Daily spend at ${input.daily.percent}% of $${input.daily.limit}.`, usage: input.daily });
  }

  if (input.monthly.limit > 0 && input.monthly.used >= input.monthly.limit) {
    alerts.push({ level: 'critical', code: 'monthly_exceeded', message: `Monthly budget exhausted: $${input.monthly.used.toFixed(2)} / $${input.monthly.limit}.`, usage: input.monthly });
  } else if (input.monthly.percent >= t) {
    alerts.push({ level: 'warning', code: 'monthly_threshold', message: `Monthly spend at ${input.monthly.percent}% of $${input.monthly.limit}.`, usage: input.monthly });
  }

  return alerts;
}

/**
 * Master Task §2.5.3 ModelSelector — which model tier should serve this call. Budget-aware by design: the
 * cheaper model is chosen automatically as the remaining budget shrinks, instead of failing the request.
 */
export const ECONOMY_MODELS: Readonly<Record<ServiceType, string>> = {
  chat: 'gemini-3.5-flash-lite',
  image: 'nano-banana-2-lite',
  video: 'veo-2',
  music: 'lyria-3',
  avatar: 'gemini-3.5-flash-lite',
  remix: 'gemini-3.5-flash-lite',
  montage: 'ffmpeg-local',
  dubbing: 'eleven-turbo',
  model3d: 'meshy-draft',
  presentation: 'gemini-3.5-flash-lite',
} as const;

export const PREMIUM_MODELS: Readonly<Record<ServiceType, string>> = {
  chat: 'gemini-3.6-flash',
  image: 'imagen-4',
  video: 'veo-3.1',
  music: 'lyria-3',
  avatar: 'gemini-3.6-flash',
  remix: 'gemini-3.6-flash',
  montage: 'ffmpeg-local',
  dubbing: 'eleven-multilingual-v2',
  model3d: 'meshy-standard',
  presentation: 'gemini-3.6-flash',
} as const;

/** Remaining monthly budget, USD → the model tier to use. <$50 left → economy; otherwise premium. */
export function selectModel(service: ServiceType, budgetRemaining: number): string {
  const remaining = Number.isFinite(budgetRemaining) ? budgetRemaining : 0;
  return remaining < 50 ? ECONOMY_MODELS[service] : PREMIUM_MODELS[service];
}
