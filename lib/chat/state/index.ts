/**
 * lib/chat/state/index.ts
 * Barrel re-export for all state stores.
 */

export {
  chatReducer,
  initialChatState,
  createInitialSession,
  ChatContext,
  useChatStore,
  type ChatAction,
} from './chatStore';

export {
  conversationReducer,
  initialConversationState,
  ConversationContext,
  useConversation,
  type ConversationAction,
  type ConversationState,
} from './conversationStore';

export {
  workflowReducer,
  initialWorkflowState,
  WorkflowContext,
  useWorkflowStore,
  getWorkflowSnapshot,
  type WorkflowStoreState,
} from './workflowStore';

export {
  projectReducer,
  initialProjectState,
  ProjectStoreContext,
  useProjectStore,
  getProjectChip,
  type ProjectStoreState,
  type ProjectAction,
} from './projectContextStore';
