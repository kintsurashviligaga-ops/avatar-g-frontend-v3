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

  const borderColor =
    service.color === 'cyan'
      ? 'hover:border-cyan-500/40 hover:shadow-[0_8px_30px_rgba(0,212,255,0.12)]'
      : service.color === 'violet'
      ? 'hover:border-violet-500/40 hover:shadow-[0_8px_30px_rgba(124,58,237,0.12)]'
      : 'hover:border-emerald-500/40 hover:shadow-[0_8px_30px_rgba(16,185,129,0.12)]'

  const iconGlow =
    service.color === 'cyan'
      ? 'group-hover:drop-shadow-[0_0_12px_rgba(0,212,255,0.7)]'
      : service.color === 'violet'
      ? 'group-hover:drop-shadow-[0_0_12px_rgba(124,58,237,0.7)]'
      : 'group-hover:drop-shadow-[0_0_12px_rgba(16,185,129,0.7)]'

  return (
    <div
      ref={ref}
      className={cn(
        'transform transition-all duration-500',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
      )}
    >
      <Link
        href={`/${locale}${service.href}`}
        className={cn(
          'group relative flex flex-col gap-3 p-5 rounded-2xl border border-white/8 transition-all duration-300 hover:-translate-y-1',
          'bg-[rgba(255,255,255,0.03)]',
          borderColor,
        )}
      >
        {/* Icon */}
        <div
          className={cn(
            'text-2xl w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300',
            iconGlow,
          )}
          style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
        >
          {service.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white/90 mb-1 truncate">{service.name[locale]}</p>
          <p className="text-[12px] leading-relaxed text-white/45 line-clamp-2">{service.desc[locale]}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-1">
          <NeonBadge color={service.color} className="text-[9px]">
            {service.color === 'cyan' ? 'AI' : service.color === 'emerald' ? 'data' : 'studio'}
          </NeonBadge>
          <span className="text-white/30 group-hover:text-white/70 transition-colors duration-200 text-sm">
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

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {SERVICES.map((service, index) => (
            <ServiceCard key={service.id} service={service} locale={locale} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}
