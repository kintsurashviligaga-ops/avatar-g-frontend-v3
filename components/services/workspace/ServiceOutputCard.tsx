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
    <div className="chat-transfer-card">
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
                className="chat-transfer-btn"
              >
                <span className="text-xs">{t.icon}</span>
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
