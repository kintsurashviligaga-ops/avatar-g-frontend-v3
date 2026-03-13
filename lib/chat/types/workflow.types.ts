/**
 * lib/chat/types/workflow.types.ts
 * Workflow state machine types
 */

import type { LocaleCode } from '@/types/core';

export type WorkflowStatus =
  | 'idle'
  | 'running'
  | 'waiting_input'
  | 'blocked'
  | 'complete'
  | 'failed';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface WorkflowStep {
  index: number;
  label: string;
  agentId: string;
  status: StepStatus;
  durationMs?: number;
  resultId?: string;
  error?: string;
}

export interface WorkflowState {
  workflowId: string;
  templateId?: string;
  projectId?: string;
  workflowType: string;
  currentStep: number;
  steps: WorkflowStep[];
  completedSteps: number[];
  pendingSteps: number[];
  failedSteps: number[];
  involvedAgents: string[];
  linkedAssetIds: string[];
  linkedResultIds: string[];
  targetPlatform?: string;
  language: LocaleCode;
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight snapshot for display in message cards */
export interface WorkflowSnapshot {
  workflowId: string;
  workflowType: string;
  steps: WorkflowStep[];
  currentStep: number;
  status: WorkflowStatus;
  percent: number;
}

// ─── Workflow Actions ────────────────────────────────────────────────────────

export type WorkflowAction =
  | { type: 'START_WORKFLOW'; workflow: WorkflowState }
  | { type: 'ADVANCE_STEP'; workflowId: string }
  | { type: 'COMPLETE_STEP'; workflowId: string; stepIndex: number; resultId?: string }
  | { type: 'FAIL_STEP'; workflowId: string; stepIndex: number; error: string }
  | { type: 'SKIP_STEP'; workflowId: string; stepIndex: number }
  | { type: 'PAUSE_WORKFLOW'; workflowId: string }
  | { type: 'RESUME_WORKFLOW'; workflowId: string; fromStep: number }
  | { type: 'CANCEL_WORKFLOW'; workflowId: string }
  | { type: 'RETRY_STEP'; workflowId: string; stepIndex: number }
  | { type: 'CLEAR_WORKFLOW' };
