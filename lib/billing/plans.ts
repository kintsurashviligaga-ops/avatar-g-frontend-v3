/**
 * Avatar G - Plan Definitions
 * Single source of truth for subscription tiers, limits, and pricing
 */

export type PlanTier = 'FREE' | 'PRO' | 'PREMIUM' | 'ENTERPRISE';

export interface PlanConfig {
  id: PlanTier;
  name: string;
  description: string;
  monthlyCredits: number;
  maxConcurrentJobs: number;
  maxStorageGB: number;
  features: string[];
  allowedAgents: string[]; // '*' means all
  stripePriceId?: string; // Undefined for FREE
  monthlyPriceUSD?: number;
  // Agent-specific limits
  limits: {
    avatarBuilder: number; // Max avatars
    videoStudio: number; // Max videos/month
    musicStudio: number; // Max tracks/month
    voiceLab: number; // Max voice slots
  };
}

export const PLANS: Record<PlanTier, PlanConfig> = {
  FREE: {
    id: 'FREE',
    name: 'Free',
    description: 'Get started with Avatar G basics',
    monthlyCredits: 100,
    maxConcurrentJobs: 1,
    maxStorageGB: 1,
    features: [
      '100 credits/month',
      '1 avatar',
      '5 videos/month',
      '5 tracks/month',
      'Basic chat agent',
      'Community support',
    ],
    allowedAgents: [
      'avatar-builder',
      'video-studio',
      'music-studio',
      'chat',
      'image-creator',
    ],
    limits: {
      avatarBuilder: 1,
      videoStudio: 5,
      musicStudio: 5,
      voiceLab: 1,
    },
  },
  
  PRO: {
    id: 'PRO',
    name: 'Basic',
    description: 'For creators and professionals',
    monthlyCredits: 1000,
    maxConcurrentJobs: 3,
    maxStorageGB: 10,
    stripePriceId: process.env.STRIPE_PRICE_PRO,
    monthlyPriceUSD: 30,
    features: [
      '1,000 credits/month',
      'Unlimited avatars',
      'Unlimited videos',
      'Unlimited tracks',
      '3 voice slots',
      'Advanced agents',
      'Priority processing',
      'Email support',
    ],
    allowedAgents: [
      'avatar-builder',
      'video-studio',
      'music-studio',
      'voice-lab',
      'chat',
      'media-production',
      'business-agent',
      'game-creator',
      'image-creator',
      'social-media',
      'online-shop',
    ],
    limits: {
      avatarBuilder: 999,
      videoStudio: 999,
      musicStudio: 999,
      voiceLab: 3,
    },
  },
  
  PREMIUM: {
    id: 'PREMIUM',
    name: 'Premium',
    description: 'Unlock the Avatar G Agent with premium powers',
    monthlyCredits: 5000,
    maxConcurrentJobs: 10,
    maxStorageGB: 50,
    stripePriceId: process.env.STRIPE_PRICE_PREMIUM,
    monthlyPriceUSD: 150,
    features: [
      '5,000 credits/month',
      'Unlimited everything',
      'Avatar G Agent (Premium)',
      'Multi-agent orchestration',
      'Custom voice cloning',
      'API access',
      'White-label options',
      'Priority support + Slack',
    ],
    allowedAgents: ['*'], // All agents
    limits: {
      avatarBuilder: 999,
      videoStudio: 999,
      musicStudio: 999,
      voiceLab: 999,
    },
  },
  
  ENTERPRISE: {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    description: 'Custom solution for teams and organizations',
    monthlyCredits: 50000,
    maxConcurrentJobs: 50,
    maxStorageGB: 500,
    stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE,
    monthlyPriceUSD: 499,
    features: [
      '50,000 credits/month (scalable)',
      'Dedicated infrastructure',
      'Custom integrations',
      'Team collaboration',
      'SSO & advanced security',
      'Custom AI training',
      'SLA guarantee',
      'Dedicated account manager',
    ],
    allowedAgents: ['*'],
    limits: {
      avatarBuilder: 9999,
      videoStudio: 9999,
      musicStudio: 9999,
      voiceLab: 9999,
    },
  },
};

/**
 * Credit costs per agent action
 */
export const AGENT_COSTS = {
  // Avatar Builder
  'avatar-builder.generate': 10,
  'avatar-builder.scan': 5,
  
  // Video Studio
  'video-studio.generate': 20,
  'video-studio.animate': 15,
  
  // Music Studio
  'music-studio.generate': 15,
  'music-studio.remix': 10,
  'music-studio.extend': 8,
  
  // Voice Lab
  'voice-lab.clone': 50,
  'voice-lab.synthesize': 5,
  
  // Media Production
  'media-production.video': 25,
  'media-production.composite': 20,
  
  // Business Agent
  'business-agent.analyze': 10,
  'business-agent.report': 15,
  
  // Chat
  'chat.message': 1,
  'chat.context': 2,
  
  // Game Creator
  'game-creator.generate': 30,
  'game-creator.asset': 10,
  
  // Image Creator
  'image-creator.generate': 8,
  'image-creator.upscale': 5,
  
  // Social Media
  'social-media.post': 5,
  'social-media.campaign': 20,
  
  // Online Shop
  'online-shop.setup': 10,
  'online-shop.product': 5,
  
  // Premium Agent (Avatar G)
  'avatar-g-agent.orchestrate': 50,
  'avatar-g-agent.complex-task': 100,
} as const;

/**
 * Get plan configuration
 */
export function getPlan(tier: PlanTier): PlanConfig {
  return PLANS[tier];
}

/**
 * Check if plan allows agent
 */
export function planAllowsAgent(plan: PlanTier, agentId: string): boolean {
  const config = PLANS[plan];
  if (config.allowedAgents.includes('*')) return true;
  return config.allowedAgents.includes(agentId);
}

/**
 * Get credit cost for action
 */
export function getCreditCost(actionKey: keyof typeof AGENT_COSTS): number {
  return AGENT_COSTS[actionKey] || 0;
}

/**
 * Check if user can afford action
 */
export function canAfford(balance: number, cost: number): boolean {
  return balance >= cost;
}

/**
 * Format credits display
 */
export function formatCredits(credits: number): string {
  if (credits >= 1000) {
    return `${(credits / 1000).toFixed(1)}K`;
  }
  return credits.toString();
}

/**
 * Calculate days until reset
 */
export function daysUntilReset(nextResetDate: Date): number {
  const now = new Date();
  const diff = nextResetDate.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Get plan by Stripe price ID
 */
export function getPlanByStripePriceId(priceId: string): PlanTier | null {
  for (const [tier, config] of Object.entries(PLANS)) {
    if (config.stripePriceId === priceId) {
      return tier as PlanTier;
    }
  }
  return null;
}
