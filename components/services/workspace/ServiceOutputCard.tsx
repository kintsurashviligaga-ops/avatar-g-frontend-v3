'use client'

/**
 * ServiceOutputCard — Shown after an assistant response with output.
 * Displays a result summary card with transfer/continue actions.
 * Connects to the ServiceContext for cross-service output tracking.
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

export function ServiceOutputCard({ serviceId: _serviceId, serviceName: _serviceName, serviceIcon: _serviceIcon, onNavigate, transfers, locale: _locale }: ServiceOutputCardProps) {
  const { language } = useLanguage()
  const lang = (language as LocaleKey) || 'en'

  if (transfers.length === 0) return null

  const heading = lang === 'ka' ? 'გაგრძელება სხვა სერვისით' : lang === 'ru' ? 'Продолжить в другом сервисе' : 'Continue in another service'

  return (
    <div className="mt-2 rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Header */}
      <div className="px-3.5 pt-3 pb-2 flex items-center gap-2">
        <div className="w-1 h-1 rounded-full" style={{ background: '#22d3ee' }} />
        <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'rgba(34,211,238,0.6)' }}>
          {heading}
        </p>
      </div>

      {/* Transfer buttons */}
      <div className="px-3 pb-3 flex gap-2 flex-wrap">
        {transfers.slice(0, 4).map(t => {
          const label = t.label[lang] || t.label.en
          return (
            <button
              key={t.targetService}
              onClick={() => onNavigate(t.targetService)}
              className="group flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-medium transition-all duration-200 active:scale-[0.97] hover:scale-[1.01]"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.65)',
              }}
            >
              <span className="text-sm">{t.icon}</span>
              <span>{label}</span>
              <svg
                width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                className="opacity-30 group-hover:opacity-80 transition-all group-hover:translate-x-0.5"
                style={{ color: '#22d3ee' }}
              >
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </button>
          )
        })}
      </div>
    </div>
  )
}
