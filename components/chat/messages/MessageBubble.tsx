'use client';

/**
 * components/chat/messages/MessageBubble.tsx
 * ============================================
 * Renders a single user or assistant message bubble with
 * copy-to-clipboard, streaming indicator, and agent badge.
 */

import { useState, useCallback } from 'react';
import Image from 'next/image';

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
      <div className="chat-bubble-user">
        {attachments && attachments.length > 0 && (
          <div className="flex gap-1.5 mb-2">
            {attachments.map((att, i) => (
              <div key={i} className="chat-attachment" style={{ width: 48, height: 48 }}>
                {att.preview ? (
                  <Image
                    src={att.preview}
                    alt={att.name}
                    width={48}
                    height={48}
                    unoptimized
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs bg-white/10">
                    {att.type === 'video' ? '🎬' : att.type === 'audio' ? '🎵' : '📄'}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="whitespace-pre-wrap">{content}</p>
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
      {config.showAvatar && <div className="chat-agent-avatar"><AgentBadge agentId={agentId || 'agent-g'} size="sm" /></div>}
      <div className="flex-1 min-w-0">
        <div className="chat-bubble-agent group">
          <p className="whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>
            {content}
            {isStreaming && <span className="chat-cursor" />}
          </p>
          {!isStreaming && content.length > 0 && (
            <button onClick={handleCopy} className="copy-btn">
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
