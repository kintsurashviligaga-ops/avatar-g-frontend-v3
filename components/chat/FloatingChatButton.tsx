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
      aria-label={language === 'ka' ? 'Agent G ჩატი' : language === 'ru' ? 'Открыть Agent G' : 'Open Agent G Chat'}
      className="
        fixed z-50 flex items-center justify-center
        w-14 h-14 rounded-full
        transition-all duration-300
        hover:scale-105 hover:-translate-y-0.5
        active:scale-95
      "
      style={{
        bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
        right: '1rem',
        background: 'linear-gradient(135deg, #22d3ee 0%, #06b6d4 50%, #0891b2 100%)',
        color: '#fff',
        boxShadow: '0 4px 24px rgba(34,211,238,0.35), 0 8px 40px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2)',
      }}
    >
      {/* Chat bubble icon */}
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>

      {/* Subtle pulse ring */}
      <span
        className="absolute inset-[-3px] rounded-full animate-ping"
        style={{ backgroundColor: 'rgba(34,211,238,0.15)' }}
      />
    </Link>
  )
}
