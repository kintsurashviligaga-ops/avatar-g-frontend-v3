'use client'

/**
 * ServiceComposer — Bottom input bar for service workspaces.
 * Matches the Agent G chat composer style but with service-specific context.
 */

import { useCallback, useRef, useEffect, type KeyboardEvent } from 'react'

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

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = '0px'
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'
  }, [value])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isSubmitting && value.trim()) onSend()
    }
  }, [isSubmitting, value, onSend])

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-30"
      style={{
        backgroundColor: '#0a0a0c',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="max-w-3xl mx-auto px-3 py-2.5 flex items-end gap-2">
        {/* Attach */}
        <button
          onClick={onAttach}
          className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors mb-0.5"
          style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--color-text-tertiary)' }}
          aria-label="Attach file"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        {/* Camera */}
        <button
          onClick={onCamera}
          className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors mb-0.5"
          style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--color-text-tertiary)' }}
          aria-label="Camera"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
        </button>

        {/* Textarea */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={isSubmitting}
            className="w-full resize-none text-sm leading-relaxed rounded-2xl px-4 py-2.5 pr-12 outline-none placeholder:opacity-40"
            style={{
              backgroundColor: 'rgba(255,255,255,0.05)',
              color: 'var(--color-text)',
              border: '1px solid rgba(255,255,255,0.08)',
              minHeight: '40px',
              maxHeight: '140px',
            }}
          />
          {/* Send button — inside textarea */}
          <button
            onClick={onSend}
            disabled={isSubmitting || !value.trim()}
            className="absolute right-2 bottom-1.5 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
            style={{
              backgroundColor: value.trim() ? 'var(--color-accent)' : 'rgba(255,255,255,0.05)',
              color: value.trim() ? '#000' : 'var(--color-text-tertiary)',
              opacity: isSubmitting ? 0.5 : 1,
            }}
            aria-label="Send"
          >
            {isSubmitting ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12 7-7 7 7" /><path d="M12 19V5" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
