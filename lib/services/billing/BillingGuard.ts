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
import { recordTrace, type AgentTraceRow, type WorkerKind } from '@/lib/observability/agentTrace';
import { structuredLog } from '@/lib/logger';
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
 * Sum `cost_wholesale_gel` over both windows, in USD, plus the bookings this instance could not write yet. Returns
 * null when the ledger cannot be read: "unknown" must never be read as "zero spent", which would silently waive the
 * entire budget, so canProceed refuses on null.
 */
async function readSpendUsd(): Promise<{ dailyUsd: number; monthlyUsd: number } | null> {
  const ledger = await readLedgerUsd();
  if (!ledger) return null;
  // Spend that succeeded but has not reached the ledger yet is still spent (see UNBOOKED below).
  const carried = unbookedUsd();
  return { dailyUsd: ledger.dailyUsd + carried, monthlyUsd: ledger.monthlyUsd + carried };
}

/** The ledger's own sums, cached. */
async function readLedgerUsd(): Promise<{ dailyUsd: number; monthlyUsd: number } | null> {
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
 * FAIL DIRECTION: CLOSED (MASTER TASK v3.1, audit F-05).
 *
 * When the ledger is unreadable we cannot know what has been spent, so no paid call may start. This used to fail OPEN
 * by default (BILLING_GUARD_FAIL_CLOSED=1 inverted it), on the theory that the credit wallet still gates each request.
 * It does not gate the PLATFORM's spend, which is what this guard exists for, and free surfaces (chat, read-aloud) have
 * no wallet at all, so a ledger outage meant unmetered paid calls. The variable is gone: there is no fail-open setting.
 * The refusal reason is `guard_unavailable`, which every surface words as "try again shortly" (budgetMessage), and the
 * `ledger_unavailable` alert keeps the outage loud.
 */

/**
 * UNBOOKED — bookings that did not land.
 *
 * A paid call that succeeded is money spent even when its ledger row is refused. Such a row is kept here instead of
 * being forgotten: every canProceed on this instance counts it as spent, and the next booking that lands writes it to
 * the ledger as the original row marked `reconciled` (with when it first failed). Each one is also logged once as a
 * structured `billing.booking_unrecorded` error, so a row that dies with its instance still has a record. Bounded:
 * past MAX_UNBOOKED rows the oldest are folded into one carried amount, which is booked as a single reconciliation row.
 *
 * A durable outbox table would survive the instance; it is a shared database change and needs the owner's approval.
 */
const MAX_UNBOOKED = 500;
/** How many kept rows one landed booking writes back, so a backlog never holds a reply for long. */
const FLUSH_BATCH = 20;
interface UnbookedRow {
  row: AgentTraceRow;
  usd: number;
  failedAt: string;
}
let unbooked: UnbookedRow[] = [];
let foldedUsd = 0;

function unbookedUsd(): number {
  return unbooked.reduce((n, u) => n + u.usd, 0) + foldedUsd;
}

/** Test seam: what is waiting to be reconciled on this instance. */
export function unbookedSpend(): { rows: number; usd: number } {
  return { rows: unbooked.length + (foldedUsd > 0 ? 1 : 0), usd: unbookedUsd() };
}

/** Test seam: forget everything kept (a fresh instance). */
export function resetUnbookedSpend(): void {
  unbooked = [];
  foldedUsd = 0;
}

function keepUnbooked(row: AgentTraceRow, usd: number, service: ServiceType, model: string): void {
  unbooked.push({ row, usd, failedAt: new Date().toISOString() });
  while (unbooked.length > MAX_UNBOOKED) foldedUsd += unbooked.shift()!.usd;
  structuredLog('error', 'billing.booking_unrecorded', {
    service,
    model,
    usd,
    pendingRows: unbookedSpend().rows,
    pendingUsd: Number(unbookedUsd().toFixed(6)),
  });
}

/** One write, never a throw: a recorder that threw did not record. */
async function writeTrace(row: AgentTraceRow): Promise<boolean> {
  try {
    // Only an explicit `false` is a refusal; a recorder that reports nothing is taken at its word, as it always was.
    return (await recordTrace(row)) !== false;
  } catch {
    return false;
  }
}

/** Write back what was kept, oldest first, after a booking proved the ledger takes rows again. */
async function flushUnbooked(): Promise<void> {
  if (unbooked.length === 0 && foldedUsd <= 0) return;
  const batch = unbooked.splice(0, FLUSH_BATCH);
  const folded = foldedUsd;
  foldedUsd = 0;
  const failed: UnbookedRow[] = [];
  let writtenUsd = 0;
  for (const u of batch) {
    const marked: AgentTraceRow = { ...u.row, metadata: { ...(u.row.metadata ?? {}), reconciled: true, failedAt: u.failedAt } };
    // The ledger just took a row, so a refusal here is about THIS row. The one field a row can carry that the table
    // refuses is the user reference; the spend matters more than the attribution, so it is written without it.
    const ok =
      (await writeTrace(marked)) ||
      (marked.userId !== null && (await writeTrace({ ...marked, userId: null, metadata: { ...marked.metadata, userIdDropped: true } })));
    if (ok) writtenUsd += u.usd;
    else failed.push(u);
  }
  let foldedLeft = 0;
  if (folded > 0) {
    const ok = await writeTrace({
      userId: null,
      agentId: 'v2-reconcile',
      workerKind: 'gemini',
      action: 'generate',
      costWholesaleGel: folded * GEL_PER_USD,
      costRetailGel: 0,
      metadata: { billingGuard: true, reconciled: true, folded: true, usd: folded },
    });
    if (ok) writtenUsd += folded;
    else foldedLeft = folded;
  }
  // Whatever did not land goes back to the front, still counted.
  unbooked = [...failed, ...unbooked];
  foldedUsd += foldedLeft;
  if (writtenUsd > 0) {
    structuredLog('info', 'billing.booking_reconciled', {
      usd: Number(writtenUsd.toFixed(6)),
      pendingRows: unbookedSpend().rows,
    });
  }
}

export interface GuardContext {
  /** Free-tier users are the first to lose video/dubbing under the §1.8 ladder. */
  isFreeTier?: boolean;
}

export interface GuardDecision extends ProceedDecision {
  /** True when the verdict was reached without a readable ledger. Such a verdict is always a refusal (FAIL DIRECTION). */
  degraded: boolean;
}

/**
 * Master Task §2.1.1 — the pre-flight gate. Never throws; an unreadable ledger is a refusal (`guard_unavailable`), never
 * an allowance (see FAIL DIRECTION).
 */
export async function canProceed(estimate: CostEstimate, ctx: GuardContext = {}): Promise<GuardDecision> {
  const limits = limitsFromEnv();
  const { dayOfMonth } = windowStarts();
  const spend = await readSpendUsd();

  if (!spend) {
    // eslint-disable-next-line no-console
    console.error(`[BillingGuard] spend ledger unreadable → refusing ${estimate.service} (fails closed)`);
    return {
      allowed: false,
      reason: 'guard_unavailable',
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
 * counts it. Never throws: the artefact has already been delivered by the time we get here. A row the ledger
 * refuses (after one retry) is not dropped: it is kept, counted and written back later (see UNBOOKED).
 */
export async function recordUsage(actual: CostEstimate, meta: { userId?: string | null; promptSummary?: string } = {}): Promise<void> {
  const usd = Number.isFinite(actual.estimatedCost) && actual.estimatedCost > 0 ? actual.estimatedCost : 0;
  const row: AgentTraceRow = {
    userId: meta.userId ?? null,
    agentId: `v2-${actual.service}`,
    workerKind: WORKER_FOR[actual.service] ?? 'gemini',
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
  };
  // One immediate retry: a dropped connection is the common failure. If the first write did land and only its answer
  // was lost, the retry books the turn twice, which over-counts (the safe direction) rather than under-counts.
  const landed = (await writeTrace(row)) || (await writeTrace(row));
  if (landed) await flushUnbooked();
  else keepUnbooked(row, usd, actual.service, actual.model);
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
      message: 'Spend ledger unreadable — the budget guard is refusing every paid call until it can read spend again (fails closed).',
    }];
  }
  const alerts = decideThresholds({
    daily: usageWindow(spend.dailyUsd, limits.dailyLimit),
    monthly: usageWindow(spend.monthlyUsd, limits.monthlyLimit),
    limits,
    dayOfMonth,
  });
  const pending = unbookedSpend();
  if (pending.rows > 0) {
    alerts.unshift({
      level: 'critical',
      code: 'booking_unrecorded',
      message: `${pending.rows} booking(s) worth $${pending.usd.toFixed(4)} have not reached the ledger yet. The guard counts them as spent and writes them on the next booking that lands.`,
    });
  }
  return alerts;
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
