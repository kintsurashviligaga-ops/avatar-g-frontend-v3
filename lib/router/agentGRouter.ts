/**
 * Agent G Unified Router — Phase 6
 * Central routing for all agents and providers.
 * Validates inputs, selects agent + model, executes, normalizes output.
 */

export interface RouterInput {
  userId: string;
  serviceId: string;
  message: string;
  attachments?: FileAttachment[];
  locale?: string;
  conversationId?: string;
}

export interface FileAttachment {
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
}

export interface RouterOutput {
  ok: boolean;
  summary: string;
  artifacts: RouterArtifact[];
  usage: {
    creditsUsed: number;
    provider: 'gpt' | 'replicate' | 'claude' | 'local';
    model: string;
  };
  conversationId?: string;
  jobId?: string;
  error?: string;
}

export interface RouterArtifact {
  type: 'image' | 'video' | 'audio' | 'text' | 'json' | 'file';
  url?: string;
  content?: string;
  mimeType: string;
  label: string;
  previewable: boolean;
}

// ─── Agent Definitions ───────────────────────────────────────────────────────

interface AgentDef {
  id: string;
  name: string;
  provider: 'gpt' | 'replicate' | 'claude';
  model: string;
  systemPrompt: string;
  capabilities: string[];
}

const AGENTS: Record<string, AgentDef> = {
  'agent_g_director': {
    id: 'agent_g_director',
    name: 'Agent G Director',
    provider: 'gpt',
    model: 'gpt-4o',
    systemPrompt: 'You are Agent G, the executive AI director for MyAvatar.ge. You orchestrate multi-step workflows, coordinate agents, and ensure quality delivery.',
    capabilities: ['orchestrate', 'plan', 'delegate', 'quality-gate'],
  },
  'business_agent': {
    id: 'business_agent',
    name: 'Business Agent',
    provider: 'gpt',
    model: 'gpt-4o',
    systemPrompt: 'You are a business intelligence agent. Analyze markets, create business plans, and optimize revenue strategies.',
    capabilities: ['business-plan', 'market-analysis', 'product-analysis', 'resell-pipeline'],
  },
  'video_agent': {
    id: 'video_agent',
    name: 'Video Agent',
    provider: 'replicate',
    model: 'anotherjesse/zeroscope-v2-xl',
    systemPrompt: 'You handle video generation, editing, and post-production tasks.',
    capabilities: ['video-gen', 'storyboard', 'caption', 'edit'],
  },
  'image_agent': {
    id: 'image_agent',
    name: 'Image Agent',
    provider: 'replicate',
    model: 'stability-ai/sdxl',
    systemPrompt: 'You handle image generation, avatar creation, photo editing, and visual assets.',
    capabilities: ['image-gen', 'avatar', 'retouch', 'upscale'],
  },
  'music_agent': {
    id: 'music_agent',
    name: 'Music Agent',
    provider: 'replicate',
    model: 'meta/musicgen',
    systemPrompt: 'You handle music generation, mixing, and audio production.',
    capabilities: ['music-gen', 'mix', 'master', 'stems'],
  },
  'software_agent': {
    id: 'software_agent',
    name: 'Software Agent',
    provider: 'gpt',
    model: 'gpt-4o',
    systemPrompt: 'You write code, debug, and build software components.',
    capabilities: ['code-gen', 'debug', 'refactor', 'deploy'],
  },
  'shop_agent': {
    id: 'shop_agent',
    name: 'Shop Agent',
    provider: 'gpt',
    model: 'gpt-4o',
    systemPrompt: 'You manage e-commerce operations: listings, pricing, inventory, and fulfillment.',
    capabilities: ['listing', 'pricing', 'inventory', 'fulfillment'],
  },
  'enterprise_agent': {
    id: 'enterprise_agent',
    name: 'Enterprise Agent',
    provider: 'gpt',
    model: 'gpt-4o',
    systemPrompt: 'You handle enterprise-scale operations, compliance, and multi-tenant workflows.',
    capabilities: ['compliance', 'multi-tenant', 'audit', 'sla'],
  },
};

// ─── Service → Agent mapping ─────────────────────────────────────────────────

