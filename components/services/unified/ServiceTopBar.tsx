'use client'

/**
 * ServiceTopBar — Minimal top bar inside the unified service shell.
 *
 * Shows: hamburger toggle (mobile), active service identity, breadcrumbs,
 * command bar trigger, credits badge, and quick-action dots.
 *
 * Neo-Cosmic: ultra-thin glass bar, blurred backdrop, subtle glow.
 */

import { motion } from 'framer-motion'
import Link from 'next/link'

interface ServiceItem {
  slug: string
  title: string
  name: string
  icon: string
  description: string
}

interface ServiceTopBarProps {
  activeService?: ServiceItem
  onCommandBar: () => void
  onDockToggle: () => void
  locale: string
}

const T = {
  services: { en: 'Services', ka: 'სერვისები', ru: 'Сервисы' },
  quickSwitch: { en: '⌘K to switch', ka: '⌘K გადართვა', ru: '⌘K переключение' },
  home: { en: 'Home', ka: 'მთავარი', ru: 'Главная' },
}

export function ServiceTopBar({ activeService, onCommandBar, onDockToggle, locale }: ServiceTopBarProps) {
  const lang = locale as 'en' | 'ka' | 'ru'

  return (
    <header
      className="shrink-0 flex items-center justify-between gap-2 px-3 sm:px-4 relative z-10"
      style={{
        height: 48,
        background: 'rgba(6,8,18,0.8)',
        backdropFilter: 'blur(16px) saturate(1.2)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {/* Subtle bottom glow */}
      <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.1) 50%, transparent)' }} />

      {/* Left: mobile menu + breadcrumbs */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Mobile dock toggle */}
        <button
          onClick={onDockToggle}
          className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
          style={{ background: 'rgba(255,255,255,0.04)' }}
          aria-label="Toggle services"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(148,163,184,0.7)' }}>
            <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" />
            <rect width="7" height="7" x="3" y="14" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" />
          </svg>
        </button>

        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1 min-w-0 text-xs" aria-label="Breadcrumb">
          <Link
            href={`/${lang}`}
            className="shrink-0 transition-colors hover:opacity-80"
            style={{ color: 'rgba(148,163,184,0.4)' }}
          >
            {T.home[lang] || T.home.en}
          </Link>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: 'rgba(148,163,184,0.2)' }}>
            <path d="m9 18 6-6-6-6" />
          </svg>
          <Link
            href={`/${lang}/services`}
            className="shrink-0 transition-colors hover:opacity-80"
            style={{ color: 'rgba(148,163,184,0.4)' }}
          >
            {T.services[lang] || T.services.en}
          </Link>

          {activeService && (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: 'rgba(148,163,184,0.2)' }}>
                <path d="m9 18 6-6-6-6" />
              </svg>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm leading-none">{activeService.icon}</span>
                <motion.span
                  key={activeService.slug}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="font-medium truncate"
                  style={{ color: '#00d4ff' }}
                >
                  {activeService.title}
                </motion.span>
              </div>
            </>
          )}
        </nav>
      </div>

      {/* Right: command bar trigger */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onCommandBar}
          className="flex items-center gap-2 h-8 px-3 rounded-lg transition-all duration-150 group"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
          aria-label="Open command bar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(148,163,184,0.5)' }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <span className="text-xs hidden sm:inline" style={{ color: 'rgba(148,163,184,0.4)' }}>
            {T.quickSwitch[lang] || T.quickSwitch.en}
          </span>
          <kbd className="hidden sm:inline px-1 py-0.5 rounded text-[10px] font-mono" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.35)', border: '1px solid rgba(255,255,255,0.06)' }}>
            ⌘K
          </kbd>
        </button>
      </div>
    </header>
  )
}
