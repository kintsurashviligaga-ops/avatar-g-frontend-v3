'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { SERVICES } from '@/lib/services/catalog'

const SECTION_COPY = {
  en: { eyebrow: 'AI System', title: 'One orchestrator. Every module.', allServices: 'All Services' },
  ka: { eyebrow: 'AI სისტემა', title: 'ერთი ორკესტრატორი. ყველა მოდული.', allServices: 'ყველა სერვისი' },
  ru: { eyebrow: 'AI-система', title: 'Один оркестратор. Все модули.', allServices: 'Все сервисы' },
} as const

const AGENT_G_COPY = {
  en: { label: 'AI Coordinator', status: 'Online', cta: 'Launch Agent G' },
  ka: { label: 'AI კოორდინატორი', status: 'ონლაინ', cta: 'Agent G-ის გაშვება' },
  ru: { label: 'AI-координатор', status: 'Онлайн', cta: 'Запустить Agent G' },
} as const

/* All services except Agent G */
const MODULES = SERVICES.filter(s => s.slug !== 'agent-g')

export default function FeatureGrid() {
  const { language } = useLanguage()
  const lang = language as 'ka' | 'en' | 'ru'
  const copy = SECTION_COPY[lang] || SECTION_COPY.en
  const ag = AGENT_G_COPY[lang] || AGENT_G_COPY.en
  const lh = (p: string) => '/' + language + p

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-16 sm:py-24 overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 70% 50% at 50% 40%, rgba(99,102,241,0.05) 0%, transparent 70%)',
        }}
      />

      <div className="relative max-w-4xl mx-auto">
        {/* Section header + All Services button */}
        <div className="text-center mb-10 sm:mb-14">
          <p
            className="text-[11px] tracking-[0.25em] uppercase font-medium mb-3"
            style={{ color: 'var(--color-accent)' }}
          >
            {copy.eyebrow}
          </p>
          <h2
            className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-6"
            style={{ color: 'var(--color-text)' }}
          >
            {copy.title}
          </h2>
          <Link
            href={lh('/services')}
            className="btn-ghost inline-flex items-center gap-2 text-[13px] px-6 py-2.5 rounded-xl"
          >
            {copy.allServices}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </Link>
        </div>

        {/* ── Hub layout: Agent G featured + module grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-5 sm:gap-6">

          {/* Agent G — featured card (left on desktop, top on mobile) */}
          <Link
            href={lh('/services/agent-g')}
            className="group relative flex flex-col items-center justify-center text-center rounded-2xl p-6 sm:p-8 transition-all duration-300 hover:-translate-y-1"
            style={{
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--color-border)',
              boxShadow: '0 0 40px rgba(99,102,241,0.08), 0 8px 32px rgba(0,0,0,0.08)',
            }}
          >
            {/* Hover glow rim */}
            <div
              className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{ boxShadow: 'inset 0 0 0 1px var(--color-accent), 0 0 30px rgba(99,102,241,0.12)' }}
            />
            {/* Top accent glow */}
            <div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{ background: 'radial-gradient(ellipse 80% 40% at 50% 0%, var(--color-accent-soft) 0%, transparent 70%)' }}
            />

            <div className="relative flex flex-col items-center gap-3.5">
              <span className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: '#16a34a' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                {ag.status}
              </span>
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                style={{ backgroundColor: 'var(--color-accent-soft)' }}
              >
                🤖
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
                  Agent G
                </h3>
                <p className="text-[11px] mt-0.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  {ag.label}
                </p>
              </div>
              <span
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold transition-colors duration-200"
                style={{ color: 'var(--color-accent)' }}
              >
                {ag.cta}
                <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
              </span>
            </div>
          </Link>

          {/* Module grid (right on desktop, below on mobile) */}
          <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-3 gap-2 sm:gap-2.5">
            {MODULES.map(svc => (
              <Link
                key={svc.slug}
                href={lh(`/services/${svc.slug}`)}
                className="service-card group relative flex flex-col items-center text-center gap-2 p-3 sm:p-4 rounded-xl transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.97]"
                style={{
                  backgroundColor: 'var(--card-bg)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <span className="text-lg sm:text-xl leading-none transition-transform duration-300 group-hover:scale-110">
                  {svc.icon}
                </span>
                <span
                  className="text-[10px] sm:text-[11px] font-semibold leading-tight transition-colors duration-200 group-hover:text-[var(--color-accent)]"
                  style={{ color: 'var(--color-text)' }}
                >
                  {svc.title[lang] || svc.title.en}
                </span>
                {/* Hover glow */}
                <div
                  className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{ boxShadow: 'inset 0 0 0 1px var(--color-accent), 0 0 12px rgba(99,102,241,0.08)' }}
                />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
