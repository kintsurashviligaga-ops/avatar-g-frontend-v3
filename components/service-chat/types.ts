/**
 * components/service-chat/types.ts
 * =================================
 * Type definitions for the unified service chatbot system.
 * Every service chatbot shares these core types while extending
 * them with domain-specific features.
 */

/* ─── Service Identity ───────────────────────────────────────────── */

export type ServiceSlug =
  | 'avatar' | 'video' | 'image' | 'music' | 'text'
  | 'editing' | 'photo' | 'visual-intel' | 'prompt'
  | 'media' | 'workflow' | 'agent-g' | 'business'
  | 'shop' | 'software' | 'tourism' | 'game' | 'interior';

export type AgentMode = 'chat' | 'agent';

/* ─── Localized String ───────────────────────────────────────────── */

export interface L10n {
  en: string;
  ka: string;
  ru: string;
}

/* ─── Quick Action ───────────────────────────────────────────────── */

export interface ServiceQuickAction {
  id: string;
  label: L10n;
  icon: string;
  action: string;
  category?: string;
}

/* ─── Hamburger Menu Item ────────────────────────────────────────── */

export interface HamburgerMenuItem {
  id: string;
  label: L10n;
  icon: string;
  action: string;
  divider?: boolean;
}

/* ─── Tool Panel Option ──────────────────────────────────────────── */

export type ToolOptionType = 'select' | 'toggle' | 'slider' | 'chips' | 'upload' | 'camera';

export interface ToolOption {
  id: string;
  label: L10n;
  type: ToolOptionType;
  options?: { value: string; label: L10n; credits?: number }[];
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
}

export interface ToolPanel {
  id: string;
  label: L10n;
  icon: string;
  options: ToolOption[];
}

/* ─── Preview ────────────────────────────────────────────────────── */

export type PreviewType = 'image' | 'video' | 'audio' | 'text' | 'workflow' | 'none';

export interface PreviewItem {
  id: string;
  type: PreviewType;
  url?: string;
  content?: string;
  title?: string;
  thumbnail?: string;
  meta?: Record<string, string>;
}

/* ─── Cross-Service Transfer ─────────────────────────────────────── */

export interface TransferAction {
  id: string;
  label: L10n;
  icon: string;
  targetService: ServiceSlug;
  description: L10n;
}

/* ─── Service Chat Message (extends base) ────────────────────────── */

export type ServiceMessageType =
  | 'user' | 'assistant' | 'system' | 'error'
  | 'result' | 'preview' | 'action-prompt' | 'agent-suggestion';

export interface ServiceChatAttachment {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'file';
  mimeType: string;
  size: number;
  preview?: string;
  dataUrl?: string;
}

export interface ServiceChatMessage {
  id: string;
  type: ServiceMessageType;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
  agentId?: string;
  attachments?: ServiceChatAttachment[];
  preview?: PreviewItem;
  isStreaming?: boolean;
  model?: string;
  suggestions?: string[];
  toolResults?: Record<string, unknown>;
}

/* ─── Service Chat State ─────────────────────────────────────────── */

export interface ServiceChatState {
  serviceSlug: ServiceSlug;
  agentId: string;
  agentMode: AgentMode;
  messages: ServiceChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  streamingMessageId: string | null;
  inputText: string;
  attachments: ServiceChatAttachment[];
  isRecording: boolean;
  showHamburger: boolean;
  showToolPanel: boolean;
  activeToolPanel: string | null;
  selectedOptions: Record<string, unknown>;
  previews: PreviewItem[];
  language: string;
}

/* ─── Service Chat Action (Reducer) ──────────────────────────────── */

export type ServiceChatAction =
  | { type: 'SET_INPUT'; text: string }
  | { type: 'SET_LOADING'; value: boolean }
  | { type: 'ADD_MESSAGE'; message: ServiceChatMessage }
  | { type: 'UPDATE_MESSAGE'; id: string; updates: Partial<ServiceChatMessage> }
  | { type: 'REMOVE_MESSAGE'; id: string }
  | { type: 'APPEND_STREAM'; id: string; token: string }
  | { type: 'FINISH_STREAM'; id: string; model?: string }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'SET_AGENT_MODE'; mode: AgentMode }
  | { type: 'TOGGLE_HAMBURGER' }
  | { type: 'CLOSE_HAMBURGER' }
  | { type: 'TOGGLE_TOOL_PANEL'; panelId?: string }
  | { type: 'SET_OPTION'; key: string; value: unknown }
  | { type: 'ADD_ATTACHMENT'; attachment: ServiceChatAttachment }
  | { type: 'REMOVE_ATTACHMENT'; id: string }
  | { type: 'CLEAR_ATTACHMENTS' }
  | { type: 'SET_RECORDING'; value: boolean }
  | { type: 'ADD_PREVIEW'; preview: PreviewItem }
  | { type: 'CLEAR_PREVIEWS' }
  | { type: 'SET_LANGUAGE'; language: string };

/* ─── Full Service Config ────────────────────────────────────────── */

export interface ServiceChatConfig {
  slug: ServiceSlug;
  agentId: string;
  icon: string;
  name: L10n;
  description: L10n;
  accentColor: string;
  accentGlow: string;
  quickActions: ServiceQuickAction[];
  hamburgerMenu: HamburgerMenuItem[];
  toolPanels: ToolPanel[];
  transferActions: TransferAction[];
  previewType: PreviewType;
  welcomeMessage: L10n;
  agentModeLabel: L10n;
  placeholders: {
    default: L10n;
    agent: L10n;
  };
}
