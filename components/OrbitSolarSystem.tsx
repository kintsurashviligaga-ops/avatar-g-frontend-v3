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
  { id: 'agent-g', label: { ka: 'აგენტი G', en: 'Agent G', ru: 'Агент G' }, description: { ka: 'კოორდინაციის მთავარი აგენტი', en: 'Primary coordination agent', ru: 'Главный агент координации' }, icon: Bot, color: '#06b6d4', slug: 'agent-g' },
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
@keyframes orbit-node-float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-3px); }
}
@keyframes orbit-pulse-glow {
  0%, 100% { opacity: 0.35; filter: blur(8px); }
  50% { opacity: 0.9; filter: blur(12px); }
}
@keyframes orbit-chip-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes orbit-lux-flicker {
  0%, 100% { opacity: 0.62; }
  50% { opacity: 0.98; }
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
.orbit-node-shell {
  animation: orbit-node-float 3.2s ease-in-out infinite;
}
.orbit-node-shell:hover {
  animation-duration: 1.9s;
}
.orbit-node-active-glow {
  animation: orbit-pulse-glow 1.8s ease-in-out infinite;
}
.orbit-node-chip {
  animation: orbit-chip-spin 7s linear infinite;
}
.orbit-lux-frame {
  animation: orbit-lux-flicker 3.6s ease-in-out infinite;
}
`

export function OrbitSolarSystem() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [radius, setRadius] = useState(165)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const { language: locale } = useLanguage()
  const isPaused = activeId !== null
  const total = ORBIT_SERVICES.length

  useEffect(() => {
    const update = () => {
      if (window.innerWidth >= 768) {
        setRadius(290)
        return
      }
      setRadius(window.innerWidth < 390 ? 150 : 165)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    // Check for generated avatar in localStorage
    try {
      const storedUrl = localStorage.getItem('GENERATED_AVATAR_URL')
      if (storedUrl) {
        setAvatarUrl(storedUrl)
      }
    } catch {
      // Ignore localStorage errors
    }

    // Listen for storage events from other tabs/windows
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'GENERATED_AVATAR_URL') {
        setAvatarUrl(e.newValue)
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  return (
    <section className="relative w-full py-20 md:py-32 overflow-hidden bg-transparent flex items-center justify-center min-h-[560px] md:min-h-[820px] max-md:[@media(orientation:landscape)]:min-h-[420px] pointer-events-none">
      <style dangerouslySetInnerHTML={{ __html: ORBIT_CSS }} />

      {/* Container for Orbit visual elements */}
      <div className="relative w-[320px] h-[320px] sm:w-[340px] sm:h-[340px] md:w-[600px] md:h-[600px] max-md:[@media(orientation:landscape)]:w-[300px] max-md:[@media(orientation:landscape)]:h-[300px] flex items-center justify-center pointer-events-auto">

        <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(6,182,212,0.14)_0%,rgba(6,182,212,0.04)_42%,transparent_68%)]" />

        {/* Core Center */}
        <div className="absolute z-20 flex flex-col items-center justify-center select-none">
          <div className="relative w-24 h-24 md:w-32 md:h-32 rounded-full border border-white/10 bg-black/20 shadow-[0_0_40px_rgba(6,182,212,0.1)] flex items-center justify-center backdrop-blur-sm overflow-hidden">
            {avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={avatarUrl}
                alt="Generated Avatar"
                className="w-full h-full object-cover rounded-full"
                onError={() => setAvatarUrl(null)}
              />
            ) : (
              <Brain className="w-10 h-10 md:w-12 md:h-12 text-cyan-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
            )}
            <div className="absolute inset-0 rounded-full border-2 border-cyan-400/30 animate-ping" style={{ animationDuration: '3s' }} />
          </div>
          <div className="mt-4 text-center">
            <h3 className="text-white font-bold text-lg md:text-xl tracking-tight drop-shadow-lg" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>{avatarUrl ? 'Your Avatar' : 'Core AI'}</h3>
            <p className="text-cyan-400/80 text-xs md:text-sm font-medium drop-shadow-md">{avatarUrl ? (locale === 'ka' ? 'შენი ციფრული იდენტობა' : locale === 'ru' ? 'Твоя цифровая идентичность' : 'Your digital identity') : 'შენი ციფრული იდენტობა'}</p>
          </div>
        </div>

        {/* Outer Orbit Rings */}
        <div className="absolute inset-0 rounded-full border border-white/30 shadow-[0_0_42px_rgba(255,255,255,0.16)] orbit-lux-frame" />
        <div className="absolute inset-[15%] rounded-full border border-white/20 shadow-[0_0_26px_rgba(255,255,255,0.12)]" />

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
                  transform: `translate(${x - 28}px, ${y - 28}px)`,
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
  const accent = service.color
  const microCode = service.id.slice(0, 2).toUpperCase()
  return (
    <Link
      href={'/' + locale + '/services/' + service.slug}
      className={`orbit-node-shell group relative flex items-center justify-center rounded-full transition-all duration-300 z-30
        ${isActive ? 'w-[4.4rem] h-[4.4rem] md:w-24 md:h-24 scale-[1.14]' : 'w-16 h-16 md:w-20 md:h-20 hover:scale-110'}
        border border-white/30 backdrop-blur-md overflow-hidden
      `}
      style={{
        background: `radial-gradient(circle at 28% 24%, rgba(255,255,255,0.7), rgba(255,255,255,0.08) 38%, ${accent}4a 84%), linear-gradient(150deg, rgba(10,20,40,0.78), rgba(4,10,24,0.86))`,
        boxShadow: isActive
          ? `0 0 0 1px rgba(255,255,255,0.32), 0 0 28px rgba(255,255,255,0.24), 0 0 30px ${accent}99, 0 0 64px ${accent}59, inset 0 2px 12px rgba(255,255,255,0.3)`
          : `0 0 0 1px rgba(255,255,255,0.2), 0 0 16px rgba(255,255,255,0.14), 0 0 16px ${accent}66, 0 0 32px ${accent}33, inset 0 2px 8px rgba(255,255,255,0.14)`,
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      aria-label={displayLabel}
    >
      <span className="absolute inset-[3px] rounded-full border border-white/30" />
      <span className="absolute inset-0 rounded-full border border-white/30 shadow-[0_0_18px_rgba(255,255,255,0.22)] orbit-lux-frame" />
      <span
        className={`absolute inset-[-16%] rounded-full orbit-node-active-glow ${isActive ? 'opacity-100' : 'opacity-35'}`}
        style={{ background: `radial-gradient(circle, ${accent}66 0%, transparent 62%)` }}
      />
      <span className="absolute inset-[8%] rounded-full border border-white/20 border-dashed orbit-node-chip" />

      <span className="absolute top-[7px] right-[7px] z-20 rounded-full border border-white/35 bg-black/45 px-1.5 py-0.5 text-[8px] font-semibold tracking-[0.14em] text-white/90">
        {microCode}
      </span>

      <div
        className="relative z-10 flex h-[56%] w-[56%] items-center justify-center rounded-full border border-white/30 bg-black/30"
        style={{ boxShadow: `inset 0 0 14px ${accent}44, 0 0 14px ${accent}44` }}
      >
      <Icon
        className={`w-6 h-6 md:w-7 md:h-7 transition-colors ${isActive ? 'text-white' : 'text-white/85 group-hover:text-white'}`}
        style={{ color: isActive ? accent : undefined }}
      />
      </div>

      {/* Tooltip */}
      <div
        className={`absolute top-full mt-4 left-1/2 -translate-x-1/2 w-[220px] sm:w-[252px] px-4 py-3 rounded-2xl bg-[#0b1020]/95 border border-white/30 text-white shadow-2xl backdrop-blur-xl transition-all duration-200 z-50
          ${isActive ? 'opacity-100 translate-y-0 visible' : 'opacity-0 translate-y-2 invisible'}
        `}
        style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.22), 0 0 26px rgba(255,255,255,0.18), 0 30px 60px rgba(0,0,0,0.55)' }}
      >
        <div className="mb-2 inline-flex items-center rounded-full border border-white/30 bg-white/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/90">
          Orbital Module
        </div>
        <p className="text-sm font-semibold text-white">{displayLabel}</p>
        <p className="mt-1 text-[11px] text-white/78 leading-relaxed">{displayDescription}</p>
        <span className="mt-3 inline-flex items-center rounded-lg border border-white/30 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/90">
          {openLabel}
        </span>
        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#0b1020]/95 border-t border-l border-white/15 transform rotate-45" />
      </div>
    </Link>
  )
}
