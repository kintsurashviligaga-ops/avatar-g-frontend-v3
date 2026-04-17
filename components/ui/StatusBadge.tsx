'use client'

import { cn } from '@/lib/utils'

type Status = 'queued' | 'processing' | 'done' | 'failed'

const STATUS_STYLES: Record<Status, { bg: string; text: string; dot: string; label: Record<string, string> }> = {
  queued: {
    bg: 'bg-slate-400/10 border-slate-400/20',
    text: 'text-slate-400',
    dot: 'bg-slate-400',
    label: { en: 'Queued', ka: 'რიგში', ru: 'В очереди' },
  },
  processing: {
    bg: 'bg-[rgba(0,212,255,0.08)] border-[rgba(0,212,255,0.2)]',
    text: 'text-[#00d4ff]',
    dot: 'bg-[#00d4ff] animate-pulse',
    label: { en: 'Processing', ka: 'მუშავდება', ru: 'Обработка' },
  },
  done: {
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
    label: { en: 'Done', ka: 'დასრულებული', ru: 'Готово' },
  },
  failed: {
    bg: 'bg-red-500/10 border-red-500/20',
    text: 'text-red-400',
    dot: 'bg-red-400',
    label: { en: 'Failed', ka: 'შეცდომა', ru: 'Ошибка' },
  },
}

interface StatusBadgeProps {
  status: Status
  locale?: string
  className?: string
}

export function StatusBadge({ status, locale = 'en', className }: StatusBadgeProps) {
  const s = STATUS_STYLES[status]
  const lang = ['ka', 'en', 'ru'].includes(locale) ? locale : 'en'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
        s.bg, s.text,
        className,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', s.dot)} />
      {s.label[lang]}
    </span>
  )
}
