'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { SERVICES } from '@/lib/services/catalog'

const SECTION_COPY = {
  en: { eyebrow: 'AI System', title: 'One orchestrator. Every module.' },
  ka: { eyebrow: 'AI სისტემა', title: 'ერთი ორკესტრატორი. ყველა მოდული.' },
  ru: { eyebrow: 'AI-система', title: 'Один оркестратор. Все модули.' },
} as const

const AGENT_G_COPY = {
  en: { label: 'AI Coordinator', status: 'Online', cta: 'Launch Agent G' },
  ka: { label: 'AI კოორდინატორი', status: 'ონლაინ', cta: 'Agent G-ის გაშვება' },
  ru: { label: 'AI-координатор', status: 'Онлайн', cta: 'Запустить Agent G' },
} as const

/* All services except Agent G — these are the module cards */
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

      <div className="relative max-w-5xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-12 sm:mb-16">
          <p
            className="text-[11px] tracking-[0.25em] uppercase font-medium mb-3"
            style={{ color: 'var(--color-accent)' }}
          >
            {copy.eyebrow}
          </p>
          <h2
            className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight"
            style={{ color: 'var(--color-text)' }}
          >
            {copy.title}
          </h2>
        </div>

        {/* ── Agent G — Central Node ── */}
        <Link
          href={lh('/services/agent-g')}
          className="group relative block max-w-md mx-auto mb-10 sm:mb-14 rounded-2xl p-6 sm:p-8 text-center transition-all duration-300 hover:-translate-y-1"
          style={{
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 0 40px rgba(99,102,241,0.08), 0 8px 32px rgba(0,0,0,0.10)',
          }}
        >
          {/* Accent glow rim */}
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{ boxShadow: 'inset 0 0 0 1px var(--color-accent), 0 0 30px rgba(99,102,241,0.15)' }}
          />
          {/* Top glow */}
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 80% 40% at 50% 0%, var(--color-accent-soft) 0%, transparent 70%)' }}
          />

          <div className="relative flex flex-col items-center gap-4">
            {/* Status */}
            <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: '#4ade80' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              {ag.status}
            </span>
            {/* Icon */}
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
              style={{ backgroundColor: 'var(--color-accent-soft)' }}
            >
              🤖
            </div>
            {/* Title */}
            <div>
              <h3 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
                Agent G
              </h3>
              <p className="text-xs mt-1 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {ag.label}
              </p>
            </div>
            {/* CTA */}
            <span
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold mt-1 transition-colors duration-200"
              style={{ color: 'var(--color-accent)' }}
            >
              {ag.cta}
              <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
            </span>
          </div>
        </Link>

        {/* ── Connection line ── */}
        <div className="flex justify-center mb-8 sm:mb-10">
          <div className="w-px h-8 sm:h-10" style={{ background: 'linear-gradient(to bottom, var(--color-accent), var(--color-border))' }} />
        </div>

        {/* ── Module grid ── */}
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3">
          {MODULES.map(svc => (
            <Link
              key={svc.slug}
              href={lh(`/services/${svc.slug}`)}
              className="service-card group relative flex flex-col items-center text-center gap-2.5 p-4 sm:p-5 rounded-xl transition-all duration-300 hover:-translate-y-1 active:scale-[0.97]"
              style={{
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--color-border)',
              }}
            >
              {/* Icon */}
              <span className="text-xl sm:text-2xl leading-none transition-transform duration-300 group-hover:scale-110">
                {svc.icon}
              </span>
              {/* Title */}
              <span
                className="text-[11px] sm:text-[12px] font-semibold leading-tight transition-colors duration-200 group-hover:text-[var(--color-accent)]"
                style={{ color: 'var(--color-text)' }}
              >
                {svc.title[lang] || svc.title.en}
              </span>
              {/* Hover glow */}
              <div
                className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{ boxShadow: 'inset 0 0 0 1px var(--color-accent), 0 0 16px rgba(99,102,241,0.10)' }}
              />
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
