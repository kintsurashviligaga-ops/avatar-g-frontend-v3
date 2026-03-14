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
    { value: 250, suffix: 'K+', label: localLabels[1], color: 'from-sky-400 to-blue-500' },
    { value: 5, suffix: 'M+', label: localLabels[2], color: 'from-rose-400 to-pink-500' },
    { value: 99, suffix: '.9%', label: localLabels[3], color: 'from-emerald-400 to-teal-500' },
  ]

  return (
    <section className="relative py-16 md:py-20 px-4 sm:px-6 overflow-hidden">
      {/* Section separator */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      <div className="mx-auto max-w-5xl">
        <motion.div
          className="relative rounded-3xl border border-white/[0.07] bg-gradient-to-br from-[#040810]/95 via-[#080e20]/90 to-[#040810]/95 backdrop-blur-2xl p-0 overflow-hidden shadow-[0_40px_120px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.07)]"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          {/* Neon top edge */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
          {/* Neon bottom edge */}
          <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
          {/* Ambient glows */}
          <div className="absolute -top-20 left-1/4 w-96 h-96 bg-cyan-500/[0.06] rounded-full blur-[140px] pointer-events-none" />
          <div className="absolute -bottom-20 right-1/4 w-96 h-96 bg-cyan-500/[0.06] rounded-full blur-[140px] pointer-events-none" />
          {/* Scan line animation */}
          <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-300/25 to-transparent animate-neon-scan pointer-events-none" />
          {/* Fine grid */}
          <div
            className="absolute inset-0 opacity-[0.016] pointer-events-none rounded-2xl overflow-hidden"
            style={{
              backgroundImage: 'linear-gradient(rgba(148,163,184,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.4) 1px, transparent 1px)',
              backgroundSize: '52px 52px',
            }}
          />

          <div className="relative grid grid-cols-2 md:grid-cols-4 gap-1">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                className="relative text-center py-8 px-4 group"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                {/* Vertical separator */}
                {i < stats.length - 1 && (
                  <div className="hidden md:block absolute right-0 top-1/4 bottom-1/4 w-px bg-gradient-to-b from-transparent via-white/[0.08] to-transparent" />
                )}
                {/* Hover glow */}
                <div className={`absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br ${stat.color} blur-2xl`} style={{ opacity: 0 }} />
                <div
                  className={`text-4xl md:text-5xl lg:text-[3.5rem] font-black bg-gradient-to-br ${stat.color} bg-clip-text text-transparent tracking-tight leading-none group-hover:drop-shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-all`}
                >
                  <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                </div>
                <div className="mt-3 text-[10px] text-white/35 uppercase tracking-[0.22em] font-semibold group-hover:text-white/55 transition-colors">
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
