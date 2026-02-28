'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'

export function ComplianceNotice() {
  const [dismissed, setDismissed] = useState(false)
  const t = useTranslations('business.compliance')

  if (dismissed) return null

  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-sm mt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-amber-400 mb-1">{t('title')}</p>
          <ul className="text-white/60 space-y-1 list-disc list-inside">
            <li>{t('rule_1')}</li>
            <li>{t('rule_2')}</li>
            <li>{t('rule_3')}</li>
            <li>{t('rule_4')}</li>
          </ul>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-white/30 hover:text-white/60 flex-shrink-0 text-lg leading-none"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}