const SERVICE_AGENT_MAP: Record<string, string> = {
  avatar: 'image_agent',
  video: 'video_agent',
  editing: 'video_agent',
  music: 'music_agent',
  photo: 'image_agent',
  image: 'image_agent',
  media: 'agent_g_director',
  text: 'agent_g_director',
  prompt: 'agent_g_director',
  'visual-intel': 'agent_g_director',
  workflow: 'agent_g_director',
  shop: 'shop_agent',
  'agent-g': 'agent_g_director',
};

// ─── Provider routing rules (Phase 7) ────────────────────────────────────────
// Text reasoning → GPT | Image/Video/Music → Replicate | Code-heavy → GPT/Claude

function selectProvider(agentId: string, hasMediaInput: boolean): { provider: 'gpt' | 'replicate' | 'claude'; model: string } {
  const agent = AGENTS[agentId];
  if (!agent) {
    return { provider: 'gpt', model: 'gpt-4o' };
  }

  // If media generation is needed, route to Replicate
  if (hasMediaInput && ['image_agent', 'video_agent', 'music_agent'].includes(agentId)) {
    return { provider: 'replicate', model: agent.model };
  }

  // Text/reasoning tasks → GPT
  return { provider: agent.provider, model: agent.model };
}

// ─── Input validation ────────────────────────────────────────────────────────

function validateInput(input: RouterInput): { valid: boolean; error?: string } {
  if (!input.userId) return { valid: false, error: 'Missing userId' };
  if (!input.serviceId) return { valid: false, error: 'Missing serviceId' };
  if (!input.message || input.message.trim().length === 0) return { valid: false, error: 'Message cannot be empty' };
  if (input.message.length > 10000) return { valid: false, error: 'Message too long (max 10000 chars)' };
  return { valid: true };
}

// ─── Main Router ─────────────────────────────────────────────────────────────

export async function routeRequest(input: RouterInput): Promise<RouterOutput> {
  // 1. Validate
  const validation = validateInput(input);
  if (!validation.valid) {
    return {
      ok: false,
      summary: validation.error ?? 'Validation failed',
      artifacts: [],
      usage: { creditsUsed: 0, provider: 'local', model: 'none' },
      error: validation.error,
    };
  }

  // 2. Select agent
  const agentId = SERVICE_AGENT_MAP[input.serviceId] ?? 'agent_g_director';
  const agent = AGENTS[agentId];
  if (!agent) {
    return {
      ok: false,
      summary: 'Agent not found',
      artifacts: [],
      usage: { creditsUsed: 0, provider: 'local', model: 'none' },
      error: `No agent configured for service: ${input.serviceId}`,
    };
  }

  // 3. Determine if media generation is needed
  const hasMediaAttachments = input.attachments?.some(a =>
    a.mimeType.startsWith('image/') || a.mimeType.startsWith('video/') || a.mimeType.startsWith('audio/')
  ) ?? false;

  const mediaKeywords = ['generate', 'create', 'make', 'produce', 'render', 'შექმნა', 'გენერაცია'];
  const isMediaRequest = mediaKeywords.some(k => input.message.toLowerCase().includes(k));

  // 4. Select provider + model
  const { provider, model } = selectProvider(agentId, hasMediaAttachments || isMediaRequest);

  // 5. Execute (delegated to API handlers)
  // In production, this would call the appropriate API
  // For now, return a structured response showing the routing decision
  const creditsUsed = provider === 'replicate' ? 10 : 3;

  return {
    ok: true,
    summary: `Routed to ${agent.name} via ${provider}/${model}`,
    artifacts: [],
    usage: { creditsUsed, provider, model },
    conversationId: input.conversationId,
  };
}

/**
 * Get available agents for a service
 */
export function getAgentsForService(serviceId: string): AgentDef[] {
  const primaryId = SERVICE_AGENT_MAP[serviceId];
  const agents: AgentDef[] = [];

  if (primaryId && AGENTS[primaryId]) {
    agents.push(AGENTS[primaryId]!);
  }

  // Always include director
  if (primaryId !== 'agent_g_director' && AGENTS['agent_g_director']) {
    agents.push(AGENTS['agent_g_director']!);
  }

  return agents;
}

/**
 * Get all registered agents
 */
export function getAllAgents(): AgentDef[] {
  return Object.values(AGENTS);
}
