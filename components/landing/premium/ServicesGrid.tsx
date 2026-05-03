'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { NeonBadge } from '@/components/ui/NeonBadge'
import { cn } from '@/lib/utils'

type LangKey = 'en' | 'ka' | 'ru'
type BadgeColor = 'cyan' | 'violet' | 'emerald' | 'crimson' | 'gold'

interface Service {
  id: string
  icon: string
  name: Record<LangKey, string>
  desc: Record<LangKey, string>
  color: BadgeColor
  href: string
}

const SERVICES: Service[] = [
  {
    id: 'avatar',
    icon: '👤',
    name: { en: 'Avatar Builder', ka: 'ავატარ ბილდერი', ru: 'Аватар' },
    desc: { en: 'Create AI avatars from photos', ka: 'AI ავატარების შექმნა ფოტოდან', ru: 'Создавайте AI-аватары' },
    color: 'cyan',
    href: '/services/avatar',
  },
  {
    id: 'video',
    icon: '🎬',
    name: { en: 'Video Studio', ka: 'ვიდეო სტუდია', ru: 'Видео Студия' },
    desc: { en: 'Generate AI-powered videos', ka: 'AI ვიდეოების გენერაცია', ru: 'Генерируйте AI-видео' },
    color: 'violet',
    href: '/services/video',
  },
  {
    id: 'image',
    icon: '🖼️',
    name: { en: 'Image Generator', ka: 'სურათის გენერატორი', ru: 'Генератор изображений' },
    desc: { en: 'Create stunning AI images', ka: 'AI სურათების შექმნა', ru: 'Создавайте AI-изображения' },
    color: 'violet',
    href: '/services/image',
  },
  {
    id: 'music',
    icon: '🎵',
    name: { en: 'Music Studio', ka: 'მუსიკის სტუდია', ru: 'Музыкальная Студия' },
    desc: { en: 'Compose AI music tracks', ka: 'AI მუსიკის შექმნა', ru: 'Сочиняйте AI-музыку' },
    color: 'cyan',
    href: '/services/music',
  },
  {
    id: 'voice',
    icon: '🗣️',
    name: { en: 'Voice Clone', ka: 'ხმის კლონი', ru: 'Клонирование Голоса' },
    desc: { en: 'Clone and synthesize voices', ka: 'ხმის კლონირება', ru: 'Клонируйте голоса' },
    color: 'cyan',
    href: '/services/voice',
  },
  {
    id: 'agent',
    icon: '🤖',
    name: { en: 'Agent G', ka: 'Agent G', ru: 'Agent G' },
    desc: { en: 'AI orchestrator for any task', ka: 'AI ორკესტრატორი', ru: 'AI-оркестратор' },
    color: 'violet',
    href: '/services/agent-g',
  },
  {
    id: 'text',
    icon: '✍️',
    name: { en: 'Text & Copy', ka: 'ტექსტი', ru: 'Текст и Копирайтинг' },
    desc: { en: 'AI copywriting & content', ka: 'AI კოპირაიტინგი', ru: 'AI-копирайтинг' },
    color: 'emerald',
    href: '/services/text',
  },
  {
    id: 'translate',
    icon: '🌐',
    name: { en: 'Translator', ka: 'თარჯიმანი', ru: 'Переводчик' },
    desc: { en: 'Translate between languages', ka: 'ენებს შორის თარგმნა', ru: 'Переводите тексты' },
    color: 'cyan',
    href: '/services/translate',
  },
  {
    id: 'podcast',
    icon: '🎙️',
    name: { en: 'Podcast Studio', ka: 'პოდკასტ სტუდია', ru: 'Подкаст Студия' },
    desc: { en: 'Create AI podcast content', ka: 'AI პოდკასტის შექმნა', ru: 'Создавайте подкасты' },
    color: 'violet',
    href: '/services/podcast',
  },
  {
    id: 'character',
    icon: '🎭',
    name: { en: 'Character AI', ka: 'პერსონაჟის AI', ru: 'Персонаж AI' },
    desc: { en: 'Build custom AI characters', ka: 'AI პერსონაჟების შექმნა', ru: 'Создавайте AI-персонажей' },
    color: 'violet',
    href: '/services/character',
  },
  {
    id: 'calls',
    icon: '📞',
    name: { en: 'Voice Calls', ka: 'ხმოვანი ზარები', ru: 'Голосовые Звонки' },
    desc: { en: 'AI voice call automation', ka: 'AI ზარების ავტომატიზაცია', ru: 'Автоматизируйте звонки' },
    color: 'cyan',
    href: '/services/voice-calls',
  },
  {
    id: 'analytics',
    icon: '📊',
    name: { en: 'Analytics', ka: 'ანალიტიკა', ru: 'Аналитика' },
    desc: { en: 'AI-powered insights & data', ka: 'AI ანალიტიკა', ru: 'AI-аналитика' },
    color: 'emerald',
    href: '/services/analytics',
  },
  {
    id: 'event',
    icon: '🎪',
    name: { en: 'Event Studio', ka: 'ივენთ სტუდია', ru: 'Event Студия' },
    desc: { en: 'AI event content creation', ka: 'AI ივენთ კონტენტი', ru: 'AI для мероприятий' },
    color: 'violet',
    href: '/services/event',
  },
]

