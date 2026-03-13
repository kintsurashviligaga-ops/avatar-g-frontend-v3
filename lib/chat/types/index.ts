/**
 * lib/chat/types/index.ts
 * Barrel re-export for all chat types.
 */

export type { ChatMode, ChatSession, PanelLayout, ChatPanelState, ComposerState, ChatState } from './chat.types';
export type {
  MessageType,
  ChatMessage,
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
} from './message.types';
export type {
  WorkflowStatus,
  StepStatus,
  WorkflowStep,
  WorkflowState,
  WorkflowSnapshot,
  WorkflowAction,
} from './workflow.types';
export type { ProjectContext, ProjectAssetRef, ProjectChip } from './project.types';
export type {
  AgentDisplayInfo,
  AgentRoutingDecision,
  ActiveAgentInfo,
  DelegatedAgentInfo,
} from './agent.types';
export { getAgentDisplayName } from './agent.types';
export type {
  ResultType,
  ResultAsset,
  SuggestionChip,
  ResultCard,
  ResultAction,
} from './result.types';
export { RESULT_ACTIONS } from './result.types';
export type { AttachmentType, ChatAttachment } from './attachment.types';
export { inferAttachmentUsage, MAX_ATTACHMENT_SIZE, MAX_ATTACHMENTS } from './attachment.types';
