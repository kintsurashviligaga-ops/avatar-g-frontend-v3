/**
 * lib/chat/config/index.ts
 * Barrel re-export for all config modules.
 */

export { getAgentRegistry, getAgentDisplay, getAgentsByType, getAgentGroups } from './agentRegistry';
export {
  WORKFLOW_TEMPLATES,
  getWorkflowTemplate,
  getTemplatesByCategory,
  type WorkflowTemplate,
} from './workflowTemplates';
export {
  SERVICE_CAPABILITIES,
  getServiceCapability,
  getServiceForAgent,
  type ServiceCapability,
} from './serviceCapabilities';
export {
  QUICK_ACTIONS,
  SERVICE_SHORTCUTS,
  DEFAULT_FOLLOW_UP_CHIPS,
  getVisibleQuickActions,
  type QuickAction,
  type ServiceShortcut,
} from './quickActionConfig';
export {
  MESSAGE_RENDER_MAP,
  type MessageRenderConfig,
} from './messageRenderConfig';
export {
  getChatLabels,
  getPlaceholder,
  getModeLabel,
  type ChatLabels,
  type ChatLabelKey,
} from './localization';
