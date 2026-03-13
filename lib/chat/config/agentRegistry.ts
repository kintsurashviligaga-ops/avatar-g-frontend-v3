/**
 * lib/chat/config/agentRegistry.ts
 * Central agent registry for the chat layer.
 * Bridges lib/agents/contracts.ts into chat-friendly display info.
 */

import { ALL_AGENTS, getAgentContract } from '@/lib/agents/contracts';
import type { AgentDisplayInfo } from '../types';

// ─── Build registry from contracts ───────────────────────────────────────────

let _cache: AgentDisplayInfo[] | null = null;

export function getAgentRegistry(): AgentDisplayInfo[] {
  if (_cache) return _cache;

  _cache = ALL_AGENTS.map(c => ({
    agentId: c.agentId,
    name: c.name,
    nameKa: c.nameKa,
    nameRu: c.nameRu,
    icon: c.icon,
    agentType: c.agentType,
    capabilities: c.capabilities,
    domain: c.domain,
    canHandoffTo: c.canHandoffTo,
  }));
  return _cache;
}

export function getAgentDisplay(agentId: string): AgentDisplayInfo | undefined {
  return getAgentRegistry().find(a => a.agentId === agentId);
}

export function getAgentsByType(type: 'director' | 'specialist' | 'integration'): AgentDisplayInfo[] {
  return getAgentRegistry().filter(a => a.agentType === type);
}

/** Agent groups for picker UI */
export function getAgentGroups() {
  return {
    directors: getAgentsByType('director'),
    specialists: getAgentsByType('specialist'),
    integrations: getAgentsByType('integration'),
  };
}

/** Get direct contract for API-layer needs */
export { getAgentContract, ALL_AGENTS };
