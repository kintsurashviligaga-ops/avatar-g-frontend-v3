'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const CTA_COPY = {
  en: { title: 'Ready to create?', button: 'Start Creating' },
  ka: { title: 'მზად ხართ შესაქმნელად?', button: 'შექმნის დაწყება' },
  ru: { title: 'Готовы творить?', button: 'Начать создание' },
} as const

export function LandingCTA() {
  const { language } = useLanguage()
  const c = CTA_COPY[language] || CTA_COPY.en

  return (
    <section className="px-4 sm:px-6 lg:px-10 py-14 sm:py-20">
      <div className="max-w-md mx-auto text-center flex flex-col items-center gap-6">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
          {c.title}
        </h2>
        <Link
          href={`/${language}/signup`}
          className="inline-flex items-center gap-2 text-[14px] font-semibold px-8 py-3.5 rounded-full transition-all duration-200 active:scale-[0.97]"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
        >
          {c.button}
          <span className="ml-1">→</span>
        </Link>
      </div>
    </section>
  )
}
