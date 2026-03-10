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
    <section className="px-4 sm:px-6 lg:px-10 py-16 sm:py-24">
      <div className="max-w-md mx-auto text-center flex flex-col items-center gap-6">
        <h2 className="text-2xl sm:text-3xl font-semibold text-white/85 tracking-tight">
          {c.title}
        </h2>
        <Link
          href={`/${language}/signup`}
          className="inline-flex items-center gap-2 bg-white text-black text-[14px] font-semibold px-8 py-3.5 rounded-full hover:bg-white/90 hover:shadow-[0_0_40px_rgba(255,255,255,0.12)] transition-all duration-300 active:scale-[0.97]"
        >
          {c.button}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </Link>
      </div>
    </section>
  )
}
