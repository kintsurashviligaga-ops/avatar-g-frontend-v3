'use client';

/**
 * components/service-chat/ServiceComposer.tsx
 * =============================================
 * Premium input composer for service chatbots.
 * Same design language as Agent G chat composer
 * with service-specific accent color and controls.
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import { Paperclip, Camera, Mic, MicOff, Send, StopCircle, Sparkles } from 'lucide-react';
import { CameraModal } from './CameraModal';
import type { ServiceChatConfig, ServiceChatAttachment, AgentMode } from './types';

interface Props {
  config: ServiceChatConfig;
  value: string;
  agentMode: AgentMode;
  language: string;
  isLoading: boolean;
  isRecording: boolean;
  attachments: ServiceChatAttachment[];
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  onToggleRecording?: () => void;
  onAddAttachment: (att: ServiceChatAttachment) => void;
  onRemoveAttachment: (id: string) => void;
}

export function ServiceComposer({
  config, value, agentMode, language, isLoading, isRecording,
  attachments, onChange, onSend, onStop, onToggleRecording,
  onAddAttachment, onRemoveAttachment,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const lang = (language || 'en') as 'en' | 'ka' | 'ru';
  const isAgent = agentMode === 'agent';
  const placeholder = isAgent
    ? (config.placeholders.agent[lang] || config.placeholders.agent.en)
    : (config.placeholders.default[lang] || config.placeholders.default.en);

  // Auto-resize
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
    if (!file || attachments.length >= 5) return;

    const att: ServiceChatAttachment = {
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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
        onAddAttachment({ ...att, preview: reader.result as string, dataUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    } else {
      onAddAttachment(att);
    }
    e.target.value = '';
  }, [attachments.length, onAddAttachment]);

  return (
    <div className="px-3 pb-3 pt-2 flex-shrink-0">
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex gap-2 mb-2 px-1 overflow-x-auto">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 group"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {att.preview ? (
                <img src={att.preview} alt={att.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {att.type === 'video' ? '🎬' : att.type === 'audio' ? '🎵' : '📄'}
                </div>
              )}
              <button
                onClick={() => onRemoveAttachment(att.id)}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <span className="text-[8px] text-white">✕</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Composer bar */}
      <div
        className="flex items-end gap-1.5 rounded-[24px] px-2.5 py-2 transition-all"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${focused ? `${config.accentColor}40` : 'rgba(255,255,255,0.08)'}`,
          boxShadow: focused
            ? `0 0 0 3px ${config.accentColor}12, 0 4px 28px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)`
            : '0 2px 20px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.03)',
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
          className="chat-action-btn"
        >
          <Paperclip className="w-[18px] h-[18px]" />
        </button>

        {/* Camera */}
        <button
          onClick={() => setShowCamera(true)}
          className="chat-action-btn"
        >
          <Camera className="w-[18px] h-[18px]" />
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
            className="flex items-center justify-center w-[38px] h-[38px] rounded-xl transition-all flex-shrink-0"
            style={{
              opacity: value.trim() ? 1 : 0.25,
              color: value.trim() ? '#fff' : 'var(--color-text-tertiary)',
              background: value.trim()
                ? `linear-gradient(135deg, ${config.accentColor} 0%, ${adjustColor(config.accentColor, -25)} 100%)`
                : 'transparent',
              boxShadow: value.trim() ? `0 2px 12px ${config.accentColor}40` : 'none',
            }}
          >
            <Send className="w-[18px] h-[18px]" />
          </button>
        )}
      </div>

      {/* Camera Modal */}
      <CameraModal
        isOpen={showCamera}
        accentColor={config.accentColor}
        onClose={() => setShowCamera(false)}
        onAttach={(att) => { onAddAttachment(att); setShowCamera(false); }}
        showFaceGuide={config.slug === 'avatar'}
      />
    </div>
  );
}

function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xFF) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xFF) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xFF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
