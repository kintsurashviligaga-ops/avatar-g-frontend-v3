'use client';

/**
 * components/chat/messages/MessageBubble.tsx
 * ============================================
 * Renders a single user or assistant message bubble with
 * copy-to-clipboard, streaming indicator, and agent badge.
 */

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, Loader2 } from 'lucide-react';
import { AgentBadge } from '../shared/AgentBadge';
import { MESSAGE_RENDER_MAP } from '@/lib/chat/config/messageRenderConfig';

interface UserBubbleProps {
  content: string;
  attachments?: Array<{ type: string; preview?: string; name: string }>;
}

export function UserBubble({ content, attachments }: UserBubbleProps) {
  const config = MESSAGE_RENDER_MAP.user;

  return (
    <div className={`flex ${config.alignment === 'right' ? 'justify-end' : 'justify-start'}`}>
      <div
        className="px-4 py-2.5 rounded-2xl rounded-br-md"
        style={{
          maxWidth: config.maxWidth,
          background: 'linear-gradient(135deg, var(--color-accent), #8b5cf6)',
          color: '#fff',
        }}
      >
        {attachments && attachments.length > 0 && (
          <div className="flex gap-1.5 mb-2">
            {attachments.map((att, i) => (
              <div key={i} className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0"
                style={{ border: '1px solid rgba(255,255,255,0.2)' }}>
                {att.preview ? (
                  <img src={att.preview} alt={att.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs bg-white/10">
                    {att.type === 'video' ? '🎬' : att.type === 'audio' ? '🎵' : '📄'}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}

interface AssistantBubbleProps {
  content: string;
  agentId?: string;
  isStreaming?: boolean;
}

export function AssistantBubble({ content, agentId, isStreaming }: AssistantBubbleProps) {
  const [copied, setCopied] = useState(false);
  const config = MESSAGE_RENDER_MAP['assistant'];

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* clipboard not available */ });
  }, [content]);

  return (
    <div className="flex gap-2.5 items-start">
      {config.showAvatar && <AgentBadge agentId={agentId || 'agent-g'} size="sm" />}
      <div className="flex-1 min-w-0" style={{ maxWidth: config.maxWidth }}>
        <div
          className="px-4 py-2.5 rounded-2xl rounded-tl-md relative group"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>
            {content}
            {isStreaming && (
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
                className="inline-block w-1.5 h-4 ml-0.5 rounded-sm align-middle"
                style={{ backgroundColor: 'var(--color-accent)' }}
              />
            )}
          </p>
          {!isStreaming && content.length > 0 && (
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
        {isStreaming && (
          <div className="flex items-center gap-1.5 mt-1.5 px-1">
            <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--color-accent)' }} />
            <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>Generating...</span>
          </div>
        )}
      </div>
    </div>
  );
}
