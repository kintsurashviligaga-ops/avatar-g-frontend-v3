/**
 * lib/service-chat/reducer.ts
 * ============================
 * State management for individual service chatbots.
 * Each service chat uses its own instance of this reducer.
 */

import type {
  ServiceChatState,
  ServiceChatAction,
  ServiceSlug,
  AgentMode,
} from '@/components/service-chat/types';

export function createInitialState(
  serviceSlug: ServiceSlug,
  agentId: string,
  language = 'en'
): ServiceChatState {
  return {
    serviceSlug,
    agentId,
    agentMode: 'chat',
    messages: [],
    isLoading: false,
    isStreaming: false,
    streamingMessageId: null,
    inputText: '',
    attachments: [],
    isRecording: false,
    showHamburger: false,
    showToolPanel: false,
    activeToolPanel: null,
    selectedOptions: {},
    previews: [],
    language,
  };
}

export function serviceChatReducer(
  state: ServiceChatState,
  action: ServiceChatAction
): ServiceChatState {
  switch (action.type) {
    case 'SET_INPUT':
      return { ...state, inputText: action.text };

    case 'SET_LOADING':
      return { ...state, isLoading: action.value };

    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] };

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, ...action.updates } : m
        ),
      };

    case 'REMOVE_MESSAGE':
      return {
        ...state,
        messages: state.messages.filter((m) => m.id !== action.id),
      };

    case 'APPEND_STREAM':
      return {
        ...state,
        isStreaming: true,
        streamingMessageId: action.id,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, text: m.text + action.token, isStreaming: true } : m
        ),
      };

    case 'FINISH_STREAM':
      return {
        ...state,
        isStreaming: false,
        streamingMessageId: null,
        messages: state.messages.map((m) =>
          m.id === action.id
            ? { ...m, isStreaming: false, model: action.model }
            : m
        ),
      };

    case 'CLEAR_MESSAGES':
      return { ...state, messages: [], previews: [] };

    case 'SET_AGENT_MODE':
      return { ...state, agentMode: action.mode };

    case 'TOGGLE_HAMBURGER':
      return { ...state, showHamburger: !state.showHamburger };

    case 'CLOSE_HAMBURGER':
      return { ...state, showHamburger: false };

    case 'TOGGLE_TOOL_PANEL':
      if (action.panelId && action.panelId !== state.activeToolPanel) {
        return { ...state, showToolPanel: true, activeToolPanel: action.panelId };
      }
      return { ...state, showToolPanel: !state.showToolPanel, activeToolPanel: null };

    case 'SET_OPTION':
      return {
        ...state,
        selectedOptions: { ...state.selectedOptions, [action.key]: action.value },
      };

    case 'ADD_ATTACHMENT':
      return { ...state, attachments: [...state.attachments, action.attachment] };

    case 'REMOVE_ATTACHMENT':
      return {
        ...state,
        attachments: state.attachments.filter((a) => a.id !== action.id),
      };

    case 'CLEAR_ATTACHMENTS':
      return { ...state, attachments: [] };

    case 'SET_RECORDING':
      return { ...state, isRecording: action.value };

    case 'ADD_PREVIEW':
      return { ...state, previews: [...state.previews, action.preview] };

    case 'CLEAR_PREVIEWS':
      return { ...state, previews: [] };

    case 'SET_LANGUAGE':
      return { ...state, language: action.language };

    default:
      return state;
  }
}
