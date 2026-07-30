/**
 * lib/services/billing/BillingGuard.ts
 * ====================================
 * Master Task §2.1.1 — the guard every provider call passes through before we spend money.
 *
 *   canProceed(estimate) → may this call run inside the $10/day · $300/month envelope?
 *   recordUsage(actual)  → book what it really cost
 *   getDailyUsage() / getMonthlyUsage() / checkThresholds()
 *
 * WHY THERE IS NO NEW LEDGER TABLE: this platform already records provider cost per call —
 * `withTrace()` writes `agent_evolution_traces.cost_wholesale_gel` (see lib/observability/agentTrace.ts) and
 * /api/admin/financials already aggregates it. A second spend table would immediately drift from the first
 * and there would be no way to say which one was true. So BillingGuard READS and WRITES that same ledger,
 * converting through the FX single-source (lib/billing/fx.ts).
 *
 * NOT TO BE CONFUSED WITH USER BILLING. The credit wallet (`deduct_credits` / `credit_ledger`) prices what
 * the CUSTOMER pays and is untouched by this module. BillingGuard protects OUR provider budget. A request
 * can be perfectly funded by the user and still be refused here because the platform's daily API budget is
 * spent — and vice versa.
 */

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { recordTrace, type WorkerKind } from '@/lib/observability/agentTrace';
import { GEL_PER_USD } from '@/lib/billing/fx';
import type { CostEstimate, ServiceType } from './costModel';
import {
  canProceed as decideCanProceed,
  checkThresholds as decideThresholds,
  budgetMode,
  limitsFromEnv,
  usageWindow,
  selectModel,
  type Alert,
  type BudgetMode,
  type ProceedDecision,
  type UsageWindow,
} from './budgetPolicy';

export type { Alert, UsageWindow } from './budgetPolicy';

/** Which provider actually bills us for each service — recorded on the trace so the Founder Audit can still
 *  attribute spend by vendor. Meshy/Lyria have no `WorkerKind` of their own yet; they ride as 'gemini'
 *  (Lyria IS Gemini) / 'replicate' with the real service in `metadata.service`. */
const WORKER_FOR: Readonly<Record<ServiceType, WorkerKind>> = {
  chat: 'gemini',
  image: 'gemini',
  video: 'gemini',
  music: 'gemini',
  avatar: 'gemini',
  remix: 'replicate',
  montage: 'replicate',
  dubbing: 'elevenlabs',
  model3d: 'replicate',
  presentation: 'gemini',
};

/**
 * Spend is read once and cached briefly. Without this, a 6-scene film would issue six identical aggregate
 * queries in the same second. 30s is short enough that the guard still reacts inside a single burst.
 */
const CACHE_MS = 30_000;
let cache: { at: number; dailyUsd: number; monthlyUsd: number } | null = null;

/** Test seam + a way for an operator to force a re-read after a manual ledger correction. */
export function resetBillingCache(): void {
  cache = null;
}

/** Start of the current UTC day / month, as the ISO strings the ledger is filtered on. */
function windowStarts(now = new Date()): { dayIso: string; monthIso: string; dayOfMonth: number } {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { dayIso: day.toISOString(), monthIso: month.toISOString(), dayOfMonth: now.getUTCDate() };
}

/**
 * Sum `cost_wholesale_gel` over both windows, in USD. Returns null when the ledger cannot be read — the
 * caller must then decide the fail direction rather than treating "unknown" as "zero spent", which would
 * silently waive the entire budget.
 */
async function readSpendUsd(): Promise<{ dailyUsd: number; monthlyUsd: number } | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return { dailyUsd: cache.dailyUsd, monthlyUsd: cache.monthlyUsd };
  }
  try {
    const admin = createServiceRoleClient();
    const { dayIso, monthIso } = windowStarts();
    // One month-wide read, split locally — cheaper than two round trips, and the month bounds the day.
    const { data, error } = await admin
      .from('agent_evolution_traces')
      .select('cost_wholesale_gel, created_at')
      .gte('created_at', monthIso)
      .limit(50_000);
    if (error || !Array.isArray(data)) return null;
    let monthGel = 0;
    let dayGel = 0;
    for (const row of data as { cost_wholesale_gel: number | null; created_at: string | null }[]) {
      const gel = Number(row.cost_wholesale_gel ?? 0);
      if (!Number.isFinite(gel) || gel <= 0) continue;
      monthGel += gel;
      if (typeof row.created_at === 'string' && row.created_at >= dayIso) dayGel += gel;
    }
    const out = { dailyUsd: dayGel / GEL_PER_USD, monthlyUsd: monthGel / GEL_PER_USD };
    cache = { at: Date.now(), ...out };
    return out;
  } catch {
    return null;
  }
}

/**
 * FAIL DIRECTION — deliberate, and the one judgement call in this module.
 *
 * When the ledger is unreadable we cannot know what has been spent. Failing CLOSED would take all ten
 * services down on a transient Supabase blip; failing OPEN risks a bounded overspend while the per-user
 * credit wallet still gates every request independently. Default is OPEN + a `critical` alert, so the
 * outage is loud rather than silent. Set BILLING_GUARD_FAIL_CLOSED=1 to invert (e.g. near month end).
 */
function failsClosed(): boolean {
  return /^(1|true|on|yes)$/i.test((process.env.BILLING_GUARD_FAIL_CLOSED || '').trim());
}

export interface GuardContext {
  /** Free-tier users are the first to lose video/dubbing under the §1.8 ladder. */
  isFreeTier?: boolean;
}

