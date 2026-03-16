'use client'

/**
 * CrossServiceTransfer — Appears after output is generated.
 * Shows buttons to transfer the output to another service.
 */

import { useLanguage } from '@/lib/i18n/LanguageContext'
import { useRouter } from 'next/navigation'
import type { TransferAction } from '@/lib/services/workspace-config'

type LocaleKey = 'en' | 'ka' | 'ru'

interface CrossServiceTransferProps {
  transfers: TransferAction[]
  outputReady: boolean
  locale: string
}

export function CrossServiceTransfer({ transfers, outputReady, locale }: CrossServiceTransferProps) {
  const { language } = useLanguage()
  const router = useRouter()
  const lang = (language as LocaleKey) || 'en'

  if (!outputReady || transfers.length === 0) return null

  const heading = lang === 'ka' ? 'გაგრძელება სხვა სერვისით' : lang === 'ru' ? 'Продолжить в другом сервисе' : 'Continue with another service'

  return (
    <div className="px-4 py-3 space-y-2">
      <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
        {heading}
      </p>
      <div className="flex gap-2 flex-wrap">
        {transfers.map(t => {
          const label = t.label[lang] || t.label.en
          return (
            <button
              key={t.targetService}
              onClick={() => {
                // Navigate to target service, passing output context
                router.push(`/${locale}/services/${t.targetService}?from=${t.targetService}&transfer=true`)
              }}
              className="group flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-medium transition-all"
              style={{
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: 'var(--color-text-secondary)'
              }}
            >
              <span className="text-[14px]">{t.icon}</span>
              <span>{label}</span>
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="opacity-40 group-hover:opacity-100 transition-all group-hover:translate-x-0.5"
                style={{ color: 'var(--color-accent)' }}
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
