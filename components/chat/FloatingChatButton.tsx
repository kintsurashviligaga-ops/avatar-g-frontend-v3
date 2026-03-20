'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { CallScreen } from '@/components/chat/grok/CallScreen'

export function FloatingChatButton() {
  const { language } = useLanguage()
  const pathname = usePathname()
  const [callOpen, setCallOpen] = useState(false)

  // Hide on Agent G chat page (already in fullscreen chat)
  if (pathname?.includes('/services/agent-g')) return null

  const chatHref = '/' + language + '/services/agent-g'
  const callLabel = language === 'ka' ? 'Agent G-ს დარეკვა' : language === 'ru' ? 'Позвонить Agent G' : 'Call Agent G'
  const chatLabel = language === 'ka' ? 'Agent G ჩატი' : language === 'ru' ? 'Открыть Agent G' : 'Open Agent G Chat'

  return (
    <>
      {/* ── CALL Button — Bottom Left ── */}
      <button
        onClick={() => setCallOpen(true)}
        aria-label={callLabel}
        type="button"
        className="floating-call-btn fixed bottom-20 md:bottom-6 left-4 z-[9999] flex items-center justify-center w-14 h-14 rounded-full transition-all duration-300 hover:scale-105 hover:-translate-y-0.5 active:scale-95"
        style={{
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 50%, #b91c1c 100%)',
          color: '#fff',
          boxShadow: '0 4px 24px rgba(239,68,68,0.35), 0 8px 40px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2)',
        }}
      >
        {/* Phone icon */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
        <span className="absolute inset-[-3px] rounded-full pointer-events-none floating-call-pulse" />
      </button>

      {/* ── CHAT Button — Bottom Right ── */}
      <Link
        href={chatHref}
        aria-label={chatLabel}
        className="floating-chat-btn fixed bottom-20 md:bottom-6 right-4 z-[9999] flex items-center justify-center w-14 h-14 rounded-full transition-all duration-300 hover:scale-105 hover:-translate-y-0.5 active:scale-95"
        style={{
          background: 'linear-gradient(135deg, #22d3ee 0%, #06b6d4 50%, #0891b2 100%)',
          color: '#fff',
          boxShadow: '0 4px 24px rgba(34,211,238,0.35), 0 8px 40px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2)',
        }}
      >
        {/* Chat bubble icon */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        <span className="absolute inset-[-3px] rounded-full pointer-events-none floating-chat-pulse" />
      </Link>

      {/* Call Screen overlay */}
      <CallScreen open={callOpen} onClose={() => setCallOpen(false)} />
    </>
  )
}
