/**
 * Avatar G - Plan & Credit Enforcement (Server-Only)
 * Used by all service API routes to validate plan access and credits
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { type PlanTier, type CanonicalPlanTier, getPlan, getPlanRank, normalizePlanTier, planAllowsAgent, canAfford } from './plans';

export interface EnforcementContext {
  userId: string;
  plan: CanonicalPlanTier;
  credits: {
    balance: number;
    monthlyAllowance: number;
    nextReset: Date;
  };
  subscription: {
    status: string;
    currentPeriodEnd: Date | null;
  };
}

/**
 * Get user enforcement context (plan + credits + subscription)
 */

export async function getEnforcementContext(userId: string): Promise<EnforcementContext> {
  const supabase = createSupabaseServerClient();

  const { data: subscription, error: subError } = await supabase
    .from('subscriptions')
    .select('plan, status, current_period_end')
  .eq('user_id', userId)
  .single();

  if (subError || !subscription) {
    throw new Error('User subscription not found');
  }

  const { data: credits, error: creditsError } = await supabase
    .from('credits')
    .select('balance, monthly_allowance, next_reset_at')
  .eq('user_id', userId)
  .single();

  if (creditsError || !credits) {
    throw new Error('User credits not found');
  }

  return {
    userId,
    plan: normalizePlanTier(subscription.plan as PlanTier),
    credits: {
      balance: credits.balance,
      monthlyAllowance: credits.monthly_allowance,
      nextReset: new Date(credits.next_reset_at),
    },
    subscription: {
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end)
        : null,
    },
  };
}

/**
 * Assert user has required plan tier
 */
function assertPlanAccess(
  context: EnforcementContext,
  requiredPlan: PlanTier
): void {
  const userPlanIndex = getPlanRank(context.plan);
  const requiredPlanIndex = getPlanRank(requiredPlan);

  if (userPlanIndex < requiredPlanIndex) {
    throw new EnforcementError(
      `This feature requires ${requiredPlan} plan or higher`,
      'PLAN_REQUIRED',
      403,
      { required: requiredPlan, current: context.plan }
    );
  }
}

/**
 * Assert user's plan allows specific agent
 */
function assertAgentAccess(
  context: EnforcementContext,
  agentId: string
): void {
  if (!planAllowsAgent(context.plan, agentId)) {
    throw new EnforcementError(
      `Your ${context.plan} plan does not include access to ${agentId}`,
      'AGENT_NOT_ALLOWED',
      403,
      { agentId, plan: context.plan }
    );
  }
}

/**
 * Assert user has sufficient credits
 */
function assertSufficientCredits(
  context: EnforcementContext,
  cost: number
): void {
  if (!canAfford(context.credits.balance, cost)) {
    throw new EnforcementError(
      `Insufficient credits. Required: ${cost}, Available: ${context.credits.balance}`,
      'INSUFFICIENT_CREDITS',
      402,
      {
        required: cost,
        available: context.credits.balance,
        nextReset: context.credits.nextReset,
      }
    );
  }
}

/**
 * Assert subscription is active
 */
function assertActiveSubscription(context: EnforcementContext): void {
  if (context.subscription.status !== 'active') {
    throw new EnforcementError(
      'Your subscription is not active',
      'SUBSCRIPTION_INACTIVE',
      403,
      { status: context.subscription.status }
    );
  }
}

/**
 * Deduct credits from user (transaction-safe via Supabase function)
 */

export async function deductCredits(params: {
  userId: string;
  amount: number;
  jobId: string;
  agentId: string;
  description: string;
}): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const supabase = createSupabaseServerClient();

  const { data: rpcData, error: rpcError } = await supabase.rpc('deduct_credits', {
    p_user_id: params.userId,
    p_amount: params.amount,
    p_job_id: params.jobId,
    p_agent_id: params.agentId,
    p_description: params.description,
  });

  if (rpcError || !rpcData || !rpcData[0]) {
    return {
      success: false,
      newBalance: 0,
      error: rpcError?.message || 'Credit deduction failed',
    };
  }

  return {
    success: !!rpcData[0].success,
    newBalance: rpcData[0].new_balance || 0,
    error: rpcData[0].error_message || undefined,
  };
}

/**
 * Add credits to user (transaction-safe via Supabase function)
 */

export async function addCredits(params: {
  userId: string;
  amount: number;
  description?: string;
}): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase.rpc('add_credits', {
    p_user_id: params.userId,
    p_amount: params.amount,
    p_description: params.description || 'Credit addition',
  });

  if (error || !data || !data[0]) {
    return {
      success: false,
      newBalance: 0,
      error: error?.message || 'Credit addition failed',
    };
  }

  return {
    success: !!data[0].success,
    newBalance: data[0].new_balance || 0,
  };
}

/**
 * Refund credits for a job
 */

export async function refundCredits(params: {
  userId: string;
  jobId: string;
  amount: number;
  reason: string;
}): Promise<void> {
  await addCredits({
    userId: params.userId,
    amount: params.amount,
    description: `Refund for job ${params.jobId}: ${params.reason}`,
  });
}

/**
 * Update monthly allowance based on plan
 */

export async function updateMonthlyAllowance(
  userId: string,
  plan: PlanTier
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const planConfig = getPlan(plan);

  const { error } = await supabase
    .from('credits')
    .update({
      monthly_allowance: planConfig.monthlyCredits,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to update monthly allowance:', error);
    throw new Error('Failed to update credit allowance');
  }
}

/**
 * Custom enforcement error
 */

export class EnforcementError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'EnforcementError';
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      metadata: this.metadata,
    };
  }
}

/**
 * Middleware wrapper for API routes with enforcement
 */

export async function withEnforcement<T>(
  userId: string,
  options: {
    agentId?: string;
    cost?: number;
    requiredPlan?: PlanTier;
  },
  handler: (context: EnforcementContext) => Promise<T>
): Promise<T> {
  const context = await getEnforcementContext(userId);

  assertActiveSubscription(context);

  if (options.requiredPlan) {
    assertPlanAccess(context, options.requiredPlan);
  }

  if (options.agentId) {
    assertAgentAccess(context, options.agentId);
  }

  if (options.cost) {
    assertSufficientCredits(context, options.cost);
  }

  return await handler(context);
}
