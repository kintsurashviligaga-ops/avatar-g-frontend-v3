'use client'

import { useState, useCallback } from 'react'
import type { ChatMode } from './ChatModeSelector'

interface ChatResponseToolbarProps {
  content: string
  mode: ChatMode
  responseTime?: number
}

export function ChatResponseToolbar({ content, mode, responseTime }: ChatResponseToolbarProps) {
  const [liked, setLiked] = useState<'up' | 'down' | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* noop */ }
  }, [content])

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: content })
      } catch { /* cancelled */ }
    } else {
      handleCopy()
    }
  }, [content, handleCopy])

  const handleSpeak = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(content)
      utterance.rate = 1
      window.speechSynthesis.speak(utterance)
    }
  }, [content])

  const modeLabel = mode === 'deep' ? 'Deep' : mode === 'expert' ? 'Expert' : mode === 'auto' ? 'Auto' : 'Fast'

  return (
    <div className="grok-response-toolbar">
      <div className="grok-response-actions">
        {/* Copy */}
        <button onClick={handleCopy} className="grok-toolbar-btn" aria-label="Copy" type="button" title="Copy">
          {copied ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>

        {/* Share */}
        <button onClick={handleShare} className="grok-toolbar-btn" aria-label="Share" type="button" title="Share">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        </button>

        {/* Like */}
        <button
          onClick={() => setLiked(liked === 'up' ? null : 'up')}
          className={`grok-toolbar-btn ${liked === 'up' ? 'active' : ''}`}
          aria-label="Like" type="button" title="Like"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={liked === 'up' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
          </svg>
        </button>

        {/* Dislike */}
        <button
          onClick={() => setLiked(liked === 'down' ? null : 'down')}
          className={`grok-toolbar-btn ${liked === 'down' ? 'active' : ''}`}
          aria-label="Dislike" type="button" title="Dislike"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={liked === 'down' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ transform: 'scaleY(-1)' }}>
            <path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
          </svg>
        </button>

        {/* Audio / Speak */}
        <button onClick={handleSpeak} className="grok-toolbar-btn" aria-label="Speak" type="button" title="Read aloud">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        </button>

        {/* Regenerate */}
        <button className="grok-toolbar-btn" aria-label="Regenerate" type="button" title="Regenerate">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M21.5 2v6h-6" /><path d="M2.5 22v-6h6" />
            <path d="M2.5 12a10 10 0 0 1 16.58-6.07L21.5 8" /><path d="M21.5 12a10 10 0 0 1-16.58 6.07L2.5 16" />
          </svg>
        </button>

        {/* More */}
        <button className="grok-toolbar-btn" aria-label="More options" type="button" title="More">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      </div>

      {/* Mode + time indicator */}
      {responseTime != null && (
        <span className="grok-response-meta">
          {modeLabel} • {responseTime.toFixed(2)}s
        </span>
      )}
    </div>
  )
}
