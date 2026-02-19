import 'server-only';

import { createRouteHandlerClient } from '@/lib/supabase/server';
import { getPlan, isPlanAtLeast, normalizePlan, planAllowsAgent, type PlanTier } from './plans';

export interface BillingSnapshot {
  userId: string;
  plan: PlanTier;
  status: string;
  currentPeriodEnd: string | null;
  credits: {
    balance: number;
    monthlyAllowance: number;
    resetAt: string;
  };
}

export class BillingEnforcementError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, statusCode: number, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'BillingEnforcementError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  toResponseBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

export async function getBillingSnapshot(userId: string): Promise<BillingSnapshot> {
  const supabase = createRouteHandlerClient();

  await supabase.rpc('ensure_user_billing_rows', { p_user_id: userId });
  await supabase.rpc('reset_user_credits_if_due', { p_user_id: userId });

  const [{ data: subscription, error: subscriptionError }, { data: credits, error: creditsError }] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', userId)
      .single(),
    supabase
      .from('credits')
      .select('balance, monthly_allowance, reset_at')
      .eq('user_id', userId)
      .single(),
  ]);

  if (subscriptionError || !subscription) {
    throw new Error('Failed to fetch subscription state');
  }

  if (creditsError || !credits) {
    throw new Error('Failed to fetch credits state');
  }

  return {
    userId,
    plan: normalizePlan(subscription.plan),
    status: subscription.status,
    currentPeriodEnd: subscription.current_period_end,
    credits: {
      balance: credits.balance,
      monthlyAllowance: credits.monthly_allowance,
      resetAt: credits.reset_at,
    },
  };
}

export function assertPlan(snapshot: BillingSnapshot, requiredPlan: PlanTier, agentId?: string): void {
  if (!isPlanAtLeast(snapshot.plan, requiredPlan)) {
    throw new BillingEnforcementError('Plan upgrade required', 403, 'PLAN_REQUIRED', {
      currentPlan: snapshot.plan,
      requiredPlan,
    });
  }

  if (agentId && !planAllowsAgent(snapshot.plan, agentId)) {
    throw new BillingEnforcementError('Agent not available for your current plan', 403, 'AGENT_FORBIDDEN', {
      currentPlan: snapshot.plan,
      agentId,
    });
  }
}

export function assertCredits(snapshot: BillingSnapshot, cost: number): void {
  if (cost <= 0) {
    return;
  }

  if (snapshot.credits.balance < cost) {
    throw new BillingEnforcementError('Insufficient credits', 402, 'INSUFFICIENT_CREDITS', {
      requiredCredits: cost,
      currentCredits: snapshot.credits.balance,
      nextResetAt: snapshot.credits.resetAt,
      monthlyAllowance: snapshot.credits.monthlyAllowance,
    });
  }
}

export async function deductCreditsTransaction(params: {
  userId: string;
  amount: number;
  jobId: string;
  agentId: string;
  reason: string;
  idempotencyKey: string;
}): Promise<{ newBalance: number }> {
  const supabase = createRouteHandlerClient();

  const { data, error } = await supabase.rpc('deduct_credits_transaction', {
    p_user_id: params.userId,
    p_amount: params.amount,
    p_job_id: params.jobId,
    p_agent_id: params.agentId,
    p_reason: params.reason,
    p_idempotency_key: params.idempotencyKey,
  });

  const result = Array.isArray(data) ? data[0] : null;

  if (error || !result) {
    throw new Error(error?.message || 'Credit deduction failed');
  }

  if (!result.success) {
    throw new BillingEnforcementError(result.error_message || 'Insufficient credits', 402, 'INSUFFICIENT_CREDITS');
  }

  return { newBalance: result.new_balance };
}

export async function enforcePlanAndCredits(params: {
  userId: string;
  requiredPlan: PlanTier;
  agentId: string;
  cost: number;
}): Promise<BillingSnapshot> {
  const snapshot = await getBillingSnapshot(params.userId);

  if (snapshot.status && !['active', 'trialing'].includes(snapshot.status)) {
    throw new BillingEnforcementError('Subscription inactive', 403, 'SUBSCRIPTION_INACTIVE', {
      status: snapshot.status,
    });
  }

  assertPlan(snapshot, params.requiredPlan, params.agentId);
  assertCredits(snapshot, params.cost);

  return snapshot;
}

export function getPlanSummary(plan: string | null | undefined) {
  return getPlan(plan);
}
