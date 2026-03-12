'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const CTA_COPY = {
  en: { title: 'Start building with AI today', cta1: 'Create Free Account', cta2: 'Explore Platform', sub: 'Free to start. No credit card required. All 17 services available.' },
  ka: { title: 'დაიწყეთ AI-თ შენება დღესვე', cta1: 'უფასო ანგარიშის შექმნა', cta2: 'პლატფორმის ნახვა', sub: 'უფასო დაწყება. საკრედიტო ბარათი არ არის საჭირო. ყველა 17 სერვისი ხელმისაწვდომია.' },
  ru: { title: 'Начните создавать с AI сегодня', cta1: 'Создать бесплатный аккаунт', cta2: 'Обзор платформы', sub: 'Бесплатный старт. Кредитная карта не нужна. Все 17 сервисов доступны.' },
} as const

export function LandingCTA() {
  const { language } = useLanguage()
  const c = CTA_COPY[language] || CTA_COPY.en

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-24 sm:py-32 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(99,102,241,0.10) 0%, transparent 70%)' }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 40% 40% at 30% 80%, rgba(139,92,246,0.08) 0%, transparent 60%)' }} />

      <div className="relative max-w-3xl mx-auto text-center flex flex-col items-center gap-6">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
          {c.title}
        </h2>
        <p className="text-sm sm:text-base max-w-xl" style={{ color: 'var(--color-text-secondary)' }}>
          {c.sub}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
          <Link
            href={`/${language}/signup`}
            className="inline-flex items-center gap-2 text-sm font-semibold px-8 py-4 rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/20"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          >
            {c.cta1}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </Link>
          <Link
            href={`/${language}/services`}
            className="inline-flex items-center gap-2 text-sm font-semibold px-8 py-4 rounded-xl transition-all duration-200 hover:-translate-y-0.5"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
          >
            {c.cta2}
          </Link>
        </div>
      </div>
    </section>
  )
}
