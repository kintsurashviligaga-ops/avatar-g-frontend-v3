'use client'

/**
 * ChatWelcome — empty state with greeting + quick action pills.
 * Shown when no messages exist yet.
 */

import { useLanguage } from '@/lib/i18n/LanguageContext'
import { CHAT_LABELS, QUICK_ACTIONS, type ChatLocale } from './config'

interface Props {
  onQuickAction: (intent: string, prefill?: string) => void
}

export function ChatWelcome({ onQuickAction }: Props) {
  const { language } = useLanguage()
  const lang = (language as ChatLocale) || 'en'
  const labels = CHAT_LABELS[lang] || CHAT_LABELS.en

  return (
    <div className="flex-1 flex flex-col justify-center px-5 sm:px-8 py-12 sm:py-16 max-w-2xl mx-auto w-full">
      {/* Greeting */}
      <p className="text-sm sm:text-base font-medium mb-2" style={{ color: 'var(--color-accent)' }}>
        {labels.greeting} 👋
      </p>

      {/* Main heading */}
      <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight mb-3" style={{ color: 'var(--color-text)' }}>
        {labels.heading}
      </h2>

      {/* Helper text */}
      <p className="text-sm sm:text-base mb-8 sm:mb-10" style={{ color: 'var(--color-text-tertiary)' }}>
        {labels.helper}
      </p>

      {/* Quick action pills */}
      <div className="flex flex-wrap gap-2.5 sm:gap-3">
        {QUICK_ACTIONS.map(action => {
          const label = action.label[lang] || action.label.en
          const prefill = action.prefillPrompt?.[lang] || action.prefillPrompt?.en
          return (
            <button
              key={action.id}
              onClick={() => onQuickAction(action.intent, prefill)}
              className="group flex items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 rounded-full text-[13px] sm:text-sm font-medium transition-all duration-200 active:scale-[0.97]"
              style={{
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
              }}
            >
              <span className="text-base sm:text-lg">{action.icon}</span>
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
