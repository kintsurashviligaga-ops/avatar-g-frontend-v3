import type { PlanTier } from '@/lib/billing/plans';

export type WorkflowDefinitionStatus = 'draft' | 'active' | 'archived';
export type WorkflowRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type WorkflowStepRunStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface WorkflowRetryPolicy {
  maxRetries: number;
  backoffMs?: number;
}

export interface WorkflowStepTierRequirements {
  minPlan?: PlanTier;
}

export interface WorkflowStepDefinition {
  stepId: string;
  serviceSlug: string;
  inputMapping: Record<string, string>;
  outputMapping: Record<string, string>;
  tierRequirements?: WorkflowStepTierRequirements;
  retryPolicy: WorkflowRetryPolicy;
  nextStepIds?: string[];
}

export interface WorkflowDefinitionEntity {
  id: string;
  userId: string;
  name: string;
  steps: WorkflowStepDefinition[];
  status: WorkflowDefinitionStatus;
  currentStep: string | null;
  result: Record<string, unknown> | null;
  logs: WorkflowLogEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunEntity {
  id: string;
  workflowId: string;
  userId: string;
  status: WorkflowRunStatus;
  currentStep: string | null;
  result: Record<string, unknown> | null;
  logs: WorkflowLogEntry[];
  triggerInput: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface WorkflowStepRunEntity {
  id: string;
  workflowRunId: string;
  workflowId: string;
  userId: string;
  stepId: string;
  serviceSlug: string;
  status: WorkflowStepRunStatus;
  attemptCount: number;
  maxAttempts: number;
  inputPayload: Record<string, unknown>;
  outputPayload: Record<string, unknown> | null;
  diagnostics: Record<string, unknown> | null;
  errorMessage: string | null;
  costCredits: number;
  executionMs: number | null;
  serviceJobId: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface WorkflowLogEntry {
  at: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  meta?: Record<string, unknown>;
}

export interface WorkflowTierLimits {
  canUseWorkflows: boolean;
  maxSteps: number;
  allowParallel: boolean;
  label: 'Free' | 'Basic' | 'Premium' | 'Full';
}

export interface WorkflowRunContext {
  trigger: Record<string, unknown>;
  run: Record<string, unknown>;
  steps: Record<string, { input?: Record<string, unknown>; output?: Record<string, unknown> }>;
}
