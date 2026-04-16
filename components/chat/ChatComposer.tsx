'use client';

/**
 * components/chat/ChatComposer.tsx
 * ================================
 * Premium input composer with glassmorphism, multiline support, attachments, voice,
 * and elegant placeholder text that changes by mode.
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Paperclip, Mic, MicOff, Send, StopCircle, X } from 'lucide-react';
import type { ChatAttachment } from '@/lib/chat/types.legacy';
import { getPlaceholder } from '@/lib/chat/constants.legacy';

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
    <motion.div 
      className="px-3 pb-3 pt-2"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <motion.div 
          className="flex gap-2 mb-2 overflow-x-auto pb-1"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {attachments.map((att, idx) => (
            <motion.div 
              key={att.id} 
              className="relative flex-shrink-0 group"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
            >
              {att.preview ? (
                <img src={att.preview} alt={att.name}
                  className="w-14 h-14 rounded-xl object-cover shadow-lg"
                  style={{ border: '1px solid var(--color-border)' }} />
              ) : (
                <div className="w-14 h-14 rounded-xl flex items-center justify-center text-xs"
                  style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)' }}>
                  {att.type === 'video' ? '🎬' : att.type === 'audio' ? '🎵' : '📄'}
                </div>
              )}
              <motion.button 
                onClick={() => onRemoveAttachment?.(att.id)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                <X className="w-3 h-3" />
              </motion.button>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Input row — Enhanced glassmorphism */}
      <div className="glass-panel-compact">
        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" className="hidden"
          accept="image/*,video/*,audio/*,.txt,.pdf,.json,.csv,.doc,.docx"
          onChange={handleFileSelect} />

        {/* Attach button */}
        <motion.button 
          onClick={() => fileInputRef.current?.click()}
          className="chat-action-btn" 
          title="Attach file"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Paperclip className="w-[18px] h-[18px]" />
        </motion.button>

        {/* Voice button */}
        {onToggleRecording && (
          <motion.button 
            onClick={onToggleRecording}
            className={`chat-action-btn ${isRecording ? 'active' : ''}`}
            style={isRecording ? { color: '#ef4444', background: 'rgba(239,68,68,0.12)' } : undefined}
            title="Voice input"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {isRecording ? <MicOff className="w-[18px] h-[18px]" /> : <Mic className="w-[18px] h-[18px]" />}
          </motion.button>
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
          className="chat-textarea"
        />

        {/* Send / Stop button */}
        {isLoading ? (
          <motion.button 
            onClick={onStop}
            className="chat-action-btn" 
            style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            animate={{ scale: [1, 0.95, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            title="Stop generation">
            <StopCircle className="w-[18px] h-[18px]" />
          </motion.button>
        ) : (
          <motion.button 
            onClick={onSend}
            disabled={!value.trim()}
            className="chat-send-btn"
            title="Send message"
            whileHover={{ scale: !value.trim() ? 1 : 1.08 }}
            whileTap={{ scale: !value.trim() ? 1 : 0.95 }}
          >
            <Send className="w-[18px] h-[18px]" />
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
