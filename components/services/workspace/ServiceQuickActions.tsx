'use client'

/**
 * ServiceQuickActions — Horizontal scrollable quick action pills.
 * Each service gets its own relevant quick actions.
 */

import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { ServiceQuickAction } from '@/lib/services/workspace-config'

type LocaleKey = 'en' | 'ka' | 'ru'

interface ServiceQuickActionsProps {
  actions: ServiceQuickAction[]
  onAction: (prompt: string) => void
}

export function ServiceQuickActions({ actions, onAction }: ServiceQuickActionsProps) {
  const { language } = useLanguage()
  const lang = (language as LocaleKey) || 'en'

  if (actions.length === 0) return null

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1 px-1">
      {actions.map(action => {
        const label = action.label[lang] || action.label.en
        return (
          <button
            key={action.id}
            onClick={() => onAction(action.prompt)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] sm:text-[13px] font-medium whitespace-nowrap transition-all duration-200 active:scale-[0.97] shrink-0"
            style={{
              backgroundColor: 'rgba(255,255,255,0.04)',
              color: 'var(--color-text)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(34,211,238,0.3)'
              ;(e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(34,211,238,0.06)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)'
              ;(e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.04)'
            }}
          >
            <span className="text-sm">{action.icon}</span>
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}
