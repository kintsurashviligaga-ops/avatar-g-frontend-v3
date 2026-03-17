'use client'

/**
 * ServiceOutputCard — Shown after an assistant response with output.
 * Displays a result summary card with transfer/continue actions.
 */

import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { TransferAction } from '@/lib/services/workspace-config'

type LocaleKey = 'en' | 'ka' | 'ru'

interface ServiceOutputCardProps {
  serviceId: string
  serviceName: string
  serviceIcon: string
  onNavigate: (slug: string) => void
  transfers: TransferAction[]
  locale: string
}

export function ServiceOutputCard({ serviceId, serviceName, serviceIcon, onNavigate, transfers, locale }: ServiceOutputCardProps) {
  const { language } = useLanguage()
  const lang = (language as LocaleKey) || 'en'

  if (transfers.length === 0) return null

  const heading = lang === 'ka' ? 'გაგრძელება' : lang === 'ru' ? 'Продолжить' : 'Continue with'

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="px-3.5 py-2.5">
        <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
          {heading}
        </p>
        <div className="flex gap-2 flex-wrap">
          {transfers.slice(0, 4).map(t => {
            const label = t.label[lang] || t.label.en
            return (
              <button
                key={t.targetService}
                onClick={() => onNavigate(t.targetService)}
                className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: 'var(--color-text-secondary)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(34,211,238,0.25)'
                  ;(e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(34,211,238,0.06)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)'
                  ;(e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.04)'
                }}
              >
                <span className="text-xs">{t.icon}</span>
                <span>{label}</span>
                <svg
                  width="10" height="10" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className="opacity-0 group-hover:opacity-60 transition-opacity"
                  style={{ color: 'var(--color-accent)' }}
                >
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
