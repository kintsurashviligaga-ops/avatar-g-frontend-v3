/**
 * lib/chat/types/message.types.ts
 * Strict message union types — each type has its own shape.
 */

import type { ChatAttachment } from './attachment.types';
import type { ResultCard } from './result.types';
import type { WorkflowSnapshot } from './workflow.types';
import type { LocaleCode } from '@/types/core';

// ─── Message Type Union ──────────────────────────────────────────────────────

export type MessageType =
  | 'user'
  | 'assistant'
  | 'handoff'
  | 'workflow-progress'
  | 'result'
  | 'clarification'
  | 'suggestion'
  | 'system'
  | 'error'
  | 'welcome';

// ─── Base Fields ─────────────────────────────────────────────────────────────

interface MessageBase {
  id: string;
  createdAt: string;
  language: LocaleCode;
}

// ─── User Message ────────────────────────────────────────────────────────────

export interface UserMessage extends MessageBase {
  type: 'user';
  text: string;
  attachments: ChatAttachment[];
  status: 'sent' | 'delivered';
}

// ─── Agent G Message ─────────────────────────────────────────────────────────

export interface AgentGMessage extends MessageBase {
  type: 'assistant';
  text: string;
  agentId: string;
  agentName?: string;
  agentIcon?: string;
  model?: string;
  tone?: string;
  isStreaming: boolean;
  actions: import('./result.types').SuggestionChip[];
  suggestions: import('./result.types').SuggestionChip[];
  relatedProjectId?: string;
  relatedWorkflowId?: string;
}

// ─── Handoff Message ─────────────────────────────────────────────────────────

export interface AgentHandoffMessage extends MessageBase {
  type: 'handoff';
  sourceAgentId: string;
  targetAgentId: string;
  taskSummary: string;
  handoffStatus: 'delegated' | 'in-progress' | 'completed' | 'failed';
}

// ─── Workflow Progress Message ───────────────────────────────────────────────

export interface WorkflowProgressMessage extends MessageBase {
  type: 'workflow-progress';
  workflowId: string;
  currentStep: number;
  completedSteps: number[];
  nextStep?: number;
  percent?: number;
  snapshot: WorkflowSnapshot;
}

// ─── Result Message ──────────────────────────────────────────────────────────

export interface ResultMessage extends MessageBase {
  type: 'result';
  resultId: string;
  resultType: string;
  title: string;
  description?: string;
  preview?: string;
  result: ResultCard;
  sourceAgentId: string;
  linkedAssetIds: string[];
}

// ─── Clarification Message ───────────────────────────────────────────────────

export interface ClarificationOption {
  label: string;
  value: string;
  icon?: string;
}

export interface ClarificationMessage extends MessageBase {
  type: 'clarification';
  question: string;
  options: ClarificationOption[];
  requiredForTask: string;
}

// ─── Suggestion Message ──────────────────────────────────────────────────────

export interface SuggestionMessage extends MessageBase {
  type: 'suggestion';
  chips: import('./result.types').SuggestionChip[];
  contextType: 'post-result' | 'post-error' | 'onboarding' | 'workflow' | 'general';
}

// ─── System Status Message ───────────────────────────────────────────────────

export interface SystemStatusMessage extends MessageBase {
  type: 'system';
  text: string;
  severity: 'info' | 'warning' | 'success';
}

// ─── Error Message ───────────────────────────────────────────────────────────

export interface ErrorMessage extends MessageBase {
  type: 'error';
  errorCode: string;
  userFriendlyMessage: string;
  retryAction?: string;
  alternativeActions: import('./result.types').SuggestionChip[];
  recoverable: boolean;
}

// ─── Welcome Message ─────────────────────────────────────────────────────────

export interface WelcomeMessage extends MessageBase {
  type: 'welcome';
  text: string;
}

// ─── Discriminated Union ─────────────────────────────────────────────────────

export type ChatMessage =
  | UserMessage
  | AgentGMessage
  | AgentHandoffMessage
  | WorkflowProgressMessage
  | ResultMessage
  | ClarificationMessage
  | SuggestionMessage
  | SystemStatusMessage
  | ErrorMessage
  | WelcomeMessage;
