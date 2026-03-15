'use client'

/**
 * BottomChatBar
 * =============
 * Premium Gemini-inspired bottom chat bar for MyAvatar.ge.
 * Powered by Agent G. Supports landing page and app contexts.
 *
 * Landing mode: welcoming, onboarding-focused, quick actions visible.
 * App mode: more functional, tool-aware, connected to services.
 */

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { BottomChatQuickActions, type QuickAction } from './BottomChatQuickActions'
import { BottomChatComposer } from './BottomChatComposer'

const LABELS = {
  en: { poweredBy: 'Powered by Agent G', greeting: 'What would you like to create today?' },
  ka: { poweredBy: 'Agent G-ით მუშაობს', greeting: 'რისი შექმნა გსურთ დღეს?' },
  ru: { poweredBy: 'Работает на Agent G', greeting: 'Что хотите создать сегодня?' },
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
    // Route to Agent G with the prompt
    navigateToService('/services/agent-g', trimmed)
    setValue('')
  }, [value, navigateToService])

  return (
    <div
      className={`bottom-chat-bar ${className}`}
      style={{
        backgroundColor: 'var(--nav-bg)',
        backdropFilter: 'blur(20px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
      }}
    >
      <div
        className="relative max-w-2xl mx-auto px-4 pt-3 pb-3"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >

        {/* Agent G identity badge */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] tracking-wide font-medium"
            style={{ backgroundColor: 'rgba(34,211,238,0.06)', color: 'var(--color-accent)', border: '1px solid rgba(34,211,238,0.12)' }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ backgroundColor: 'var(--color-accent)' }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
            </span>
            {labels.poweredBy}
          </div>
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
  )
}
