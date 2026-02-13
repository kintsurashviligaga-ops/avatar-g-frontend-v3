/**
 * Avatar G - Agent Registry
 * Centralized registry for all 13 AI agents with metadata and orchestration config
 */

import { type PlanTier, getPlanRank } from '@/lib/billing/plans';

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'creation' | 'studio' | 'business' | 'premium';
  route: string;
  requiredPlan: PlanTier;
  baseCost: number; // Base credit cost for typical operation
  capabilities: string[];
  color: {
    primary: string;
    accent: string;
  };
  enabled: boolean;
}

export const AGENT_REGISTRY: Record<string, AgentConfig> = {
  'avatar-builder': {
    id: 'avatar-builder',
    name: 'Avatar Builder',
    description: 'Create your AI avatar with face scan or prompt',
    icon: '🎭',
    category: 'creation',
    route: '/services/avatar-builder',
    requiredPlan: 'FREE',
    baseCost: 10,
    capabilities: ['face-scan', 'prompt-generation', '3d-modeling', 'voice-mapping'],
    color: {
      primary: '#06b6d4', // cyan-500
      accent: '#0891b2', // cyan-600
    },
    enabled: true,
  },
  
  'video-studio': {
    id: 'video-studio',
    name: 'Video Studio',
    description: 'Generate cinematic videos with your avatar',
    icon: '🎬',
    category: 'studio',
    route: '/services/video-studio',
    requiredPlan: 'FREE',
    baseCost: 20,
    capabilities: ['video-generation', 'animation', 'lip-sync', 'scene-composition'],
    color: {
      primary: '#8b5cf6', // violet-500
      accent: '#7c3aed', // violet-600
    },
    enabled: true,
  },
  
  'music-studio': {
    id: 'music-studio',
    name: 'Music Studio',
    description: 'Create original music tracks with AI',
    icon: '🎵',
    category: 'studio',
    route: '/services/music-studio',
    requiredPlan: 'FREE',
    baseCost: 15,
    capabilities: ['music-generation', 'lyrics', 'remix', 'extend', 'voice-synthesis'],
    color: {
      primary: '#ec4899', // pink-500
      accent: '#db2777', // pink-600
    },
    enabled: true,
  },
  
  'voice-lab': {
    id: 'voice-lab',
    name: 'Voice Lab',
    description: 'Clone and customize your voice',
    icon: '🎙️',
    category: 'creation',
    route: '/services/voice-lab',
    requiredPlan: 'BASIC',
    baseCost: 50,
    capabilities: ['voice-cloning', 'tts', 'voice-customization', 'multilingual'],
    color: {
      primary: '#f59e0b', // amber-500
      accent: '#d97706', // amber-600
    },
    enabled: true,
  },
  
  'media-production': {
    id: 'media-production',
    name: 'Media Production',
    description: 'Professional video editing and compositing',
    icon: '🎞️',
    category: 'studio',
    route: '/services/media-production',
    requiredPlan: 'BASIC',
    baseCost: 25,
    capabilities: ['video-editing', 'compositing', 'effects', 'export'],
    color: {
      primary: '#3b82f6', // blue-500
      accent: '#2563eb', // blue-600
    },
    enabled: true,
  },
  
  'business-agent': {
    id: 'business-agent',
    name: 'Business Agent',
    description: 'AI-powered business strategy and analytics',
    icon: '💼',
    category: 'business',
    route: '/services/business-agent',
    requiredPlan: 'BASIC',
    baseCost: 15,
    capabilities: ['market-analysis', 'strategy', 'reporting', 'insights'],
    color: {
      primary: '#10b981', // emerald-500
      accent: '#059669', // emerald-600
    },
    enabled: true,
  },
  
  'chat': {
    id: 'chat',
    name: 'AI Chat',
    description: 'Conversational AI assistant',
    icon: '💬',
    category: 'creation',
    route: '/chat',
    requiredPlan: 'FREE',
    baseCost: 1,
    capabilities: ['conversation', 'context-awareness', 'multilingual', 'knowledge'],
    color: {
      primary: '#06b6d4', // cyan-500
      accent: '#0891b2', // cyan-600
    },
    enabled: true,
  },
  
  'game-creator': {
    id: 'game-creator',
    name: 'Game Creator',
    description: 'Build interactive games with AI',
    icon: '🎮',
    category: 'creation',
    route: '/services/game-creator',
    requiredPlan: 'BASIC',
    baseCost: 30,
    capabilities: ['game-design', 'asset-generation', 'mechanics', 'prototyping'],
    color: {
      primary: '#8b5cf6', // violet-500
      accent: '#7c3aed', // violet-600
    },
    enabled: false, // Coming soon
  },
  
  'image-creator': {
    id: 'image-creator',
    name: 'Image Creator',
    description: 'Generate stunning AI images',
    icon: '🖼️',
    category: 'creation',
    route: '/services/image-creator',
    requiredPlan: 'FREE',
    baseCost: 8,
    capabilities: ['image-generation', 'upscaling', 'style-transfer', 'inpainting'],
    color: {
      primary: '#f59e0b', // amber-500
      accent: '#d97706', // amber-600
    },
    enabled: true,
  },
  
  'social-media': {
    id: 'social-media',
    name: 'Social Media Manager',
    description: 'Automate social media content and posting',
    icon: '📱',
    category: 'business',
    route: '/services/social-media',
    requiredPlan: 'BASIC',
    baseCost: 5,
    capabilities: ['content-generation', 'scheduling', 'analytics', 'multi-platform'],
    color: {
      primary: '#ec4899', // pink-500
      accent: '#db2777', // pink-600
    },
    enabled: false, // Coming soon
  },
  
  'online-shop': {
    id: 'online-shop',
    name: 'Online Shop Builder',
    description: 'Create and manage your AI-powered shop',
    icon: '🛒',
    category: 'business',
    route: '/services/online-shop',
    requiredPlan: 'BASIC',
    baseCost: 10,
    capabilities: ['shop-setup', 'product-management', 'inventory', 'payments'],
    color: {
      primary: '#10b981', // emerald-500
      accent: '#059669', // emerald-600
    },
    enabled: false, // Coming soon
  },
  
  'prompt-builder': {
    id: 'prompt-builder',
    name: 'Prompt Builder',
    description: 'Optimize prompts for better AI results',
    icon: '✍️',
    category: 'creation',
    route: '/services/prompt-builder',
    requiredPlan: 'FREE',
    baseCost: 2,
    capabilities: ['prompt-optimization', 'templates', 'refinement', 'testing'],
    color: {
      primary: '#06b6d4', // cyan-500
      accent: '#0891b2', // cyan-600
    },
    enabled: false, // Coming soon
  },
  
  'avatar-g-agent': {
    id: 'avatar-g-agent',
    name: 'Avatar G Agent (Premium)',
    description: 'Your personal AI superhero with advanced powers',
    icon: '🦸',
    category: 'premium',
    route: '/agent',
    requiredPlan: 'PREMIUM',
    baseCost: 50,
    capabilities: [
      'multi-agent-orchestration',
      'complex-workflows',
      'autonomous-operation',
      'learning',
      'api-integration',
      'custom-tools',
    ],
    color: {
      primary: '#f59e0b', // amber-500 (gold)
      accent: '#06b6d4', // cyan-500 (neon)
    },
    enabled: true,
  },
};

