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

      <div
        className="flex items-end gap-1.5 rounded-2xl px-2 py-1.5 transition-all duration-200"
        style={{
          backgroundColor: 'var(--color-surface)',
          border: `1px solid ${focused ? 'var(--color-accent)' : 'var(--color-border)'}`,
          boxShadow: focused ? '0 0 0 3px var(--color-accent-soft)' : 'none',
        }}
      >
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
          className="p-2 rounded-xl transition-colors hover:bg-white/5 flex-shrink-0"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <Paperclip className="w-4 h-4" />
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
          className="flex-1 bg-transparent text-sm resize-none outline-none py-2 leading-5"
          style={{
            color: 'var(--color-text)',
            maxHeight: '160px',
            scrollbarWidth: 'thin',
          }}
        />

        {/* Voice */}
        {onToggleRecording && (
          <button
            onClick={onToggleRecording}
            className="p-2 rounded-xl transition-colors hover:bg-white/5 flex-shrink-0"
            style={{ color: isRecording ? '#ef4444' : 'var(--color-text-tertiary)' }}
          >
            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        )}

        {/* Send / Stop */}
        {isLoading ? (
          <button
            onClick={onStop}
            className="p-2 rounded-xl flex-shrink-0"
            style={{ color: '#ef4444' }}
          >
            <StopCircle className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!value.trim()}
            className="p-2 rounded-xl transition-all flex-shrink-0 disabled:opacity-30"
            style={{
              color: value.trim() ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
            }}
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
