'use client'

import { motion, useInView } from 'framer-motion'
import { useRef, useEffect, useState, useCallback } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })
  const [value, setValue] = useState(0)

  const animate = useCallback(() => {
    const duration = 1800
    const start = performance.now()
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 4) // ease-out quartic
      setValue(Math.round(eased * target))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target])

  useEffect(() => {
    if (isInView) animate()
  }, [isInView, animate])

  return (
    <span ref={ref}>
      {value.toLocaleString()}{suffix}
    </span>
  )
}

export function StatsSection() {
  const { language } = useLanguage()

  const labels = {
    en: ['AI modules active', 'outputs generated', 'platform interactions', 'uptime guarantee'],
    ka: ['AI მოდული', 'გენერირებული შედეგი', 'ინტერაქცია', 'uptime გარანტია'],
    ru: ['AI модулей активно', 'результатов создано', 'взаимодействий', 'гарантия аптайма'],
  } as const

  const localLabels = labels[language as keyof typeof labels] || labels.en

  const stats = [
    { value: 17, suffix: '+', label: localLabels[0], color: 'from-cyan-400 to-blue-500' },
    { value: 250, suffix: 'K+', label: localLabels[1], color: 'from-violet-400 to-indigo-500' },
    { value: 5, suffix: 'M+', label: localLabels[2], color: 'from-rose-400 to-pink-500' },
    { value: 99, suffix: '.9%', label: localLabels[3], color: 'from-emerald-400 to-teal-500' },
  ]

  return (
    <section className="relative py-16 md:py-20 px-4 sm:px-6 border-t border-white/[0.05]">
      <div className="mx-auto max-w-5xl">
        <motion.div
          className="relative rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#04070F]/90 via-[#0A1222]/80 to-[#04070F]/90 backdrop-blur-xl p-8 md:p-14 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          {/* Decorative gradient orbs */}
          <div className="absolute top-0 left-1/4 w-80 h-80 bg-cyan-500/[0.05] rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-violet-500/[0.05] rounded-full blur-[120px] pointer-events-none" />
          {/* Subtle grid */}
          <div
            className="absolute inset-0 opacity-[0.016] pointer-events-none"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />

          <div className="relative grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-10">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                className="text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <div className={`text-3xl md:text-4xl lg:text-5xl font-extrabold bg-gradient-to-br ${stat.color} bg-clip-text text-transparent tracking-tight`}>
                  <AnimatedCounter
                    target={stat.value}
                    suffix={stat.suffix}
                  />
                </div>
                <div className="mt-3 text-[10px] md:text-xs text-white/38 uppercase tracking-[0.2em] font-medium">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
