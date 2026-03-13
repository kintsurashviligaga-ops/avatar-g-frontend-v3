'use client';

/**
 * components/chat/ChatShell.tsx
 * ================================
 * Root chat container — replaces the old UniversalChat component.
 * Provides all stores, orchestrates message flow, renders the
 * full component tree (header → messages → composer).
 *
 * Panel modes: floating (default), expanded, mobile-sheet.
 */

import { useReducer, useCallback, useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle } from 'lucide-react';

// State stores
import {
  ChatContext, chatReducer, initialChatState,
} from '@/lib/chat/state/chatStore';
import {
  ConversationContext, conversationReducer, initialConversationState,
} from '@/lib/chat/state/conversationStore';

// Types
import type { ChatAttachment, ChatMessage } from '@/lib/chat/types';

// Logic & orchestration
import { classifyIntent } from '@/lib/agents/orchestrator';
import { getAgentContract } from '@/lib/agents/contracts';
import { createUserMessage, createAssistantMessage, createHandoffMessage, createErrorMessage } from '@/lib/chat/logic/messageFactory';
import { buildFollowUpFromMessage } from '@/lib/chat/logic/suggestionEngine';

// Subcomponents
import { ChatHeaderBar } from './shell/ChatHeaderBar';
import { AgentControlStrip } from './shell/AgentControlStrip';
import { ProjectContextBar } from './shell/ProjectContextBar';
import { MessageList } from './messages/MessageList';
import { WelcomePanel } from './panels/WelcomePanel';
import { InputComposer } from './input/InputComposer';
import { ChatAgentPicker } from './ChatAgentPicker';

