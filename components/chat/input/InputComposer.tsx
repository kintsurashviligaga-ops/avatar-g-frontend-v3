'use client';

/**
 * components/chat/input/InputComposer.tsx
 * =========================================
 * Premium multiline input with attachments, voice,
 * context-aware placeholder, and send/stop controls.
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import { Paperclip, Mic, MicOff, Send, StopCircle } from 'lucide-react';
import type { ChatAttachment, ChatMode } from '@/lib/chat/types';
import { getPlaceholder } from '@/lib/chat/config/localization';
import { AttachmentTray } from './AttachmentTray';
import { fileToAttachment, validateAttachment, createAttachmentPreview } from '@/lib/chat/logic/attachmentResolver';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  attachments: ChatAttachment[];
  onAddAttachment: (att: ChatAttachment) => void;
  onRemoveAttachment: (id: string) => void;
  mode: ChatMode;
  language: string;
  isLoading: boolean;
  isRecording: boolean;
  onToggleRecording?: () => void;
}

export function InputComposer({
  value, onChange, onSend, onStop,
  attachments, onAddAttachment, onRemoveAttachment,
  mode, language, isLoading, isRecording, onToggleRecording,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const placeholder = getPlaceholder(mode, language);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [value]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isLoading) onSend();
    }
  }, [value, isLoading, onSend]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateAttachment(file, attachments.length);
    if (!validation.valid) return;

    const att = fileToAttachment(file);

    // Generate preview for images
    if (file.type.startsWith('image/')) {
      const preview = createAttachmentPreview(file);
      if (preview) {
        onAddAttachment({ ...att, previewUrl: preview.url });
      } else {
        onAddAttachment(att);
      }
    } else {
      onAddAttachment(att);
    }
    e.target.value = '';
  }, [attachments.length, onAddAttachment]);

  return (
    <div className="px-3 pb-3 pt-2">
      <AttachmentTray attachments={attachments} onRemove={onRemoveAttachment} />

      <div className="chat-composer">
        {/* File input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
          onChange={handleFileSelect}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="chat-action-btn"
        >
          <Paperclip className="w-[18px] h-[18px]" />
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          rows={1}
          className="chat-textarea"
        />

        {/* Voice */}
        {onToggleRecording && (
          <button
            onClick={onToggleRecording}
            className={`chat-action-btn ${isRecording ? 'active' : ''}`}
            style={isRecording ? { color: '#ef4444', background: 'rgba(239,68,68,0.12)' } : undefined}
          >
            {isRecording ? <MicOff className="w-[18px] h-[18px]" /> : <Mic className="w-[18px] h-[18px]" />}
          </button>
        )}

        {/* Send / Stop */}
        {isLoading ? (
          <button onClick={onStop} className="chat-action-btn" style={{ color: '#ef4444' }}>
            <StopCircle className="w-[18px] h-[18px]" />
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!value.trim()}
            className="chat-send-btn"
          >
            <Send className="w-[18px] h-[18px]" />
          </button>
        )}
      </div>
    </div>
  );
}
