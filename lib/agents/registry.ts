import { type PlanTier, getPlanRank } from '@/lib/billing/plans';

export interface AgentConfig {
  id: string;
  name: string;
  route: string;
  baseCost: number;
  requiredPlan: PlanTier;
  capabilities: string[];
  enabled: boolean;
}

export const AGENT_REGISTRY: Record<string, AgentConfig> = {
  'avatar-builder': {
    id: 'avatar-builder',
    name: 'Avatar Builder',
    route: '/services/avatar-builder',
    baseCost: 10,
    requiredPlan: 'FREE',
    capabilities: ['avatar-generation', 'avatar-customization'],
    enabled: true,
  },
  'video-studio': {
    id: 'video-studio',
    name: 'Video Studio',
    route: '/services/video-studio',
    baseCost: 20,
    requiredPlan: 'FREE',
    capabilities: ['video-generation', 'scene-editing'],
    enabled: true,
  },
  'music-studio': {
    id: 'music-studio',
    name: 'Music Studio',
    route: '/services/music-studio',
    baseCost: 15,
    requiredPlan: 'FREE',
    capabilities: ['music-generation', 'arrangement'],
    enabled: true,
  },
  'voice-lab': {
    id: 'voice-lab',
    name: 'Voice Lab',
    route: '/services/voice-lab',
    baseCost: 40,
    requiredPlan: 'PRO',
    capabilities: ['voice-cloning', 'tts'],
    enabled: true,
  },
  'media-production': {
    id: 'media-production',
    name: 'Media Production',
    route: '/services/media-production',
    baseCost: 30,
    requiredPlan: 'PRO',
    capabilities: ['media-composition', 'post-production'],
    enabled: true,
  },
  'business-agent': {
    id: 'business-agent',
    name: 'Business Agent',
    route: '/services/business-agent',
    baseCost: 12,
    requiredPlan: 'PRO',
    capabilities: ['analysis', 'strategy', 'forecasting'],
    enabled: true,
  },
  chat: {
    id: 'chat',
    name: 'Chat',
    route: '/services/chat',
    baseCost: 1,
    requiredPlan: 'FREE',
    capabilities: ['conversational-ai'],
    enabled: true,
  },
  'game-creator': {
    id: 'game-creator',
    name: 'Game Creator',
    route: '/services/game-creator',
    baseCost: 25,
    requiredPlan: 'PRO',
    capabilities: ['game-design', 'asset-generation'],
    enabled: true,
  },
  'image-creator': {
    id: 'image-creator',
    name: 'Image Creator',
    route: '/services/image-creator',
    baseCost: 8,
    requiredPlan: 'FREE',
    capabilities: ['image-generation', 'upscaling'],
    enabled: true,
  },
  'prompt-builder': {
    id: 'prompt-builder',
    name: 'Prompt Builder per service',
    route: '/services/prompt-builder',
    baseCost: 3,
    requiredPlan: 'FREE',
    capabilities: ['prompt-optimization', 'prompt-templates'],
    enabled: true,
  },
  'social-media-marketing': {
    id: 'social-media-marketing',
    name: 'Social Media + Marketing & Posting',
    route: '/services/social-media',
    baseCost: 10,
    requiredPlan: 'PRO',
    capabilities: ['campaign-planning', 'scheduled-posting'],
    enabled: true,
  },
  'online-shop': {
    id: 'online-shop',
    name: 'Online Shop',
    route: '/services/online-shop',
    baseCost: 6,
    requiredPlan: 'PRO',
    capabilities: ['catalog-management', 'shop-automation'],
    enabled: true,
  },
  'avatar-g-agent-premium': {
    id: 'avatar-g-agent-premium',
    name: 'Avatar G Agent (premium)',
    route: '/services/agent-g',
    baseCost: 50,
    requiredPlan: 'PREMIUM',
    capabilities: ['multi-agent-orchestration', 'autonomous-workflows'],
    enabled: true,
  },
};

export function getAgent(agentId: string): AgentConfig | undefined {
  return AGENT_REGISTRY[agentId];
}

export function getAllAgents(): AgentConfig[] {
  return Object.values(AGENT_REGISTRY);
}

export function getEnabledAgents(): AgentConfig[] {
  return getAllAgents().filter((agent) => agent.enabled);
}

export function isAgentAvailable(agentId: string, plan: PlanTier): boolean {
  const agent = getAgent(agentId);
  if (!agent || !agent.enabled) {
    return false;
  }

  return getPlanRank(plan) >= getPlanRank(agent.requiredPlan);
}
