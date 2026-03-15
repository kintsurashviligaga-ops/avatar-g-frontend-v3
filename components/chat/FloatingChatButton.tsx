'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'

export function FloatingChatButton() {
  const { language } = useLanguage()
  const pathname = usePathname()

  // Hide on Agent G chat page (already in fullscreen chat)
  if (pathname?.includes('/services/agent-g')) return null

  const href = '/' + language + '/services/agent-g'

  return (
    <Link
      href={href}
      aria-label="Open Agent G Chat"
      className="
        fixed z-50 flex items-center justify-center
        w-14 h-14 rounded-full
        shadow-lg shadow-cyan-500/25
        transition-all duration-200
        hover:scale-105 hover:shadow-xl hover:shadow-cyan-500/30
        active:scale-95
      "
      style={{
        bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
        right: '1rem',
        backgroundColor: 'var(--color-accent)',
        color: '#fff',
      }}
    >
      {/* Chat bubble icon */}
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>

      {/* Subtle pulse ring */}
      <span
        className="absolute inset-0 rounded-full animate-ping opacity-20"
        style={{ backgroundColor: 'var(--color-accent)' }}
      />
    </Link>
  )
}
