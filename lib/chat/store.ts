/**
 * lib/chat/store.ts
 * =================
 * Chat state management — lightweight store using React context + useReducer.
 * Provides global chat state accessible from any component.
 */

'use client';

import { createContext, useContext, useReducer, useCallback, type Dispatch } from 'react';
import type {
  ChatState,
  ChatMessage,
  ChatMode,
  ChatAttachment,
  SuggestionChip,
  ChatSession,
} from './types';

// ─── Initial State ───────────────────────────────────────────────────────────

function createInitialSession(): ChatSession {
  return {
    id: `session_${Date.now()}`,
    mode: 'assistant',
    messages: [],
    activeAgentId: 'agent-g',
    delegatedAgents: [],
    language: 'ka',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export const initialChatState: ChatState = {
  isOpen: false,
  isExpanded: false,
  isMobileFullscreen: false,
  session: createInitialSession(),
  inputText: '',
  inputAttachments: [],
  isRecording: false,
  isLoading: false,
  streamingMessageId: null,
  showAgentPicker: false,
  showQuickActions: false,
  showServiceShortcuts: false,
  rateLimitNotice: null,
};

// ─── Actions ─────────────────────────────────────────────────────────────────

export type ChatAction =
  | { type: 'TOGGLE_OPEN' }
  | { type: 'SET_OPEN'; open: boolean }
  | { type: 'TOGGLE_EXPANDED' }
  | { type: 'SET_MOBILE_FULLSCREEN'; value: boolean }
  | { type: 'SET_MODE'; mode: ChatMode }
  | { type: 'SET_INPUT'; text: string }
  | { type: 'ADD_ATTACHMENT'; attachment: ChatAttachment }
  | { type: 'REMOVE_ATTACHMENT'; id: string }
  | { type: 'CLEAR_ATTACHMENTS' }
  | { type: 'SET_RECORDING'; value: boolean }
  | { type: 'ADD_MESSAGE'; message: ChatMessage }
  | { type: 'UPDATE_MESSAGE'; id: string; updates: Partial<ChatMessage> }
  | { type: 'APPEND_STREAM'; id: string; token: string }
  | { type: 'FINISH_STREAM'; id: string; model?: string }
  | { type: 'SET_LOADING'; value: boolean }
  | { type: 'SET_STREAMING_ID'; id: string | null }
  | { type: 'SET_ACTIVE_AGENT'; agentId: string }
  | { type: 'ADD_DELEGATED_AGENT'; agentId: string }
  | { type: 'REMOVE_DELEGATED_AGENT'; agentId: string }
  | { type: 'TOGGLE_AGENT_PICKER' }
  | { type: 'TOGGLE_QUICK_ACTIONS' }
  | { type: 'TOGGLE_SERVICE_SHORTCUTS' }
  | { type: 'SET_RATE_LIMIT'; notice: string | null }
  | { type: 'SET_PROJECT'; project: ChatSession['project'] }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'NEW_SESSION' }
  | { type: 'SET_LANGUAGE'; language: 'en' | 'ka' | 'ru' }
  | { type: 'ADD_SUGGESTIONS'; suggestions: SuggestionChip[] };

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  const now = new Date().toISOString();

  switch (action.type) {
    case 'TOGGLE_OPEN':
      return { ...state, isOpen: !state.isOpen };

    case 'SET_OPEN':
      return { ...state, isOpen: action.open };

    case 'TOGGLE_EXPANDED':
      return { ...state, isExpanded: !state.isExpanded };

    case 'SET_MOBILE_FULLSCREEN':
      return { ...state, isMobileFullscreen: action.value };

    case 'SET_MODE':
      return {
        ...state,
        session: { ...state.session, mode: action.mode, updatedAt: now },
      };

    case 'SET_INPUT':
      return { ...state, inputText: action.text };

    case 'ADD_ATTACHMENT':
      return {
        ...state,
        inputAttachments: [...state.inputAttachments, action.attachment],
      };

    case 'REMOVE_ATTACHMENT':
      return {
        ...state,
        inputAttachments: state.inputAttachments.filter(a => a.id !== action.id),
      };

    case 'CLEAR_ATTACHMENTS':
      return { ...state, inputAttachments: [] };

    case 'SET_RECORDING':
      return { ...state, isRecording: action.value };

    case 'ADD_MESSAGE':
      return {
        ...state,
        session: {
          ...state.session,
          messages: [...state.session.messages, action.message],
          updatedAt: now,
        },
      };

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        session: {
          ...state.session,
          messages: state.session.messages.map(m =>
            m.id === action.id ? { ...m, ...action.updates } : m
          ),
        },
      };

    case 'APPEND_STREAM':
      return {
        ...state,
        session: {
          ...state.session,
          messages: state.session.messages.map(m =>
            m.id === action.id ? { ...m, content: m.content + action.token } : m
          ),
        },
      };

    case 'FINISH_STREAM':
      return {
        ...state,
        session: {
          ...state.session,
          messages: state.session.messages.map(m =>
            m.id === action.id
              ? { ...m, isStreaming: false, model: action.model }
              : m
          ),
        },
        isLoading: false,
        streamingMessageId: null,
      };

    case 'SET_LOADING':
      return { ...state, isLoading: action.value };

    case 'SET_STREAMING_ID':
      return { ...state, streamingMessageId: action.id };

    case 'SET_ACTIVE_AGENT':
      return {
        ...state,
        session: { ...state.session, activeAgentId: action.agentId, updatedAt: now },
        showAgentPicker: false,
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

    case 'TOGGLE_AGENT_PICKER':
      return { ...state, showAgentPicker: !state.showAgentPicker };

    case 'TOGGLE_QUICK_ACTIONS':
      return { ...state, showQuickActions: !state.showQuickActions };

    case 'TOGGLE_SERVICE_SHORTCUTS':
      return { ...state, showServiceShortcuts: !state.showServiceShortcuts };

    case 'SET_RATE_LIMIT':
      return { ...state, rateLimitNotice: action.notice };

    case 'SET_PROJECT':
      return {
        ...state,
        session: { ...state.session, project: action.project, mode: action.project ? 'project' : state.session.mode, updatedAt: now },
      };

    case 'CLEAR_MESSAGES':
      return {
        ...state,
        session: { ...state.session, messages: [], updatedAt: now },
      };

    case 'NEW_SESSION':
      return {
        ...state,
        session: createInitialSession(),
        inputText: '',
        inputAttachments: [],
        isLoading: false,
        streamingMessageId: null,
        showAgentPicker: false,
        showQuickActions: false,
        rateLimitNotice: null,
      };

    case 'SET_LANGUAGE':
      return {
        ...state,
        session: { ...state.session, language: action.language, updatedAt: now },
      };

    case 'ADD_SUGGESTIONS': {
      const sugMsg: ChatMessage = {
        id: `sug_${Date.now()}`,
        type: 'suggestion',
        content: '',
        timestamp: now,
        agentId: 'agent-g',
        suggestions: action.suggestions,
      };
      return {
        ...state,
        session: {
          ...state.session,
          messages: [...state.session.messages, sugMsg],
          updatedAt: now,
        },
      };
    }

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
  if (!ctx) throw new Error('useChatStore must be used within ChatProvider');
  return ctx;
}

// ─── Convenience hooks ───────────────────────────────────────────────────────

export function useChatActions() {
  const { dispatch } = useChatStore();

  const toggleOpen = useCallback(() => dispatch({ type: 'TOGGLE_OPEN' }), [dispatch]);
  const setOpen = useCallback((open: boolean) => dispatch({ type: 'SET_OPEN', open }), [dispatch]);
  const setInput = useCallback((text: string) => dispatch({ type: 'SET_INPUT', text }), [dispatch]);
  const setMode = useCallback((mode: ChatMode) => dispatch({ type: 'SET_MODE', mode }), [dispatch]);
  const addMessage = useCallback((msg: ChatMessage) => dispatch({ type: 'ADD_MESSAGE', message: msg }), [dispatch]);
  const clearMessages = useCallback(() => dispatch({ type: 'CLEAR_MESSAGES' }), [dispatch]);
  const newSession = useCallback(() => dispatch({ type: 'NEW_SESSION' }), [dispatch]);
  const setActiveAgent = useCallback((id: string) => dispatch({ type: 'SET_ACTIVE_AGENT', agentId: id }), [dispatch]);
  const setLoading = useCallback((v: boolean) => dispatch({ type: 'SET_LOADING', value: v }), [dispatch]);

  return {
    toggleOpen, setOpen, setInput, setMode, addMessage,
    clearMessages, newSession, setActiveAgent, setLoading, dispatch,
  };
}
