'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useLanguage } from '@/lib/i18n/LanguageContext'

/* ─── Copy ──────────────────────────────────────────────── */
const COPY = {
  en: {
    headline: 'Your AI Production Studio',
    sub: 'Create avatars, generate videos, design visuals, produce music, build stores and launch projects — using a single intelligent platform powered by Agent G.',
    cta1: 'Start Creating',
    cta2: 'Explore Tools',
    trust: 'Trusted by creators, businesses and developers worldwide',
  },
  ka: {
    headline: 'თქვენი AI პროდაქშენ სტუდია',
    sub: 'შექმენით ავატარები, ვიდეოები, ვიზუალი, მუსიკა, მაღაზიები და პროექტები — ერთი ინტელექტუალური პლატფორმით, Agent G-ის ძალით.',
    cta1: 'შექმნის დაწყება',
    cta2: 'ინსტრუმენტების ნახვა',
    trust: 'კრეატორების, ბიზნესისა და დეველოპერების ნდობით მსოფლიოში',
  },
  ru: {
    headline: 'Ваша AI-студия производства',
    sub: 'Создавайте аватары, генерируйте видео, дизайн, музыку, интернет-магазины и проекты — на единой интеллектуальной платформе на базе Agent G.',
    cta1: 'Начать создание',
    cta2: 'Обзор инструментов',
    trust: 'Доверяют создатели, бизнесы и разработчики по всему миру',
  },
} as const

/* Orbit items */
const ORBIT_ITEMS = [
  { icon: '👤', label: 'Avatar',   angle: 0 },
  { icon: '🎬', label: 'Video',    angle: 51 },
  { icon: '🎵', label: 'Music',    angle: 103 },
  { icon: '🖼️', label: 'Poster',   angle: 154 },
  { icon: '🛒', label: 'Store',    angle: 206 },
  { icon: '💻', label: 'Code',     angle: 257 },
  { icon: '📊', label: 'Business', angle: 309 },
]

export function HeroSection() {
  const { language } = useLanguage()
  const c = COPY[language] || COPY.en
  const lh = (p: string) => '/' + language + p

  return (
    <section className="relative overflow-hidden px-4 sm:px-6 lg:px-10 pt-24 pb-16 sm:pt-32 sm:pb-20 lg:pt-40 lg:pb-28">

      {/* Ambient gradients */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(99,102,241,0.10) 0%, transparent 70%)' }} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] pointer-events-none" style={{ background: 'radial-gradient(ellipse 50% 50% at 50% 30%, rgba(99,102,241,0.10) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      <div className="absolute top-16 left-1/4 w-[400px] h-[300px] pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 50% at 40% 45%, rgba(139,92,246,0.06) 0%, transparent 70%)', filter: 'blur(50px)' }} />

      {/* Dot grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(var(--color-text) 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }} />

      <div className="relative z-10 mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-2 items-center gap-12 lg:gap-20">

        {/* ── Left: Content ── */}
        <div className="flex flex-col items-start text-left max-w-xl">
          {/* Logo + badge */}
          <div className="flex items-center gap-3 mb-8">
            <div className="relative w-10 h-10">
              <Image src="/brand/rocket-brain.svg" alt="MyAvatar.ge" fill sizes="40px" className="object-contain" />
            </div>
            <span className="text-[11px] tracking-[0.18em] uppercase font-medium px-3 py-1.5 rounded-full" style={{ color: 'var(--color-accent)', backgroundColor: 'var(--color-accent-soft)', border: '1px solid rgba(99,102,241,0.15)' }}>
              AI Platform
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-[-0.03em] leading-[1.08]" style={{ color: 'var(--color-text)' }}>
            {c.headline.split(' ').slice(0, -1).join(' ')}{' '}
            <span className="bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 bg-clip-text text-transparent">
              {c.headline.split(' ').slice(-1)}
            </span>
          </h1>

          <p className="mt-6 text-base sm:text-lg leading-[1.7] max-w-lg" style={{ color: 'var(--color-text-secondary)' }}>
            {c.sub}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-wrap items-center gap-3 mt-10">
            <Link
              href={lh('/signup')}
              className="inline-flex items-center gap-2 text-sm font-semibold px-7 py-3.5 rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/20"
              style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
            >
              {c.cta1}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
            <Link
              href={lh('/services')}
              className="inline-flex items-center gap-2 text-sm font-semibold px-7 py-3.5 rounded-xl transition-all duration-200 hover:-translate-y-0.5"
              style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
            >
              {c.cta2}
            </Link>
          </div>

          {/* Trust signal */}
          <p className="mt-8 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{c.trust}</p>
        </div>

        {/* ── Right: Orbit Visual ── */}
        <div className="relative flex items-center justify-center">
          <div className="relative w-[320px] h-[320px] sm:w-[400px] sm:h-[400px] lg:w-[460px] lg:h-[460px]">

            {/* Orbit ring */}
            <div className="absolute inset-6 sm:inset-8 rounded-full border border-dashed" style={{ borderColor: 'rgba(99,102,241,0.15)' }}>
              <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.04) 0%, transparent 70%)' }} />
            </div>

            {/* Center: Agent G */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-3xl sm:text-4xl" style={{ background: 'linear-gradient(135deg, var(--color-accent), rgba(139,92,246,0.9))', boxShadow: '0 0 60px rgba(99,102,241,0.3), 0 0 120px rgba(139,92,246,0.15)' }}>
                🤖
              </div>
              <span className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-accent)' }}>Agent G</span>
            </div>

            {/* Orbiting service nodes */}
            {ORBIT_ITEMS.map((item, i) => {
              const radius = 46 // percent from center
              const angleRad = (item.angle * Math.PI) / 180
              const x = 50 + radius * Math.cos(angleRad)
              const y = 50 + radius * Math.sin(angleRad)
              return (
                <div
                  key={i}
                  className="absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-1/2 z-10 transition-transform duration-300 hover:scale-110"
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  <div
                    className="w-11 h-11 sm:w-13 sm:h-13 rounded-xl flex items-center justify-center text-lg sm:text-xl"
                    style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
                  >
                    {item.icon}
                  </div>
                  <span className="text-[9px] sm:text-[10px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{item.label}</span>
                </div>
              )
            })}

            {/* Connection lines (decorative SVG) */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" viewBox="0 0 100 100">
              {ORBIT_ITEMS.map((item, i) => {
                const r = 46
                const a = (item.angle * Math.PI) / 180
                return <line key={i} x1="50" y1="50" x2={50 + r * Math.cos(a)} y2={50 + r * Math.sin(a)} stroke="var(--color-accent)" strokeWidth="0.15" />
              })}
            </svg>
          </div>
        </div>
      </div>
    </section>
  )
}
