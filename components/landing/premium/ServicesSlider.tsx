'use client'

/**
 * ServicesSlider — Full-screen slide-mode services carousel.
 * Shows ALL 16 services as immersive slides with:
 * - Auto-play (8s interval), progress bar
 * - Pagination dots, swipe, keyboard navigation
 * - Dynamic service-colored accents
 */

import { useRef, useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { SERVICES } from '@/lib/services/catalog'

type Lang = 'en' | 'ka' | 'ru'

const COPY = {
  en: { eyebrow: 'AI SERVICES', title: 'Every Tool You Need', cta: 'Open Service', viewAll: 'View All Services' },
  ka: { eyebrow: 'AI სერვისები', title: 'ყველა ინსტრუმენტი', cta: 'გახსენი სერვისი', viewAll: 'ყველა სერვისი' },
  ru: { eyebrow: 'AI-СЕРВИСЫ', title: 'Все инструменты', cta: 'Открыть сервис', viewAll: 'Все сервисы' },
} as const

const ACCENTS: Record<string, string> = {
  avatar: '#a78bfa', video: '#f59e0b', image: '#22d3ee', music: '#34d399',
  text: '#818cf8', editing: '#06b6d4', photo: '#fb923c', workflow: '#fb923c',
  'agent-g': '#22d3ee', 'visual-intel': '#3b82f6', prompt: '#fbbf24',
  media: '#06b6d4', business: '#38bdf8', shop: '#10b981', software: '#6366f1',
  tourism: '#14b8a6', game: '#f97316', interior: '#06b6d4',
  voice: '#38bdf8', 'content-writer': '#4ade80', podcast: '#e879f9',
  character: '#a78bfa', event: '#fb923c', 'prompt-builder': '#fbbf24', terminal: '#34d399',
}

const AUTO_MS = 8000

export function ServicesSlider() {
  const { language } = useLanguage()
  const lang = (language as Lang) || 'en'
  const c = COPY[lang] || COPY.en

  const [active, setActive] = useState(0)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const progTimer = useRef<number>(0)
  const touchX = useRef(0)
  const total = SERVICES.length

  const go = useCallback((i: number) => {
    setActive(((i % total) + total) % total)
    setProgress(0)
  }, [total])

  const next = useCallback(() => go(active + 1), [active, go])
  const prev = useCallback(() => go(active - 1), [active, go])

  /* Auto-play with progress */
  useEffect(() => {
    if (paused) return
    const tick = 50
    progTimer.current = window.setInterval(() => {
      setProgress(p => {
        if (p >= 100) { setActive(a => (a + 1) % total); return 0 }
        return p + (tick / AUTO_MS) * 100
      })
    }, tick)
    return () => clearInterval(progTimer.current)
  }, [paused, total, active])

  /* Keyboard */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') prev(); if (e.key === 'ArrowRight') next() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [next, prev])

  /* Swipe */
  const onTouchStart = useCallback((e: React.TouchEvent) => { touchX.current = e.touches[0]!.clientX; setPaused(true) }, [])
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0]!.clientX - touchX.current
    if (Math.abs(dx) > 50) {
      if (dx > 0) {
        prev()
      } else {
        next()
      }
    }
    setPaused(false)
  }, [next, prev])

  const svc = SERVICES[active]!
  const accent = ACCENTS[svc.slug] || '#22d3ee'

  return (
    <section
      className="relative py-16 sm:py-24 overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Dynamic accent ambient */}
      <div className="absolute inset-0 pointer-events-none transition-all duration-700" style={{ background: `radial-gradient(ellipse 80% 60% at 50% 30%, ${accent}12 0%, transparent 70%)` }} />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <p className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase font-black mb-3" style={{ color: accent }}>{c.eyebrow}</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>{c.title}</h2>
        </div>

        {/* ═══ SLIDE VIEWPORT ═══ */}
        <div
          className="relative rounded-3xl overflow-hidden mx-auto"
          style={{
            background: 'linear-gradient(170deg, #0b1219, #080e14 40%, #0a1018)',
            border: `1px solid ${accent}22`,
            boxShadow: `0 8px 60px rgba(0,0,0,0.5), 0 0 80px ${accent}08`,
            minHeight: 360,
          }}
        >
          {/* Slide content */}
          <div className="relative flex flex-col sm:flex-row items-center sm:items-stretch overflow-hidden min-h-[360px]">
            {/* Card image — cinematic generated artwork */}
            <div className="relative w-full sm:w-1/2 min-h-[200px] sm:min-h-[360px] flex-shrink-0">
              <Image
                src={`/services/${svc.slug}.webp`}
                alt={svc.title[lang] || svc.title.en}
                fill
                sizes="(max-width: 640px) 100vw, 50vw"
                className="object-cover"
                priority={active < 3}
              />
              {/* Bottom gradient fade (mobile) / right fade (desktop) */}
              <div className="absolute inset-0 sm:hidden" style={{ background: 'linear-gradient(to top, #080e14 0%, transparent 60%)' }} />
              <div className="absolute inset-0 hidden sm:block" style={{ background: 'linear-gradient(to left, #080e14 0%, transparent 50%)' }} />
            </div>

            {/* Text + CTA panel */}
            <div className="relative z-10 flex flex-col justify-center px-6 sm:px-10 py-8 sm:py-12 w-full sm:w-1/2">
              {/* Glow orb */}
              <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[200px] pointer-events-none transition-all duration-700" style={{ background: `radial-gradient(ellipse, ${accent}15 0%, transparent 70%)`, filter: 'blur(50px)' }} />

              {/* Icon badge */}
              <div
                className="relative z-10 w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-5 transition-all duration-500"
                style={{ background: `linear-gradient(135deg, ${accent}20, ${accent}08)`, border: `1px solid ${accent}30`, boxShadow: `0 0 24px ${accent}10` }}
              >
                {svc.icon}
              </div>

              {/* Name */}
              <h3 className="relative z-10 text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 transition-colors duration-500" style={{ color: accent }}>
                {svc.title[lang] || svc.title.en}
              </h3>

              {/* Description */}
              <p className="relative z-10 text-sm sm:text-base max-w-md mb-8" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {svc.description[lang] || svc.description.en}
              </p>

              {/* CTA */}
              <Link
                href={`/${language}/services/${svc.slug}`}
                className="relative z-10 inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-bold transition-all duration-300 active:scale-95 hover:-translate-y-0.5 w-fit"
                style={{ background: `linear-gradient(135deg, ${accent}25, ${accent}10)`, border: `1px solid ${accent}40`, color: accent, boxShadow: `0 0 24px ${accent}15` }}
              >
                {c.cta}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /><polyline points="12 5 19 12 12 19" /></svg>
              </Link>
            </div>

            {/* Counter */}
            <div className="absolute top-4 right-5 z-10 text-[11px] font-bold tracking-wider" style={{ color: 'rgba(255,255,255,0.2)' }}>
              {String(active + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </div>
          </div>

          {/* Arrows */}
          <button onClick={prev} className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-90" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(8px)' }} aria-label="Previous">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <button onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-90" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(8px)' }} aria-label="Next">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 6 15 12 9 18" /></svg>
          </button>

          {/* Progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="h-full transition-[width] duration-75" style={{ width: `${progress}%`, background: accent }} />
          </div>
        </div>

        {/* Dots */}
        <div className="flex items-center justify-center gap-1.5 mt-6 flex-wrap max-w-md mx-auto">
          {SERVICES.map((s, i) => {
            const a = ACCENTS[s.slug] || '#22d3ee'
            return (
              <button
                key={s.slug}
                onClick={() => go(i)}
                className="w-2 h-2 rounded-full transition-all duration-300"
                style={{
                  backgroundColor: i === active ? a : 'rgba(255,255,255,0.12)',
                  boxShadow: i === active ? `0 0 8px ${a}` : 'none',
                  transform: i === active ? 'scale(1.4)' : 'scale(1)',
                }}
                aria-label={s.title.en}
              />
            )
          })}
        </div>

        {/* View all link */}
        <div className="text-center mt-8">
          <Link
            href={`/${language}/services`}
            className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-xl transition-all duration-300 hover:-translate-y-0.5"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--color-text)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {c.viewAll}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
          </Link>
        </div>
      </div>
    </section>
  )
}
