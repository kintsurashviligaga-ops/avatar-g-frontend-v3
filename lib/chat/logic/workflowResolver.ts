/**
 * lib/chat/logic/workflowResolver.ts
 * Builds and resolves workflow state from templates.
 */

import type { WorkflowState, WorkflowStep, WorkflowSnapshot } from '../types';
import type { LocaleCode } from '@/types/core';
import { getWorkflowTemplate, type WorkflowTemplate } from '../config/workflowTemplates';

/**
 * Create a new WorkflowState from a template.
 */
export function createWorkflowFromTemplate(
  templateId: string,
  language: LocaleCode,
  projectId?: string,
  targetPlatform?: string
): WorkflowState | null {
  const template = getWorkflowTemplate(templateId);
  if (!template) return null;

  const workflowId = `wf_${Date.now()}`;
  const steps: WorkflowStep[] = template.steps.map(s => ({
    ...s,
    status: s.index === 0 ? 'running' : 'pending',
  }));

  return {
    workflowId,
    templateId,
    projectId,
    workflowType: template.name,
    currentStep: 0,
    steps,
    completedSteps: [],
    pendingSteps: steps.filter(s => s.status === 'pending').map(s => s.index),
    failedSteps: [],
    involvedAgents: [...new Set(steps.map(s => s.agentId))],
    linkedAssetIds: [],
    linkedResultIds: [],
    targetPlatform,
    language,
    status: 'running',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get a concise snapshot for display in chat.
 */
export function snapshotFromWorkflow(wf: WorkflowState): WorkflowSnapshot {
  const completed = wf.steps.filter(s => s.status === 'completed').length;
  const total = wf.steps.length;
  return {
    workflowId: wf.workflowId,
    workflowType: wf.workflowType,
    steps: wf.steps,
    currentStep: wf.currentStep,
    status: wf.status,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

/**
 * Detect if user text refers to a workflow template.
 */
export function detectWorkflowIntent(text: string): string | null {
  const lower = text.toLowerCase();
  const hints: Array<{ keywords: string[]; templateId: string }> = [
    { keywords: ['creator flow', 'avatar video music'], templateId: 'creator-flow' },
    { keywords: ['store flow', 'product listing seo'], templateId: 'store-flow' },
    { keywords: ['business flow', 'business plan revenue'], templateId: 'business-flow' },
    { keywords: ['app flow', 'app spec architecture'], templateId: 'app-flow' },
    { keywords: ['marketing flow', 'campaign content seo'], templateId: 'marketing-flow' },
    { keywords: ['social content', 'social pack', 'reels pack'], templateId: 'social-content-pack' },
  ];
  for (const h of hints) {
    if (h.keywords.some(k => lower.includes(k))) return h.templateId;
  }
  return null;
}
