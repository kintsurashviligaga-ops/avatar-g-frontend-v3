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
      className="fixed bottom-0 left-0 right-0 z-30"
      style={{
        backgroundColor: '#060c1a',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="max-w-3xl mx-auto px-3 sm:px-4 pt-2 pb-2">
        {/* Composer container */}
        <div className="chat-composer">
          {/* Left actions */}
          <div className="flex items-center shrink-0">
            <button onClick={onAttach} className="chat-action-btn" aria-label={labels.attachHint} type="button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
            <button onClick={onCamera} className="chat-action-btn" aria-label={labels.cameraHint} type="button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </button>
          </div>

          {/* Input */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? labels.voiceListening : labels.placeholder}
            rows={1}
            className="chat-textarea"
            disabled={isSubmitting}
          />

          {/* Right actions */}
          <div className="flex items-center shrink-0">
            <button
              onClick={onVoice}
              className={`chat-action-btn ${isListening ? 'active' : ''}`}
              aria-label={isListening ? labels.voiceListening : 'Voice input'}
              type="button"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
              </svg>
            </button>

            <button
              onClick={onSpeechModeToggle}
              className={`chat-action-btn ${speechModeOn ? 'active' : ''}`}
              aria-label={speechModeOn ? labels.speechModeOn : labels.speechModeOff}
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
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

            <button
              onClick={onSend}
              disabled={!canSend}
              className="chat-send-btn"
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
