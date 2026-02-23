import { normalizePlan as normalizeLegacyPlan, type PlanTier as LegacyPlanTier } from '@/lib/billing/plans';

export type PlanId = 'FREE' | 'BASIC' | 'PREMIUM' | 'AGENT_G_FULL';

export type PlanFeatureFlag =
  | 'observability'
  | 'priority_queue'
  | 'advanced_ai_routing'
  | 'white_label';

export type PlanDefinition = {
  plan_id: PlanId;
  name: string;
  price_usd: number;
  limits: {
    requests_per_minute: number;
    requests_per_day: number;
    concurrent_jobs: number;
    max_output_size: number;
    model_access: string[];
  };
  features: PlanFeatureFlag[];
  rate_limits: {
    read_per_minute: number;
    write_per_minute: number;
    expensive_per_minute: number;
  };
  router_policy: {
    quality: 'cost-first' | 'balanced' | 'quality-first' | 'premium-first';
    monthly_cost_budget_units: number;
    target_latency_ms: number;
  };
};

export const PLAN_CATALOG: Record<PlanId, PlanDefinition> = {
  FREE: {
    plan_id: 'FREE',
    name: 'Free',
    price_usd: 0,
    limits: {
      requests_per_minute: 20,
      requests_per_day: 300,
      concurrent_jobs: 1,
      max_output_size: 512_000,
      model_access: ['openai:gpt-4.1-mini', 'deepseek:chat'],
    },
    features: [],
    rate_limits: {
      read_per_minute: 60,
      write_per_minute: 20,
      expensive_per_minute: 5,
    },
    router_policy: {
      quality: 'cost-first',
      monthly_cost_budget_units: 10_000,
      target_latency_ms: 2400,
    },
  },
  BASIC: {
    plan_id: 'BASIC',
    name: 'Basic',
    price_usd: 39,
    limits: {
      requests_per_minute: 60,
      requests_per_day: 2_000,
      concurrent_jobs: 4,
      max_output_size: 2_000_000,
      model_access: ['openai:gpt-4.1-mini', 'deepseek:chat', 'groq:llama-3.3-70b'],
    },
    features: ['observability'],
    rate_limits: {
      read_per_minute: 180,
      write_per_minute: 60,
      expensive_per_minute: 15,
    },
    router_policy: {
      quality: 'balanced',
      monthly_cost_budget_units: 80_000,
      target_latency_ms: 1800,
    },
  },
  PREMIUM: {
    plan_id: 'PREMIUM',
    name: 'Premium',
    price_usd: 150,
    limits: {
      requests_per_minute: 150,
      requests_per_day: 10_000,
      concurrent_jobs: 12,
      max_output_size: 8_000_000,
      model_access: [
        'openai:gpt-4.1-mini',
        'openai:gpt-4.1',
        'deepseek:chat',
        'groq:llama-3.3-70b',
        'openrouter:claude-3.7-sonnet',
      ],
    },
    features: ['observability', 'priority_queue', 'advanced_ai_routing'],
    rate_limits: {
      read_per_minute: 400,
      write_per_minute: 150,
      expensive_per_minute: 40,
    },
    router_policy: {
      quality: 'quality-first',
      monthly_cost_budget_units: 350_000,
      target_latency_ms: 1400,
    },
  },
  AGENT_G_FULL: {
    plan_id: 'AGENT_G_FULL',
    name: 'Agent G Full',
    price_usd: 500,
    limits: {
      requests_per_minute: 500,
      requests_per_day: 50_000,
      concurrent_jobs: 40,
      max_output_size: 20_000_000,
      model_access: ['*'],
    },
    features: ['observability', 'priority_queue', 'advanced_ai_routing', 'white_label'],
    rate_limits: {
      read_per_minute: 1000,
      write_per_minute: 400,
      expensive_per_minute: 120,
    },
    router_policy: {
      quality: 'premium-first',
      monthly_cost_budget_units: 1_200_000,
      target_latency_ms: 1000,
    },
  },
};

const LEGACY_TO_CANONICAL: Record<LegacyPlanTier, PlanId> = {
  FREE: 'FREE',
  PRO: 'BASIC',
  PREMIUM: 'PREMIUM',
  ENTERPRISE: 'AGENT_G_FULL',
};

export function normalizePlanId(input: string | null | undefined): PlanId {
  const value = (input || '').toUpperCase();
  if (value === 'BASIC' || value === 'PREMIUM' || value === 'AGENT_G_FULL' || value === 'FREE') {
    return value;
  }

  const legacy = normalizeLegacyPlan(value);
  return LEGACY_TO_CANONICAL[legacy];
}

export function toLegacyPlanTier(plan: PlanId): LegacyPlanTier {
  if (plan === 'BASIC') return 'PRO';
  if (plan === 'AGENT_G_FULL') return 'ENTERPRISE';
  return plan;
}

export function getPlanDefinition(plan: PlanId | string | null | undefined): PlanDefinition {
  const normalized = normalizePlanId(typeof plan === 'string' ? plan : undefined);
  return PLAN_CATALOG[normalized];
}

export function planHasFeature(plan: PlanId | string | null | undefined, feature: PlanFeatureFlag): boolean {
  return getPlanDefinition(plan).features.includes(feature);
}

export function modelAllowedForPlan(plan: PlanId | string | null | undefined, modelKey: string): boolean {
  const modelAccess = getPlanDefinition(plan).limits.model_access;
  return modelAccess.includes('*') || modelAccess.includes(modelKey);
}
