'use client';

/**
 * components/chat/UniversalChat.tsx
 * =================================
 * The Agent G Command Center — the main intelligent communication layer
 * of MyAvatar.ge. Renders as a floating panel on desktop, a full-screen
 * assistant on mobile, and an expanded workspace mode when docked.
 *
 * Integrates:
 * - All 23 agents via contracts
 * - All services via catalog
 * - Streaming SSE via /api/chat/stream
 * - Fallback via /api/chat
 * - Rich message types (handoff, result, workflow, clarification, suggestions)
 * - Welcome onboarding flow
 * - Agent picker
 * - Attachment support
 * - Voice input
 * - Context-aware placeholders
 */

import { useReducer, useCallback, useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import { chatReducer, initialChatState, ChatContext } from '@/lib/chat/store.legacy';
import type { ChatMessage, ChatAttachment } from '@/lib/chat/types.legacy';
import { classifyIntent } from '@/lib/agents/orchestrator';
import { getAgentContract } from '@/lib/agents/contracts';

import { ChatHeader } from './ChatHeader';
import { ChatWelcome } from './ChatWelcome';
import { ChatMessages } from './ChatMessages';
import { ChatComposer } from './ChatComposer';
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

export default function UniversalChat() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [isClient, setIsClient] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const { session, isOpen, isExpanded, isLoading, inputText, inputAttachments } = state;
  const { messages, mode, activeAgentId, delegatedAgents, language } = session;

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
      if (t) dispatch({ type: 'SET_INPUT', text: t });
    };
    rec.onend = () => dispatch({ type: 'SET_RECORDING', value: false });
    recognitionRef.current = rec;
  }, []);

  // ─── Send Message ──────────────────────────────────────────────────────

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText || inputText).trim();
    if (!text || isLoading) return;

    // Add user message
    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      type: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      attachments: inputAttachments.length > 0 ? [...inputAttachments] : undefined,
    };
    dispatch({ type: 'ADD_MESSAGE', message: userMsg });
    dispatch({ type: 'SET_INPUT', text: '' });
    dispatch({ type: 'CLEAR_ATTACHMENTS' });
    dispatch({ type: 'SET_LOADING', value: true });

    // Classify intent to detect agent routing
    const intent = classifyIntent(text);

    // If routing to a specific agent, switch and show handoff
    if (intent.type === 'single-agent' && intent.primaryAgent !== 'agent-g' && intent.primaryAgent !== activeAgentId) {
      const targetAgent = getAgentContract(intent.primaryAgent);
      if (targetAgent) {
        dispatch({ type: 'SET_ACTIVE_AGENT', agentId: intent.primaryAgent });
        dispatch({ type: 'ADD_MESSAGE', message: {
          id: `h_${Date.now()}`,
          type: 'handoff',
          content: '',
          timestamp: new Date().toISOString(),
          handoff: {
            fromAgent: 'agent-g',
            toAgent: intent.primaryAgent,
            task: text,
            status: 'delegated',
          },
        }});
      }
    }

    // If multi-agent or pipeline, show handoff to multiple agents
    if (intent.type === 'multi-agent' || intent.type === 'pipeline') {
      for (const agentId of intent.supportingAgents.slice(0, 3)) {
        dispatch({ type: 'ADD_DELEGATED_AGENT', agentId });
      }
    }

    // Determine which agent to send to
    const targetAgentId = intent.type !== 'conversational' ? intent.primaryAgent : activeAgentId;

    // Create streaming placeholder
    const assistantId = `a_${Date.now()}`;
    const streamMsg: ChatMessage = {
      id: assistantId,
      type: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      agentId: targetAgentId,
      agentName: getAgentContract(targetAgentId)?.name,
      agentIcon: getAgentContract(targetAgentId)?.icon,
      isStreaming: true,
    };
    dispatch({ type: 'ADD_MESSAGE', message: streamMsg });
    dispatch({ type: 'SET_STREAMING_ID', id: assistantId });

    // Prepare history
    const history = messages.slice(-20).map(m => ({
      role: m.type === 'user' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Stream from /api/chat/stream
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
              dispatch({ type: 'APPEND_STREAM', id: assistantId, token: data.token });
            }
            if (data.done) model = data.model || '';
            if (data.error) {
              const errorText = String(data.error);
              if (/throttled|rate.limit|quota/i.test(errorText)) {
                dispatch({ type: 'SET_RATE_LIMIT', notice: 'Rate limited. Please retry shortly.' });
              }
              throw new Error(errorText);
            }
          } catch { /* skip parse errors for individual lines */ }
        }
      }

      // Finish stream
      dispatch({ type: 'FINISH_STREAM', id: assistantId, model });
      dispatch({ type: 'SET_RATE_LIMIT', notice: null });

      // Add follow-up suggestions after substantive responses
      if (fullText.length > 100) {
        const agent = getAgentContract(targetAgentId);
        const suggestions = buildFollowUpSuggestions(targetAgentId, agent?.canHandoffTo || []);
        if (suggestions.length > 0) {
          dispatch({ type: 'ADD_SUGGESTIONS', suggestions });
        }
      }

      // Clear delegated agents
      for (const id of delegatedAgents) {
        dispatch({ type: 'REMOVE_DELEGATED_AGENT', agentId: id });
      }

    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        dispatch({ type: 'UPDATE_MESSAGE', id: assistantId, updates: {
          content: state.session.messages.find(m => m.id === assistantId)?.content || '[Stopped]',
          isStreaming: false,
        }});
      } else {
        // Fallback to non-streaming /api/chat
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
          const responseText = d?.data?.response || d?.response || 'Sorry, I encountered an error. Please try again.';
          dispatch({ type: 'UPDATE_MESSAGE', id: assistantId, updates: {
            content: responseText,
            model: d?.data?.model || '',
            isStreaming: false,
          }});
        } catch {
          dispatch({ type: 'UPDATE_MESSAGE', id: assistantId, updates: {
            content: '',
            isStreaming: false,
          }});
          dispatch({ type: 'ADD_MESSAGE', message: {
            id: `err_${Date.now()}`,
            type: 'error',
            content: 'Connection error. Please check your network and try again.',
            timestamp: new Date().toISOString(),
            error: {
              message: 'Connection error. Please check your network and try again.',
              retryAction: text,
              fallbackActions: [
                { label: 'Show All Tools', action: 'Show all available AI tools' },
              ],
            },
          }});
        }
      }
      dispatch({ type: 'SET_LOADING', value: false });
      dispatch({ type: 'SET_STREAMING_ID', id: null });
    }

    abortRef.current = null;
  }, [inputText, inputAttachments, isLoading, activeAgentId, messages, delegatedAgents, state.session.messages]);

  // ─── Stop Generation ───────────────────────────────────────────────────

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: 'SET_LOADING', value: false });
  }, []);

  // ─── Voice Toggle ──────────────────────────────────────────────────────

  const toggleRecording = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (state.isRecording) {
      rec.stop();
    } else {
      rec.lang = language === 'ka' ? 'ka-GE' : language === 'ru' ? 'ru-RU' : 'en-US';
      rec.start();
      dispatch({ type: 'SET_RECORDING', value: true });
    }
  }, [state.isRecording, language]);

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
    dispatch({ type: 'SET_ACTIVE_AGENT', agentId });
    sendMessage(action);
  }, [sendMessage]);

  const handleWelcomeAction = useCallback((action: string) => {
    sendMessage(action);
  }, [sendMessage]);

  // ─── Render ────────────────────────────────────────────────────────────

  if (!isClient) return null;

  const hasMessages = messages.length > 0;

  // Panel sizing
  const panelClasses = isExpanded
    ? 'fixed inset-4 sm:inset-6 z-50 rounded-3xl'
    : 'fixed bottom-20 right-3 sm:right-5 z-50 w-[calc(100vw-24px)] sm:w-[440px] h-[75vh] max-h-[700px] rounded-3xl';

  return (
    <ChatContext.Provider value={{ state, dispatch }}>
      {/* ─── Toggle Button ──────────────────────────────────────────── */}
      <button
        onClick={() => dispatch({ type: 'TOGGLE_OPEN' })}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 group"
        style={{
          background: isOpen
            ? 'rgba(239,68,68,0.85)'
            : 'linear-gradient(135deg, var(--color-accent), #0891b2)',
          color: '#fff',
          boxShadow: isOpen
            ? '0 4px 20px rgba(239,68,68,0.3)'
            : '0 4px 24px var(--color-accent-soft), 0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        {isOpen ? (
          <span className="text-xl font-bold">×</span>
        ) : (
          <>
            <MessageCircle className="w-6 h-6 transition-transform group-hover:scale-110" />
            {/* Pulse ring */}
            <span className="absolute inset-0 rounded-2xl animate-ping opacity-20"
              style={{ backgroundColor: 'var(--color-accent)' }} />
          </>
        )}
      </button>

      {/* ─── Chat Panel ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
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
            <ChatHeader
              activeAgentId={activeAgentId}
              delegatedAgents={delegatedAgents}
              mode={mode}
              projectName={session.project?.name}
              language={language}
              isExpanded={isExpanded}
              onToggleExpanded={() => dispatch({ type: 'TOGGLE_EXPANDED' })}
              onClose={() => dispatch({ type: 'SET_OPEN', open: false })}
              onNewSession={() => dispatch({ type: 'NEW_SESSION' })}
              onToggleAgentPicker={() => dispatch({ type: 'TOGGLE_AGENT_PICKER' })}
              showAgentPicker={state.showAgentPicker}
            />

            {/* Agent Picker */}
            <AnimatePresence>
              {state.showAgentPicker && (
                <ChatAgentPicker
                  activeAgentId={activeAgentId}
                  language={language}
                  onSelect={(id) => dispatch({ type: 'SET_ACTIVE_AGENT', agentId: id })}
                  onClose={() => dispatch({ type: 'TOGGLE_AGENT_PICKER' })}
                />
              )}
            </AnimatePresence>

            {/* Rate limit notice */}
            {state.rateLimitNotice && (
              <div className="mx-4 mt-2 px-3 py-2 rounded-xl text-xs flex items-center justify-between"
                style={{ backgroundColor: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
                <span>{state.rateLimitNotice}</span>
                <button onClick={() => dispatch({ type: 'SET_RATE_LIMIT', notice: null })}
                  className="text-[10px] opacity-70 hover:opacity-100">Dismiss</button>
              </div>
            )}

            {/* Content: Welcome or Messages */}
            {!hasMessages ? (
              <ChatWelcome
                language={language}
                onAction={handleWelcomeAction}
                onServiceSelect={handleServiceSelect}
              />
            ) : (
              <ChatMessages
                messages={messages}
                language={language}
                onSuggestionClick={handleSuggestionClick}
                onClarificationSelect={handleClarificationSelect}
                onRetry={handleRetry}
              />
            )}

            {/* Composer */}
            <ChatComposer
              value={inputText}
              onChange={(t) => dispatch({ type: 'SET_INPUT', text: t })}
              onSend={() => sendMessage()}
              onStop={stopGeneration}
              onAttach={(att) => dispatch({ type: 'ADD_ATTACHMENT', attachment: att })}
              onRemoveAttachment={(id) => dispatch({ type: 'REMOVE_ATTACHMENT', id })}
              attachments={inputAttachments}
              mode={mode}
              language={language}
              isLoading={isLoading}
              isRecording={state.isRecording}
              onToggleRecording={toggleRecording}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </ChatContext.Provider>
  );
}

// ─── Follow-up suggestion builder ────────────────────────────────────────────

function buildFollowUpSuggestions(agentId: string, handoffTargets: string[]) {
  const suggestions: { label: string; action: string; icon?: string; variant?: 'primary' | 'secondary' }[] = [];

  suggestions.push({ label: 'Continue', action: 'Continue with the next step', variant: 'primary' });

  // Add handoff suggestions based on the agent's capabilities
  const targetLabels: Record<string, { label: string; icon: string; action: string }> = {
    'video-agent': { label: 'Add Video', icon: '🎬', action: 'Create a video from this result' },
    'music-agent': { label: 'Add Music', icon: '🎵', action: 'Add music to this' },
    'subtitle-agent': { label: 'Add Captions', icon: '💬', action: 'Add captions/subtitles' },
    'image-agent': { label: 'Create Image', icon: '🖼️', action: 'Generate an image from this' },
    'thumbnail-agent': { label: 'Make Thumbnail', icon: '📐', action: 'Create a thumbnail' },
    'seo-agent': { label: 'SEO Optimize', icon: '🔍', action: 'Optimize for SEO' },
    'store-agent': { label: 'Add to Store', icon: '🏪', action: 'Add this to my store' },
    'reels-agent': { label: 'Make Reels', icon: '📱', action: 'Create social media reels' },
  };

  for (const targetId of handoffTargets.slice(0, 3)) {
    const info = targetLabels[targetId];
    if (info) {
      suggestions.push({ ...info, variant: 'secondary' });
    }
  }

  suggestions.push({ label: 'Export', action: 'Export the final result', icon: '📤', variant: 'secondary' });

  return suggestions;
}
