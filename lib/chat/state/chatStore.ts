/**
 * lib/chat/state/chatStore.ts
 * Core chat UI state — panel, loading, rate-limit.
 * Uses React Context + useReducer (project standard).
 */

'use client';

import { createContext, useContext, type Dispatch } from 'react';
import type { ChatState, ChatSession, ChatMode, ChatAttachment, SuggestionChip, PanelLayout } from '../types';
import type { ChatMessage } from '../types';

// ─── Create Initial Session ──────────────────────────────────────────────────

export function createInitialSession(): ChatSession {
  return {
    id: `session_${Date.now()}`,
    mode: 'assistant',
    activeAgentId: 'agent-g',
    delegatedAgents: [],
    language: 'ka',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export const initialChatState: ChatState = {
  panel: {
    isOpen: false,
    layout: 'floating',
    showAgentPicker: false,
    showQuickActions: false,
    showServiceGrid: false,
  },
  session: createInitialSession(),
  composer: {
    text: '',
    attachments: [],
    isRecording: false,
    isSubmitting: false,
  },
  isLoading: false,
  streamingMessageId: null,
  rateLimitNotice: null,
};

// ─── Actions ─────────────────────────────────────────────────────────────────

export type ChatAction =
  // Panel
  | { type: 'TOGGLE_OPEN' }
  | { type: 'SET_OPEN'; open: boolean }
  | { type: 'SET_LAYOUT'; layout: PanelLayout }
  | { type: 'TOGGLE_AGENT_PICKER' }
  | { type: 'TOGGLE_QUICK_ACTIONS' }
  | { type: 'TOGGLE_SERVICE_GRID' }
  // Session
  | { type: 'SET_MODE'; mode: ChatMode }
  | { type: 'SET_ACTIVE_AGENT'; agentId: string }
  | { type: 'ADD_DELEGATED_AGENT'; agentId: string }
  | { type: 'REMOVE_DELEGATED_AGENT'; agentId: string }
  | { type: 'SET_LANGUAGE'; language: 'en' | 'ka' | 'ru' }
  | { type: 'SET_SERVICE_CONTEXT'; slug: string | undefined }
  | { type: 'SET_PROJECT'; projectId?: string; projectName?: string }
  | { type: 'SET_WORKFLOW'; workflowId?: string }
  | { type: 'NEW_SESSION' }
  // Composer
  | { type: 'SET_INPUT'; text: string }
  | { type: 'ADD_ATTACHMENT'; attachment: ChatAttachment }
  | { type: 'REMOVE_ATTACHMENT'; id: string }
  | { type: 'CLEAR_ATTACHMENTS' }
  | { type: 'SET_RECORDING'; value: boolean }
  | { type: 'SET_SUBMITTING'; value: boolean }
  // Loading / streaming
  | { type: 'SET_LOADING'; value: boolean }
  | { type: 'SET_STREAMING_ID'; id: string | null }
  | { type: 'SET_RATE_LIMIT'; notice: string | null };

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  const now = new Date().toISOString();

  switch (action.type) {
    // Panel
    case 'TOGGLE_OPEN':
      return { ...state, panel: { ...state.panel, isOpen: !state.panel.isOpen } };
    case 'SET_OPEN':
      return { ...state, panel: { ...state.panel, isOpen: action.open } };
    case 'SET_LAYOUT':
      return { ...state, panel: { ...state.panel, layout: action.layout } };
    case 'TOGGLE_AGENT_PICKER':
      return { ...state, panel: { ...state.panel, showAgentPicker: !state.panel.showAgentPicker } };
    case 'TOGGLE_QUICK_ACTIONS':
      return { ...state, panel: { ...state.panel, showQuickActions: !state.panel.showQuickActions } };
    case 'TOGGLE_SERVICE_GRID':
      return { ...state, panel: { ...state.panel, showServiceGrid: !state.panel.showServiceGrid } };

    // Session
    case 'SET_MODE':
      return { ...state, session: { ...state.session, mode: action.mode, updatedAt: now } };
    case 'SET_ACTIVE_AGENT':
      return {
        ...state,
        session: { ...state.session, activeAgentId: action.agentId, updatedAt: now },
        panel: { ...state.panel, showAgentPicker: false },
      };
    case 'ADD_DELEGATED_AGENT':
      return {
        ...state,
        session: {
          ...state.session,
          delegatedAgents: [...new Set([...state.session.delegatedAgents, action.agentId])],
        },
      };
    case 'REMOVE_DELEGATED_AGENT':
      return {
        ...state,
        session: {
          ...state.session,
          delegatedAgents: state.session.delegatedAgents.filter(id => id !== action.agentId),
        },
      };
    case 'SET_LANGUAGE':
      return { ...state, session: { ...state.session, language: action.language, updatedAt: now } };
    case 'SET_SERVICE_CONTEXT':
      return { ...state, session: { ...state.session, activeServiceSlug: action.slug, updatedAt: now } };
    case 'SET_PROJECT':
      return {
        ...state,
        session: {
          ...state.session,
          projectId: action.projectId,
          mode: action.projectId ? 'project' : state.session.mode,
          updatedAt: now,
        },
      };
    case 'SET_WORKFLOW':
      return {
        ...state,
        session: {
          ...state.session,
          workflowId: action.workflowId,
          mode: action.workflowId ? 'workflow' : state.session.mode,
          updatedAt: now,
        },
      };
    case 'NEW_SESSION':
      return {
        ...state,
        session: createInitialSession(),
        composer: { text: '', attachments: [], isRecording: false, isSubmitting: false },
        isLoading: false,
        streamingMessageId: null,
        panel: { ...state.panel, showAgentPicker: false, showQuickActions: false },
        rateLimitNotice: null,
      };

    // Composer
    case 'SET_INPUT':
      return { ...state, composer: { ...state.composer, text: action.text } };
    case 'ADD_ATTACHMENT':
      return {
        ...state,
        composer: { ...state.composer, attachments: [...state.composer.attachments, action.attachment] },
      };
    case 'REMOVE_ATTACHMENT':
      return {
        ...state,
        composer: { ...state.composer, attachments: state.composer.attachments.filter(a => a.attachmentId !== action.id) },
      };
    case 'CLEAR_ATTACHMENTS':
      return { ...state, composer: { ...state.composer, attachments: [] } };
    case 'SET_RECORDING':
      return { ...state, composer: { ...state.composer, isRecording: action.value } };
    case 'SET_SUBMITTING':
      return { ...state, composer: { ...state.composer, isSubmitting: action.value } };

    // Loading
    case 'SET_LOADING':
      return { ...state, isLoading: action.value };
    case 'SET_STREAMING_ID':
      return { ...state, streamingMessageId: action.id };
    case 'SET_RATE_LIMIT':
      return { ...state, rateLimitNotice: action.notice };

    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface ChatContextValue {
  state: ChatState;
  dispatch: Dispatch<ChatAction>;
}

export const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatStore() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatStore must be used within ChatContext.Provider');
  return ctx;
}
