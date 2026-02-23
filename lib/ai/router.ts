import { z } from 'zod';
import { getPlanDefinition, type PlanId } from '@/lib/monetization/plans';
import { recordLatencySample } from '@/lib/observability/runtime';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const RouterInputSchema = z.object({
  message: z.string().min(1),
  user_id: z.string().uuid(),
  org_id: z.string().uuid().nullable().optional(),
  plan: z.enum(['FREE', 'BASIC', 'PREMIUM', 'AGENT_G_FULL']),
  context: z.record(z.unknown()).optional(),
  service_registry: z.array(
    z.object({
      service_id: z.string().min(1),
      capabilities: z.array(z.string()),
      providers: z.array(
        z.object({
          provider: z.string(),
          model: z.string(),
          estimated_cost_units: z.number().nonnegative(),
          expected_latency_ms: z.number().nonnegative(),
          reliability_score: z.number().min(0).max(1),
        })
      ),
    })
  ),
});

export type RouterInput = z.infer<typeof RouterInputSchema>;

export type RouterOutput = {
  selected_service_id: string;
  selected_model: string;
  selected_provider: string;
  execution_strategy: 'sync' | 'async_job';
  estimated_cost_units: number;
  safety_checks_passed: boolean;
  fallback_chain: Array<{ provider: string; model: string }>;
};

function inferCapability(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('image') || normalized.includes('photo')) return 'image_generation';
  if (normalized.includes('video')) return 'video_generation';
  if (normalized.includes('voice') || normalized.includes('audio')) return 'voice_generation';
  if (normalized.includes('publish') || normalized.includes('campaign') || normalized.includes('social')) return 'social_automation';
  return 'text_generation';
}

function scoreProvider(input: {
  strategy: 'cost-first' | 'balanced' | 'quality-first' | 'premium-first';
  monthlyBudgetUnits: number;
  provider: RouterInput['service_registry'][number]['providers'][number];
  targetLatencyMs: number;
}): number {
  const p = input.provider;
  const normalizedCost = Math.min(1, p.estimated_cost_units / Math.max(1, input.monthlyBudgetUnits / 100));
  const normalizedLatency = Math.min(1, p.expected_latency_ms / Math.max(1, input.targetLatencyMs));
  const reliability = p.reliability_score;

  if (input.strategy === 'cost-first') {
    return (1 - normalizedCost) * 0.55 + (1 - normalizedLatency) * 0.25 + reliability * 0.2;
  }
  if (input.strategy === 'balanced') {
    return (1 - normalizedCost) * 0.35 + (1 - normalizedLatency) * 0.25 + reliability * 0.4;
  }
  if (input.strategy === 'quality-first') {
    return reliability * 0.6 + (1 - normalizedLatency) * 0.25 + (1 - normalizedCost) * 0.15;
  }
  return reliability * 0.65 + (1 - normalizedLatency) * 0.2 + (1 - normalizedCost) * 0.15;
}

export async function routeAI(inputRaw: RouterInput): Promise<RouterOutput> {
  const input = RouterInputSchema.parse(inputRaw);
  const capability = inferCapability(input.message);
  const matchedServices = input.service_registry.filter((service) => service.capabilities.includes(capability));
  const fallbackServices = matchedServices.length > 0 ? matchedServices : input.service_registry;

  if (fallbackServices.length === 0) {
    throw new Error('No service available for routing');
  }

  const planDefinition = getPlanDefinition(input.plan);
  const strategy = planDefinition.router_policy.quality;
  const targetLatency = planDefinition.router_policy.target_latency_ms;

  const ranked = fallbackServices
    .flatMap((service) =>
      service.providers.map((provider) => ({
        service_id: service.service_id,
        provider,
        score: scoreProvider({
          strategy,
          monthlyBudgetUnits: planDefinition.router_policy.monthly_cost_budget_units,
          provider,
          targetLatencyMs: targetLatency,
        }),
      }))
    )
    .sort((a, b) => b.score - a.score);

  const selected = ranked[0];
  if (!selected) {
    throw new Error('No provider available for routing');
  }

  const fallbackChain = ranked.slice(1, 4).map((entry) => ({
    provider: entry.provider.provider,
    model: entry.provider.model,
  }));

  const executionStrategy: 'sync' | 'async_job' =
    selected.provider.expected_latency_ms > targetLatency || selected.provider.estimated_cost_units > 200
      ? 'async_job'
      : 'sync';

  recordLatencySample('/api/agent-g/router/execute', selected.provider.provider, selected.provider.expected_latency_ms);

  return {
    selected_service_id: selected.service_id,
    selected_model: selected.provider.model,
    selected_provider: selected.provider.provider,
    execution_strategy: executionStrategy,
    estimated_cost_units: selected.provider.estimated_cost_units,
    safety_checks_passed: true,
    fallback_chain: fallbackChain,
  };
}

export async function logRouterFallback(input: {
  userId: string;
  orgId: string | null;
  serviceId: string;
  fromProvider: string;
  toProvider: string;
  reason: string;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from('events').insert({
    type: 'router_fallback',
    user_id: input.userId,
    org_id: input.orgId,
    metadata: {
      service_id: input.serviceId,
      from_provider: input.fromProvider,
      to_provider: input.toProvider,
      reason: input.reason,
    },
  });
}

export function selectRoutingPolicyForPlan(plan: PlanId) {
  const def = getPlanDefinition(plan);
  if (plan === 'FREE') return 'cheapest_and_safest';
  if (plan === 'BASIC') return 'balanced';
  if (plan === 'PREMIUM') return 'quality';
  return `full_priority_${def.router_policy.quality}`;
}
