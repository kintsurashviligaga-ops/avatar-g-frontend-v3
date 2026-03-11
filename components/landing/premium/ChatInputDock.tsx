'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const PLACEHOLDERS = {
  en: 'Ask MyAvatar to create, edit, or generate...',
  ka: 'სთხოვეთ MyAvatar-ს შექმნა, რედაქტირება ან გენერაცია...',
  ru: 'Попросите MyAvatar создать, изменить или сгенерировать...',
} as const

export function ChatInputDock() {
  const { language } = useLanguage()
  const router = useRouter()
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed) return
    const encoded = encodeURIComponent(trimmed)
    router.push(`/${language}/services?prompt=${encoded}`)
  }, [value, language, router])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <section className="px-4 sm:px-6 lg:px-10 pb-10 sm:pb-14">
      <div className="max-w-2xl mx-auto">
        <div
          className="relative flex items-center rounded-2xl transition-all duration-200"
          style={{
            backgroundColor: 'var(--input-bg)',
            border: `1px solid ${focused ? 'var(--input-focus)' : 'var(--input-border)'}`,
            boxShadow: focused ? '0 0 0 3px var(--color-accent-soft)' : 'none',
          }}
        >
          {/* Attach button (paperclip) */}
          <button
            type="button"
            className="flex-shrink-0 ml-3 p-1.5 rounded-lg transition-colors hover:opacity-70"
            style={{ color: 'var(--color-text-tertiary)' }}
            aria-label="Attach"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>

          {/* Input */}
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={PLACEHOLDERS[language] || PLACEHOLDERS.en}
            className="flex-1 bg-transparent text-sm sm:text-[15px] py-3.5 sm:py-4 px-3 outline-none"
            style={{ color: 'var(--color-text)', border: 'none', boxShadow: 'none' }}
          />

          {/* Send button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="flex-shrink-0 mr-3 p-2 rounded-xl transition-all duration-200 disabled:opacity-20 active:scale-95"
            style={{
              color: value.trim() ? '#fff' : 'var(--color-text-tertiary)',
              backgroundColor: value.trim() ? 'var(--color-accent)' : 'transparent',
            }}
            aria-label="Send"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  )
}
