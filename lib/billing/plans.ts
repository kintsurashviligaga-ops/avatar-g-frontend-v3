/**
 * Avatar G - Billing Plan Source of Truth
 */

export type PlanTier = 'FREE' | 'PRO' | 'PREMIUM' | 'ENTERPRISE';

export interface PlanDefinition {
  id: PlanTier;
  label: string;
  monthlyCredits: number;
  requiredForPortal: boolean;
  refillPolicy: {
    cadence: 'monthly';
    resetRule: 'first_day_utc_month';
  };
  limits: {
    maxConcurrentJobs: number;
    maxStorageGb: number;
  };
  allowedAgents: string[] | '*';
  features: string[];
}

export const PLAN_ORDER: PlanTier[] = ['FREE', 'PRO', 'PREMIUM', 'ENTERPRISE'];

export const PLAN_DEFINITIONS: Record<PlanTier, PlanDefinition> = {
  FREE: {
    id: 'FREE',
    label: 'Free',
    monthlyCredits: 100,
    requiredForPortal: false,
    refillPolicy: { cadence: 'monthly', resetRule: 'first_day_utc_month' },
    limits: { maxConcurrentJobs: 1, maxStorageGb: 2 },
    allowedAgents: [
      'avatar-builder',
      'video-studio',
      'music-studio',
      'chat',
      'image-creator',
      'prompt-builder',
    ],
    features: ['Starter tools', 'Community support'],
  },
  PRO: {
    id: 'PRO',
    label: 'Pro',
    monthlyCredits: 1000,
    requiredForPortal: true,
    refillPolicy: { cadence: 'monthly', resetRule: 'first_day_utc_month' },
    limits: { maxConcurrentJobs: 4, maxStorageGb: 20 },
    allowedAgents: [
      'avatar-builder',
      'video-studio',
      'music-studio',
      'voice-lab',
      'media-production',
      'business-agent',
      'chat',
      'game-creator',
      'image-creator',
      'prompt-builder',
      'social-media-marketing',
      'online-shop',
    ],
    features: ['Priority queue', 'Expanded studio access'],
  },
  PREMIUM: {
    id: 'PREMIUM',
    label: 'Premium',
    monthlyCredits: 5000,
    requiredForPortal: true,
    refillPolicy: { cadence: 'monthly', resetRule: 'first_day_utc_month' },
    limits: { maxConcurrentJobs: 10, maxStorageGb: 100 },
    allowedAgents: '*',
    features: ['Avatar G Agent (premium)', 'Multi-agent orchestration'],
  },
  ENTERPRISE: {
    id: 'ENTERPRISE',
    label: 'Enterprise',
    monthlyCredits: 20000,
    requiredForPortal: true,
    refillPolicy: { cadence: 'monthly', resetRule: 'first_day_utc_month' },
    limits: { maxConcurrentJobs: 50, maxStorageGb: 1000 },
    allowedAgents: '*',
    features: ['SLA', 'Custom integrations', 'Dedicated support'],
  },
};

export const ACTION_CREDIT_COSTS = {
  'avatar-builder.generate': 10,
  'video-studio.generate': 20,
  'music-studio.generate': 15,
  'voice-lab.clone': 40,
  'media-production.render': 30,
  'business-agent.strategy': 12,
  'chat.message': 1,
  'game-creator.generate': 25,
  'image-creator.generate': 8,
  'prompt-builder.optimize': 3,
  'social-media-marketing.campaign': 10,
  'online-shop.publish': 6,
  'avatar-g-agent-premium.orchestrate': 50,
} as const;

export type AgentActionKey = keyof typeof ACTION_CREDIT_COSTS;

export function normalizePlan(plan: string | null | undefined): PlanTier {
  const upper = (plan || '').toUpperCase();
  if (upper === 'PRO' || upper === 'PREMIUM' || upper === 'ENTERPRISE') {
    return upper;
  }
  return 'FREE';
}

export const normalizePlanTier = normalizePlan;

export function getPlan(plan: string | null | undefined): PlanDefinition {
  return PLAN_DEFINITIONS[normalizePlan(plan)];
}

export function getPlanRank(plan: string | null | undefined): number {
  return PLAN_ORDER.indexOf(normalizePlan(plan));
}

export function isPlanAtLeast(currentPlan: string | null | undefined, requiredPlan: PlanTier): boolean {
  return getPlanRank(currentPlan) >= getPlanRank(requiredPlan);
}

export function planAllowsAgent(plan: string | null | undefined, agentId: string): boolean {
  const definition = getPlan(plan);
  if (definition.allowedAgents === '*') {
    return true;
  }
  return definition.allowedAgents.includes(agentId);
}

export function getCreditCost(actionKey: string, fallbackCost: number): number {
  const knownCost = ACTION_CREDIT_COSTS[actionKey as AgentActionKey];
  return typeof knownCost === 'number' ? knownCost : fallbackCost;
}

export function formatCredits(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return `${value}`;
}

export function daysUntilReset(nextResetDate: Date | string): number {
  const next = typeof nextResetDate === 'string' ? new Date(nextResetDate) : nextResetDate;
  const now = new Date();
  const delta = next.getTime() - now.getTime();
  return Math.max(0, Math.ceil(delta / (1000 * 60 * 60 * 24)));
}
