'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
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

// Terminal chat lines shown with typewriter effect
const TERMINAL_LINES = [
  { role: 'user',  ka: 'შექმენი Tbilisi Night-ის ვიდეო',          en: 'Create a Tbilisi Night video',          ru: 'Создай видео «Ночной Тбилиси»' },
  { role: 'agent', ka: '⚡ ვიდეო სერვისი → LTX-2.3 … 100%',       en: '⚡ Routing → Video Studio · LTX-2.3',    ru: '⚡ Маршрут → Video Studio · LTX-2.3' },
  { role: 'agent', ka: '🎵 მუსიკა → ElevenLabs soundtrack …',      en: '🎵 Music → ElevenLabs soundtrack …',    ru: '🎵 Музыка → ElevenLabs soundtrack …' },
  { role: 'agent', ka: '✅ გამართული! ვიდეო + საუნდტრეკი მზადაა.', en: '✅ Done! Video + soundtrack ready.',     ru: '✅ Готово! Видео + саундтрек готовы.' },
  { role: 'user',  ka: 'ახლა ავატარი ამ ხმით',                    en: 'Now make an avatar with that voice',    ru: 'Теперь аватар с этим голосом' },
  { role: 'agent', ka: '👤 HeyGen ავატარი იქმნება …',              en: '👤 HeyGen avatar generating …',         ru: '👤 Генерирую аватар HeyGen …' },
] as const

function TerminalMockup({ locale }: { locale: 'ka' | 'en' | 'ru' }) {
  const [visibleLines, setVisibleLines] = useState(0)
  const [cursorBlink, setCursorBlink] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !started.current) {
          started.current = true
          let i = 0
          const tick = () => {
            setVisibleLines(v => v + 1)
            i++
            if (i < TERMINAL_LINES.length) setTimeout(tick, 900 + Math.random() * 400)
          }
          setTimeout(tick, 600)
        }
      },
      { threshold: 0.3 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const id = setInterval(() => setCursorBlink(v => !v), 530)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative rounded-2xl overflow-hidden font-mono text-[13px] leading-relaxed select-none"
      style={{
        backgroundColor: '#03030a',
        border: '1px solid rgba(0,212,255,0.15)',
        boxShadow: '0 0 60px rgba(0,212,255,0.08), inset 0 0 40px rgba(0,0,0,0.4)',
      }}
    >
      {/* Scan lines overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,212,255,0.015) 2px, rgba(0,212,255,0.015) 4px)',
        }}
      />

      {/* Scrolling scan line */}
      <div
        className="pointer-events-none absolute inset-x-0 h-8 z-10"
        style={{
          background: 'linear-gradient(to bottom, transparent, rgba(0,212,255,0.04), transparent)',
          animation: 'neon-scan 4s linear infinite',
        }}
      />

      {/* Title bar */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 border-b"
        style={{ borderColor: 'rgba(0,212,255,0.12)', backgroundColor: 'rgba(0,212,255,0.04)' }}
      >
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500/60" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
          <span className="w-3 h-3 rounded-full bg-green-500/60" />
        </div>
        <span className="text-[11px] tracking-widest uppercase text-cyan-400/60 ml-2">agent-g · terminal</span>
      </div>

      {/* Chat lines */}
      <div className="px-5 py-4 space-y-3 min-h-[260px]">
        {TERMINAL_LINES.slice(0, visibleLines).map((line, i) => (
          <div key={i} className={`flex gap-2 ${line.role === 'user' ? 'justify-end' : ''}`}>
            {line.role === 'agent' && (
              <span className="text-cyan-500/70 text-[11px] mt-0.5 flex-shrink-0">▶</span>
            )}
            <span
              className={`text-[12px] sm:text-[13px] leading-relaxed max-w-[85%] px-3 py-1.5 rounded-xl ${
                line.role === 'user'
                  ? 'text-white/75 bg-white/6 border border-white/8'
                  : 'text-cyan-300/90'
              }`}
            >
              {line[locale]}
            </span>
          </div>
        ))}

        {/* Blinking cursor */}
        <div className="flex gap-2">
          <span className="text-cyan-500/70 text-[11px] mt-0.5">▶</span>
          <span
            className="inline-block w-2 h-[1em] mt-0.5"
            style={{
              backgroundColor: '#00d4ff',
              opacity: cursorBlink ? 0.9 : 0,
              transition: 'opacity 0.1s',
            }}
          />
        </div>
      </div>
    </div>
  )
}

export function AgentGSection() {
  const { language } = useLanguage()
  const c = COPY[language] || COPY.en
  const locale = (language as 'ka' | 'en' | 'ru')
  const lh = (p: string) => '/' + language + p

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      {/* Ambient */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(6,182,212,0.05) 0%, transparent 70%)' }} />
      {/* Circuit pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.025]" style={{ backgroundImage: 'radial-gradient(rgba(0,212,255,0.8) 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }} />

      <div className="relative max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[55%_45%] gap-12 lg:gap-16 items-center">

          {/* Left: Content */}
          <div>
            <p className="text-[11px] tracking-[0.25em] uppercase font-medium mb-3 text-cyan-400">{c.eyebrow}</p>
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-4 text-white/95 uppercase"
              style={{ fontFamily: 'var(--font-display, var(--font-syne, sans-serif))', letterSpacing: '0.04em' }}
            >
              {c.title}
            </h2>
            <p className="text-base sm:text-lg leading-[1.7] mb-8 max-w-lg text-white/55">{c.sub}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              {c.capabilities.map((cap, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-4 rounded-xl transition-all duration-200 hover:border-cyan-500/20 hover:bg-white/4"
                  style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <span className="text-xl flex-shrink-0">{cap.icon}</span>
                  <div>
                    <h4 className="text-sm font-semibold mb-0.5 text-white/90">{cap.label}</h4>
                    <p className="text-xs leading-relaxed text-white/45">{cap.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <Link
              href={lh('/dashboard')}
              className="inline-flex items-center gap-2 text-sm font-semibold px-7 py-3.5 rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-cyan-500/25 text-white"
              style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.9), rgba(124,58,237,0.9))', boxShadow: '0 0 20px rgba(0,212,255,0.25)' }}
            >
              {c.cta}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
          </div>

          {/* Right: Terminal mockup */}
          <TerminalMockup locale={locale} />
        </div>
      </div>
    </section>
  )
}
