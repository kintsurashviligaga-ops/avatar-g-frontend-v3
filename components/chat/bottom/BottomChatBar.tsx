'use client'

/**
 * BottomChatBar
 * =============
 * Premium Gemini-inspired bottom chat bar for MyAvatar.ge.
 * Powered by Agent G. Supports landing page and app contexts.
 * Includes premium phone call button to call Agent G directly.
 */

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { BottomChatQuickActions, type QuickAction } from './BottomChatQuickActions'
import { BottomChatComposer } from './BottomChatComposer'
import { CallScreen } from '@/components/chat/grok/CallScreen'

const LABELS = {
  en: { poweredBy: 'Powered by Agent G', greeting: 'What would you like to create today?', callAgent: 'Call Agent G' },
  ka: { poweredBy: 'Agent G-ით მუშაობს', greeting: 'რისი შექმნა გსურთ დღეს?', callAgent: 'Agent G-ს დარეკვა' },
  ru: { poweredBy: 'Работает на Agent G', greeting: 'Что хотите создать сегодня?', callAgent: 'Позвонить Agent G' },
} as const

interface Props {
  /** 'landing' = welcoming, fewer actions; 'app' = functional, all actions */
  mode?: 'landing' | 'app'
  /** Additional class for positioning (e.g. sticky, fixed) */
  className?: string
}

export function BottomChatBar({ mode = 'landing', className = '' }: Props) {
  const { language } = useLanguage()
  const lang = language as 'en' | 'ka' | 'ru'
  const router = useRouter()
  const [value, setValue] = useState('')
  const [callOpen, setCallOpen] = useState(false)
  const labels = LABELS[lang] || LABELS.en

  const navigateToService = useCallback((path: string, prompt?: string) => {
    const base = `/${language}${path}`
    if (prompt) {
      router.push(`${base}?prompt=${encodeURIComponent(prompt)}`)
    } else {
      router.push(base)
    }
  }, [language, router])

  const handleAction = useCallback((action: QuickAction) => {
    if (action.route) {
      navigateToService(action.route, action.prompt)
    }
  }, [navigateToService])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed) return
    navigateToService('/services/agent-g', trimmed)
    setValue('')
  }, [value, navigateToService])

  const handleCallAgent = useCallback(() => {
    setCallOpen(true)
  }, [])

  return (
    <>
      <div
        className={`chat-bottom-bar ${className}`}
        style={{
          ...(mode === 'landing' ? { position: 'relative', zIndex: 1 } : {}),
          backgroundColor: 'var(--nav-bg)',
          backdropFilter: 'blur(20px) saturate(1.2)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
        }}
      >
        <div
          className="relative max-w-2xl mx-auto px-4 pt-3 pb-3"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >

          {/* Top row: Phone call button (left) | Agent badge (center) | Chat button (right) */}
          <div className="flex items-center justify-between mb-2">
            {/* Premium Phone Call Button — left side */}
            <button
              onClick={handleCallAgent}
              className="landing-call-btn"
              aria-label={labels.callAgent}
              type="button"
            >
              <span className="landing-call-btn-pulse" />
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="relative z-10">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2z" />
              </svg>
            </button>

            {/* Agent G identity badge — center */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] tracking-wide font-medium"
              style={{ backgroundColor: 'rgba(34,211,238,0.06)', color: 'var(--color-accent)', border: '1px solid rgba(34,211,238,0.12)' }}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ backgroundColor: 'var(--color-accent)' }} />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
              </span>
              {labels.poweredBy}
            </div>

            {/* Chat with Agent G — right side (opposite of phone) */}
            <button
              onClick={() => navigateToService('/services/agent-g')}
              className="landing-chat-btn"
              aria-label="Chat with Agent G"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="relative z-10">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          </div>

          {/* Quick actions */}
          <div className="mb-2">
            <BottomChatQuickActions onAction={handleAction} mode={mode} />
          </div>

          {/* Composer */}
          <BottomChatComposer
            value={value}
            onChange={setValue}
            onSend={handleSend}
            onAttach={mode === 'app' ? () => {} : undefined}
            onMic={() => {}}
          />
        </div>
      </div>

      {/* Call Screen overlay — accessible from landing */}
      <CallScreen
        open={callOpen}
        onClose={() => setCallOpen(false)}
      />
    </>
  )
}
