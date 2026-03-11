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
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      {/* Cinematic ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 60% 50% at 50% 60%, rgba(99,102,241,0.08) 0%, transparent 70%),
            radial-gradient(ellipse 40% 40% at 30% 80%, rgba(139,92,246,0.06) 0%, transparent 60%),
            radial-gradient(ellipse 40% 40% at 70% 80%, rgba(34,211,238,0.05) 0%, transparent 60%)
          `,
        }}
      />
      <div className="relative max-w-lg mx-auto text-center flex flex-col items-center gap-6">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
          {c.title}
        </h2>
        <p className="text-sm sm:text-base" style={{ color: 'var(--color-text-secondary)' }}>
          {CTA_SUB[language] || CTA_SUB.en}
        </p>
        <Link
          href={`/${language}/signup`}
          className="group/cta inline-flex items-center gap-2 text-[14px] font-semibold px-8 py-3.5 rounded-full transition-all duration-300 active:scale-[0.97] hover:shadow-[0_0_30px_rgba(99,102,241,0.3)]"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
        >
          {c.button}
          <span className="ml-1 transition-transform duration-200 group-hover/cta:translate-x-0.5">→</span>
        </Link>
      </div>
    </section>
  )
}
