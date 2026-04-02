import { ToolName } from '@/lib/ai/tools';

export interface CreditCost {
  avatar_creation: number;
  image_generation: number;
  video_generation: number;
  music_composition: number;
  workflow_execution: number;
}

export const CREDIT_COSTS: CreditCost = {
  avatar_creation: 10,
  image_generation: 5,
  video_generation: 15,
  music_composition: 8,
  workflow_execution: 20,
};

export interface SubscriptionTier {
  id: 'free' | 'creator' | 'pro' | 'enterprise';
  creditsPerMonth: number;
  monthlyPrice: number;
  features: string[];
}

export const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
  free: {
    id: 'free',
    creditsPerMonth: 100,
    monthlyPrice: 0,
    features: ['Avatar creation', 'Basic chat'],
  },
  creator: {
    id: 'creator',
    creditsPerMonth: 500,
    monthlyPrice: 9.99,
    features: ['All services', 'Workflows', 'Priority support'],
  },
  pro: {
    id: 'pro',
    creditsPerMonth: 2000,
    monthlyPrice: 29.99,
    features: ['Agents', 'Autonomy', 'API access', 'Custom branding'],
  },
  enterprise: {
    id: 'enterprise',
    creditsPerMonth: 999999,
    monthlyPrice: 9999,
    features: ['Unlimited', 'White-label', 'Dedicated support', 'SLA 99.9%'],
  },
};

export function getCreditCost(toolName: ToolName): number {
  const costMap: Record<ToolName, number> = {
    create_avatar: CREDIT_COSTS.avatar_creation,
    generate_image: CREDIT_COSTS.image_generation,
    generate_video: CREDIT_COSTS.video_generation,
    compose_music: CREDIT_COSTS.music_composition,
    run_workflow: CREDIT_COSTS.workflow_execution,
  };
  return costMap[toolName] || 0;
}

export function checkCreditAvailability(credits: number, toolName: ToolName): boolean {
  const cost = getCreditCost(toolName);
  return credits >= cost;
}

export function deductCredits(currentCredits: number, toolName: ToolName): { success: boolean; remainingCredits: number } {
  const cost = getCreditCost(toolName);
  if (currentCredits < cost) {
    return { success: false, remainingCredits: currentCredits };
  }
  return { success: true, remainingCredits: currentCredits - cost };
}
