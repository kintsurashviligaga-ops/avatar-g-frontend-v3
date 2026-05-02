'use client'

import React from 'react'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const STATS_COPY = {
  en: {
    label1: 'AI Services',
    label2: 'Languages',
    label3: 'Creative Possibilities',
    label4: 'Platform',
  },
  ka: {
    label1: 'AI სერვისი',
    label2: 'ენა',
    label3: 'შემოქმედებითი შესაძლებლობა',
    label4: 'პლატფორმა',
  },
  ru: {
    label1: 'AI Сервисов',
    label2: 'Языка',
    label3: 'Творческих возможностей',
    label4: 'Платформа',
  },
} as const

export function StatsSection() {
  const { language } = useLanguage()
  const c = STATS_COPY[language] || STATS_COPY.en

  const stats = [
    { value: 13, suffix: '', label: c.label1, isInfinity: false },
    { value: 3, suffix: '', label: c.label2, isInfinity: false },
    { value: 0, suffix: '', label: c.label3, isInfinity: true },
    { value: 1, suffix: '', label: c.label4, isInfinity: false },
  ]

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-16 overflow-hidden">
      {/* Subtle background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 50%, rgba(0,212,255,0.04) 0%, transparent 70%)',
        }}
      />

      <div className="relative max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row items-stretch divide-y sm:divide-y-0 sm:divide-x divide-white/8 rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.02)] overflow-hidden backdrop-blur-sm">
          {stats.map((stat, i) => (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-center py-10 px-6 text-center relative group"
            >
              {/* Number */}
              <div className="mb-2">
                {stat.isInfinity ? (
                  <span
                    className="text-5xl sm:text-6xl font-extrabold tracking-tight"
                    style={{
                      background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    ∞
                  </span>
                ) : (
                  <span
                    style={{
                      background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
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
              <p className="text-sm text-white/50 font-medium">{stat.label}</p>

              {/* Hover glow */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{
                  background:
                    'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(0,212,255,0.04) 0%, transparent 70%)',
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