/**
 * Get agent by ID
 */
export function getAgent(agentId: string): AgentConfig | undefined {
  return AGENT_REGISTRY[agentId];
}

/**
 * Get all agents
 */
export function getAllAgents(): AgentConfig[] {
  return Object.values(AGENT_REGISTRY);
}

/**
 * Get agents by category
 */
export function getAgentsByCategory(
  category: AgentConfig['category']
): AgentConfig[] {
  return getAllAgents().filter((agent) => agent.category === category);
}

/**
 * Get agents accessible by plan
 */
export function getAgentsByPlan(plan: PlanTier): AgentConfig[] {
  const userPlanIndex = getPlanRank(plan);
  
  return getAllAgents().filter((agent) => {
    const agentPlanIndex = getPlanRank(agent.requiredPlan);
    return agentPlanIndex <= userPlanIndex && agent.enabled;
  });
}

/**
 * Get enabled agents only
 */
export function getEnabledAgents(): AgentConfig[] {
  return getAllAgents().filter((agent) => agent.enabled);
}

/**
 * Check if agent is available (enabled + user has plan access)
 */
export function isAgentAvailable(agentId: string, userPlan: PlanTier): boolean {
  const agent = getAgent(agentId);
  if (!agent || !agent.enabled) return false;
  
  const userPlanIndex = getPlanRank(userPlan);
  const agentPlanIndex = getPlanRank(agent.requiredPlan);
  
  return agentPlanIndex <= userPlanIndex;
}

/**
 * Get agent display name with category badge
 */
export function getAgentDisplayName(agentId: string): string {
  const agent = getAgent(agentId);
  if (!agent) return agentId;
  
  return `${agent.icon} ${agent.name}`;
}
