/**
 * lib/chat/orchestration/agentRouter.ts
 * Routes user input to the correct agent(s) through Agent G.
 */

import { classifyIntent as classifyFromOrchestrator } from '@/lib/agents/orchestrator';
import { getAgentContract } from '@/lib/agents/contracts';
import type { AgentRoutingDecision } from '../types';
import { detectWorkflowIntent } from '../logic/workflowResolver';

export interface RoutingContext {
  text: string;
  attachmentTypes: string[];
  activeProjectId?: string;
  activeWorkflowId?: string;
  activeServiceSlug?: string;
  language: string;
  activeAgentId: string;
}

/**
 * Full routing pipeline:
 * 1. Inspect user input + attachments
 * 2. Check active project/workflow context
 * 3. Detect language
 * 4. Classify intent (single/multi/pipeline/conversational)
 * 5. Select primary agent + support agents
 */
export function routeMessage(ctx: RoutingContext): AgentRoutingDecision {
  // 1. Check if this is a workflow request
  const workflowTemplate = detectWorkflowIntent(ctx.text);
  if (workflowTemplate) {
    return {
      primaryAgent: 'agent-g',
      supportingAgents: [],
      routingType: 'pipeline',
      confidence: 0.9,
    };
  }

  // 2. Use existing intent classifier
  const intent = classifyFromOrchestrator(ctx.text);

  // 3. If a specific service context is active and intent is conversational,
  //    route to that service's agent
  if (intent.type === 'conversational' && ctx.activeServiceSlug) {
    const contract = getAgentContract(ctx.activeAgentId);
    if (contract && contract.serviceSlugs.includes(ctx.activeServiceSlug)) {
      return {
        primaryAgent: ctx.activeAgentId,
        supportingAgents: [],
        routingType: 'single-agent',
        confidence: 0.7,
      };
    }
  }

  // 4. Map intent classification to routing decision
  return {
    primaryAgent: intent.primaryAgent || 'agent-g',
    supportingAgents: intent.supportingAgents || [],
    routingType: intent.type as AgentRoutingDecision['routingType'],
    confidence: 0.8,
  };
}

/**
 * Get the display-friendly name for an agent by ID.
 */
export function getAgentName(agentId: string, language: string): string {
  const contract = getAgentContract(agentId);
  if (!contract) return agentId;
  if (language === 'ka') return contract.nameKa;
  if (language === 'ru') return contract.nameRu;
  return contract.name;
}
