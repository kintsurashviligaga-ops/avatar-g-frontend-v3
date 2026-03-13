/**
 * lib/chat/state/conversationStore.ts
 * Message lifecycle — add, update, stream, remove messages.
 * Separated from chatStore to keep single-responsibility.
 */

'use client';

import { createContext, useContext, type Dispatch } from 'react';
import type { ChatMessage } from '../types';

// ─── State ───────────────────────────────────────────────────────────────────

export interface ConversationState {
  messages: ChatMessage[];
  messageCount: number;
}

export const initialConversationState: ConversationState = {
  messages: [],
  messageCount: 0,
};

// ─── Actions ─────────────────────────────────────────────────────────────────

export type ConversationAction =
  | { type: 'ADD_MESSAGE'; message: ChatMessage }
  | { type: 'UPDATE_MESSAGE'; id: string; updates: Partial<ChatMessage> }
  | { type: 'REMOVE_MESSAGE'; id: string }
  | { type: 'APPEND_STREAM'; id: string; token: string }
  | { type: 'FINISH_STREAM'; id: string; model?: string }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'SET_MESSAGES'; messages: ChatMessage[] };

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function conversationReducer(
  state: ConversationState,
  action: ConversationAction
): ConversationState {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return {
        messages: [...state.messages, action.message],
        messageCount: state.messageCount + 1,
      };

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.id ? ({ ...m, ...action.updates } as ChatMessage) : m
        ),
      };

    case 'REMOVE_MESSAGE':
      return {
        messages: state.messages.filter(m => m.id !== action.id),
        messageCount: state.messageCount - 1,
      };

    case 'APPEND_STREAM':
      return {
        ...state,
        messages: state.messages.map(m => {
          if (m.id !== action.id || m.type !== 'assistant') return m;
          return { ...m, text: m.text + action.token };
        }),
      };

    case 'FINISH_STREAM':
      return {
        ...state,
        messages: state.messages.map(m => {
          if (m.id !== action.id || m.type !== 'assistant') return m;
          return { ...m, isStreaming: false, model: action.model ?? m.model };
        }),
      };

    case 'CLEAR_MESSAGES':
      return { messages: [], messageCount: 0 };

    case 'SET_MESSAGES':
      return { messages: action.messages, messageCount: action.messages.length };

    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface ConversationContextValue {
  state: ConversationState;
  dispatch: Dispatch<ConversationAction>;
}

export const ConversationContext = createContext<ConversationContextValue | null>(null);

export function useConversation() {
  const ctx = useContext(ConversationContext);
  if (!ctx) throw new Error('useConversation must be used within ConversationContext.Provider');
  return ctx;
}
