'use client'

/**
 * ChatComposer — fullscreen bottom composer bar with all action buttons.
 * Fixed at bottom, safe-area aware, keyboard-aware.
 *
 * Left: Attach + Camera
 * Center: Multiline input
 * Right: Voice + SpeechMode + Send
 */

import { useRef, useEffect, useCallback } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { CHAT_LABELS, type ChatLocale } from './config'
import type { FCAttachment, VoiceStatus } from './types'

interface Props {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onAttach: () => void
  onCamera: () => void
  onVoice: () => void
  onSpeechModeToggle: () => void
  isSubmitting: boolean
  voiceStatus: VoiceStatus
  speechModeOn: boolean
  attachments: FCAttachment[]
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  onAttach,
  onCamera,
  onVoice,
  onSpeechModeToggle,
  isSubmitting,
  voiceStatus,
  speechModeOn,
  attachments,
}: Props) {
  const { language } = useLanguage()
  const lang = (language as ChatLocale) || 'en'
  const labels = CHAT_LABELS[lang] || CHAT_LABELS.en
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const canSend = (value.trim().length > 0 || attachments.length > 0) && !isSubmitting

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = '24px'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [value])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (canSend) onSend()
    }
  }, [canSend, onSend])

  const isListening = voiceStatus === 'listening'

  return (
    <div
      className="sticky bottom-0 z-30 shrink-0 w-full"
      style={{
        backgroundColor: 'var(--color-bg)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="max-w-2xl mx-auto px-3 sm:px-4 pt-2 pb-2">
        {/* Composer container */}
        <div
          className="flex items-end gap-1 rounded-[24px] px-2 py-1.5 transition-all duration-200"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 -2px 16px rgba(0,0,0,0.08)',
          }}
        >
          {/* Left actions */}
          <div className="flex items-center shrink-0 pb-0.5">
            {/* Attach button */}
            <button
              onClick={onAttach}
              className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl transition-colors active:scale-95"
              style={{ color: 'var(--color-text-tertiary)' }}
              aria-label={labels.attachHint}
              type="button"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>

            {/* Camera button */}
            <button
              onClick={onCamera}
              className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl transition-colors active:scale-95"
              style={{ color: 'var(--color-text-tertiary)' }}
              aria-label={labels.cameraHint}
              type="button"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </button>
          </div>

          {/* Input */}
          <div className="flex-1 min-w-0 py-1">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={e => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? labels.voiceListening : labels.placeholder}
              rows={1}
              className="w-full bg-transparent text-sm sm:text-[15px] outline-none resize-none leading-6"
              style={{
                color: 'var(--color-text)',
                minHeight: '24px',
                maxHeight: '120px',
              }}
              disabled={isSubmitting}
            />
          </div>

          {/* Right actions */}
          <div className="flex items-center shrink-0 pb-0.5">
            {/* Voice (mic) button */}
            <button
              onClick={onVoice}
              className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl transition-all active:scale-95"
              style={{
                color: isListening ? '#fff' : 'var(--color-text-tertiary)',
                backgroundColor: isListening ? 'var(--color-accent)' : 'transparent',
              }}
              aria-label={isListening ? labels.voiceListening : 'Voice input'}
              type="button"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>

            {/* Speech mode toggle */}
            <button
              onClick={onSpeechModeToggle}
              className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl transition-all active:scale-95"
              style={{
                color: speechModeOn ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              }}
              aria-label={speechModeOn ? labels.speechModeOn : labels.speechModeOff}
              type="button"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                {speechModeOn ? (
                  <>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                  </>
                ) : (
                  <line x1="23" y1="9" x2="17" y2="15" />
                )}
              </svg>
            </button>

            {/* Send button */}
            <button
              onClick={onSend}
              disabled={!canSend}
              className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl transition-all active:scale-95 disabled:opacity-30"
              style={{
                backgroundColor: canSend ? 'var(--color-accent)' : 'transparent',
                color: canSend ? '#fff' : 'var(--color-text-tertiary)',
              }}
              aria-label="Send"
              type="button"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
