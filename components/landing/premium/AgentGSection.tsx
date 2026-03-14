'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const COPY = {
  en: {
    eyebrow: 'Core Intelligence',
    title: 'Meet Agent G',
    sub: 'Your AI coordinator that understands requests, recommends tools, builds workflows, and automates creation across every service.',
    cta: 'Launch Agent G',
    capabilities: [
      { icon: '🧠', label: 'Understands Requests', desc: 'Natural language understanding of complex creative briefs' },
      { icon: '🔗', label: 'Recommends Tools', desc: 'Automatically selects the right services for your task' },
      { icon: '⚡', label: 'Builds Workflows', desc: 'Chains multiple services into automated pipelines' },
      { icon: '🚀', label: 'Automates Creation', desc: 'Delivers complete projects from a single prompt' },
    ],
  },
  ka: {
    eyebrow: 'ძირითადი ინტელექტი',
    title: 'გაიცანით Agent G',
    sub: 'თქვენი AI კოორდინატორი, რომელიც ესმის მოთხოვნებს, ურჩევს ინსტრუმენტებს, აშენებს სამუშაო პროცესებს და ავტომატიზირებს შექმნას.',
    cta: 'Agent G-ის გაშვება',
    capabilities: [
      { icon: '🧠', label: 'მოთხოვნების გაგება', desc: 'ბუნებრივი ენის გაგება რთული შემოქმედებითი ბრიფებისთვის' },
      { icon: '🔗', label: 'ინსტრუმენტების რეკომენდაცია', desc: 'ავტომატურად ირჩევს შესაბამის სერვისებს' },
      { icon: '⚡', label: 'პროცესების აგება', desc: 'მრავალ სერვისს აწყობს ავტომატიზებულ პროცესებში' },
      { icon: '🚀', label: 'შექმნის ავტომატიზაცია', desc: 'ასრულებს მთლიან პროექტებს ერთი მოთხოვნით' },
    ],
  },
  ru: {
    eyebrow: 'Ядро интеллекта',
    title: 'Знакомьтесь: Agent G',
    sub: 'Ваш AI-координатор, который понимает запросы, рекомендует инструменты, строит рабочие процессы и автоматизирует создание.',
    cta: 'Запустить Agent G',
    capabilities: [
      { icon: '🧠', label: 'Понимает запросы', desc: 'Понимание сложных творческих брифов на естественном языке' },
      { icon: '🔗', label: 'Рекомендует инструменты', desc: 'Автоматически подбирает нужные сервисы' },
      { icon: '⚡', label: 'Строит процессы', desc: 'Объединяет сервисы в автоматические пайплайны' },
      { icon: '🚀', label: 'Автоматизирует создание', desc: 'Выполняет полные проекты из одного запроса' },
    ],
  },
} as const

export function AgentGSection() {
  const { language } = useLanguage()
  const c = COPY[language] || COPY.en
  const lh = (p: string) => '/' + language + p

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      {/* Ambient */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(6,182,212,0.06) 0%, transparent 70%)' }} />

      <div className="relative max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left: Visual */}
          <div className="flex items-center justify-center">
            <div className="relative w-[280px] h-[280px] sm:w-[340px] sm:h-[340px]">
              {/* Glow rings */}
              <div className="absolute inset-0 rounded-full" style={{ border: '1px solid rgba(34,211,238,0.08)' }} />
              <div className="absolute inset-8 rounded-full" style={{ border: '1px solid rgba(34,211,238,0.12)' }} />
              <div className="absolute inset-16 rounded-full" style={{ border: '1px solid rgba(34,211,238,0.16)' }} />
              {/* Center */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl" style={{ background: 'linear-gradient(135deg, var(--color-accent), rgba(6,182,212,0.9))', boxShadow: '0 0 80px rgba(34,211,238,0.35), 0 0 160px rgba(6,182,212,0.15)' }}>
                  🤖
                </div>
              </div>
              {/* Satellite dots */}
              {[30, 90, 150, 210, 270, 330].map((angle, i) => {
                const r = 48
                const a = (angle * Math.PI) / 180
                const x = 50 + r * Math.cos(a)
                const y = 50 + r * Math.sin(a)
                return (
                  <div key={i} className="absolute w-3 h-3 rounded-full -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%`, backgroundColor: 'var(--color-accent)', opacity: 0.3 + (i * 0.1), boxShadow: '0 0 12px rgba(34,211,238,0.3)' }} />
                )
              })}
            </div>
          </div>

          {/* Right: Content */}
          <div>
            <p className="text-[11px] tracking-[0.25em] uppercase font-medium mb-3" style={{ color: 'var(--color-accent)' }}>{c.eyebrow}</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4" style={{ color: 'var(--color-text)' }}>{c.title}</h2>
            <p className="text-base sm:text-lg leading-[1.7] mb-8 max-w-lg" style={{ color: 'var(--color-text-secondary)' }}>{c.sub}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {c.capabilities.map((cap, i) => (
                <div key={i} className="flex items-start gap-3 p-4 rounded-xl" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}>
                  <span className="text-xl flex-shrink-0">{cap.icon}</span>
                  <div>
                    <h4 className="text-sm font-semibold mb-0.5" style={{ color: 'var(--color-text)' }}>{cap.label}</h4>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>{cap.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <Link
              href={lh('/services/agent-g')}
              className="inline-flex items-center gap-2 text-sm font-semibold px-7 py-3.5 rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-cyan-500/20"
              style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
            >
              {c.cta}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
