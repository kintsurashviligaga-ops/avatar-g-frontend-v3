'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const PLACEHOLDERS = {
  en: 'Ask Agent G what to create…',
  ka: 'სთხოვეთ Agent G-ს რა შეიქმნას…',
  ru: 'Спросите Agent G, что создать…',
} as const

interface Props {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onAttach?: () => void
  onMic?: () => void
  disabled?: boolean
}

export function BottomChatComposer({ value, onChange, onSend, onAttach, onMic, disabled }: Props) {
  const { language } = useLanguage()
  const lang = language as keyof typeof PLACEHOLDERS
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [focused, setFocused] = useState(false)

  // Auto-resize
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [value])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !disabled) onSend()
    }
  }, [value, disabled, onSend])

  const canSend = value.trim().length > 0 && !disabled

  return (
    <div className="chat-composer">
      {/* Attach */}
      {onAttach && (
        <button type="button" onClick={onAttach} className="chat-action-btn" aria-label="Attach file">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={PLACEHOLDERS[lang] || PLACEHOLDERS.en}
        rows={1}
        className="chat-textarea"
      />

      {/* Right-side buttons */}
      <div className="flex items-center shrink-0">
        {/* Mic */}
        {onMic && (
          <button type="button" onClick={onMic} className="chat-action-btn" aria-label="Voice input">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" x2="12" y1="19" y2="22"/>
            </svg>
          </button>
        )}

        {/* Send */}
        <button type="button" onClick={onSend} disabled={!canSend} className="chat-send-btn" aria-label="Send message">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12 14 0"/>
            <path d="m12 5 7 7-7 7"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
