'use client'

/**
 * ServiceComposer — Bottom input bar for service workspaces.
 * Matches the Agent G ChatComposer style: rounded pill, attach, camera, voice, send.
 */

import { useCallback, useRef, useEffect, useState, type KeyboardEvent } from 'react'

interface ServiceComposerProps {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onAttach: () => void
  onCamera: () => void
  isSubmitting: boolean
  placeholder: string
}

export function ServiceComposer({ value, onChange, onSend, onAttach, onCamera, isSubmitting, placeholder }: ServiceComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const canSend = value.trim().length > 0 && !isSubmitting

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = '24px'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [value])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (canSend) onSend()
    }
  }, [canSend, onSend])

  // Voice input via Web Speech API
  const handleVoice = useCallback(() => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop()
      setIsListening(false)
      return
    }

    const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new (SpeechRecognition as new () => SpeechRecognition)()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognitionRef.current = recognition

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript
      if (transcript) {
        onChange(value + (value ? ' ' : '') + transcript)
      }
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)

    recognition.start()
    setIsListening(true)
  }, [isListening, onChange, value])

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-30"
      style={{
        backgroundColor: 'rgba(6,12,26,0.85)',
        backdropFilter: 'blur(16px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="max-w-3xl mx-auto px-3 sm:px-4 pt-2 pb-2">
        {/* Composer pill container */}
        <div
          className="flex items-end gap-1 rounded-[24px] px-2 py-1.5 transition-all duration-200"
          style={{
            backgroundColor: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 -2px 16px rgba(0,0,0,0.08)',
          }}
        >
          {/* Left: Attach + Camera */}
          <div className="flex items-center shrink-0 pb-0.5">
            <button
              onClick={onAttach}
              className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors active:scale-95"
              style={{ color: 'var(--color-text-tertiary)' }}
              aria-label="Attach file"
              type="button"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <button
              onClick={onCamera}
              className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors active:scale-95"
              style={{ color: 'var(--color-text-tertiary)' }}
              aria-label="Camera"
              type="button"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
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
              placeholder={isListening ? 'Listening…' : placeholder}
              rows={1}
              disabled={isSubmitting}
              className="w-full bg-transparent text-sm sm:text-[15px] outline-none resize-none leading-6"
              style={{
                color: 'var(--color-text)',
                minHeight: '24px',
                maxHeight: '120px',
              }}
            />
          </div>

          {/* Right: Voice + Send */}
          <div className="flex items-center shrink-0 pb-0.5">
            {/* Voice mic button */}
            <button
              onClick={handleVoice}
              className="flex items-center justify-center w-9 h-9 rounded-xl transition-all active:scale-95"
              style={{
                color: isListening ? '#fff' : 'var(--color-text-tertiary)',
                backgroundColor: isListening ? 'var(--color-accent)' : 'transparent',
              }}
              aria-label="Voice input"
              type="button"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>

            {/* Send button */}
            <button
              onClick={onSend}
              disabled={!canSend}
              className="flex items-center justify-center w-9 h-9 rounded-xl transition-all active:scale-95 disabled:opacity-30"
              style={{
                backgroundColor: canSend ? 'var(--color-accent)' : 'transparent',
                color: canSend ? '#fff' : 'var(--color-text-tertiary)',
              }}
              aria-label="Send"
              type="button"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
