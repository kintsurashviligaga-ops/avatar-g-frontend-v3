'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRef, useState, useEffect, useCallback } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { SERVICES } from '@/lib/services/catalog'

const COPY = {
  en: { eyebrow: '16 AI Services', title: 'Everything you need to create', sub: 'One platform. Every creative and business tool — powered by AI.', viewAll: 'View All Services' },
  ka: { eyebrow: '16 AI სერვისი', title: 'ყველაფერი შესაქმნელად', sub: 'ერთი პლატფორმა. ყველა შემოქმედებითი და ბიზნეს ინსტრუმენტი.', viewAll: 'ყველა სერვისის ნახვა' },
  ru: { eyebrow: '16 AI-сервисов', title: 'Всё для создания контента', sub: 'Одна платформа. Все творческие и бизнес-инструменты.', viewAll: 'Все сервисы' },
} as const

function ArrowLeft() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
}
function ArrowRight() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 6 15 12 9 18"/></svg>
}

export function ServicesOverview() {
  const { language } = useLanguage()
  const lang = language as 'en' | 'ka' | 'ru'
  const c = COPY[lang] || COPY.en
  const lh = (p: string) => '/' + language + p

  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    checkScroll()
    el.addEventListener('scroll', checkScroll, { passive: true })
    window.addEventListener('resize', checkScroll)
    return () => { el.removeEventListener('scroll', checkScroll); window.removeEventListener('resize', checkScroll) }
  }, [checkScroll])

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    const cardWidth = el.querySelector<HTMLElement>(':scope > a')?.offsetWidth ?? 280
    el.scrollBy({ left: dir === 'left' ? -cardWidth - 20 : cardWidth + 20, behavior: 'smooth' })
  }

  return (
    <section className="relative py-20 sm:py-28 overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 30%, rgba(34,211,238,0.04) 0%, transparent 70%)' }} />

      <div className="relative max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 sm:mb-16 px-4 sm:px-6">
          <p className="text-[11px] tracking-[0.25em] uppercase font-medium mb-3" style={{ color: 'var(--color-accent)' }}>{c.eyebrow}</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>{c.title}</h2>
          <p className="mt-4 text-base sm:text-lg max-w-2xl mx-auto" style={{ color: 'var(--color-text-secondary)' }}>{c.sub}</p>
        </div>

        {/* Slider controls (desktop) */}
        <div className="hidden md:flex justify-end gap-2 mb-4 px-6 lg:px-10">
          <button
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className="p-2 rounded-lg transition-all duration-200 disabled:opacity-30"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
            aria-label="Scroll left"
          >
            <ArrowLeft />
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className="p-2 rounded-lg transition-all duration-200 disabled:opacity-30"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
            aria-label="Scroll right"
          >
            <ArrowRight />
          </button>
        </div>

        {/* Horizontal scroll slider */}
        <div
          ref={scrollRef}
          className="flex gap-4 sm:gap-5 overflow-x-auto scroll-smooth snap-x snap-mandatory no-scrollbar px-4 sm:px-6 lg:px-10"
        >
          {SERVICES.map(svc => (
            <Link
              key={svc.slug}
              href={lh(`/services/${svc.slug}`)}
              className="svc-card group relative flex flex-col rounded-2xl overflow-hidden transition-all duration-400 hover:-translate-y-2 shrink-0 snap-start w-[75vw] sm:w-[45vw] md:w-[30vw] lg:w-[23vw]"
              style={{
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--color-border)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
              }}
            >
              {/* ── Image header ── */}
              <div className="relative h-44 sm:h-48 overflow-hidden">
                <Image
                  src={`/services/${svc.slug}.webp`}
                  alt={svc.title[lang] || svc.title.en}
                  fill
                  sizes="(max-width: 640px) 75vw, (max-width: 768px) 45vw, (max-width: 1024px) 30vw, 23vw"
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                  loading="lazy"
                  quality={80}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 60%, rgba(34,211,238,0.15), transparent 70%)' }}
                />
                <div className="absolute top-3 left-3 w-9 h-9 rounded-lg flex items-center justify-center text-lg backdrop-blur-md"
                  style={{ backgroundColor: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  {svc.icon}
                </div>
              </div>

              {/* ── Text content ── */}
              <div className="relative flex flex-col flex-1 p-4 sm:p-5">
                <h3
                  className="text-base font-semibold mb-1.5 transition-colors duration-300 group-hover:text-[var(--color-accent)]"
                  style={{ color: 'var(--color-text)' }}
                >
                  {svc.title[lang] || svc.title.en}
                </h3>
                <p className="text-xs sm:text-sm leading-relaxed flex-1" style={{ color: 'var(--color-text-tertiary)' }}>
                  {svc.description[lang] || svc.description.en}
                </p>
                <div className="mt-3 flex items-center gap-1.5 text-xs font-medium opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300" style={{ color: 'var(--color-accent)' }}>
                  <span>{lang === 'ka' ? 'გამოიყენე' : lang === 'ru' ? 'Открыть' : 'Launch'}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>
                </div>
              </div>

              {/* ── Hover border glow ── */}
              <div
                className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-400"
                style={{ boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.4), 0 0 24px rgba(34,211,238,0.08), 0 8px 32px rgba(0,0,0,0.3)' }}
              />
            </Link>
          ))}
        </div>

        {/* View all link */}
        <div className="text-center mt-12 px-4">
          <Link
            href={lh('/services')}
            className="inline-flex items-center gap-2 text-sm font-semibold px-7 py-3.5 rounded-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-cyan-500/10"
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
