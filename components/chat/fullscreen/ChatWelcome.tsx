'use client'

/**
 * ChatWelcome — empty state with greeting + quick action pills.
 * Shown when no messages exist yet.
 */

import { useLanguage } from '@/lib/i18n/LanguageContext'
import { CHAT_LABELS, QUICK_ACTIONS, type ChatLocale } from './config'

/* ── Clean minimal SVG icons for each MyAvatar service ── */
const SERVICE_ICONS: Record<string, React.ReactNode> = {
  avatar: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
  video: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="14" height="16" rx="2" /><path d="m22 7-6 5 6 5V7Z" />
    </svg>
  ),
  image: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  ),
  music: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
    </svg>
  ),
  text: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" />
    </svg>
  ),
  workflow: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
    </svg>
  ),
}

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

      {/* Quick action pills — real MyAvatar services */}
      <div className="flex flex-wrap gap-2.5 sm:gap-3">
        {QUICK_ACTIONS.map(action => {
          const label = action.label[lang] || action.label.en
          const prefill = action.prefillPrompt[lang] || action.prefillPrompt.en
          return (
            <button
              key={action.id}
              onClick={() => onQuickAction(action.intent, prefill)}
              className="group flex items-center gap-2.5 px-4 py-2.5 sm:px-5 sm:py-3 rounded-2xl text-[13px] sm:text-sm font-medium transition-all duration-200 active:scale-[0.97] hover:border-[color:var(--color-accent)]"
              style={{
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
              }}
            >
              <span className="shrink-0" style={{ color: 'var(--color-accent)' }}>
                {SERVICE_ICONS[action.icon] ?? null}
              </span>
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { SERVICE_ICONS }
