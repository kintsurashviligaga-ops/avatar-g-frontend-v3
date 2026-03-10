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

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed) return
    // Navigate to the services page with the prompt as a query parameter
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
          className="relative flex items-center rounded-xl transition-all duration-200"
          style={{
            backgroundColor: 'var(--input-bg)',
            border: '1px solid var(--input-border)',
          }}
        >
          {/* Attach button */}
          <button
            type="button"
            className="flex-shrink-0 ml-2 p-2 rounded-lg transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            aria-label="Attach"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </button>

          {/* Input */}
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDERS[language] || PLACEHOLDERS.en}
            className="flex-1 bg-transparent text-sm sm:text-[15px] py-3.5 sm:py-4 px-3 outline-none"
            style={{ color: 'var(--color-text)', border: 'none', boxShadow: 'none' }}
          />

          {/* Send button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="flex-shrink-0 mr-2 p-2 rounded-lg transition-all duration-200 disabled:opacity-20 active:scale-95"
            style={{ color: value.trim() ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
            aria-label="Send"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  )
}
