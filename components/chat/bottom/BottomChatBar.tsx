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
    <div className={`bottom-chat-bar ${className}`}>
      <div className="relative max-w-2xl mx-auto">

        {/* Agent G identity badge */}
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] tracking-wide font-medium"
            style={{ backgroundColor: 'rgba(34,211,238,0.06)', color: 'var(--color-accent)', border: '1px solid rgba(34,211,238,0.12)' }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ backgroundColor: 'var(--color-accent)' }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
            </span>
            {labels.poweredBy}
          </div>
        </div>

        {/* Greeting text — landing only */}
        {mode === 'landing' && (
          <p className="text-center text-sm sm:text-base mb-4 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {labels.greeting}
          </p>
        )}

        {/* Quick actions */}
        <div className="mb-3">
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

        {/* Subtle legal / helper text */}
        {mode === 'landing' && (
          <p className="text-center text-[10px] mt-2.5 tracking-wide" style={{ color: 'var(--color-text-tertiary)', opacity: 0.6 }}>
            {lang === 'ka' ? 'Agent G დაგეხმარებათ ნებისმიერი AI სერვისის გამოყენებაში'
              : lang === 'ru' ? 'Agent G поможет с любым AI-сервисом'
              : 'Agent G will help you use any AI service'}
          </p>
        )}
      </div>
    </div>
  )
}
