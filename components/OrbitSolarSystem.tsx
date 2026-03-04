'use client'

import React, { useState, useEffect } from 'react'
import { Brain, Sparkles, Video, Music, Image as ImageIcon, MessageSquare, Bot, Cpu, Monitor, Zap, LayoutTemplate, PenTool, Database, Users, Mic, Layers, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'

/* ── Slug map: use SHORT slugs that match app/[locale]/services/[slug]/page.tsx ── */
const ORBIT_SERVICES = [
  { id: 'video', label: { ka: 'ვიდეო სტუდია', en: 'Video Studio', ru: 'Видеостудия' }, description: { ka: 'კინემატიკური ვიდეო გენერაცია', en: 'Cinematic video generation', ru: 'Кинематографичная генерация видео' }, icon: Video, color: '#3b82f6', slug: 'video' },
  { id: 'music', label: { ka: 'მუსიკის სტუდია', en: 'Music Studio', ru: 'Музстудия' }, description: { ka: 'ბითები, ვოკალი, მასტერინგი', en: 'Beats, vocals, mastering', ru: 'Биты, вокал и мастеринг' }, icon: Music, color: '#8b5cf6', slug: 'music' },
  { id: 'photo', label: { ka: 'ფოტო სტუდია', en: 'Photo Studio', ru: 'Фотостудия' }, description: { ka: 'რეტუში და batch დამუშავება', en: 'Retouch and batch processing', ru: 'Ретушь и пакетная обработка' }, icon: ImageIcon, color: '#ec4899', slug: 'photo' },
  { id: 'image', label: { ka: 'სურათების შექმნა', en: 'Image Creator', ru: 'Генератор' }, description: { ka: 'პოსტერები და რეკლამები', en: 'Posters and ad creatives', ru: 'Постеры и рекламные креативы' }, icon: PenTool, color: '#f43f5e', slug: 'image' },
  { id: 'editing', label: { ka: 'ვიდეო რედაქტირება', en: 'Video Editing', ru: 'Редактор' }, description: { ka: 'AI მონტაჟი და subtitle', en: 'AI editing and subtitles', ru: 'AI-монтаж и субтитры' }, icon: Users, color: '#f59e0b', slug: 'editing' },
  { id: 'agent-g', label: { ka: 'აგენტი G', en: 'Agent G', ru: 'Агент G' }, description: { ka: 'ორკესტრაციის მთავარი აგენტი', en: 'Primary orchestration agent', ru: 'Главный агент оркестрации' }, icon: Bot, color: '#06b6d4', slug: 'agent-g' },
  { id: 'text', label: { ka: 'ტექსტის გენერაცია', en: 'Text AI', ru: 'Текст AI' }, description: { ka: 'რეკლამა, SEO და კონტენტი', en: 'Ads, SEO and content', ru: 'Реклама, SEO и контент' }, icon: MessageSquare, color: '#6366f1', slug: 'text' },
  { id: 'workflow', label: { ka: 'ავტომატიზაცია', en: 'Workflows', ru: 'Процессы' }, description: { ka: 'პროცესების ავტომატიზაცია', en: 'Pipeline automation', ru: 'Автоматизация процессов' }, icon: Zap, color: '#eab308', slug: 'workflow' },
  { id: 'prompt', label: { ka: 'პრომპტ ბილდერი', en: 'Prompt Builder', ru: 'Промпт' }, description: { ka: 'სტაბილური prompt სისტემები', en: 'Reusable prompt systems', ru: 'Переиспользуемые промпты' }, icon: Database, color: '#0ea5e9', slug: 'prompt' },
  { id: 'visual-intel', label: { ka: 'ვიზუალური AI', en: 'Visual Intel', ru: 'Визуальный AI' }, description: { ka: 'ვიზუალების ანალიზი', en: 'Visual quality analysis', ru: 'Анализ визуального качества' }, icon: Cpu, color: '#d946ef', slug: 'visual-intel' },
  { id: 'media', label: { ka: 'მედია პროდუქცია', en: 'Media', ru: 'Медиа' }, description: { ka: 'სრული კამპანიის პაკეტი', en: 'Full campaign pack', ru: 'Полный пакет кампании' }, icon: Monitor, color: '#84cc16', slug: 'media' },
  { id: 'software', label: { ka: 'პროგრამირება', en: 'Software', ru: 'Софт' }, description: { ka: 'აპების/საიტების შექმნა', en: 'Build apps and sites', ru: 'Создание приложений и сайтов' }, icon: LayoutTemplate, color: '#f97316', slug: 'software' },
  { id: 'business', label: { ka: 'ბიზნესი', en: 'Business', ru: 'Бизнес' }, description: { ka: 'სტრატეგია და CRM', en: 'Strategy and CRM flows', ru: 'Стратегия и CRM-процессы' }, icon: Layers, color: '#14b8a6', slug: 'business' },
  { id: 'tourism', label: { ka: 'ტურიზმი', en: 'Tourism', ru: 'Туризм' }, description: { ka: 'მოგზაურობის AI გეგმები', en: 'AI travel planning', ru: 'AI-планирование путешествий' }, icon: Mic, color: '#10b981', slug: 'tourism' },
  { id: 'avatar', label: { ka: 'ავატარი', en: 'Avatar', ru: 'Аватар' }, description: { ka: 'ციფრული იდენტობის შექმნა', en: 'Digital identity creation', ru: 'Создание цифровой идентичности' }, icon: Brain, color: '#64748b', slug: 'avatar' },
  { id: 'shop', label: { ka: 'მაღაზია', en: 'Shop', ru: 'Магазин' }, description: { ka: 'მონეტიზაცია და გაყიდვები', en: 'Monetization and storefront', ru: 'Монетизация и витрина' }, icon: Sparkles, color: '#f43f5e', slug: 'shop' },
]

interface OrbitService {
  id: string
  label: Record<string, string>
  description: Record<string, string>
  icon: LucideIcon
  color: string
  slug: string
}

const ORBIT_CSS = `
@keyframes orbit-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes orbit-counter-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(-360deg); }
}
.orbit-container {
  animation: orbit-spin 60s linear infinite;
}
.orbit-item-counter {
  animation: orbit-counter-spin 60s linear infinite;
}
.orbit-paused {
  animation-play-state: paused !important;
}
.orbit-running {
  animation-play-state: running;
}
`

export function OrbitSolarSystem() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [radius, setRadius] = useState(165)
  const { language: locale } = useLanguage()
  const isPaused = activeId !== null
  const total = ORBIT_SERVICES.length

  useEffect(() => {
    const update = () => setRadius(window.innerWidth >= 768 ? 290 : 165)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return (
    <section className="relative w-full py-24 md:py-32 overflow-hidden bg-transparent flex items-center justify-center min-h-[600px] md:min-h-[800px] pointer-events-none">
      <style dangerouslySetInnerHTML={{ __html: ORBIT_CSS }} />

      {/* Container for Orbit visual elements */}
      <div className="relative w-[340px] h-[340px] md:w-[600px] md:h-[600px] flex items-center justify-center pointer-events-auto">

        {/* Core Center */}
        <div className="absolute z-20 flex flex-col items-center justify-center select-none">
          <div className="relative w-24 h-24 md:w-32 md:h-32 rounded-full border border-white/10 bg-black/20 shadow-[0_0_40px_rgba(6,182,212,0.1)] flex items-center justify-center backdrop-blur-sm">
            <Brain className="w-10 h-10 md:w-12 md:h-12 text-cyan-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
            <div className="absolute inset-0 rounded-full border-2 border-cyan-400/30 animate-ping" style={{ animationDuration: '3s' }} />
          </div>
          <div className="mt-4 text-center">
            <h3 className="text-white font-bold text-lg md:text-xl tracking-tight drop-shadow-lg" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>Core AI</h3>
            <p className="text-cyan-400/80 text-xs md:text-sm font-medium drop-shadow-md">შენი ციფრული იდენტობა</p>
          </div>
        </div>

        {/* Outer Orbit Rings */}
        <div className="absolute inset-0 rounded-full border border-white/[0.1] shadow-[0_0_30px_rgba(255,255,255,0.05)]" />
        <div className="absolute inset-[15%] rounded-full border border-white/[0.05]" />

        {/* Orbit Rotating Container */}
        <div className={`absolute inset-0 w-full h-full orbit-container ${isPaused ? 'orbit-paused' : 'orbit-running'}`}>
          {ORBIT_SERVICES.map((service, i) => {
            const angle = (360 / total) * i
            const rad = (angle * Math.PI) / 180
            const x = Math.cos(rad) * radius
            const y = Math.sin(rad) * radius

            return (
              <div
                key={service.id}
                className="absolute top-1/2 left-1/2"
                style={{
                  transform: `translate(${x - 24}px, ${y - 24}px)`,
                }}
              >
                <div className={`orbit-item-counter flex items-center justify-center ${isPaused ? 'orbit-paused' : 'orbit-running'}`}>
                  <OrbitNodeContent
                    service={service}
                    locale={locale || 'ka'}
                    isActive={activeId === service.id}
                    onEnter={() => setActiveId(service.id)}
                    onLeave={() => setActiveId(null)}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function OrbitNodeContent({ service, locale, isActive, onEnter, onLeave }: { service: OrbitService; locale: string; isActive: boolean; onEnter: () => void; onLeave: () => void }) {
  const Icon = service.icon
  const displayLabel = service.label[locale] || service.label.ka
  const displayDescription = service.description[locale] || service.description.ka
  const openLabel = locale === 'ka' ? 'სერვისის გახსნა' : locale === 'ru' ? 'Открыть сервис' : 'Open service'
  return (
    <Link
      href={'/' + locale + '/services/' + service.slug}
      className={`group relative flex items-center justify-center rounded-full transition-all duration-300 z-30
        ${isActive ? 'w-14 h-14 md:w-16 md:h-16 bg-[#1a1a2e] border-cyan-400 scale-110 shadow-[0_0_20px_rgba(6,182,212,0.4)]' : 'w-12 h-12 md:w-14 md:h-14 bg-[#11111a]/80 border-white/10 hover:bg-[#1a1a2e] hover:scale-105'}
        border backdrop-blur-sm
      `}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      aria-label={displayLabel}
    >
      <Icon
        className={`w-5 h-5 md:w-6 md:h-6 transition-colors relative z-10 ${isActive ? 'text-white' : 'text-white/70 group-hover:text-white'}`}
        style={{ color: isActive ? service.color : undefined }}
      />

      {/* Tooltip */}
      <div
        className={`absolute top-full mt-4 left-1/2 -translate-x-1/2 w-[220px] px-4 py-3 rounded-2xl bg-[#0f0f1a]/90 border border-white/15 text-white shadow-2xl backdrop-blur-xl transition-all duration-200 z-50
          ${isActive ? 'opacity-100 translate-y-0 visible' : 'opacity-0 translate-y-2 invisible'}
        `}
      >
        <p className="text-sm font-semibold text-white">{displayLabel}</p>
        <p className="mt-1 text-[11px] text-white/65 leading-relaxed">{displayDescription}</p>
        <span className="mt-3 inline-flex items-center rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-200">
          {openLabel}
        </span>
        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#0f0f1a]/95 border-t border-l border-white/10 transform rotate-45" />
      </div>
    </Link>
  )
}
