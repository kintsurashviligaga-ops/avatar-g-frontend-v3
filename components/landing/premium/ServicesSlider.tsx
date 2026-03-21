'use client'

/**
 * ServicesSlider — Premium draggable/swipable services carousel.
 * Touch-friendly with momentum scroll, snap points, and fluid drag.
 * Renders the core 8 services as premium glass cards.
 */

import { useRef, useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'

type Lang = 'en' | 'ka' | 'ru'

const COPY = {
  en: { eyebrow: 'AI SERVICES', title: 'Everything You Need', sub: 'One platform. Every creative and business tool — powered by AI.', viewAll: 'View All Services' },
  ka: { eyebrow: 'AI სერვისები', title: 'ყველაფერი რაც გჭირდება', sub: 'ერთი პლატფორმა. ყველა შემოქმედებითი და ბიზნეს ინსტრუმენტი.', viewAll: 'ყველა სერვისი' },
  ru: { eyebrow: 'AI-СЕРВИСЫ', title: 'Всё что нужно', sub: 'Одна платформа. Все творческие и бизнес-инструменты.', viewAll: 'Все сервисы' },
} as const

interface ServiceCard {
  slug: string
  icon: string
  accent: string
  name: { en: string; ka: string; ru: string }
  desc: { en: string; ka: string; ru: string }
  tags: { en: string[]; ka: string[]; ru: string[] }
}

const CARDS: ServiceCard[] = [
  {
    slug: 'avatar', icon: '👤', accent: '#a78bfa',
    name: { en: 'Avatar Studio', ka: 'ავატარ სტუდია', ru: 'Аватар-студия' },
    desc: { en: 'Photorealistic digital humans & identity assets', ka: 'ფოტორეალისტური ციფრული ადამიანები', ru: 'Фотореалистичные цифровые аватары' },
    tags: { en: ['Portraits', 'Brand', 'Styles'], ka: ['პორტრეტები', 'ბრენდი', 'სტილები'], ru: ['Портреты', 'Бренд', 'Стили'] },
  },
  {
    slug: 'video', icon: '🎬', accent: '#f59e0b',
    name: { en: 'Video Generation', ka: 'ვიდეო გენერაცია', ru: 'Генерация видео' },
    desc: { en: 'Cinematic AI video from text or image prompts', ka: 'კინემატოგრაფიული ვიდეო ტექსტიდან', ru: 'Кинематографическое видео из текста' },
    tags: { en: ['Text-to-Video', 'Cinematic', 'Ads'], ka: ['ტექსტიდან', 'კინემატო', 'რეკლამა'], ru: ['Текст→Видео', 'Кино', 'Реклама'] },
  },
  {
    slug: 'image', icon: '🖼️', accent: '#f472b6',
    name: { en: 'Image Generation', ka: 'სურათის გენერაცია', ru: 'Генерация изображений' },
    desc: { en: 'Campaign-grade visuals & commercial imagery', ka: 'კამპანიის დონის ვიზუალი', ru: 'Визуалы коммерческого качества' },
    tags: { en: ['Posters', 'Products', 'Art'], ka: ['პოსტერები', 'პროდუქტი', 'ხელოვნება'], ru: ['Постеры', 'Продукт', 'Арт'] },
  },
  {
    slug: 'music', icon: '🎵', accent: '#34d399',
    name: { en: 'Music Production', ka: 'მუსიკა', ru: 'Музыка' },
    desc: { en: 'Original beats, scores & soundscapes with AI', ka: 'ორიგინალური ბითები და საუნდსკეიფები', ru: 'Оригинальные биты и саундскейпы' },
    tags: { en: ['Beats', 'Scores', 'Sound'], ka: ['ბითები', 'მუსიკა', 'საუნდი'], ru: ['Биты', 'Саундтреки', 'Звук'] },
  },
  {
    slug: 'text', icon: '✍️', accent: '#818cf8',
    name: { en: 'Text & Copy', ka: 'ტექსტი', ru: 'Текст' },
    desc: { en: 'Marketing copy, scripts & translations', ka: 'მარკეტინგული ტექსტი და თარგმანები', ru: 'Маркетинговые тексты и переводы' },
    tags: { en: ['Copy', 'Scripts', 'SEO'], ka: ['კოპი', 'სცენარი', 'SEO'], ru: ['Копи', 'Сценарии', 'SEO'] },
  },
  {
    slug: 'workflow', icon: '⚡', accent: '#22d3ee',
    name: { en: 'Workflow Builder', ka: 'ვორქფლოუ', ru: 'Воркфлоу' },
    desc: { en: 'Automated multi-step AI pipelines', ka: 'მრავალსაფეხურიანი AI პაიპლაინები', ru: 'Многоступенчатые AI-пайплайны' },
    tags: { en: ['Pipelines', 'Auto', 'Multi-Step'], ka: ['პაიპლაინი', 'ავტო', 'ეტაპები'], ru: ['Пайплайны', 'Авто', 'Этапы'] },
  },
  {
    slug: 'agent-g', icon: '🤖', accent: '#22d3ee',
    name: { en: 'Agent G', ka: 'Agent G', ru: 'Agent G' },
    desc: { en: 'AI orchestrator — routes tasks across services', ka: 'AI ორკესტრატორი — ანაწილებს ამოცანებს', ru: 'AI-оркестратор — распределяет задачи' },
    tags: { en: ['Routing', 'Smart', 'Pipeline'], ka: ['როუტინგი', 'ჭკვიანი', 'პაიპლაინი'], ru: ['Роутинг', 'Умный', 'Пайплайн'] },
  },
  {
    slug: 'business', icon: '💼', accent: '#fbbf24',
    name: { en: 'Business Intelligence', ka: 'ბიზნესი', ru: 'Бизнес' },
    desc: { en: 'Reports, dashboards & strategic content', ka: 'ანგარიშები და ბიზნეს კონტენტი', ru: 'Отчёты, дашборды и контент' },
    tags: { en: ['Reports', 'Strategy', 'KPIs'], ka: ['ანგარიშები', 'სტრატეგია', 'KPI'], ru: ['Отчёты', 'Стратегия', 'KPI'] },
  },
]

function ChevronLeft() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
}
function ChevronRight() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 6 15 12 9 18" /></svg>
}

