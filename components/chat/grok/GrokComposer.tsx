'use client'

import { useCallback, useRef, useEffect, useState, type KeyboardEvent } from 'react'
import { ChatModeSelector, type ChatMode, getModeIcon } from './ChatModeSelector'

interface GrokComposerProps {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onAttach: () => void
  onCamera: () => void
  isSubmitting: boolean
  placeholder: string
  mode: ChatMode
  onModeChange: (mode: ChatMode) => void
  attachCount?: number
}

export function GrokComposer({
  value, onChange, onSend, onAttach, onCamera,
  isSubmitting, placeholder, mode, onModeChange, attachCount = 0,
}: GrokComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const canSend = (value.trim().length > 0 || attachCount > 0) && !isSubmitting

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

  const handleVoice = useCallback(() => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop()
      setIsListening(false)
      return
    }
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    if (!SR) return
    const recognition = new (SR as new () => SpeechRecognition)()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognitionRef.current = recognition
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript
      if (transcript) onChange(value + (value ? ' ' : '') + transcript)
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    recognition.start()
    setIsListening(true)
  }, [isListening, onChange, value])

  const handleSpeak = useCallback(() => {
    // Start voice mode - continuous listening
    handleVoice()
  }, [handleVoice])

  return (
    <div className="grok-bottom-bar">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 w-full">
        {/* Text input area */}
        <div className="grok-composer">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? 'Listening…' : placeholder}
            rows={1}
            disabled={isSubmitting}
            className="grok-textarea"
          />

          {/* Send button - appears when there's text */}
          {canSend && (
            <button
              onClick={onSend}
              disabled={!canSend}
              className="grok-send-btn"
              aria-label="Send"
              type="button"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="m5 12 7-7 7 7" /><path d="M12 19V5" />
                </svg>
              )}
            </button>
          )}
        </div>

        {/* Bottom controls row */}
        <div className="grok-controls-row">
          <div className="flex items-center gap-1.5">
            {/* Attachment */}
            <button onClick={onAttach} className="grok-control-btn" aria-label="Attach file" type="button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>

            {/* Mode selector chip */}
            <ChatModeSelector mode={mode} onModeChange={onModeChange} />
          </div>

          <div className="flex items-center gap-1.5">
            {/* Mic */}
            <button
              onClick={handleVoice}
              className={`grok-control-btn ${isListening ? 'active' : ''}`}
              aria-label="Voice input"
              type="button"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
              </svg>
            </button>

            {/* Speak button */}
            <button
              onClick={handleSpeak}
              className="grok-speak-btn"
              aria-label="Speak"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 10v3" /><path d="M6 6v11" /><path d="M10 3v18" /><path d="M14 8v7" /><path d="M18 5v13" /><path d="M22 10v3" />
              </svg>
              <span>Speak</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