// ─── Speech Recognition type ────────────────────────────────────────────────

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function ChatShell() {
  // ─── State ─────────────────────────────────────────────────────────────
  const [chatState, chatDispatch] = useReducer(chatReducer, initialChatState);
  const [convState, convDispatch] = useReducer(conversationReducer, initialConversationState);
  const [isClient, setIsClient] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const { panel, session, composer, isLoading } = chatState;
  const { messages } = convState;
  const { mode, activeAgentId, delegatedAgents, language } = session;

  useEffect(() => { setIsClient(true); }, []);

  // Init speech recognition
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const t = e.results[0]?.[0]?.transcript;
      if (t) chatDispatch({ type: 'SET_INPUT', text: t });
    };
    rec.onend = () => chatDispatch({ type: 'SET_RECORDING', value: false });
    recognitionRef.current = rec;
  }, []);

  // ─── Send Message ──────────────────────────────────────────────────────

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText || composer.text).trim();
    if (!text || isLoading) return;

    // Add user message
    const userMsg = createUserMessage(text, composer.attachments, language);
    convDispatch({ type: 'ADD_MESSAGE', message: userMsg });
    chatDispatch({ type: 'SET_INPUT', text: '' });
    chatDispatch({ type: 'CLEAR_ATTACHMENTS' });
    chatDispatch({ type: 'SET_LOADING', value: true });

    // Classify intent
    const intent = classifyIntent(text);

    // Route to specific agent if needed
    if (intent.type === 'single-agent' && intent.primaryAgent !== 'agent-g' && intent.primaryAgent !== activeAgentId) {
      const targetAgent = getAgentContract(intent.primaryAgent);
      if (targetAgent) {
        chatDispatch({ type: 'SET_ACTIVE_AGENT', agentId: intent.primaryAgent });
        const handoffMsg = createHandoffMessage('agent-g', intent.primaryAgent, text, language);
        convDispatch({ type: 'ADD_MESSAGE', message: handoffMsg });
      }
    }

    // Multi-agent delegation
    if (intent.type === 'multi-agent' || intent.type === 'pipeline') {
      for (const agentId of intent.supportingAgents.slice(0, 3)) {
        chatDispatch({ type: 'ADD_DELEGATED_AGENT', agentId });
      }
    }

    const targetAgentId = intent.type !== 'conversational' ? intent.primaryAgent : activeAgentId;

    // Create streaming assistant message  
    const assistantMsg = createAssistantMessage(targetAgentId, language);
    convDispatch({ type: 'ADD_MESSAGE', message: assistantMsg });
    chatDispatch({ type: 'SET_STREAMING_ID', id: assistantMsg.id });

    // Build history
    const history = messages.slice(-20).map(m => ({
      role: (m.type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.type === 'user' ? m.text : (m.type === 'assistant' ? m.text : ''),
    }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: targetAgentId,
          messages: [...history, { role: 'user', content: text }],
          channel: 'web',
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error('Stream unavailable');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let model = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value, { stream: true })
          .split('\n')
          .filter(l => l.startsWith('data: '));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.token) {
              fullText += data.token;
              convDispatch({ type: 'APPEND_STREAM', id: assistantMsg.id, token: data.token });
            }
            if (data.done) model = data.model || '';
            if (data.error) {
              const errorText = String(data.error);
              if (/throttled|rate.limit|quota/i.test(errorText)) {
                chatDispatch({ type: 'SET_RATE_LIMIT', notice: 'Rate limited. Please retry shortly.' });
              }
              throw new Error(errorText);
            }
          } catch { /* skip parse errors for individual SSE lines */ }
        }
      }

      // Finish stream
      convDispatch({ type: 'FINISH_STREAM', id: assistantMsg.id, model });
      chatDispatch({ type: 'SET_LOADING', value: false });
      chatDispatch({ type: 'SET_STREAMING_ID', id: null });
      chatDispatch({ type: 'SET_RATE_LIMIT', notice: null });

      // Clear delegated agents
      for (const id of delegatedAgents) {
        chatDispatch({ type: 'REMOVE_DELEGATED_AGENT', agentId: id });
      }

    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        convDispatch({ type: 'FINISH_STREAM', id: assistantMsg.id });
      } else {
        // Fallback to non-streaming
        try {
          const fb = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: text,
              agentId: targetAgentId,
              history,
              channel: 'web',
            }),
          });
          const d = await fb.json();
          const responseText = d?.data?.response || d?.response || 'Sorry, I encountered an error.';
          convDispatch({
            type: 'UPDATE_MESSAGE',
            id: assistantMsg.id,
            updates: { text: responseText, isStreaming: false, model: d?.data?.model || '' },
          });
        } catch {
          convDispatch({ type: 'REMOVE_MESSAGE', id: assistantMsg.id });
          const errMsg = createErrorMessage(
            'network_error',
            'Connection error. Please check your network and try again.',
            language,
            { retryAction: text },
          );
          convDispatch({ type: 'ADD_MESSAGE', message: errMsg });
        }
      }
      chatDispatch({ type: 'SET_LOADING', value: false });
      chatDispatch({ type: 'SET_STREAMING_ID', id: null });
    }

    abortRef.current = null;
  }, [composer.text, composer.attachments, isLoading, activeAgentId, messages, delegatedAgents, language]);

  // ─── Stop Generation ───────────────────────────────────────────────────

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    chatDispatch({ type: 'SET_LOADING', value: false });
  }, []);

  // ─── Voice Toggle ──────────────────────────────────────────────────────

  const toggleRecording = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (composer.isRecording) {
      rec.stop();
    } else {
      rec.lang = language === 'ka' ? 'ka-GE' : language === 'ru' ? 'ru-RU' : 'en-US';
      rec.start();
      chatDispatch({ type: 'SET_RECORDING', value: true });
    }
  }, [composer.isRecording, language]);

  // ─── Handlers ──────────────────────────────────────────────────────────

  const handleSuggestionClick = useCallback((action: string) => {
    sendMessage(action);
  }, [sendMessage]);

  const handleClarificationSelect = useCallback((value: string) => {
    sendMessage(value);
  }, [sendMessage]);

  const handleRetry = useCallback((action: string) => {
    sendMessage(action);
  }, [sendMessage]);

  const handleServiceSelect = useCallback((agentId: string, action: string) => {
    chatDispatch({ type: 'SET_ACTIVE_AGENT', agentId });
    sendMessage(action);
  }, [sendMessage]);

  const handleNewSession = useCallback(() => {
    chatDispatch({ type: 'NEW_SESSION' });
    convDispatch({ type: 'CLEAR_MESSAGES' });
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────

  if (!isClient) return null;

  const hasMessages = messages.length > 0;
  const isExpanded = panel.layout === 'expanded';

  const panelClasses = isExpanded
    ? 'fixed inset-4 sm:inset-6 z-50 rounded-3xl'
    : 'fixed bottom-20 right-3 sm:right-5 z-50 w-[calc(100vw-24px)] sm:w-[440px] h-[75vh] max-h-[700px] rounded-3xl';

  return (
    <ChatContext.Provider value={{ state: chatState, dispatch: chatDispatch }}>
      <ConversationContext.Provider value={{ state: convState, dispatch: convDispatch }}>
        {/* ─── Toggle Button ────────────────────────────────────────── */}
        <button
          onClick={() => chatDispatch({ type: 'TOGGLE_OPEN' })}
          className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 group"
          style={{
            background: panel.isOpen
              ? 'rgba(239,68,68,0.85)'
              : 'linear-gradient(135deg, var(--color-accent), #8b5cf6)',
            color: '#fff',
            boxShadow: panel.isOpen
              ? '0 4px 20px rgba(239,68,68,0.3)'
              : '0 4px 24px var(--color-accent-soft), 0 8px 32px rgba(0,0,0,0.2)',
          }}
        >
          {panel.isOpen ? (
            <span className="text-xl font-bold">×</span>
          ) : (
            <>
              <MessageCircle className="w-6 h-6 transition-transform group-hover:scale-110" />
              <span className="absolute inset-0 rounded-2xl animate-ping opacity-20"
                style={{ backgroundColor: 'var(--color-accent)' }} />
            </>
          )}
        </button>

        {/* ─── Chat Panel ───────────────────────────────────────────── */}
        <AnimatePresence>
          {panel.isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              className={`${panelClasses} flex flex-col overflow-hidden backdrop-blur-2xl`}
              style={{
                backgroundColor: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                boxShadow: '0 24px 64px rgba(0,0,0,0.35), 0 0 1px rgba(255,255,255,0.1) inset',
              }}
            >
              {/* Header */}
              <ChatHeaderBar
                activeAgentId={activeAgentId}
                delegatedAgents={delegatedAgents}
                mode={mode}
                projectName={session.projectId ? 'Active Project' : undefined}
                language={language}
                isExpanded={isExpanded}
                onToggleExpanded={() =>
                  chatDispatch({ type: 'SET_LAYOUT', layout: isExpanded ? 'floating' : 'expanded' })
                }
                onClose={() => chatDispatch({ type: 'SET_OPEN', open: false })}
                onNewSession={handleNewSession}
                onToggleAgentPicker={() => chatDispatch({ type: 'TOGGLE_AGENT_PICKER' })}
              />

              {/* Agent Control Strip */}
              <AnimatePresence>
                {delegatedAgents.length > 0 && (
                  <AgentControlStrip
                    activeAgentId={activeAgentId}
                    delegatedAgents={delegatedAgents}
                    onSelectAgent={(id) => chatDispatch({ type: 'SET_ACTIVE_AGENT', agentId: id })}
                  />
                )}
              </AnimatePresence>

              {/* Agent Picker */}
              <AnimatePresence>
                {panel.showAgentPicker && (
                  <ChatAgentPicker
                    activeAgentId={activeAgentId}
                    language={language}
                    onSelect={(id) => chatDispatch({ type: 'SET_ACTIVE_AGENT', agentId: id })}
                    onClose={() => chatDispatch({ type: 'TOGGLE_AGENT_PICKER' })}
                  />
                )}
              </AnimatePresence>

              {/* Rate limit notice */}
              {chatState.rateLimitNotice && (
                <div className="mx-4 mt-2 px-3 py-2 rounded-xl text-xs flex items-center justify-between"
                  style={{ backgroundColor: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
                  <span>{chatState.rateLimitNotice}</span>
                  <button onClick={() => chatDispatch({ type: 'SET_RATE_LIMIT', notice: null })}
                    className="text-[10px] opacity-70 hover:opacity-100">Dismiss</button>
                </div>
              )}

              {/* Content */}
              {!hasMessages ? (
                <WelcomePanel
                  language={language}
                  hasProject={!!session.projectId}
                  onAction={handleSuggestionClick}
                  onServiceSelect={handleServiceSelect}
                />
              ) : (
                <MessageList
                  messages={messages}
                  language={language}
                  onSuggestionClick={handleSuggestionClick}
                  onClarificationSelect={handleClarificationSelect}
                  onRetry={handleRetry}
                />
              )}

              {/* Composer */}
              <InputComposer
                value={composer.text}
                onChange={(t) => chatDispatch({ type: 'SET_INPUT', text: t })}
                onSend={() => sendMessage()}
                onStop={stopGeneration}
                attachments={composer.attachments}
                onAddAttachment={(att) => chatDispatch({ type: 'ADD_ATTACHMENT', attachment: att })}
                onRemoveAttachment={(id) => chatDispatch({ type: 'REMOVE_ATTACHMENT', id })}
                mode={mode}
                language={language}
                isLoading={isLoading}
                isRecording={composer.isRecording}
                onToggleRecording={toggleRecording}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </ConversationContext.Provider>
    </ChatContext.Provider>
  );
}
