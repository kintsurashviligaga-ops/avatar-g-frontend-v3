'use client'

/**
 * ImagineComposer — Bottom prompt bar for the Create/Imagine tab.
 * "Type to imagine…" input with settings gear, create button, avatar.
 */

import { useState, useRef, useCallback } from 'react'

interface ImagineComposerProps {
  onSubmit: (prompt: string) => void
  onOpenSettings: () => void
  onOpenActions: () => void
  disabled?: boolean
}

export function ImagineComposer({ onSubmit, onOpenSettings, onOpenActions, disabled }: ImagineComposerProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = useCallback(() => {
    const t = text.trim()
    if (!t || disabled) return
    onSubmit(t)
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = '40px'
  }, [text, disabled, onSubmit])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }, [handleSubmit])

  const handleInput = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = '40px'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [])

  return (
    <div className="ma-imagine-bar">
      <div className="ma-imagine-composer">
        {/* Avatar / create icon */}
        <button type="button" className="ma-imagine-action-btn" onClick={onOpenActions} aria-label="Create tools">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          className="ma-imagine-input"
          placeholder="Type to imagine…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          rows={1}
          disabled={disabled}
        />

        {/* Settings gear */}
        <button type="button" className="ma-imagine-action-btn" onClick={onOpenSettings} aria-label="Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {/* Send / create button */}
        <button
          type="button"
          className={`ma-imagine-send ${text.trim() ? 'active' : ''}`}
          onClick={handleSubmit}
          disabled={!text.trim() || disabled}
          aria-label="Create"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}
