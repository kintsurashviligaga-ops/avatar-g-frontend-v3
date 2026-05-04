'use client';

/**
 * components/service-chat/ServiceChatShell.tsx
 * ===============================================
 * THE UNIVERSAL SERVICE CHATBOT SHELL
 * 
 * This is the main wrapper that turns any service into a
 * full functional service chatbot. It composes:
 * 
 * - ServiceChatHeader (identity + controls)
 * - ServiceHamburgerMenu (service-specific menu)
 * - ServiceToolPanel (service-specific settings)
 * - ServiceWelcome (clean welcome screen)
 * - ServiceMessageList (premium message thread)
 * - ServicePreviewPanel (output previews)
 * - ServiceTransferBar (cross-service continuation)
 * - ServiceComposer (premium input)
 * 
 * Every service uses this shell with its own config.
 * Same premium design language, different functionality.
 */

import { useReducer, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import type { ServiceChatConfig, ServiceChatMessage, AgentMode } from './types';
import { serviceChatReducer, createInitialState } from '@/lib/service-chat/reducer';

import { ServiceChatHeader } from './ServiceChatHeader';
import { ServiceHamburgerMenu } from './ServiceHamburgerMenu';
import { ServiceToolPanel } from './ServiceToolPanel';
import { ServiceWelcome } from './ServiceWelcome';
import { ServiceMessageList } from './ServiceMessageList';
import { ServicePreviewPanel } from './ServicePreviewPanel';
import { ServiceTransferBar } from './ServiceTransferBar';
import { ServiceComposer } from './ServiceComposer';
import { ServiceStatusBar } from './ServiceStatusBar';
import WorkflowBuilder from '@/components/workflow/WorkflowBuilder';

interface Props {
  config: ServiceChatConfig;
  language?: string;
  className?: string;
}

const SHELL_COPY = {
  ka: {
    genericError: 'რაღაც ხარვეზი მოხდა. სცადე ხელახლა.',
    chatMode: 'ჩატის რეჟიმი',
    activated: 'აქტიურდა',
    checkingStatus: 'ვამოწმებ API key-ებს და ბალანსს...',
    statusLabel: 'სისტემის სტატუსი',
    keysLabel: 'API key-ები',
    balanceLabel: 'ბალანსი',
    unavailableLabel: 'მიუწვდომელია',
    statusError: 'სტატუსის მიღება ვერ მოხერხდა.',
  },
  en: {
    genericError: 'Something went wrong. Please try again.',
    chatMode: 'Chat Mode',
    activated: 'activated',
    checkingStatus: 'Checking API key status and balance...',
    statusLabel: 'System status',
    keysLabel: 'API keys',
    balanceLabel: 'Balance',
    unavailableLabel: 'unavailable',
    statusError: 'Unable to load status right now.',
  },
  ru: {
    genericError: 'Что-то пошло не так. Попробуйте снова.',
    chatMode: 'Режим чата',
    activated: 'активирован',
    checkingStatus: 'Проверяю API-ключи и баланс...',
    statusLabel: 'Статус системы',
    keysLabel: 'API-ключи',
    balanceLabel: 'Баланс',
    unavailableLabel: 'недоступно',
    statusError: 'Не удалось получить статус.',
  },
} as const;

type AppStatusPayload = {
  keys?: {
    status?: 'ready' | 'partial' | 'missing';
    configured?: number;
    total?: number;
  };
  billing?: {
    balance?: number | null;
    authenticated?: boolean;
  };
};

export default function ServiceChatShell({ config, language = 'en', className = '' }: Props) {
  const router = useRouter();
  const activeLanguage = language === 'ka' || language === 'ru' ? language : 'en';
  const shellCopy = SHELL_COPY[activeLanguage];

  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const [state, dispatch] = useReducer(
    serviceChatReducer,
    createInitialState(config.slug, config.agentId, language)
  );

  const {
    messages, inputText, isLoading, isStreaming: _isStreaming, agentMode,
    showHamburger, showToolPanel, activeToolPanel,
    selectedOptions, attachments, previews, isRecording,
  } = state;

  const hasMessages = messages.length > 0;
  const hasResults = previews.length > 0 || messages.some((m) => m.type === 'result');

  // ─── Speech Recognition Init ────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
      .webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const t = e.results[0]?.[0]?.transcript;
      if (t) dispatch({ type: 'SET_INPUT', text: t });
    };
    rec.onend = () => dispatch({ type: 'SET_RECORDING', value: false });
    recognitionRef.current = rec;
  }, []);

  // ─── Send Message ───────────────────────────────────────────
  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText || inputText).trim();
    if (!text || isLoading) return;

    // User message
    const userMsg: ServiceChatMessage = {
      id: `u_${Date.now()}`,
      type: 'user',
      role: 'user',
      text,
      timestamp: Date.now(),
      attachments: attachments.length > 0 ? [...attachments] : undefined,
    };
    dispatch({ type: 'ADD_MESSAGE', message: userMsg });
    dispatch({ type: 'SET_INPUT', text: '' });
    dispatch({ type: 'CLEAR_ATTACHMENTS' });
    dispatch({ type: 'SET_LOADING', value: true });

    // Assistant placeholder for streaming
    const assistantId = `a_${Date.now()}`;
    const assistantMsg: ServiceChatMessage = {
      id: assistantId,
      type: 'assistant',
      role: 'assistant',
      text: '',
      timestamp: Date.now(),
      agentId: config.agentId,
      isStreaming: true,
    };
    dispatch({ type: 'ADD_MESSAGE', message: assistantMsg });

    try {
      abortRef.current = new AbortController();

      const body = {
        message: text,
        serviceSlug: config.slug,
        agentId: config.agentId,
        agentMode,
        options: selectedOptions,
        language,
      };

      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamError: string | null = null;
      let streamFinished = false;
      let streamModel: string | undefined;

      outer:
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              streamFinished = true;
              break outer;
            }
            try {
              const parsed = JSON.parse(data);
              if (typeof parsed.error === 'string' && parsed.error.trim().length > 0) {
                streamError = parsed.error.trim();
                break outer;
              }
              if (parsed.token) {
                dispatch({ type: 'APPEND_STREAM', id: assistantId, token: parsed.token });
              }
              if (parsed.suggestions) {
                dispatch({
                  type: 'UPDATE_MESSAGE',
                  id: assistantId,
                  updates: { suggestions: parsed.suggestions },
                });
              }
              if (parsed.preview) {
                dispatch({ type: 'ADD_PREVIEW', preview: parsed.preview });
              }
              if (parsed.done === true) {
                streamFinished = true;
                streamModel = typeof parsed.model === 'string' ? parsed.model : undefined;
                break outer;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      if (streamError) {
        dispatch({
          type: 'UPDATE_MESSAGE',
          id: assistantId,
          updates: {
            text: streamError,
            isStreaming: false,
            type: 'error',
          },
        });
      } else {
        dispatch({ type: 'FINISH_STREAM', id: assistantId, model: streamModel });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        dispatch({ type: 'FINISH_STREAM', id: assistantId });
      } else {
        dispatch({
          type: 'UPDATE_MESSAGE',
          id: assistantId,
          updates: {
            text: shellCopy.genericError,
            isStreaming: false,
            type: 'error',
          },
        });
      }
    } finally {
      dispatch({ type: 'SET_LOADING', value: false });
      abortRef.current = null;
    }
  }, [inputText, isLoading, attachments, config, agentMode, selectedOptions, language, shellCopy.genericError]);

  const showRuntimeStatus = useCallback(async () => {
    dispatch({
      type: 'ADD_MESSAGE',
      message: {
        id: `sys_status_${Date.now()}`,
        type: 'system',
        role: 'system',
        text: shellCopy.checkingStatus,
        timestamp: Date.now(),
      },
    });

    try {
      const res = await fetch('/api/app/status', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const payload = await res.json() as AppStatusPayload;
      const configured = typeof payload.keys?.configured === 'number' ? payload.keys.configured : 0;
      const total = typeof payload.keys?.total === 'number' ? payload.keys.total : 0;
      const balance = typeof payload.billing?.balance === 'number'
        ? Math.max(0, Math.round(payload.billing.balance))
        : null;

      const summary = [
        `${shellCopy.statusLabel}:`,
        `${shellCopy.keysLabel}: ${configured}/${total}`,
        `${shellCopy.balanceLabel}: ${balance === null ? shellCopy.unavailableLabel : balance}`,
      ].join('\n');

      dispatch({
        type: 'ADD_MESSAGE',
        message: {
          id: `sys_status_result_${Date.now()}`,
          type: 'system',
          role: 'system',
          text: summary,
          timestamp: Date.now(),
        },
      });
    } catch {
      dispatch({
        type: 'ADD_MESSAGE',
        message: {
          id: `sys_status_error_${Date.now()}`,
          type: 'error',
          role: 'system',
          text: shellCopy.statusError,
          timestamp: Date.now(),
        },
      });
    }
  }, [shellCopy]);

  // ─── Stop Streaming ─────────────────────────────────────────
  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ─── Toggle Voice ───────────────────────────────────────────
  const toggleRecording = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (isRecording) {
      rec.stop();
      dispatch({ type: 'SET_RECORDING', value: false });
    } else {
      rec.lang = language === 'ka' ? 'ka-GE' : language === 'ru' ? 'ru-RU' : 'en-US';
      rec.start();
      dispatch({ type: 'SET_RECORDING', value: true });
    }
  }, [isRecording, language]);

  // ─── New Session ────────────────────────────────────────────
  const newSession = useCallback(() => {
    dispatch({ type: 'CLEAR_MESSAGES' });
    dispatch({ type: 'SET_INPUT', text: '' });
    dispatch({ type: 'CLEAR_ATTACHMENTS' });
    dispatch({ type: 'CLEAR_PREVIEWS' });
  }, []);

  // ─── Toggle Agent Mode ──────────────────────────────────────
  const toggleAgentMode = useCallback(() => {
    const newMode: AgentMode = agentMode === 'chat' ? 'agent' : 'chat';
    dispatch({ type: 'SET_AGENT_MODE', mode: newMode });

    // System message announcing mode change
    const label = newMode === 'agent'
      ? (config.agentModeLabel[(language || 'en') as 'en' | 'ka' | 'ru'] || config.agentModeLabel.en)
      : shellCopy.chatMode;

    dispatch({
      type: 'ADD_MESSAGE',
      message: {
        id: `sys_${Date.now()}`,
        type: 'system',
        role: 'system',
        text: `${label} ${shellCopy.activated}`,
        timestamp: Date.now(),
      },
    });
  }, [agentMode, config, language, shellCopy.chatMode, shellCopy.activated]);

  // ─── Handle Transfer ────────────────────────────────────────
  const handleTransfer = useCallback((targetService: string) => {
    router.push(`/${activeLanguage}/services/${targetService}`);
  }, [router, activeLanguage]);

  // ─── Handle Quick Action ────────────────────────────────────
  const handleAction = useCallback((action: string) => {
    if (action === 'new-session') {
      newSession();
      return;
    }
    if (action === 'service-status') {
      void showRuntimeStatus();
      return;
    }
    if (action.startsWith('transfer-')) {
      const target = action.replace('transfer-', '');
      handleTransfer(target);
      return;
    }
    // Convert action to a chat message as user intent
    const actionLabel = config.quickActions.find((a) => a.action === action);
    if (actionLabel) {
      const lang = (language || 'en') as 'en' | 'ka' | 'ru';
      sendMessage(actionLabel.label[lang] || actionLabel.label.en);
    } else {
      sendMessage(action);
    }
  }, [newSession, config.quickActions, language, sendMessage, handleTransfer, showRuntimeStatus]);

  // ─── Handle Suggestion Click ────────────────────────────────
  const handleSuggestionClick = useCallback((text: string) => {
    dispatch({ type: 'SET_INPUT', text });
  }, []);

  return (
    <div
      className={`relative flex flex-col h-full overflow-hidden ${className}`}
      style={{
        background: 'var(--color-bg)',
      }}
    >
      {/* Subtle ambient glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse 80% 30% at 50% 0%, ${config.accentColor}04 0%, transparent 60%)` }} />

      {/* Header */}
      <ServiceChatHeader
        config={config}
        agentMode={agentMode}
        language={language}
        showHamburger={showHamburger}
        onToggleHamburger={() => dispatch({ type: 'TOGGLE_HAMBURGER' })}
        onToggleAgentMode={toggleAgentMode}
        onNewSession={newSession}
        onToggleToolPanel={() => dispatch({ type: 'TOGGLE_TOOL_PANEL' })}
      />

      {/* Tool Panel */}
      <ServiceToolPanel
        config={config}
        isOpen={showToolPanel}
        activePanel={activeToolPanel}
        language={language}
        selectedOptions={selectedOptions}
        onSetOption={(key, val) => dispatch({ type: 'SET_OPTION', key, value: val })}
        onClose={() => dispatch({ type: 'TOGGLE_TOOL_PANEL' })}
      />

      {/* Status Bar — connection/capability indicator */}
      <ServiceStatusBar
        config={config}
        language={language}
        isLoading={isLoading}
        agentMode={agentMode}
        selectedOptions={selectedOptions}
      />

      {/* Main Content Area — clean, breathable */}
      {config.slug === 'workflow' ? (
        <div className="flex-1 overflow-hidden">
          <WorkflowBuilder />
        </div>
      ) : !hasMessages ? (
        <ServiceWelcome
          config={config}
          agentMode={agentMode}
          language={language}
          onAction={handleAction}
        />
      ) : (
        <ServiceMessageList
          config={config}
          messages={messages}
          isLoading={isLoading}
          language={language}
          onSuggestionClick={handleSuggestionClick}
        />
      )}

      {/* Preview Panel */}
      <ServicePreviewPanel
        config={config}
        previews={previews}
        language={language}
        onClearPreviews={() => dispatch({ type: 'CLEAR_PREVIEWS' })}
      />

      {/* Transfer Bar */}
      <ServiceTransferBar
        config={config}
        language={language}
        onTransfer={handleTransfer}
        show={hasResults}
      />

      {/* Composer */}
      <ServiceComposer
        config={config}
        value={inputText}
        agentMode={agentMode}
        language={language}
        isLoading={isLoading}
        isRecording={isRecording}
        attachments={attachments}
        onChange={(text) => dispatch({ type: 'SET_INPUT', text })}
        onSend={() => sendMessage()}
        onStop={stopStreaming}
        onToggleRecording={toggleRecording}
        onAddAttachment={(att) => dispatch({ type: 'ADD_ATTACHMENT', attachment: att })}
        onRemoveAttachment={(id) => dispatch({ type: 'REMOVE_ATTACHMENT', id })}
      />

      {/* Hamburger Menu (overlay) */}
      <ServiceHamburgerMenu
        config={config}
        isOpen={showHamburger}
        language={language}
        onClose={() => dispatch({ type: 'CLOSE_HAMBURGER' })}
        onAction={handleAction}
      />
    </div>
  );
}

/* ─── Speech Recognition type ─── */
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};
