/**
 * lib/chat/orchestration/handoffManager.ts
 * Manages agent handoff lifecycle — delegation, tracking, completion.
 */

import type { DelegatedAgentInfo } from '../types';
import { getAgentDisplay } from '../config/agentRegistry';

export interface HandoffRequest {
  sourceAgentId: string;
  targetAgentId: string;
  task: string;
  inputData?: Record<string, unknown>;
}

export interface HandoffResult {
  targetAgentId: string;
  success: boolean;
  resultId?: string;
  error?: string;
}

/**
 * Build a DelegatedAgentInfo for UI display when starting a handoff.
 */
export function createDelegatedInfo(
  agentId: string,
  task: string
): DelegatedAgentInfo | null {
  const agent = getAgentDisplay(agentId);
  if (!agent) return null;

  return {
    agentId: agent.agentId,
    displayName: agent.name,
    icon: agent.icon,
    task,
    status: 'delegated',
  };
}

/**
 * Determine if the message requires a handoff from Agent G to a specialist.
 */
export function shouldHandoff(
  routingType: string,
  primaryAgent: string,
  currentAgent: string
): boolean {
  if (routingType === 'conversational') return false;
  if (primaryAgent === currentAgent) return false;
  if (primaryAgent === 'agent-g') return false;
  return true;
}

/**
 * Get up to N agents to display in the delegate strip.
 */
export function getVisibleDelegates(
  delegatedAgents: string[],
  max: number = 3
): DelegatedAgentInfo[] {
  const infos: DelegatedAgentInfo[] = [];
  for (const agentId of delegatedAgents.slice(0, max)) {
    const agent = getAgentDisplay(agentId);
    if (agent) {
      infos.push({
        agentId: agent.agentId,
        displayName: agent.name,
        icon: agent.icon,
        task: '',
        status: 'in-progress',
      });
    }
  }
  return infos;
}