const SECTION_COPY = {
  en: { title: 'Everything you need to create with AI', subtitle: '13 powerful tools. One unified platform.' },
  ka: { title: 'ყველაფერი AI-ით შექმნისთვის', subtitle: '13 ძლიერი ინსტრუმენტი. ერთი პლატფორმა.' },
  ru: { title: 'Всё для AI-творчества', subtitle: '13 мощных инструментов. Одна платформа.' },
} as const

interface ServiceCardProps {
  service: Service
  locale: LangKey
  index: number
}

function ServiceCard({ service, locale, index }: ServiceCardProps) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const featured = index < 3

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          const delay = (index % 4) * 60
          setTimeout(() => setVisible(true), delay)
          observer.disconnect()
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [index])

  const accentCyan = service.color === 'cyan'
  const accentViolet = service.color === 'violet'

  const borderHover = accentCyan
    ? 'hover:border-cyan-500/50 hover:shadow-[0_12px_40px_rgba(0,212,255,0.15)]'
    : accentViolet
    ? 'hover:border-violet-500/50 hover:shadow-[0_12px_40px_rgba(124,58,237,0.15)]'
    : 'hover:border-emerald-500/50 hover:shadow-[0_12px_40px_rgba(16,185,129,0.12)]'

  const iconGlow = accentCyan
    ? 'group-hover:drop-shadow-[0_0_16px_rgba(0,212,255,0.8)]'
    : accentViolet
    ? 'group-hover:drop-shadow-[0_0_16px_rgba(124,58,237,0.8)]'
    : 'group-hover:drop-shadow-[0_0_16px_rgba(16,185,129,0.8)]'

  const glowAccent = accentCyan ? 'rgba(0,212,255,0.06)' : accentViolet ? 'rgba(124,58,237,0.06)' : 'rgba(16,185,129,0.05)'
  const iconBg = accentCyan ? 'rgba(0,212,255,0.1)' : accentViolet ? 'rgba(124,58,237,0.1)' : 'rgba(16,185,129,0.08)'

  return (
    <div
      ref={ref}
      className={cn(
        'transform transition-all duration-500',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8',
        featured && 'sm:row-span-2',
      )}
    >
      <Link
        href={`/${locale}${service.href}`}
        className={cn(
          'group relative flex flex-col gap-4 rounded-2xl border border-white/8 transition-all duration-300 hover:-translate-y-1.5 h-full',
          featured ? 'p-6 sm:p-7 bg-[rgba(255,255,255,0.04)]' : 'p-5 bg-[rgba(255,255,255,0.02)]',
          borderHover,
        )}
        style={featured ? { boxShadow: `inset 0 0 60px ${glowAccent}` } : undefined}
      >
        {/* Featured top gradient bar */}
        {featured && (
          <div
            className="absolute top-0 left-0 right-0 h-px rounded-t-2xl"
            style={{
              background: accentCyan
                ? 'linear-gradient(90deg, transparent, rgba(0,212,255,0.5), transparent)'
                : accentViolet
                ? 'linear-gradient(90deg, transparent, rgba(124,58,237,0.5), transparent)'
                : 'linear-gradient(90deg, transparent, rgba(0,200,150,0.5), transparent)',
            }}
          />
        )}

        {/* Icon */}
        <div
          className={cn(
            'flex items-center justify-center rounded-xl transition-all duration-300 flex-shrink-0',
            featured ? 'text-3xl w-14 h-14' : 'text-2xl w-10 h-10',
            iconGlow,
          )}
          style={{ backgroundColor: iconBg }}
        >
          {service.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={cn('font-bold text-white/95 mb-1.5', featured ? 'text-base sm:text-lg' : 'text-sm truncate')}>
            {service.name[locale]}
          </p>
          <p className={cn('leading-relaxed text-white/50', featured ? 'text-[13px] sm:text-sm line-clamp-3' : 'text-[12px] line-clamp-2')}>
            {service.desc[locale]}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto">
          <NeonBadge color={service.color} className={featured ? 'text-[10px]' : 'text-[9px]'}>
            {service.color === 'cyan' ? 'AI' : service.color === 'emerald' ? 'data' : 'studio'}
          </NeonBadge>
          <span className={cn(
            'text-white/30 group-hover:text-white/80 group-hover:translate-x-1 transition-all duration-200',
            featured ? 'text-base' : 'text-sm',
          )}>
            →
          </span>
        </div>
      </Link>
    </div>
  )
}

export function ServicesGrid() {
  const { language } = useLanguage()
  const locale = language as LangKey
  const c = SECTION_COPY[locale] || SECTION_COPY.en

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      {/* Background glows */}
      <div
        className="absolute top-0 left-1/4 w-[600px] h-[400px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(0,212,255,0.05) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />
      <div
        className="absolute bottom-0 right-1/4 w-[500px] h-[400px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(124,58,237,0.05) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />

      <div className="relative max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <NeonBadge color="cyan" pulse className="mb-4">
            13 AI Services
          </NeonBadge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white/95 mb-4">
            {c.title}
          </h2>
          <p className="text-base text-white/50 max-w-md mx-auto">{c.subtitle}</p>
        </div>

        {/* Grid — first 3 cards span 2 rows on sm+ (featured) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 sm:grid-rows-[auto_auto_auto]">
          {SERVICES.map((service, index) => (
            <ServiceCard key={service.id} service={service} locale={locale} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}