export function ServicesSlider() {
  const { language } = useLanguage()
  const lang = (language as Lang) || 'en'
  const c = COPY[lang] || COPY.en

  const trackRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollStart, setScrollStart] = useState(0)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(true)

  const checkEdges = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }, [])

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    checkEdges()
    el.addEventListener('scroll', checkEdges, { passive: true })
    window.addEventListener('resize', checkEdges)
    return () => { el.removeEventListener('scroll', checkEdges); window.removeEventListener('resize', checkEdges) }
  }, [checkEdges])

  /* Drag/swipe handlers */
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = trackRef.current
    if (!el) return
    setIsDragging(true)
    setStartX(e.clientX)
    setScrollStart(el.scrollLeft)
    el.setPointerCapture(e.pointerId)
    el.style.cursor = 'grabbing'
    el.style.scrollSnapType = 'none'
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return
    const el = trackRef.current
    if (!el) return
    const dx = e.clientX - startX
    el.scrollLeft = scrollStart - dx
  }, [isDragging, startX, scrollStart])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return
    setIsDragging(false)
    const el = trackRef.current
    if (!el) return
    el.releasePointerCapture(e.pointerId)
    el.style.cursor = ''
    el.style.scrollSnapType = 'x mandatory'
  }, [isDragging])

  const scroll = useCallback((dir: 'left' | 'right') => {
    const el = trackRef.current
    if (!el) return
    const card = el.querySelector<HTMLElement>(':scope > a')
    const w = card ? card.offsetWidth + 16 : 300
    el.scrollBy({ left: dir === 'left' ? -w : w, behavior: 'smooth' })
  }, [])

  return (
    <section className="relative py-16 sm:py-24 overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 50% at 50% 30%, rgba(34,211,238,0.04) 0%, transparent 70%)' }} />

      <div className="relative max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10 sm:mb-14 px-4 sm:px-6">
          <p className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase font-bold mb-3" style={{ color: '#22d3ee' }}>
            {c.eyebrow}
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
            {c.title}
          </h2>
          <p className="mt-3 text-sm sm:text-base max-w-xl mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
            {c.sub}
          </p>
        </div>

        {/* Nav arrows */}
        <div className="hidden md:flex justify-end gap-2 mb-4 px-6 lg:px-10">
          <button
            onClick={() => scroll('left')}
            disabled={!canLeft}
            className="p-2.5 rounded-xl transition-all duration-200 disabled:opacity-20 hover:scale-105 active:scale-95"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--color-text-secondary)' }}
            aria-label="Previous"
          >
            <ChevronLeft />
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={!canRight}
            className="p-2.5 rounded-xl transition-all duration-200 disabled:opacity-20 hover:scale-105 active:scale-95"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--color-text-secondary)' }}
            aria-label="Next"
          >
            <ChevronRight />
          </button>
        </div>

        {/* Drag track */}
        <div
          ref={trackRef}
          className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory no-scrollbar px-4 sm:px-6 lg:px-10 select-none touch-pan-x"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {CARDS.map(card => (
            <Link
              key={card.slug}
              href={`/${language}/services/${card.slug}`}
              draggable={false}
              className="group relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 shrink-0 snap-start"
              style={{
                width: 'clamp(240px, 72vw, 280px)',
                background: 'linear-gradient(165deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
              onClick={e => { if (isDragging) e.preventDefault() }}
            >
              {/* Hover glow */}
              <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ boxShadow: `inset 0 0 0 1px ${card.accent}44, 0 0 32px ${card.accent}10` }}
              />

              <div className="p-5 flex flex-col flex-1">
                {/* Icon + Name */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${card.accent}18, ${card.accent}08)`,
                      border: `1px solid ${card.accent}25`,
                    }}
                  >
                    {card.icon}
                  </div>
                  <h3 className="text-sm font-semibold transition-colors group-hover:text-[var(--color-accent)]" style={{ color: 'rgba(255,255,255,0.9)' }}>
                    {card.name[lang]}
                  </h3>
                </div>

                {/* Desc */}
                <p className="text-xs leading-relaxed mb-4 flex-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {card.desc[lang]}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {card.tags[lang].map(t => (
                    <span
                      key={t}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-md"
                      style={{ background: `${card.accent}12`, border: `1px solid ${card.accent}20`, color: `${card.accent}bb` }}
                    >
                      {t}
                    </span>
                  ))}
                </div>

                {/* Launch arrow */}
                <div className="flex items-center gap-1 text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ color: card.accent }}>
                  <span>{lang === 'ka' ? 'გამოიყენე' : lang === 'ru' ? 'Открыть' : 'Launch'}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /><polyline points="12 5 19 12 12 19" /></svg>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* View all */}
        <div className="text-center mt-10 px-4">
          <Link
            href={`/${language}/services`}
            className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-cyan-500/10"
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
