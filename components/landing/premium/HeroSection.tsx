'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { HeroVideo } from './HeroVideo'

/* ─── Copy ──────────────────────────────────────────────── */
const COPY = {
  en: {
    headline: 'Create Anything With AI',
    sub: 'MyAvatar.ge — The AI Creation Platform powered by Agent G.',
    desc: 'Create avatars, videos, music, posters and full AI workflows with a powerful multi-agent system.',
    cta1: 'Start Creating',
    cta2: 'Explore Tools',
    trust: 'Trusted by creators, businesses and developers worldwide',
  },
  ka: {
    headline: 'შექმენი ყველაფერი AI-ით',
    sub: 'MyAvatar.ge — AI შექმნის პლატფორმა Agent G-ის ძალით.',
    desc: 'შექმენით ავატარები, ვიდეოები, მუსიკა, პოსტერები და სრული AI სამუშაო ნაკადები მძლავრი მულტი-აგენტური სისტემით.',
    cta1: 'შექმნის დაწყება',
    cta2: 'ინსტრუმენტების ნახვა',
    trust: 'კრეატორების, ბიზნესისა და დეველოპერების ნდობით მსოფლიოში',
  },
  ru: {
    headline: 'Создавайте всё с AI',
    sub: 'MyAvatar.ge — AI-платформа для создания контента на базе Agent G.',
    desc: 'Создавайте аватары, видео, музыку, постеры и полные AI-воркфлоу с мощной мультиагентной системой.',
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
    <section className="relative overflow-hidden px-4 sm:px-6 lg:px-10 pt-24 pb-16 sm:pt-32 sm:pb-20 lg:pt-40 lg:pb-28">

      {/* Ambient gradients */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(99,102,241,0.10) 0%, transparent 70%)' }} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] pointer-events-none" style={{ background: 'radial-gradient(ellipse 50% 50% at 50% 30%, rgba(99,102,241,0.10) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      <div className="absolute top-16 left-1/4 w-[400px] h-[300px] pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 50% at 40% 45%, rgba(139,92,246,0.06) 0%, transparent 70%)', filter: 'blur(50px)' }} />

      {/* Dot grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(var(--color-text) 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }} />

      <div className="relative z-10 mx-auto max-w-5xl flex flex-col items-center text-center gap-8 lg:gap-10">

        {/* Badge */}
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9">
            <Image src="/brand/rocket-brain.svg" alt="MyAvatar.ge" fill sizes="36px" className="object-contain" />
          </div>
          <span className="text-[11px] tracking-[0.18em] uppercase font-medium px-3 py-1.5 rounded-full" style={{ color: 'var(--color-accent)', backgroundColor: 'var(--color-accent-soft)', border: '1px solid rgba(99,102,241,0.15)' }}>
            AI Creation Platform
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-[-0.03em] leading-[1.08]" style={{ color: 'var(--color-text)' }}>
          {c.headline.split(' ').slice(0, -1).join(' ')}{' '}
          <span className="bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 bg-clip-text text-transparent">
            {c.headline.split(' ').slice(-1)}
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-lg sm:text-xl lg:text-2xl font-medium max-w-2xl" style={{ color: 'var(--color-text-secondary)' }}>
          {c.sub}
        </p>

        {/* Supporting text */}
        <p className="text-sm sm:text-base max-w-xl leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
          {c.desc}
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3">
          <Link
            href={lh('/signup')}
            className="inline-flex items-center gap-2 text-sm font-semibold px-8 py-3.5 rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/20"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          >
            {c.cta1}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </Link>
          <Link
            href={lh('/services')}
            className="inline-flex items-center gap-2 text-sm font-semibold px-8 py-3.5 rounded-xl transition-all duration-200 hover:-translate-y-0.5"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
          >
            {c.cta2}
          </Link>
        </div>

        {/* ── Cinematic Hero Video ── */}
        <div className="w-full mt-4 sm:mt-6">
          <HeroVideo />
        </div>

        {/* Trust signal */}
        <p className="mt-2 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{c.trust}</p>
      </div>
    </section>
  )
}
