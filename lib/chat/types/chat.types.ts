/**
 * lib/chat/types/chat.types.ts
 * Core chat types — modes, sessions, state
 */

import type { LocaleCode } from '@/types/core';

// ─── Chat Modes ──────────────────────────────────────────────────────────────

export type ChatMode =
  | 'assistant'   // Q&A, guidance, recommendations
  | 'action'      // Create, generate, edit, export
  | 'workflow'    // Multi-step pipelines
  | 'project'     // Continue work in project context
  | 'agent';      // Target a specific agent directly

// ─── Chat Session ────────────────────────────────────────────────────────────

export interface ChatSession {
  id: string;
  mode: ChatMode;
  activeAgentId: string;
  delegatedAgents: string[];
  projectId?: string;
  workflowId?: string;
  language: LocaleCode;
  activeServiceSlug?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Chat Panel State ────────────────────────────────────────────────────────

export type PanelLayout = 'floating' | 'docked' | 'expanded' | 'mobile-sheet' | 'mobile-full';

export interface ChatPanelState {
  isOpen: boolean;
  layout: PanelLayout;
  showAgentPicker: boolean;
  showQuickActions: boolean;
  showServiceGrid: boolean;
}

// ─── Composer State ──────────────────────────────────────────────────────────

export interface ComposerState {
  text: string;
  attachments: import('./attachment.types').ChatAttachment[];
  isRecording: boolean;
  isSubmitting: boolean;
  inferredIntent?: string;
}

// ─── Full Chat State ─────────────────────────────────────────────────────────

export interface ChatState {
  panel: ChatPanelState;
  session: ChatSession;
  composer: ComposerState;
  isLoading: boolean;
  streamingMessageId: string | null;
  rateLimitNotice: string | null;
}
