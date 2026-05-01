'use client'

/**
 * ServiceHomeDashboard — Modern dashboard view inside the unified shell.
 * Inspired by myavatar-plus Home.tsx: stats grid + service cards + quick actions.
 * Shown when user is at /services or when no specific service is active.
 */

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { getLocalizedServices } from '@/lib/service-registry';
import { motion } from 'framer-motion'

type LocaleKey = 'en' | 'ka' | 'ru'

const CATEGORIES = [
  {
    id: 'creative',
    label: { en: 'Creative Studio', ka: 'კრეატიული სტუდია', ru: 'Креативная студия' },
    services: ['avatar', 'video', 'editing', 'music', 'photo', 'image', 'game', 'interior'],
  },
  {
    id: 'intelligence',
    label: { en: 'Intelligence', ka: 'ინტელექტი', ru: 'Интеллект' },
    services: ['media', 'text', 'prompt', 'visual-intel'],
  },
  {
    id: 'automation',
    label: { en: 'Automation', ka: 'ავტომატიზაცია', ru: 'Автоматизация' },
    services: ['workflow', 'agent-g'],
  },
  {
    id: 'business',
    label: { en: 'Business', ka: 'ბიზნესი', ru: 'Бизнес' },
    services: ['shop', 'software', 'business', 'tourism', 'next'],
  },
]

const T = {
  welcome: { en: 'Welcome to MyAvatar', ka: 'კეთილი იყოს თქვენი მობრძანება', ru: 'Добро пожаловать' },
  subtitle: { en: 'Your AI-powered workspace', ka: 'თქვენი AI სამუშაო გარემო', ru: 'Ваше AI-рабочее пространство' },
  credits: { en: 'Credits', ka: 'კრედიტები', ru: 'Кредиты' },
  generated: { en: 'Generated', ka: 'გენერირებული', ru: 'Создано' },
  workflows: { en: 'Workflows', ka: 'პროცესები', ru: 'Процессы' },
  thisMonth: { en: 'This Month', ka: 'ამ თვეში', ru: 'Этот месяц' },
  openService: { en: 'Open', ka: 'გახსნა', ru: 'Открыть' },
  quickActions: { en: 'Quick Actions', ka: 'სწრაფი ქმედებები', ru: 'Быстрые действия' },
}

interface ServiceHomeDashboardProps {
  locale: string
}

export default function ServiceHomeDashboard({ locale }: ServiceHomeDashboardProps) {
  const { language } = useLanguage()
  const lang = (language as LocaleKey) || 'en'
  const services = getLocalizedServices(lang)
  const serviceMap = new Map(services.map(s => [s.slug, s]))

  const stats = [
    { label: T.credits[lang], value: '1000', icon: '⚡', color: '#00d4ff' },
    { label: T.generated[lang], value: '0', icon: '✨', color: '#a78bfa' },
    { label: T.workflows[lang], value: '0', icon: '🔄', color: '#34d399' },
    { label: T.thisMonth[lang], value: '0', icon: '📊', color: '#f59e0b' },
  ]

  return (
    <div className="h-full w-full overflow-y-auto" style={{ background: '#0a0a0f' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: '#f8fafc' }}>
            {T.welcome[lang]} 👋
          </h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(148,163,184,0.6)' }}>
            {T.subtitle[lang]}
          </p>
        </motion.div>

        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="rounded-xl p-4 group cursor-default"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg">{stat.icon}</span>
                <span className="text-xs font-medium" style={{ color: stat.color }}>—</span>
              </div>
              <p className="text-2xl font-bold mt-2" style={{ color: '#f8fafc' }}>{stat.value}</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(148,163,184,0.5)' }}>{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* ── Quick Actions ── */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgba(148,163,184,0.4)' }}>
            {T.quickActions[lang]}
          </h2>
          <div className="flex flex-wrap gap-2">
            {['agent-g', 'image', 'video', 'music', 'text'].map(slug => {
              const svc = serviceMap.get(slug)
              if (!svc) return null
              return (
                <Link
                  key={slug}
                  href={`/${locale}/services/${slug}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 hover:scale-[1.02]"
                  style={{
                    background: 'rgba(0,212,255,0.06)',
                    border: '1px solid rgba(0,212,255,0.12)',
                    color: '#00d4ff',
                  }}
                >
                  <span>{svc.icon}</span>
                  <span>{svc.name}</span>
                </Link>
              )
            })}
          </div>
        </div>

        {/* ── Service Categories + Cards ── */}
        {CATEGORIES.map((cat, catIdx) => (
          <motion.div
            key={cat.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 + catIdx * 0.05 }}
          >
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(148,163,184,0.5)' }}>
              {cat.label[lang] || cat.label.en}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {cat.services.map(slug => {
                const svc = serviceMap.get(slug)
                if (!svc) return null
                return (
                  <Link
                    key={slug}
                    href={`/${locale}/services/${slug}`}
                    className="group relative rounded-xl p-4 transition-all duration-200 hover:-translate-y-0.5"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {/* Hover glow */}
                    <div
                      className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                      style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(0,212,255,0.04) 0%, transparent 70%)' }}
                    />
                    <div className="relative z-10">
                      <div className="flex items-center gap-3 mb-2">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0 transition-transform duration-200 group-hover:scale-110"
                          style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.12)' }}
                        >
                          {svc.icon}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold truncate" style={{ color: '#f8fafc' }}>{svc.name}</h3>
                        </div>
                      </div>
                      <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'rgba(148,163,184,0.5)' }}>
                        {svc.description}
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(148,163,184,0.4)' }}>
                          {svc.slug}
                        </span>
                        <span
                          className="text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                          style={{ color: '#00d4ff' }}
                        >
                          {T.openService[lang]}
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </motion.div>
        ))}

        {/* ── Footer spacer ── */}
        <div className="h-8" />
      </div>
    </div>
  )
}
