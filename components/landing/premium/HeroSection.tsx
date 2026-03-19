'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { HeroVideo } from './HeroVideo'

/* ─── Copy ──────────────────────────────────────────────── */
const COPY = {
  en: {
    headline1: 'Create Everything with AI',
    headline2: 'All in One Place.',
    cta1: 'Start Creating',
    cta2: 'Explore Tools',
    trust: 'Trusted by creators, businesses and developers worldwide',
  },
  ka: {
    headline1: 'შექმენი ყველაფერი AI-ით',
    headline2: 'ერთ სივრცეში.',
    cta1: 'შექმნის დაწყება',
    cta2: 'ინსტრუმენტების ნახვა',
    trust: 'კრეატორების, ბიზნესისა და დეველოპერების ნდობით მსოფლიოში',
  },
  ru: {
    headline1: 'Создавайте всё с помощью AI',
    headline2: 'В одном месте.',
    cta1: 'Начать создание',
    cta2: 'Обзор инструментов',
    trust: 'Доверяют создатели, бизнесы и разработчики по всему миру',
  },
} as const

export function HeroSection() {
  const { language } = useLanguage()
  const c = COPY[language] || COPY.en
  const lh = (p: string) => '/' + language + p

  return (
    <section className="cinematic-section relative overflow-hidden px-4 sm:px-6 lg:px-10 pt-24 pb-16 sm:pt-32 sm:pb-20 lg:pt-40 lg:pb-28">

      {/* Ambient gradients — enhanced for cinematic depth */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(34,211,238,0.15) 0%, transparent 70%)' }} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] pointer-events-none glow-drift" style={{ background: 'radial-gradient(ellipse 50% 50% at 50% 30%, rgba(34,211,238,0.12) 0%, transparent 70%)', filter: 'blur(80px)' }} />
      <div className="absolute top-16 left-1/4 w-[400px] h-[300px] pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 50% at 40% 45%, rgba(6,182,212,0.08) 0%, transparent 70%)', filter: 'blur(60px)' }} />

      {/* Structural grid — holographic plane */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.025]" style={{ backgroundImage: 'radial-gradient(var(--color-text) 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }} />

      <div className="relative z-10 mx-auto max-w-5xl flex flex-col items-center text-center gap-8 lg:gap-10">

        {/* Badge — glass capsule */}
        <div className="flex items-center gap-3 holo-panel px-4 py-2 !rounded-full" style={{ background: 'rgba(10,18,36,0.6)' }}>
          <div className="relative w-[47px] h-[47px]">
            <Image src="/brand/gemini-rocket-clean.png" alt="MyAvatar.ge" fill sizes="47px" className="object-contain" />
          </div>
          <span className="text-[11px] tracking-[0.18em] uppercase font-medium" style={{ color: 'var(--color-accent)' }}>
            AI Creation Platform
          </span>
        </div>

        {/* Headline — cinematic type */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-[-0.03em] leading-[1.08]" style={{ color: 'var(--color-text)' }}>
          {c.headline1}
          <br />
          <span style={{ color: 'var(--color-accent)' }}>{c.headline2}</span>
        </h1>

        {/* CTA Buttons — cinematic treatment */}
        <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3">
          <Link
            href={lh('/signup')}
            className="cinematic-btn cinematic-btn-primary text-sm px-8 py-3.5 rounded-xl"
          >
            {c.cta1}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </Link>
          <Link
            href={lh('/services')}
            className="cinematic-btn cinematic-btn-secondary text-sm px-8 py-3.5 rounded-xl"
          >
            {c.cta2}
          </Link>
        </div>

        {/* ── Cinematic Hero Video ── */}
        <div className="w-full mt-6 sm:mt-8 lg:mt-10" style={{ maxWidth: 1100, margin: '24px auto 0' }}>
          <HeroVideo />
        </div>

        {/* Trust signal */}
        <p className="mt-2 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{c.trust}</p>
      </div>
    </section>
  )
}
