'use client'

/**
 * PlatformStats — Animated platform-wide statistics & social-proof section.
 */

import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const COPY = {
  en: {
    eyebrow: 'TRUSTED BY CREATORS WORLDWIDE',
    title: 'Built for Scale',
    stats: [
      { value: 18, suffix: '+', label: 'AI Services', icon: '🔧' },
      { value: 50, suffix: 'K+', label: 'Generations', icon: '⚡' },
      { value: 12, suffix: 'K+', label: 'Active Users', icon: '👥' },
      { value: 99, suffix: '%', label: 'Uptime', icon: '🟢' },
    ],
    banner: 'Join thousands of creators using myavatar.ge to power their workflows.',
  },
  ka: {
    eyebrow: 'კრეატორების მიერ სანდო მსოფლიოში',
    title: 'აგებული მასშტაბისთვის',
    stats: [
      { value: 18, suffix: '+', label: 'AI სერვისი', icon: '🔧' },
      { value: 50, suffix: 'K+', label: 'გენერაცია', icon: '⚡' },
      { value: 12, suffix: 'K+', label: 'აქტიური მომხმარებელი', icon: '👥' },
      { value: 99, suffix: '%', label: 'აპტაიმი', icon: '🟢' },
    ],
    banner: 'შეუერთდი ათასობით კრეატორს რომლებიც myavatar.ge-ს იყენებენ.',
  },
  ru: {
    eyebrow: 'ДОВЕРИЕ СОЗДАТЕЛЕЙ ПО ВСЕМУ МИРУ',
    title: 'Построено для Масштаба',
    stats: [
      { value: 18, suffix: '+', label: 'AI Сервисов', icon: '🔧' },
      { value: 50, suffix: 'K+', label: 'Генераций', icon: '⚡' },
      { value: 12, suffix: 'K+', label: 'Активных юзеров', icon: '👥' },
      { value: 99, suffix: '%', label: 'Аптайм', icon: '🟢' },
    ],
    banner: 'Присоединяйтесь к тысячам создателей, использующих myavatar.ge.',
  },
} as const

/* Animated counter */
function AnimatedNumber({ target, suffix }: { target: number; suffix: string }) {
  const [val, setVal] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })

  useEffect(() => {
    if (!inView) return
    let start = 0
    const duration = 1800
    const startTime = performance.now()
    function step(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      start = Math.round(eased * target)
      setVal(start)
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [inView, target])

  return (
    <span ref={ref}>
      {val}
      {suffix}
    </span>
  )
}

export function PlatformStats() {
  const { language } = useLanguage()
  const c = COPY[language] || COPY.en

  return (
    <section className="relative py-16 sm:py-24 overflow-hidden">
      {/* Background grain */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 60%, rgba(99,102,241,0.04) 0%, transparent 70%)' }} />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-12 sm:mb-16">
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase font-black mb-3"
            style={{ color: 'var(--color-accent)' }}
          >
            {c.eyebrow}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight"
            style={{ color: 'var(--color-text)' }}
          >
            {c.title}
          </motion.h2>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {c.stats.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.08 * i, type: 'spring', stiffness: 200 }}
              className="relative rounded-2xl p-6 sm:p-8 text-center group hover:-translate-y-1 transition-transform"
              style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
                border: '1px solid var(--color-border)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ background: 'radial-gradient(circle at 50% 0%, rgba(34,211,238,0.08) 0%, transparent 60%)' }}
              />
              <span className="text-3xl sm:text-4xl mb-3 block">{s.icon}</span>
              <div
                className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mb-2"
                style={{ color: 'var(--color-text)', background: 'linear-gradient(135deg, #22d3ee, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
              >
                <AnimatedNumber target={s.value} suffix={s.suffix} />
              </div>
              <p className="text-xs sm:text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{s.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Social-proof banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="mt-12 sm:mt-16 text-center"
        >
          <p className="text-sm sm:text-base max-w-lg mx-auto" style={{ color: 'var(--color-text-tertiary)' }}>
            {c.banner}
          </p>
          {/* Avatars Row */}
          <div className="flex items-center justify-center gap-1.5 mt-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="w-9 h-9 rounded-full -ml-2 first:ml-0"
                style={{
                  background: `linear-gradient(135deg, hsl(${190 + i * 30}, 60%, 50%), hsl(${210 + i * 30}, 70%, 40%))`,
                  border: '2px solid rgba(0,0,0,0.6)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                }}
              />
            ))}
            <span className="ml-3 text-xs font-medium px-3 py-1 rounded-full" style={{ background: 'rgba(34,211,238,0.08)', color: 'var(--color-accent)', border: '1px solid rgba(34,211,238,0.15)' }}>
              +12K
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
