'use client'

/**
 * ServiceHeader — Top header bar for every service workspace.
 * Shows service icon, name, agent badge, and menu toggle.
 */

import { useLanguage } from '@/lib/i18n/LanguageContext'

import Link from 'next/link'

interface ServiceHeaderProps {
  serviceId: string
  serviceName: string
  serviceIcon: string
  onMenuToggle: () => void
  onBack: () => void
}

export function ServiceHeader({ serviceId, serviceName, serviceIcon, onMenuToggle, onBack }: ServiceHeaderProps) {
  const { language } = useLanguage()

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between gap-3 px-3 sm:px-4"
      style={{
        backgroundColor: 'rgba(6,12,26,0.85)',
        backdropFilter: 'blur(16px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        height: 'calc(56px + env(safe-area-inset-top, 0px))',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      {/* Left: Back + Service identity */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          onClick={onBack}
          className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors shrink-0"
          style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)' }}
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <Link href={`/${language}/services/${serviceId}`} className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.2), rgba(6,182,212,0.1))', border: '1px solid rgba(34,211,238,0.15)' }}
          >
            <span className="text-base">{serviceIcon}</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>
              {serviceName}
            </h1>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>Agent G</span>
            </div>
          </div>
        </Link>
      </div>

      {/* Right: Menu toggle */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onMenuToggle}
          className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
          style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)' }}
          aria-label="Menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>
    </header>
  )
}
