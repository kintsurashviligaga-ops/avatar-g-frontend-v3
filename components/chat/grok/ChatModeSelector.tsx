'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

export type ChatMode = 'fast' | 'expert' | 'deep' | 'auto'

interface ChatModeSelectorProps {
  mode: ChatMode
  onModeChange: (mode: ChatMode) => void
}

const MODES: { id: ChatMode; icon: React.ReactNode; label: string; desc: string }[] = [
  {
    id: 'deep',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    label: 'Deep',
    desc: 'Powered by Agent G Pro',
  },
  {
    id: 'expert',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M9 18h6" /><path d="M10 22h4" />
        <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
      </svg>
    ),
    label: 'Expert',
    desc: 'Thinks hard',
  },
  {
    id: 'fast',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    label: 'Fast',
    desc: 'Quick responses',
  },
  {
    id: 'auto',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
        <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
        <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
      </svg>
    ),
    label: 'Auto',
    desc: 'Chooses Fast or Expert',
  },
]

export function ChatModeSelector({ mode, onModeChange }: ChatModeSelectorProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const current = MODES.find(m => m.id === mode)!

  const select = useCallback((id: ChatMode) => {
    onModeChange(id)
    setOpen(false)
  }, [onModeChange])

  return (
    <div className="relative" ref={ref}>
      {/* Trigger chip */}
      <button
        onClick={() => setOpen(o => !o)}
        className="grok-mode-chip"
        type="button"
      >
        <span className="grok-mode-chip-icon">{current.icon}</span>
        <span>{current.label}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="grok-mode-dropdown">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => select(m.id)}
              className={`grok-mode-option ${m.id === mode ? 'selected' : ''}`}
              type="button"
            >
              <span className="grok-mode-option-icon">{m.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold" style={{ color: 'var(--color-text)' }}>{m.label}</div>
                <div className="text-[12px]" style={{ color: 'var(--color-text-tertiary)' }}>{m.desc}</div>
              </div>
              {m.id === mode && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text)' }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function getModeIcon(mode: ChatMode) {
  return MODES.find(m => m.id === mode)?.icon
}
