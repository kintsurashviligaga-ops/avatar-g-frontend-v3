/**
 * lib/chat/types.ts
 * =================
 * Type definitions for the Universal Chat system.
 */

// ─── Chat Modes ──────────────────────────────────────────────────────────────

export type ChatMode =
  | 'assistant'    // Q&A, guidance, recommendations
  | 'action'       // Create, generate, edit, export
  | 'workflow'     // Multi-step pipelines
  | 'project'      // Continue work in project context
  | 'agent';       // Target a specific agent directly

// ─── Message Types ───────────────────────────────────────────────────────────

export type MessageType =
  | 'user'
  | 'assistant'
  | 'handoff'          // Agent delegation notification
  | 'result'           // Generated result card
  | 'workflow-status'  // Workflow step update
  | 'clarification'    // Smart prompt for user decision
  | 'suggestion'       // Quick action chips
  | 'system'           // System status / info
  | 'error';           // Error with recovery

export interface ChatAttachment {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'file';
  mimeType: string;
  size: number;
  url?: string;
  preview?: string; // base64 thumbnail for images
}

export interface ResultAsset {
  type: 'image' | 'video' | 'audio' | 'text' | 'document' | '3d-model';
  label: string;
  url?: string;
  content?: string;
  mimeType?: string;
  preview?: string;
}

export interface ClarificationOption {
  label: string;
  value: string;
  icon?: string;
}

export interface SuggestionChip {
  label: string;
  action: string;     // intent string to send
  icon?: string;
  variant?: 'primary' | 'secondary';
}

export interface WorkflowStep {
  index: number;
  label: string;
  agentId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  durationMs?: number;
}

export interface HandoffInfo {
  fromAgent: string;
  toAgent: string;
  task: string;
  status: 'delegated' | 'in-progress' | 'completed' | 'failed';
}

export interface ResultCard {
  title: string;
  agentId: string;
  assets: ResultAsset[];
  actions: SuggestionChip[];
  qaScore?: number;
}

export interface ErrorInfo {
  message: string;
  retryAction?: string;
  fallbackActions?: SuggestionChip[];
}

// ─── Chat Message ────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  type: MessageType;
  content: string;
  timestamp: string;

  // Agent info
  agentId?: string;
  agentName?: string;
  agentIcon?: string;
  model?: string;

  // Streaming
  isStreaming?: boolean;

  // Attachments
  attachments?: ChatAttachment[];

  // Rich content (only one per message)
  handoff?: HandoffInfo;
  result?: ResultCard;
  workflow?: { steps: WorkflowStep[]; currentStep: number };
  clarification?: { question: string; options: ClarificationOption[] };
  suggestions?: SuggestionChip[];
  error?: ErrorInfo;
}

// ─── Chat Session ────────────────────────────────────────────────────────────

export interface ChatProject {
  id: string;
  name: string;
  goal?: string;
  assetCount: number;
}

export interface ChatSession {
  id: string;
  mode: ChatMode;
  messages: ChatMessage[];
  activeAgentId: string;
  delegatedAgents: string[];      // agents currently working
  project?: ChatProject;
  workflowId?: string;
  language: 'en' | 'ka' | 'ru';
  createdAt: string;
  updatedAt: string;
}

// ─── Chat Store State ────────────────────────────────────────────────────────

export interface ChatState {
  // Panel state
  isOpen: boolean;
  isExpanded: boolean;           // full-width mode
  isMobileFullscreen: boolean;

  // Session
  session: ChatSession;

  // Input
  inputText: string;
  inputAttachments: ChatAttachment[];
  isRecording: boolean;

  // Loading
  isLoading: boolean;
  streamingMessageId: string | null;

  // UI
  showAgentPicker: boolean;
  showQuickActions: boolean;
  showServiceShortcuts: boolean;
  rateLimitNotice: string | null;
}

// ─── Quick Action ────────────────────────────────────────────────────────────

export interface QuickAction {
  id: string;
  label: { en: string; ka: string; ru: string };
  icon: string;
  action: string;      // intent or command
  category: 'create' | 'workflow' | 'project' | 'discover' | 'tools';
}

// ─── Service Shortcut ────────────────────────────────────────────────────────

export interface ServiceShortcut {
  slug: string;
  label: { en: string; ka: string; ru: string };
  icon: string;
  agentId: string;
}
