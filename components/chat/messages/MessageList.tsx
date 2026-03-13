'use client';

/**
 * components/chat/messages/MessageList.tsx
 * ==========================================
 * Scrollable message area. Routes each message to its
 * appropriate renderer based on discriminated type.
 */

import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ChatMessage } from '@/lib/chat/types';
import { UserBubble, AssistantBubble } from './MessageBubble';
import { ResultCardView } from './ResultCardView';
import { WorkflowCardView } from './WorkflowCardView';
import { SuggestionChips } from './SuggestionChips';
import { ClarificationCardView } from './ClarificationCardView';
import { ErrorCardView } from './ErrorCardView';
import { HandoffCardView } from './HandoffCardView';
import { AgentBadge } from '../shared/AgentBadge';

interface Props {
  messages: ChatMessage[];
  language: string;
  onSuggestionClick: (action: string) => void;
  onClarificationSelect: (value: string) => void;
  onRetry: (action: string) => void;
}

export function MessageList({ messages, language, onSuggestionClick, onClarificationSelect, onRetry }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.id]);

  return (
    <div
      className="flex-1 overflow-y-auto px-4 py-5 space-y-4 scroll-smooth"
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--color-border) transparent' }}
    >
      <AnimatePresence initial={false}>
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <MessageRenderer
              message={msg}
              onSuggestionClick={onSuggestionClick}
              onClarificationSelect={onClarificationSelect}
              onRetry={onRetry}
            />
          </motion.div>
        ))}
      </AnimatePresence>
      <div ref={endRef} />
    </div>
  );
}

// ─── Message Router ──────────────────────────────────────────────────────────

function MessageRenderer({ message, onSuggestionClick, onClarificationSelect, onRetry }: {
  message: ChatMessage;
  onSuggestionClick: (action: string) => void;
  onClarificationSelect: (value: string) => void;
  onRetry: (action: string) => void;
}) {
  switch (message.type) {
    case 'user':
      return (
        <UserBubble
          content={message.text}
          attachments={message.attachments?.map(a => ({ type: a.type, preview: a.previewUrl, name: a.fileName }))}
        />
      );

    case 'assistant':
      return (
        <AssistantBubble
          content={message.text}
          agentId={message.agentId}
          isStreaming={message.isStreaming}
        />
      );

    case 'handoff':
      return (
        <HandoffCardView
          fromAgent={message.sourceAgentId}
          toAgent={message.targetAgentId}
          taskSummary={message.taskSummary}
          status={message.handoffStatus}
        />
      );

    case 'workflow-progress':
      return <WorkflowCardView snapshot={message.snapshot} />;

    case 'result':
      return <ResultCardView card={message.result} onAction={onSuggestionClick} />;

    case 'clarification':
      return (
        <ClarificationCardView
          question={message.question}
          options={message.options}
          onSelect={onClarificationSelect}
        />
      );

    case 'suggestion':
      return <SuggestionChips chips={message.chips} onSelect={onSuggestionClick} />;

    case 'system':
      return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{
          backgroundColor: message.severity === 'warning' ? 'rgba(251,191,36,0.06)'
            : 'rgba(99,102,241,0.05)',
        }}>
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {message.severity === 'warning' ? '⚡' : message.severity === 'success' ? '✅' : 'ℹ️'} {message.text}
          </span>
        </div>
      );

    case 'error':
      return (
        <ErrorCardView
          code={message.errorCode}
          userMessage={message.userFriendlyMessage}
          recoverable={message.recoverable}
          retryAction={message.retryAction}
          alternatives={message.alternativeActions?.map(a => ({ label: a.label, action: a.action }))}
          onAction={onRetry}
        />
      );

    case 'welcome':
      return (
        <div className="flex items-center gap-2">
          <AgentBadge agentId="agent-g" size="sm" />
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {message.text || 'New conversation started'}
          </p>
        </div>
      );

    default:
      return null;
  }
}
