'use client';

/**
 * components/chat/ChatComposer.tsx
 * ================================
 * Premium input composer with multiline support, attachments, voice,
 * and elegant placeholder text that changes by mode.
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import { Paperclip, Mic, MicOff, Send, StopCircle, X } from 'lucide-react';
import type { ChatAttachment } from '@/lib/chat/types';
import { getPlaceholder } from '@/lib/chat/constants';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  onAttach?: (attachment: ChatAttachment) => void;
  onRemoveAttachment?: (id: string) => void;
  attachments?: ChatAttachment[];
  mode: string;
  language: string;
  isLoading: boolean;
  isRecording: boolean;
  onToggleRecording?: () => void;
}

export function ChatComposer({
  value, onChange, onSend, onStop, onAttach, onRemoveAttachment,
  attachments = [], mode, language, isLoading, isRecording, onToggleRecording,
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
    if (!file || !onAttach) return;
    if (file.size > 10 * 1024 * 1024) return; // 10MB limit

    const att: ChatAttachment = {
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      type: file.type.startsWith('image/') ? 'image'
        : file.type.startsWith('video/') ? 'video'
        : file.type.startsWith('audio/') ? 'audio'
        : 'file',
      mimeType: file.type,
      size: file.size,
    };

    // Generate preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        att.preview = reader.result as string;
        onAttach(att);
      };
      reader.readAsDataURL(file);
    } else {
      onAttach(att);
    }
    e.target.value = '';
  }, [onAttach]);

  return (
    <div className="px-3 pb-3 pt-2">
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
          {attachments.map(att => (
            <div key={att.id} className="relative flex-shrink-0 group">
              {att.preview ? (
                <img src={att.preview} alt={att.name}
                  className="w-14 h-14 rounded-xl object-cover"
                  style={{ border: '1px solid var(--color-border)' }} />
              ) : (
                <div className="w-14 h-14 rounded-xl flex items-center justify-center text-xs"
                  style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)' }}>
                  {att.type === 'video' ? '🎬' : att.type === 'audio' ? '🎵' : '📄'}
                </div>
              )}
              <button onClick={() => onRemoveAttachment?.(att.id)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
      <div
        className="flex items-end gap-1.5 rounded-2xl px-2 py-1.5 transition-all duration-200"
        style={{
          backgroundColor: 'var(--color-surface)',
          border: `1px solid ${focused ? 'var(--color-accent)' : 'var(--color-border)'}`,
          boxShadow: focused ? '0 0 0 3px var(--color-accent-soft)' : 'none',
        }}
      >
        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" className="hidden"
          accept="image/*,video/*,audio/*,.txt,.pdf,.json,.csv,.doc,.docx"
          onChange={handleFileSelect} />

        {/* Attach button */}
        <button onClick={() => fileInputRef.current?.click()}
          className="p-2 rounded-xl transition-colors flex-shrink-0 hover:bg-white/5"
          style={{ color: 'var(--color-text-tertiary)' }}
          title="Attach file">
          <Paperclip className="w-4 h-4" />
        </button>

        {/* Voice button */}
        {onToggleRecording && (
          <button onClick={onToggleRecording}
            className={`p-2 rounded-xl flex-shrink-0 transition-colors ${isRecording ? 'bg-red-500/20' : 'hover:bg-white/5'}`}
            style={{ color: isRecording ? '#ef4444' : 'var(--color-text-tertiary)' }}
            title="Voice input">
            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          rows={1}
          placeholder={placeholder}
          className="flex-1 py-2 px-1 text-sm resize-none focus:outline-none bg-transparent min-h-[36px] max-h-[160px]"
          style={{ color: 'var(--color-text)' }}
        />

        {/* Send / Stop button */}
        {isLoading ? (
          <button onClick={onStop}
            className="p-2 rounded-xl flex-shrink-0 bg-red-500/15 hover:bg-red-500/25 transition-colors"
            title="Stop generation">
            <StopCircle className="w-5 h-5 text-red-400" />
          </button>
        ) : (
          <button onClick={onSend}
            disabled={!value.trim()}
            className="p-2 rounded-xl flex-shrink-0 transition-all duration-150 disabled:opacity-25 hover:scale-105 active:scale-95"
            style={{ backgroundColor: value.trim() ? 'var(--color-accent)' : 'transparent', color: value.trim() ? '#fff' : 'var(--color-text-tertiary)' }}
            title="Send message">
            <Send className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
