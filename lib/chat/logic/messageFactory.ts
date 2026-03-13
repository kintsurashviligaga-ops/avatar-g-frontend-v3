/**
 * lib/chat/logic/messageFactory.ts
 * Creates properly-typed message objects for each message type.
 */

import type {
  UserMessage,
  AgentGMessage,
  AgentHandoffMessage,
  WorkflowProgressMessage,
  ResultMessage,
  ClarificationMessage,
  ClarificationOption,
  SuggestionMessage,
  SystemStatusMessage,
  ErrorMessage,
  WelcomeMessage,
  ChatAttachment,
  ResultCard,
  SuggestionChip,
  WorkflowSnapshot,
} from '../types';
import type { LocaleCode } from '@/types/core';

let _seq = 0;
function uid(prefix: string): string {
  _seq += 1;
  return `${prefix}_${Date.now()}_${_seq}`;
}

export function createUserMessage(
  text: string,
  attachments: ChatAttachment[],
  language: LocaleCode
): UserMessage {
  return {
    id: uid('u'),
    type: 'user',
    createdAt: new Date().toISOString(),
    text,
    attachments,
    language,
    status: 'sent',
  };
}

export function createAssistantMessage(
  agentId: string,
  language: LocaleCode,
  opts?: { agentName?: string; agentIcon?: string }
): AgentGMessage {
  return {
    id: uid('a'),
    type: 'assistant',
    createdAt: new Date().toISOString(),
    text: '',
    agentId,
    agentName: opts?.agentName,
    agentIcon: opts?.agentIcon,
    isStreaming: true,
    actions: [],
    suggestions: [],
    language,
  };
}

export function createHandoffMessage(
  sourceAgentId: string,
  targetAgentId: string,
  taskSummary: string,
  language: LocaleCode
): AgentHandoffMessage {
  return {
    id: uid('h'),
    type: 'handoff',
    createdAt: new Date().toISOString(),
    sourceAgentId,
    targetAgentId,
    taskSummary,
    handoffStatus: 'delegated',
    language,
  };
}

export function createWorkflowProgressMessage(
  snapshot: WorkflowSnapshot,
  language: LocaleCode
): WorkflowProgressMessage {
  return {
    id: uid('wf'),
    type: 'workflow-progress',
    createdAt: new Date().toISOString(),
    workflowId: snapshot.workflowId,
    currentStep: snapshot.currentStep,
    completedSteps: snapshot.steps
      .filter(s => s.status === 'completed')
      .map(s => s.index),
    nextStep: snapshot.steps.find(s => s.status === 'pending')?.index,
    percent: snapshot.percent,
    snapshot,
    language,
  };
}

export function createResultMessage(
  result: ResultCard,
  sourceAgentId: string,
  language: LocaleCode
): ResultMessage {
  return {
    id: uid('r'),
    type: 'result',
    createdAt: new Date().toISOString(),
    resultId: result.resultId,
    resultType: result.resultType,
    title: result.title,
    description: result.subtitle,
    preview: result.preview,
    result,
    sourceAgentId,
    linkedAssetIds: result.linkedAssetIds,
    language,
  };
}

export function createClarificationMessage(
  question: string,
  options: ClarificationOption[],
  requiredForTask: string,
  language: LocaleCode
): ClarificationMessage {
  return {
    id: uid('cl'),
    type: 'clarification',
    createdAt: new Date().toISOString(),
    question,
    options,
    requiredForTask,
    language,
  };
}

export function createSuggestionMessage(
  chips: SuggestionChip[],
  contextType: SuggestionMessage['contextType'],
  language: LocaleCode
): SuggestionMessage {
  return {
    id: uid('sug'),
    type: 'suggestion',
    createdAt: new Date().toISOString(),
    chips,
    contextType,
    language,
  };
}

export function createSystemMessage(
  text: string,
  severity: SystemStatusMessage['severity'],
  language: LocaleCode
): SystemStatusMessage {
  return {
    id: uid('sys'),
    type: 'system',
    createdAt: new Date().toISOString(),
    text,
    severity,
    language,
  };
}

export function createErrorMessage(
  code: string,
  userMessage: string,
  language: LocaleCode,
  opts?: { retryAction?: string; alternatives?: SuggestionChip[]; recoverable?: boolean }
): ErrorMessage {
  return {
    id: uid('err'),
    type: 'error',
    createdAt: new Date().toISOString(),
    errorCode: code,
    userFriendlyMessage: userMessage,
    retryAction: opts?.retryAction,
    alternativeActions: opts?.alternatives ?? [],
    recoverable: opts?.recoverable ?? true,
    language,
  };
}

export function createWelcomeMessage(text: string, language: LocaleCode): WelcomeMessage {
  return {
    id: uid('w'),
    type: 'welcome',
    createdAt: new Date().toISOString(),
    text,
    language,
  };
}
