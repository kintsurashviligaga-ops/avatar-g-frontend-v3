'use client'

import React from 'react'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { motion } from 'framer-motion'

const STATS_COPY = {
  en: {
    stats: [
      { value: 14, suffix: '', label: 'AI Services', sub: 'Voice · Image · Video · Music', isInfinity: false },
      { value: 3, suffix: '', label: 'Languages', sub: 'Georgian · English · Russian', isInfinity: false },
      { value: 200, suffix: '+', label: 'Free Credits', sub: 'No card required', isInfinity: false },
      { value: 0, suffix: '', label: 'Possibilities', sub: 'Unlimited creativity', isInfinity: true },
    ],
  },
  ka: {
    stats: [
      { value: 14, suffix: '', label: 'AI სერვისი', sub: 'ხმა · სურათი · ვიდეო · მუსიკა', isInfinity: false },
      { value: 3, suffix: '', label: 'ენა', sub: 'ქართული · ინგლისური · რუსული', isInfinity: false },
      { value: 200, suffix: '+', label: 'უფასო კრედიტი', sub: 'ბარათი არ სჭირდება', isInfinity: false },
      { value: 0, suffix: '', label: 'შესაძლებლობა', sub: 'შეუზღუდავი კრეატივობა', isInfinity: true },
    ],
  },
  ru: {
    stats: [
      { value: 14, suffix: '', label: 'AI Сервисов', sub: 'Голос · Фото · Видео · Музыка', isInfinity: false },
      { value: 3, suffix: '', label: 'Языка', sub: 'Грузинский · Английский · Русский', isInfinity: false },
      { value: 200, suffix: '+', label: 'Бесплатных кредитов', sub: 'Без карты', isInfinity: false },
      { value: 0, suffix: '', label: 'Возможностей', sub: 'Безграничное творчество', isInfinity: true },
    ],
  },
} as const

export function StatsSection() {
  const { language } = useLanguage()
  const c = STATS_COPY[language] || STATS_COPY.en

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-16 overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 50%, rgba(0,212,255,0.04) 0%, transparent 70%)',
        }}
      />

      <div className="relative max-w-5xl mx-auto">
        <div
          className="flex flex-col sm:flex-row items-stretch divide-y sm:divide-y-0 sm:divide-x rounded-2xl overflow-hidden"
          style={{
            border: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(255,255,255,0.02)',
            backdropFilter: 'blur(8px)',
          }}
        >
          {c.stats.map((stat, i) => (
            <motion.div
              key={i}
              className="flex-1 flex flex-col items-center justify-center py-10 px-6 text-center relative group"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              style={{ borderColor: 'rgba(255,255,255,0.06)' }}
            >
              {/* Hover glow */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{
                  background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(0,212,255,0.05) 0%, transparent 70%)',
                }}
              />

              {/* Number */}
              <div className="mb-1 relative z-10">
                {stat.isInfinity ? (
                  <span
                    className="text-5xl sm:text-6xl font-extrabold tracking-tight"
                    style={{
                      background: 'linear-gradient(135deg, #00d4ff, #0284c7)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    ∞
                  </span>
                ) : (
                  <span
                    style={{
                      background: 'linear-gradient(135deg, #00d4ff, #0284c7)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    <AnimatedCounter
                      value={stat.value}
                      suffix={stat.suffix}
                      duration={1600}
                      className="text-5xl sm:text-6xl font-extrabold tracking-tight"
                    />
                  </span>
                )}
              </div>

              {/* Label */}
              <p className="text-sm font-semibold text-white/60 mb-1 relative z-10">{stat.label}</p>

              {/* Sub-label */}
              <p className="text-[11px] text-white/30 font-medium tracking-wide relative z-10">{stat.sub}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
