import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getPlanDefinition, modelAllowedForPlan, normalizePlanId, planHasFeature, type PlanFeatureFlag, type PlanId } from '@/lib/monetization/plans';
import { checkSlidingWindow } from '@/lib/platform/rate-limit';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const PaywallErrorSchema = z.object({
  error_code: z.string(),
  message: z.string(),
  upgrade_url: z.string().url(),
  current_plan: z.string(),
});

export type PaywallError = z.infer<typeof PaywallErrorSchema>;

export class MonetizationError extends Error {
  public readonly statusCode: number;
  public readonly payload: PaywallError;

  constructor(statusCode: number, payload: PaywallError) {
    super(payload.message);
    this.name = 'MonetizationError';
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

function upgradeUrl(plan: PlanId): string {
  return `/pricing?from=${encodeURIComponent(plan)}`;
}

export function toPlanIdFromUnknown(value: string | null | undefined): PlanId {
  return normalizePlanId(value);
}

export function assertFeature(plan: PlanId, feature: PlanFeatureFlag): void {
  if (planHasFeature(plan, feature)) return;
  throw new MonetizationError(403, {
    error_code: 'PLAN_FEATURE_REQUIRED',
    message: `Your current plan does not include ${feature}`,
    upgrade_url: upgradeUrl(plan),
    current_plan: plan,
  });
}

export function assertModelAccess(plan: PlanId, modelKey: string): void {
  if (modelAllowedForPlan(plan, modelKey)) return;
  throw new MonetizationError(403, {
    error_code: 'MODEL_ACCESS_DENIED',
    message: `Model ${modelKey} is not available on your current plan`,
    upgrade_url: upgradeUrl(plan),
    current_plan: plan,
  });
}

export async function enforceRateLimits(input: {
  request: NextRequest;
  userId: string;
  orgId: string | null;
  plan: PlanId;
  operation: 'read' | 'write' | 'expensive';
}): Promise<void> {
  const emitLimitEvent = async (type: string, metadata: Record<string, unknown>) => {
    try {
      const supabase = createServiceRoleClient();
      await supabase.from('events').insert({
        type,
        user_id: input.userId,
        org_id: input.orgId,
        metadata,
      });
    } catch {
      // Non-blocking event pipeline.
    }
  };

  const def = getPlanDefinition(input.plan);
  const limitPerMinute =
    input.operation === 'read'
      ? def.rate_limits.read_per_minute
      : input.operation === 'write'
      ? def.rate_limits.write_per_minute
      : def.rate_limits.expensive_per_minute;

  const userMinute = await checkSlidingWindow({
    namespace: 'rl:user:minute',
    key: `${input.userId}:${input.operation}`,
    limit: limitPerMinute,
    windowSeconds: 60,
  });
  if (!userMinute.allowed) {
    await emitLimitEvent('limit_reached_upgrade_cta', {
      scope: 'user_minute',
      operation: input.operation,
      limit: limitPerMinute,
    });

    throw new MonetizationError(429, {
      error_code: 'RATE_LIMIT_EXCEEDED',
      message: 'Rate limit exceeded for your current plan',
      upgrade_url: upgradeUrl(input.plan),
      current_plan: input.plan,
    });
  }

  const userDaily = await checkSlidingWindow({
    namespace: 'rl:user:day',
    key: `${input.userId}:${input.operation}`,
    limit: def.limits.requests_per_day,
    windowSeconds: 86400,
  });
  if (!userDaily.allowed) {
    await emitLimitEvent('limit_reached_upgrade_cta', {
      scope: 'user_daily',
      operation: input.operation,
      limit: def.limits.requests_per_day,
    });

    throw new MonetizationError(429, {
      error_code: 'DAILY_LIMIT_EXCEEDED',
      message: 'Daily usage limit reached for your current plan',
      upgrade_url: upgradeUrl(input.plan),
      current_plan: input.plan,
    });
  }

  if (input.orgId) {
    const orgMinute = await checkSlidingWindow({
      namespace: 'rl:org:minute',
      key: `${input.orgId}:${input.operation}`,
      limit: limitPerMinute * 2,
      windowSeconds: 60,
    });

    if (!orgMinute.allowed) {
      await emitLimitEvent('limit_reached_upgrade_cta', {
        scope: 'org_minute',
        operation: input.operation,
        limit: limitPerMinute * 2,
      });

      throw new MonetizationError(429, {
        error_code: 'ORG_RATE_LIMIT_EXCEEDED',
        message: 'Organization-level rate limit exceeded',
        upgrade_url: upgradeUrl(input.plan),
        current_plan: input.plan,
      });
    }
  }
}
