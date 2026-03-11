'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const COPY = {
  en: {
    eyebrow: 'AI Orchestrator',
    title: 'Agent G',
    description: 'Your flagship AI command center — routes tasks across every service, orchestrates workflows, and delivers results in one unified interface.',
    cta: 'Launch Agent G',
    chips: ['Multi-Service Routing', 'Smart Orchestration', 'Auto-Pipeline'],
    status: 'Online',
  },
  ka: {
    eyebrow: 'AI ორკესტრატორი',
    title: 'Agent G',
    description: 'თქვენი მთავარი AI მართვის ცენტრი — ანაწილებს ამოცანებს ყველა სერვისზე, მართავს პროცესებს და აწვდის შედეგებს ერთიან ინტერფეისში.',
    cta: 'Agent G-ის გაშვება',
    chips: ['მულტი-სერვისი', 'ჭკვიანი ორკესტრაცია', 'ავტო-პაიპლაინი'],
    status: 'ონლაინ',
  },
  ru: {
    eyebrow: 'AI-оркестратор',
    title: 'Agent G',
    description: 'Ваш флагманский AI-центр управления — направляет задачи по всем сервисам, оркестрирует процессы и выдаёт результаты в едином интерфейсе.',
    cta: 'Запустить Agent G',
    chips: ['Мульти-сервис', 'Умная оркестрация', 'Авто-пайплайн'],
    status: 'Онлайн',
  },
} as const

export function AgentGHero() {
  const { language } = useLanguage()
  const c = COPY[language] || COPY.en

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-16 sm:py-24 overflow-hidden">
      {/* Ambient background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 70% 50% at 50% 50%, rgba(99,102,241,0.06) 0%, transparent 70%),
            radial-gradient(ellipse 40% 40% at 30% 70%, rgba(139,92,246,0.04) 0%, transparent 60%),
            radial-gradient(ellipse 40% 40% at 70% 30%, rgba(99,102,241,0.03) 0%, transparent 60%)
          `,
        }}
      />

      <div className="relative max-w-2xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-8 sm:mb-10">
          <p className="text-[11px] tracking-[0.25em] uppercase font-medium mb-3" style={{ color: 'var(--color-accent)' }}>
            {c.eyebrow}
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
            {c.title}
          </h2>
        </div>

        {/* Card */}
        <div
          className="relative rounded-2xl overflow-hidden p-6 sm:p-8 lg:p-10"
          style={{
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          }}
        >
          {/* Subtle accent glow at top — dark only */}
          <div
            className="absolute inset-0 pointer-events-none rounded-2xl"
            style={{
              background: 'radial-gradient(ellipse 80% 40% at 50% 0%, var(--color-accent-soft) 0%, transparent 70%)',
            }}
          />

          <div className="relative flex flex-col items-center text-center gap-5">
            {/* Status indicator */}
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: '#4ade80' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                {c.status}
              </span>
            </div>

            {/* Icon */}
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl" style={{ backgroundColor: 'var(--color-accent-soft)' }}>
              🤖
            </div>

            {/* Description */}
            <p
              className="text-sm sm:text-base leading-relaxed max-w-md"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {c.description}
            </p>

            {/* Capability chips */}
            <div className="flex flex-wrap justify-center gap-2">
              {c.chips.map(chip => (
                <span
                  key={chip}
                  className="text-[11px] sm:text-xs font-medium px-3 py-1.5 rounded-full"
                  style={{
                    color: 'var(--color-text-secondary)',
                    backgroundColor: 'var(--color-accent-soft)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {chip}
                </span>
              ))}
            </div>

            {/* CTA */}
            <Link
              href={`/${language}/services/agent-g`}
              className="group inline-flex items-center gap-2 text-[14px] font-semibold px-8 py-3 rounded-full transition-all duration-300 active:scale-[0.97] hover:shadow-[0_0_30px_rgba(99,102,241,0.2)]"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: '#fff',
              }}
            >
              {c.cta}
              <span className="ml-0.5 transition-transform duration-200 group-hover:translate-x-0.5">→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
