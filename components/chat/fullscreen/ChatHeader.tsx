'use client'

/**
 * ChatHeader — fixed app-style header for the fullscreen chat.
 * Left: back button. Center: Agent G title. Right: account icon.
 */

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { CHAT_LABELS, type ChatLocale } from './config'

export function ChatHeader() {
  const { language } = useLanguage()
  const lang = (language as ChatLocale) || 'en'
  const labels = CHAT_LABELS[lang] || CHAT_LABELS.en
  const lh = (p: string) => '/' + language + p

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6 shrink-0"
      style={{
        height: 'calc(56px + env(safe-area-inset-top, 0px))',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        backgroundColor: 'var(--color-bg)',
        borderBottom: '1px solid var(--color-border)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      {/* Left: Back button */}
      <Link
        href={lh('/')}
        className="flex items-center justify-center w-10 h-10 -ml-1 rounded-xl transition-colors"
        style={{ color: 'var(--color-text-secondary)' }}
        aria-label="Back"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      </Link>

      {/* Center: Title + status */}
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ backgroundColor: 'var(--color-accent)' }} />
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
        </span>
        <h1 className="text-lg sm:text-xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
          {labels.title}
        </h1>
      </div>

      {/* Right: Account */}
      <Link
        href={lh('/login')}
        className="flex items-center justify-center w-10 h-10 -mr-1 rounded-xl transition-colors"
        style={{ color: 'var(--color-text-secondary)' }}
        aria-label="Account"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </Link>
    </header>
  )
}
