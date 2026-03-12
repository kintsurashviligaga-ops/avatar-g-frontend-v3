'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { SERVICES } from '@/lib/services/catalog'

const COPY = {
  en: { eyebrow: '17 AI Services', title: 'Everything you need to create', sub: 'One platform. Every creative and business tool.', viewAll: 'View All Services' },
  ka: { eyebrow: '17 AI სერვისი', title: 'ყველაფერი შესაქმნელად', sub: 'ერთი პლატფორმა. ყველა შემოქმედებითი და ბიზნეს ინსტრუმენტი.', viewAll: 'ყველა სერვისის ნახვა' },
  ru: { eyebrow: '17 AI-сервисов', title: 'Всё для создания контента', sub: 'Одна платформа. Все творческие и бизнес-инструменты.', viewAll: 'Все сервисы' },
} as const

export function ServicesOverview() {
  const { language } = useLanguage()
  const lang = language as 'en' | 'ka' | 'ru'
  const c = COPY[lang] || COPY.en
  const lh = (p: string) => '/' + language + p

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 30%, rgba(99,102,241,0.04) 0%, transparent 70%)' }} />

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 sm:mb-16">
          <p className="text-[11px] tracking-[0.25em] uppercase font-medium mb-3" style={{ color: 'var(--color-accent)' }}>{c.eyebrow}</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>{c.title}</h2>
          <p className="mt-4 text-base sm:text-lg max-w-2xl mx-auto" style={{ color: 'var(--color-text-secondary)' }}>{c.sub}</p>
        </div>

        {/* Services grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {SERVICES.map(svc => (
            <Link
              key={svc.slug}
              href={lh(`/services/${svc.slug}`)}
              className="group relative flex flex-col items-start gap-3 p-5 sm:p-6 rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-indigo-500/5"
              style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}
            >
              {/* Hover glow */}
              <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ boxShadow: 'inset 0 0 0 1px var(--color-accent), 0 0 20px rgba(99,102,241,0.08)' }} />
              <span className="text-2xl transition-transform duration-300 group-hover:scale-110">{svc.icon}</span>
              <div>
                <h3 className="text-sm font-semibold mb-1 transition-colors group-hover:text-[var(--color-accent)]" style={{ color: 'var(--color-text)' }}>
                  {svc.title[lang] || svc.title.en}
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
                  {svc.description[lang] || svc.description.en}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* View all link */}
        <div className="text-center mt-10">
          <Link
            href={lh('/services')}
            className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-xl transition-all hover:-translate-y-0.5"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
          >
            {c.viewAll}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </Link>
        </div>
      </div>
    </section>
  )
}
