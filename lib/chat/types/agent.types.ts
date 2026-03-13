/**
 * lib/chat/types/agent.types.ts
 * Agent-specific types for chat layer (lightweight re-exports + chat-layer extras)
 */

import type { LocaleCode } from '@/types/core';

/** Minimal agent display info used by chat UI */
export interface AgentDisplayInfo {
  agentId: string;
  name: string;
  nameKa: string;
  nameRu: string;
  icon: string;
  agentType: 'director' | 'specialist' | 'integration';
  capabilities: string[];
  domain: string[];
  canHandoffTo: string[];
}

/** Agent routing decision from orchestration */
export interface AgentRoutingDecision {
  primaryAgent: string;
  supportingAgents: string[];
  routingType: 'single-agent' | 'multi-agent' | 'pipeline' | 'conversational';
  confidence: number;
}

/** Quick info for active agent display in header / strip */
export interface ActiveAgentInfo {
  agentId: string;
  displayName: string;
  icon: string;
  status: 'active' | 'processing' | 'idle';
}

/** Delegated agent info for control strip */
export interface DelegatedAgentInfo {
  agentId: string;
  displayName: string;
  icon: string;
  task: string;
  status: 'delegated' | 'in-progress' | 'completed' | 'failed';
}

export function getAgentDisplayName(agent: AgentDisplayInfo, language: LocaleCode): string {
  if (language === 'ka') return agent.nameKa;
  if (language === 'ru') return agent.nameRu;
  return agent.name;
}
