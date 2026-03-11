'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const CTA_COPY = {
  en: { title: 'Ready to create?', button: 'Start Creating' },
  ka: { title: 'მზად ხართ შესაქმნელად?', button: 'შექმნის დაწყება' },
  ru: { title: 'Готовы творить?', button: 'Начать создание' },
} as const

const CTA_SUB = {
  en: 'Free to start. No credit card required.',
  ka: 'უფასო დაწყება. საკრედიტო ბარათი არ არის საჭირო.',
  ru: 'Бесплатный старт. Кредитная карта не нужна.',
} as const

export function LandingCTA() {
  const { language } = useLanguage()
  const c = CTA_COPY[language] || CTA_COPY.en

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-16 sm:py-24 overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 50% 60% at 50% 80%, var(--color-accent-soft) 0%, transparent 70%)' }}
      />
      <div className="relative max-w-lg mx-auto text-center flex flex-col items-center gap-5">
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
          {c.title}
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          {CTA_SUB[language] || CTA_SUB.en}
        </p>
        <Link
          href={`/${language}/signup`}
          className="inline-flex items-center gap-2 text-[14px] font-semibold px-8 py-3.5 rounded-full transition-all duration-200 active:scale-[0.97] hover:opacity-90"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
        >
          {c.button}
          <span className="ml-1">→</span>
        </Link>
      </div>
    </section>
  )
}
