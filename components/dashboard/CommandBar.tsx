'use client'

import { useTranslations } from 'next-intl'
import { CommandInput } from '@/components/ui/CommandInput'
import Link from 'next/link'

interface CommandBarProps {
  locale: string
  onSubmit?: (message: string) => void
  loading?: boolean
}

export function CommandBar({ locale, onSubmit, loading }: CommandBarProps) {
  const t = useTranslations('dashboard')

  const quickActions = [
    { key: 'avatar', icon: '🧑', slug: 'avatar' },
    { key: 'image', icon: '🖼️', slug: 'image' },
    { key: 'video', icon: '🎬', slug: 'video' },
    { key: 'voice', icon: '🎙️', slug: 'music' },
    { key: 'music', icon: '🎵', slug: 'music' },
  ] as const

  return (
    <div className="space-y-3">
      <CommandInput
        placeholder={t('commandBar.placeholder')}
        onSubmit={onSubmit}
        loading={loading}
      />
      <div className="flex flex-wrap gap-2">
        {quickActions.map(a => (
          <Link
            key={a.key}
            href={`/${locale}/services/${a.slug}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 hover:scale-[1.03]"
            style={{
              background: 'rgba(0,212,255,0.06)',
              border: '1px solid rgba(0,212,255,0.12)',
              color: '#00d4ff',
            }}
          >
            <span>{a.icon}</span>
            <span>{t(`commandBar.quickActions.${a.key}`)}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
