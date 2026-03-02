/**
 * Automation Planner — Phase 5
 * Accepts serviceId + user input → generates structured plan JSON
 */

export interface AutomationStep {
  stepId: string;
  agentId: string;
  action: string;
  toolchain: string[];
  input: Record<string, unknown>;
  estimatedCredits: number;
  verificationRules: VerificationRule[];
  dependsOn: string[];
}

export interface VerificationRule {
  type: 'file_exists' | 'preview_loads' | 'no_404' | 'quality_score' | 'custom';
  target?: string;
  threshold?: number;
  description: string;
}

export interface AutomationPlan {
  planId: string;
  serviceId: string;
  userId: string;
  title: string;
  steps: AutomationStep[];
  totalEstimatedCredits: number;
  createdAt: string;
  status: 'draft' | 'approved' | 'running' | 'completed' | 'failed';
}

// Agent routing rules: which agent handles which service
const AGENT_MAP: Record<string, string> = {
  avatar: 'image-agent',
  video: 'video-agent',
  editing: 'video-agent',
  music: 'audio-agent',
  photo: 'image-agent',
  image: 'image-agent',
  media: 'content-agent',
  text: 'content-agent',
  prompt: 'content-agent',
  'visual-intel': 'research-agent',
  workflow: 'automation-agent',
  shop: 'marketplace-agent',
  'agent-g': 'executive-agent-g',
};

// Provider routing: which provider for which task type
const PROVIDER_MAP: Record<string, 'gpt' | 'replicate' | 'claude'> = {
  'image-agent': 'replicate',
  'video-agent': 'replicate',
  'audio-agent': 'replicate',
  'content-agent': 'gpt',
  'research-agent': 'gpt',
  'automation-agent': 'gpt',
  'marketplace-agent': 'gpt',
  'executive-agent-g': 'gpt',
};

// Credit costs per action type
const CREDIT_COSTS: Record<string, number> = {
  'generate_image': 5,
  'generate_video': 20,
  'generate_music': 15,
  'generate_text': 2,
  'analyze': 3,
  'edit': 10,
  'orchestrate': 1,
  'default': 5,
};

function generateId(): string {
  return `plan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateStepId(index: number): string {
  return `step_${index + 1}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Analyze user input and determine which steps are needed
 */
function analyzeIntent(serviceId: string, userInput: string): { action: string; toolchain: string[] }[] {
  const input = userInput.toLowerCase();
  const steps: { action: string; toolchain: string[] }[] = [];

  switch (serviceId) {
    case 'avatar':
      steps.push({ action: 'generate_image', toolchain: ['face-detect', 'style-transfer', 'avatar-render'] });
      if (input.includes('video') || input.includes('turntable')) {
        steps.push({ action: 'generate_video', toolchain: ['avatar-animate', 'turntable-render'] });
      }
      break;
    case 'video':
    case 'editing':
      steps.push({ action: 'generate_text', toolchain: ['storyboard-gen', 'shot-list'] });
      steps.push({ action: 'generate_video', toolchain: ['scene-render', 'caption-gen', 'export'] });
      break;
    case 'music':
      steps.push({ action: 'generate_music', toolchain: ['beat-gen', 'vocal-chain', 'mix-master'] });
      break;
    case 'photo':
      steps.push({ action: 'generate_image', toolchain: ['bg-remove', 'retouch', 'enhance'] });
      break;
    case 'image':
      steps.push({ action: 'generate_image', toolchain: ['prompt-expand', 'sdxl-render', 'upscale'] });
      break;
    case 'media':
      steps.push({ action: 'generate_text', toolchain: ['brief-parse', 'brand-check'] });
      steps.push({ action: 'generate_image', toolchain: ['asset-gen', 'format-export'] });
      break;
    case 'text':
      steps.push({ action: 'generate_text', toolchain: ['framework-select', 'copywrite', 'seo-optimize'] });
      break;
    case 'prompt':
      steps.push({ action: 'generate_text', toolchain: ['prompt-design', 'negative-gen', 'test-run'] });
      break;
    case 'visual-intel':
      steps.push({ action: 'analyze', toolchain: ['score-creative', 'brand-audit', 'suggest-improve'] });
      break;
    case 'workflow':
      steps.push({ action: 'orchestrate', toolchain: ['dag-plan', 'step-validate', 'schedule'] });
      break;
    case 'shop':
      steps.push({ action: 'generate_text', toolchain: ['listing-gen', 'seo-optimize'] });
      break;
    case 'agent-g':
      steps.push({ action: 'orchestrate', toolchain: ['intent-detect', 'multi-agent-dispatch', 'qa-gate'] });
      break;
    default:
      steps.push({ action: 'default', toolchain: ['process'] });
  }

  return steps;
}

/**
 * Build a structured automation plan from service + user input
 */
export function buildPlan(params: {
  serviceId: string;
  userId: string;
  userInput: string;
  title?: string;
}): AutomationPlan {
  const { serviceId, userId, userInput, title } = params;
  const intents = analyzeIntent(serviceId, userInput);
  const agentId = AGENT_MAP[serviceId] ?? 'executive-agent-g';

  const steps: AutomationStep[] = intents.map((intent, index) => {
    const creditCost = CREDIT_COSTS[intent.action] ?? CREDIT_COSTS['default']!;
    return {
      stepId: generateStepId(index),
      agentId,
      action: intent.action,
      toolchain: intent.toolchain,
      input: { serviceId, userInput, stepIndex: index },
      estimatedCredits: creditCost,
      verificationRules: [
        { type: 'no_404', description: 'Result must load without errors' },
        ...(intent.action.startsWith('generate_')
          ? [{ type: 'file_exists' as const, description: 'Output artifact must exist' }]
          : []),
        ...(intent.action === 'generate_image' || intent.action === 'generate_video'
          ? [{ type: 'preview_loads' as const, description: 'Preview must render in panel' }]
          : []),
      ],
      dependsOn: index > 0 ? [intents[index - 1] ? generateStepId(index - 1) : ''] : [],
    };
  });

  const totalCredits = steps.reduce((sum, s) => sum + s.estimatedCredits, 0);

  return {
    planId: generateId(),
    serviceId,
    userId,
    title: title ?? `${serviceId} automation`,
    steps,
    totalEstimatedCredits: totalCredits,
    createdAt: new Date().toISOString(),
    status: 'draft',
  };
}

/**
 * Validate a plan before execution
 */
export function validatePlan(plan: AutomationPlan): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!plan.steps.length) errors.push('Plan has no steps');
  if (!plan.userId) errors.push('Missing userId');
  if (!plan.serviceId) errors.push('Missing serviceId');

  // Check for circular dependencies
  const stepIds = new Set(plan.steps.map(s => s.stepId));
  for (const step of plan.steps) {
    for (const dep of step.dependsOn) {
      if (dep && !stepIds.has(dep)) {
        errors.push(`Step ${step.stepId} depends on non-existent step ${dep}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