export interface GuardDecision extends ProceedDecision {
  /** True when the verdict was reached without a readable ledger (see `failsClosed`). */
  degraded: boolean;
}

/** Master Task §2.1.1 — the pre-flight gate. Never throws: a guard that throws takes the product down. */
export async function canProceed(estimate: CostEstimate, ctx: GuardContext = {}): Promise<GuardDecision> {
  const limits = limitsFromEnv();
  const { dayOfMonth } = windowStarts();
  const spend = await readSpendUsd();

  if (!spend) {
    const closed = failsClosed();
    // eslint-disable-next-line no-console
    console.error(`[BillingGuard] spend ledger unreadable → failing ${closed ? 'CLOSED' : 'OPEN'} for ${estimate.service}`);
    return {
      allowed: !closed,
      reason: closed ? 'monthly_limit' : 'ok',
      mode: 'normal',
      projectedDaily: estimate.estimatedCost,
      projectedMonthly: estimate.estimatedCost,
      degraded: true,
    };
  }

  const decision = decideCanProceed({
    daily: usageWindow(spend.dailyUsd, limits.dailyLimit),
    monthly: usageWindow(spend.monthlyUsd, limits.monthlyLimit),
    limits,
    dayOfMonth,
    estimatedCost: estimate.estimatedCost,
    service: estimate.service,
    ...(ctx.isFreeTier === undefined ? {} : { isFreeTier: ctx.isFreeTier }),
  });
  if (!decision.allowed) {
    // eslint-disable-next-line no-console
    console.warn(`[BillingGuard] BLOCKED ${estimate.service} ($${estimate.estimatedCost}) — ${decision.reason}; month $${spend.monthlyUsd.toFixed(2)}/$${limits.monthlyLimit}`);
  }
  return { ...decision, degraded: false };
}

/**
 * Master Task §2.1.1 — book the ACTUAL cost after the call. Writes the canonical trace row (so
 * /api/admin/financials and the Founder Audit see it) and invalidates the cache so the next `canProceed`
 * counts it. Best-effort by construction: the artefact has already been delivered by the time we get here,
 * so a bookkeeping failure must never surface as a user-facing error.
 */
export async function recordUsage(actual: CostEstimate, meta: { userId?: string | null; promptSummary?: string } = {}): Promise<void> {
  const usd = Number.isFinite(actual.estimatedCost) && actual.estimatedCost > 0 ? actual.estimatedCost : 0;
  try {
    await recordTrace({
      userId: meta.userId ?? null,
      agentId: `v2-${actual.service}`,
      workerKind: WORKER_FOR[actual.service],
      action: 'generate',
      ...(meta.promptSummary ? { promptSummary: meta.promptSummary } : {}),
      costWholesaleGel: usd * GEL_PER_USD,
      // No retail price here: BillingGuard books PLATFORM spend only. The user-facing charge stays with
      // the credit wallet, and passing a retail price would double-bill the customer.
      costRetailGel: 0,
      metadata: {
        billingGuard: true,
        service: actual.service,
        model: actual.model,
        usd,
        ...(actual.inputTokens === undefined ? {} : { inputTokens: actual.inputTokens }),
        ...(actual.outputTokens === undefined ? {} : { outputTokens: actual.outputTokens }),
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[BillingGuard] recordUsage failed:', err instanceof Error ? err.message : err);
  }
  resetBillingCache();
}

export async function getDailyUsage(): Promise<UsageWindow> {
  const limits = limitsFromEnv();
  const spend = await readSpendUsd();
  return usageWindow(spend?.dailyUsd ?? 0, limits.dailyLimit);
}

export async function getMonthlyUsage(): Promise<UsageWindow> {
  const limits = limitsFromEnv();
  const spend = await readSpendUsd();
  return usageWindow(spend?.monthlyUsd ?? 0, limits.monthlyLimit);
}

/** Master Task §2.1.1 — everything an operator should be told, most severe first. */
export async function checkThresholds(): Promise<Alert[]> {
  const limits = limitsFromEnv();
  const { dayOfMonth } = windowStarts();
  const spend = await readSpendUsd();
  if (!spend) {
    return [{
      level: 'critical',
      code: 'ledger_unavailable',
      message: `Spend ledger unreadable — the budget guard is running ${failsClosed() ? 'CLOSED (all calls refused)' : 'OPEN (calls unguarded)'}.`,
    }];
  }
  return decideThresholds({
    daily: usageWindow(spend.dailyUsd, limits.dailyLimit),
    monthly: usageWindow(spend.monthlyUsd, limits.monthlyLimit),
    limits,
    dayOfMonth,
  });
}

/** Current §1.8 rung — drives the economy/premium model choice and the UI's budget banner. */
export async function currentMode(): Promise<BudgetMode> {
  const limits = limitsFromEnv();
  const { dayOfMonth } = windowStarts();
  const spend = await readSpendUsd();
  if (!spend) return 'normal';
  return budgetMode({
    daily: usageWindow(spend.dailyUsd, limits.dailyLimit),
    monthly: usageWindow(spend.monthlyUsd, limits.monthlyLimit),
    limits,
    dayOfMonth,
  });
}

/** Master Task §2.5.3 — the budget-aware model for this service right now. */
export async function modelFor(service: ServiceType): Promise<string> {
  const limits = limitsFromEnv();
  const spend = await readSpendUsd();
  return selectModel(service, limits.monthlyLimit - (spend?.monthlyUsd ?? 0));
}
