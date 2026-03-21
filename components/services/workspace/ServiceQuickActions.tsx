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
    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 px-1">
      {actions.map(action => {
        const label = action.label[lang] || action.label.en
        return (
          <button
            key={action.id}
            onClick={() => onAction(action.prompt)}
            className="chat-chip"
          >
            <span className="text-sm">{action.icon}</span>
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}
