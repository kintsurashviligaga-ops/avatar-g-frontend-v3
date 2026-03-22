/**
 * components/service-chat/index.ts
 * ===================================
 * Barrel export for the unified service chatbot system.
 */

export { default as ServiceChatShell } from './ServiceChatShell';
export { ServiceChatHeader } from './ServiceChatHeader';
export { ServiceHamburgerMenu } from './ServiceHamburgerMenu';
export { ServiceQuickActions } from './ServiceQuickActions';
export { ServiceToolPanel } from './ServiceToolPanel';
export { ServiceMessageList } from './ServiceMessageList';
export { ServicePreviewPanel } from './ServicePreviewPanel';
export { ServiceTransferBar } from './ServiceTransferBar';
export { ServiceComposer } from './ServiceComposer';
export { ServiceWelcome } from './ServiceWelcome';
export { AgentModeButton } from './AgentModeButton';
export { CameraModal } from './CameraModal';

export type {
  ServiceSlug,
  ServiceChatConfig,
  ServiceChatState,
  ServiceChatAction,
  ServiceChatMessage,
  ServiceChatAttachment,
  AgentMode,
  ServiceQuickAction as ServiceQuickActionType,
  HamburgerMenuItem,
  ToolPanel,
  ToolOption,
  PreviewItem,
  TransferAction,
} from './types';
