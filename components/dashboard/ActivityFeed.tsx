'use client'

import { useTranslations } from 'next-intl'
import { StatusBadge } from '@/components/ui/StatusBadge'

export type ActivityItem = {
  id: string
  serviceIcon: string
  serviceName: string
  summary: string
  status: 'queued' | 'processing' | 'done' | 'failed'
  timestamp: string
}

interface ActivityFeedProps {
  items: ActivityItem[]
  locale: string
}

export function ActivityFeed({ items, locale }: ActivityFeedProps) {
  const t = useTranslations('dashboard')

  if (items.length === 0) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
      >
        <div
          className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center text-2xl"
          style={{ background: 'rgba(0,212,255,0.06)' }}
        >
          ✨
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          {t('activity.empty')}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
          {t('activity.emptyHint')}
        </p>
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl divide-y"
      style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
          {t('sections.activity')}
        </h3>
        <button className="text-xs font-medium" style={{ color: '#00d4ff' }}>
          {t('activity.viewAll')}
        </button>
      </div>
      {items.map(item => (
        <div key={item.id} className="flex items-center gap-3 px-4 py-3">
          <span className="text-lg shrink-0">{item.serviceIcon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
              {item.summary}
            </p>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              {item.serviceName} · {item.timestamp}
            </p>
          </div>
          <StatusBadge status={item.status} locale={locale} />
        </div>
      ))}
    </div>
  )
}
