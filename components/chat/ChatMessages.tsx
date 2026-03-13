'use client';

/**
 * components/chat/ChatMessages.tsx
 * ================================
 * Renders the full conversation stream with rich message types:
 * user messages, agent responses, handoff cards, result cards,
 * workflow cards, clarification prompts, suggestions, errors.
 */

import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, CheckCircle2, XCircle, Loader2, AlertTriangle,
  Copy, Check, RefreshCw, Sparkles,
} from 'lucide-react';
import type {
  ChatMessage, SuggestionChip, WorkflowStep, HandoffInfo,
  ResultCard, ErrorInfo, ClarificationOption,
} from '@/lib/chat/types';
import { getAgentContract } from '@/lib/agents/contracts';
import { getChatLabels } from '@/lib/chat/constants';

interface Props {
  messages: ChatMessage[];
  language: string;
  onSuggestionClick: (action: string) => void;
  onClarificationSelect: (value: string) => void;
  onRetry?: (action: string) => void;
}

export function ChatMessages({
  messages, language, onSuggestionClick, onClarificationSelect, onRetry,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const labels = getChatLabels(language);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.content]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 scroll-smooth"
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--color-border) transparent' }}>
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
              language={language}
              labels={labels}
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

// ─── Message Renderer ────────────────────────────────────────────────────────

function MessageRenderer({
  message: msg,
  language,
  labels,
  onSuggestionClick,
  onClarificationSelect,
  onRetry,
}: {
  message: ChatMessage;
  language: string;
  labels: ReturnType<typeof getChatLabels>;
  onSuggestionClick: (action: string) => void;
  onClarificationSelect: (value: string) => void;
  onRetry?: (action: string) => void;
}) {
  switch (msg.type) {
    case 'user':
      return <UserBubble msg={msg} />;
    case 'assistant':
      return <AssistantBubble msg={msg} />;
    case 'handoff':
      return msg.handoff ? <HandoffCard info={msg.handoff} labels={labels} /> : null;
    case 'result':
      return msg.result ? <ResultCardView card={msg.result} labels={labels} onAction={onSuggestionClick} /> : null;
    case 'workflow-status':
      return msg.workflow ? <WorkflowCard steps={msg.workflow.steps} current={msg.workflow.currentStep} labels={labels} /> : null;
    case 'clarification':
      return msg.clarification ? <ClarificationCard question={msg.clarification.question} options={msg.clarification.options} onSelect={onClarificationSelect} /> : null;
    case 'suggestion':
      return msg.suggestions ? <SuggestionChips chips={msg.suggestions} onClick={onSuggestionClick} labels={labels} /> : null;
    case 'error':
      return <ErrorCard info={msg.error} content={msg.content} onRetry={onRetry} labels={labels} />;
    case 'system':
      return <SystemMessage content={msg.content} />;
    default:
      return <AssistantBubble msg={msg} />;
  }
}

// ─── User Bubble ─────────────────────────────────────────────────────────────

function UserBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-br-md text-sm leading-relaxed"
        style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}>
        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.attachments.map(a => (
              <span key={a.id} className="text-[11px] px-2 py-0.5 rounded-full bg-white/20">
                {a.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Assistant Bubble ────────────────────────────────────────────────────────

function AssistantBubble({ msg }: { msg: ChatMessage }) {
  const agent = msg.agentId ? getAgentContract(msg.agentId) : null;
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content).catch(() => { /* noop */ });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex gap-3 group">
      {/* Agent avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-sm"
        style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
        {agent?.icon || '◈'}
      </div>
      <div className="flex-1 min-w-0">
        {/* Agent name */}
        {agent && (
          <span className="text-[11px] font-medium mb-1 block"
            style={{ color: 'var(--color-accent)' }}>
            {agent.name}
          </span>
        )}
        {/* Content */}
        <div className="px-4 py-3 rounded-2xl rounded-tl-md text-sm leading-relaxed"
          style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
          <div className="whitespace-pre-wrap break-words">
            {msg.content || (msg.isStreaming ? '' : '')}
          </div>
          {msg.isStreaming && (
            <span className="inline-block w-1.5 h-4 rounded-sm animate-pulse ml-0.5"
              style={{ backgroundColor: 'var(--color-accent)' }} />
          )}
        </div>
        {/* Meta + copy */}
        <div className="flex items-center gap-2 mt-1 h-5">
          {msg.model && !msg.isStreaming && (
            <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {msg.model}
            </span>
          )}
          {!msg.isStreaming && msg.content && (
            <button onClick={handleCopy}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
              title="Copy">
              {copied
                ? <Check className="w-3 h-3 text-emerald-400" />
                : <Copy className="w-3 h-3" style={{ color: 'var(--color-text-tertiary)' }} />
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Handoff Card ────────────────────────────────────────────────────────────

function HandoffCard({ info, labels }: { info: HandoffInfo; labels: ReturnType<typeof getChatLabels> }) {
  const toAgent = getAgentContract(info.toAgent);
  const statusColor = info.status === 'completed' ? 'text-emerald-400'
    : info.status === 'failed' ? 'text-red-400'
    : 'text-blue-400';
  const StatusIcon = info.status === 'completed' ? CheckCircle2
    : info.status === 'failed' ? XCircle
    : info.status === 'in-progress' ? Loader2
    : ArrowRight;

  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <ArrowRight className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
      </div>
      <div className="flex-1 rounded-2xl px-4 py-3"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2 text-xs">
          <StatusIcon className={`w-3.5 h-3.5 ${statusColor} ${info.status === 'in-progress' ? 'animate-spin' : ''}`} />
          <span style={{ color: 'var(--color-text-secondary)' }}>
            {labels.delegatedTo}
          </span>
          <span className="font-medium" style={{ color: 'var(--color-text)' }}>
            {toAgent?.icon} {toAgent?.name || info.toAgent}
          </span>
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
          {info.task}
        </p>
      </div>
    </div>
  );
}

// ─── Result Card ─────────────────────────────────────────────────────────────

function ResultCardView({ card, labels, onAction }: {
  card: ResultCard;
  labels: ReturnType<typeof getChatLabels>;
  onAction: (action: string) => void;
}) {
  const agent = getAgentContract(card.agentId);

  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
        {agent?.icon || '✦'}
      </div>
      <div className="flex-1 rounded-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h4 className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {card.title}
            </h4>
            <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {labels.handledBy} {agent?.name || card.agentId}
            </span>
          </div>
          {card.qaScore != null && (
            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: card.qaScore >= 85 ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)',
                color: card.qaScore >= 85 ? '#34d399' : '#fbbf24',
              }}>
              QA {card.qaScore}%
            </span>
          )}
        </div>
        {/* Assets */}
        {card.assets.length > 0 && (
          <div className="px-4 py-3 grid gap-2" style={{ gridTemplateColumns: card.assets.length === 1 ? '1fr' : 'repeat(2, 1fr)' }}>
            {card.assets.map((asset, i) => (
              <div key={i} className="rounded-xl overflow-hidden"
                style={{ backgroundColor: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                {(asset.type === 'image' && (asset.url || asset.preview)) ? (
                  <img src={asset.url || asset.preview} alt={asset.label}
                    className="w-full h-32 object-cover" />
                ) : (
                  <div className="h-20 flex items-center justify-center">
                    <span className="text-2xl opacity-40">
                      {asset.type === 'video' ? '🎬' : asset.type === 'audio' ? '🎵' : asset.type === 'text' ? '📝' : '📄'}
                    </span>
                  </div>
                )}
                <div className="px-3 py-2">
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {asset.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Actions */}
        {card.actions.length > 0 && (
          <div className="px-4 py-3 flex flex-wrap gap-2"
            style={{ borderTop: '1px solid var(--color-border)' }}>
            {card.actions.map((a, i) => (
              <button key={i} onClick={() => onAction(a.action)}
                className="text-xs px-3 py-1.5 rounded-xl font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={a.variant === 'primary'
                  ? { backgroundColor: 'var(--color-accent)', color: '#fff' }
                  : { backgroundColor: 'var(--color-elevated)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }
                }>
                {a.icon && <span className="mr-1">{a.icon}</span>}
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Workflow Card ───────────────────────────────────────────────────────────

function WorkflowCard({ steps, current, labels }: {
  steps: WorkflowStep[];
  current: number;
  labels: ReturnType<typeof getChatLabels>;
}) {
  const completed = steps.filter(s => s.status === 'completed').length;
  const pct = steps.length > 0 ? Math.round((completed / steps.length) * 100) : 0;

  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="flex-1 rounded-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
              {labels.workflowProgress}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {completed} {labels.stepOf} {steps.length}
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 rounded-full overflow-hidden mb-3"
            style={{ backgroundColor: 'var(--color-elevated)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: 'var(--color-accent)' }} />
          </div>
          {/* Steps */}
          <div className="space-y-2">
            {steps.map((step) => {
              const agent = getAgentContract(step.agentId);
              const isActive = step.index === current;
              return (
                <div key={step.index}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all ${isActive ? 'ring-1 ring-[var(--color-accent)]' : ''}`}
                  style={{
                    backgroundColor: isActive ? 'var(--color-accent-soft)' : 'transparent',
                  }}>
                  {step.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
                  {step.status === 'running' && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />}
                  {step.status === 'failed' && <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                  {step.status === 'pending' && (
                    <div className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                      style={{ border: '1.5px solid var(--color-border)' }} />
                  )}
                  {step.status === 'skipped' && (
                    <div className="w-3.5 h-3.5 rounded-full flex-shrink-0 opacity-40"
                      style={{ backgroundColor: 'var(--color-border)' }} />
                  )}
                  <span className="flex-1" style={{ color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)' }}>
                    {agent?.icon} {step.label}
                  </span>
                  {step.durationMs != null && (
                    <span style={{ color: 'var(--color-text-tertiary)' }}>
                      {(step.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Clarification Card ──────────────────────────────────────────────────────

function ClarificationCard({ question, options, onSelect }: {
  question: string;
  options: ClarificationOption[];
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <span className="text-sm">❓</span>
      </div>
      <div className="flex-1 rounded-2xl px-4 py-3"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <p className="text-sm mb-3" style={{ color: 'var(--color-text)' }}>{question}</p>
        <div className="flex flex-wrap gap-2">
          {options.map((opt, i) => (
            <button key={i} onClick={() => onSelect(opt.value)}
              className="text-xs px-3 py-2 rounded-xl font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ backgroundColor: 'var(--color-elevated)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
              {opt.icon && <span className="mr-1">{opt.icon}</span>}
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Suggestion Chips ────────────────────────────────────────────────────────

function SuggestionChips({ chips, onClick, labels }: {
  chips: SuggestionChip[];
  onClick: (action: string) => void;
  labels: ReturnType<typeof getChatLabels>;
}) {
  return (
    <div className="pl-11">
      <span className="text-[11px] font-medium block mb-2"
        style={{ color: 'var(--color-text-tertiary)' }}>
        {labels.nextSteps}
      </span>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip, i) => (
          <button key={i} onClick={() => onClick(chip.action)}
            className="text-xs px-3 py-1.5 rounded-xl font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={chip.variant === 'primary'
              ? { backgroundColor: 'var(--color-accent)', color: '#fff' }
              : { backgroundColor: 'var(--color-elevated)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }
            }>
            {chip.icon && <span className="mr-1">{chip.icon}</span>}
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Error Card ──────────────────────────────────────────────────────────────

function ErrorCard({ info, content, onRetry, labels }: {
  info?: ErrorInfo;
  content: string;
  onRetry?: (action: string) => void;
  labels: ReturnType<typeof getChatLabels>;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center bg-red-500/10">
        <AlertTriangle className="w-4 h-4 text-red-400" />
      </div>
      <div className="flex-1 rounded-2xl px-4 py-3"
        style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
        <p className="text-sm text-red-300">{info?.message || content}</p>
        {(info?.retryAction || (info?.fallbackActions && info.fallbackActions.length > 0)) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {info?.retryAction && onRetry && (
              <button onClick={() => onRetry(info.retryAction!)}
                className="text-xs px-3 py-1.5 rounded-xl font-medium bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> {labels.retry}
              </button>
            )}
            {info?.fallbackActions?.map((fb, i) => (
              <button key={i} onClick={() => onRetry?.(fb.action)}
                className="text-xs px-3 py-1.5 rounded-xl font-medium transition-colors"
                style={{ backgroundColor: 'var(--color-elevated)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                {fb.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── System Message ──────────────────────────────────────────────────────────

function SystemMessage({ content }: { content: string }) {
  return (
    <div className="text-center py-2">
      <span className="text-[11px] px-3 py-1 rounded-full"
        style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }}>
        {content}
      </span>
    </div>
  );
}

// Need React for useState in AssistantBubble
import React from 'react';
