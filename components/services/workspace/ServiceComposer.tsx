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
  attachCount?: number
}

export function ServiceComposer({ value, onChange, onSend, onAttach, onCamera, isSubmitting, placeholder, attachCount = 0 }: ServiceComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const canSend = (value.trim().length > 0 || attachCount > 0) && !isSubmitting

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
    <div className="chat-bottom-bar">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 pt-2 pb-2">
        <div className="chat-composer">
          {/* Left: Attach + Camera */}
          <div className="flex items-center shrink-0">
            <button onClick={onAttach} className="chat-action-btn" aria-label="Attach file" type="button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <button onClick={onCamera} className="chat-action-btn" aria-label="Camera" type="button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
          </div>

          {/* Input */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? 'Listening…' : placeholder}
            rows={1}
            disabled={isSubmitting}
            className="chat-textarea"
          />

          {/* Right: Voice + Send */}
          <div className="flex items-center shrink-0">
            <button
              onClick={handleVoice}
              className={`chat-action-btn ${isListening ? 'active' : ''}`}
              aria-label="Voice input"
              type="button"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
              </svg>
            </button>

            <button
              onClick={onSend}
              disabled={!canSend}
              className="chat-send-btn"
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
