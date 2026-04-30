'use client';

/**
 * components/service-chat/ServiceMessageList.tsx
 * =================================================
 * Displays the message thread for a service chatbot.
 * Reuses the premium design language from Agent G chat.
 * Supports: user/assistant bubbles, streaming, previews,
 * suggestions, and agent mode indicators.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { Copy, Check, Loader2 } from 'lucide-react';
import type { ServiceChatConfig, ServiceChatMessage } from './types';

interface Props {
  config: ServiceChatConfig;
  messages: ServiceChatMessage[];
  isLoading: boolean;
  language: string;
  onSuggestionClick?: (text: string) => void;
}

function getUiCopy(language: string) {
  const lang = language === 'ka' || language === 'ru' ? language : 'en';
  if (lang === 'ka') {
    return {
      thinking: 'ფიქრობს...',
      generating: 'გენერირდება...',
    };
  }
  if (lang === 'ru') {
    return {
      thinking: 'думает...',
      generating: 'генерация...',
    };
  }
  return {
    thinking: 'is thinking...',
    generating: 'Generating...',
  };
}

export function ServiceMessageList({ config, messages, isLoading, language, onSuggestionClick }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const copy = getUiCopy(language);

  // Auto-scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (messages.length === 0) return null;

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map((msg, _idx) => (
        <motion.div
          key={msg.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {msg.role === 'user' ? (
            <UserBubble message={msg} accentColor={config.accentColor} />
          ) : msg.role === 'system' ? (
            <SystemBubble message={msg} />
          ) : (
            <AssistantBubble
              message={msg}
              config={config}
              language={language}
              onSuggestionClick={onSuggestionClick}
            />
          )}
        </motion.div>
      ))}

      {/* Loading indicator */}
      {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
        <div className="flex gap-2.5 items-start">
          <ServiceAgentAvatar config={config} />
          <div className="chat-bubble-agent">
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: config.accentColor }} />
              <span className="text-[12px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {config.name[(language || 'en') as 'en' | 'ka' | 'ru'] || config.name.en} {copy.thinking}
              </span>
            </div>
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────── */

function ServiceAgentAvatar({ config }: { config: ServiceChatConfig }) {
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm"
      style={{
        background: `${config.accentColor}18`,
        border: `1px solid ${config.accentColor}30`,
        boxShadow: `0 0 12px ${config.accentGlow}`,
      }}
    >
      {config.icon}
    </div>
  );
}

function UserBubble({ message, accentColor }: { message: ServiceChatMessage; accentColor: string }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[85%] sm:max-w-[75%] rounded-[20px_20px_6px_20px] px-4 py-3 text-[14px] sm:text-[15px] leading-relaxed text-white"
        style={{
          background: `linear-gradient(135deg, ${accentColor} 0%, ${adjustColor(accentColor, -30)} 100%)`,
          boxShadow: `0 2px 12px ${accentColor}25`,
        }}
      >
        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex gap-1.5 mb-2">
            {message.attachments.map((att) => (
              <div key={att.id} className="w-12 h-12 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center text-xs">
                {att.preview ? (
                  <Image src={att.preview} alt={att.name} width={48} height={48} unoptimized className="w-full h-full object-cover" />
                ) : (
                  att.type === 'video' ? '🎬' : att.type === 'audio' ? '🎵' : '📄'
                )}
              </div>
            ))}
          </div>
        )}
        <p className="whitespace-pre-wrap">{message.text}</p>
      </div>
    </div>
  );
}

function AssistantBubble({
  message, config, language, onSuggestionClick,
}: {
  message: ServiceChatMessage;
  config: ServiceChatConfig;
  language: string;
  onSuggestionClick?: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = getUiCopy(language);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [message.text]);

  return (
    <div className="flex gap-2.5 items-start">
      <ServiceAgentAvatar config={config} />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="chat-bubble-agent group relative">
          <p className="whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>
            {message.text}
            {message.isStreaming && <span className="chat-cursor" />}
          </p>
          {!message.isStreaming && message.text.length > 0 && (
            <button onClick={handleCopy} className="copy-btn">
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {/* Streaming indicator */}
        {message.isStreaming && (
          <div className="flex items-center gap-1.5 px-1">
            <Loader2 className="w-3 h-3 animate-spin" style={{ color: config.accentColor }} />
            <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{copy.generating}</span>
          </div>
        )}

        {/* Suggestion chips */}
        {message.suggestions && message.suggestions.length > 0 && !message.isStreaming && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {message.suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick?.(s)}
                className="px-3 py-1.5 rounded-full text-[11px] font-medium transition-all hover:scale-[1.02]"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SystemBubble({ message }: { message: ServiceChatMessage }) {
  return (
    <div className="flex justify-center">
      <div className="px-4 py-2 rounded-full text-[11px] font-medium" style={{
        background: 'rgba(255,255,255,0.04)',
        color: 'var(--color-text-tertiary)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        {message.text}
      </div>
    </div>
  );
}

/* ─── Utility ─────────────────────────────────────────── */

function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xFF) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xFF) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xFF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
