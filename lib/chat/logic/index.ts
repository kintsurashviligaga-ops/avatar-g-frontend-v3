/**
 * lib/chat/logic/index.ts
 * Barrel re-export for logic modules.
 */

export {
  createUserMessage,
  createAssistantMessage,
  createHandoffMessage,
  createWorkflowProgressMessage,
  createResultMessage,
  createClarificationMessage,
  createSuggestionMessage,
  createSystemMessage,
  createErrorMessage,
  createWelcomeMessage,
} from './messageFactory';

export { mapToResultCard, type RawApiResult } from './resultMapper';
export { buildSuggestions, buildFollowUpFromMessage } from './suggestionEngine';
export { createWorkflowFromTemplate, snapshotFromWorkflow, detectWorkflowIntent } from './workflowResolver';
export { checkClarification, type ClarificationNeed } from './clarificationResolver';
export { validateAttachment, fileToAttachment, createAttachmentPreview, getSuggestedActionsForAttachments } from './attachmentResolver';
