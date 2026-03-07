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
    en: ['AI modules', 'generated outputs', 'interactions', 'workflow automation'],
    ka: ['AI მოდული', 'გენერირებული შედეგი', 'ინტერაქცია', 'workflow ავტომატიზაცია'],
    ru: ['AI модулей', 'сгенерированных результатов', 'интеракций', 'автоматизация workflow'],
  } as const

  const localLabels = labels[language as keyof typeof labels] || labels.ka

  const stats = [
    { value: 17, suffix: '', label: localLabels[0], color: 'from-cyan-400 to-blue-500' },
    { value: 50, suffix: 'K+', label: localLabels[1], color: 'from-purple-400 to-indigo-500' },
    { value: 1, suffix: 'M+', label: localLabels[2], color: 'from-rose-400 to-pink-500' },
    { value: 100, suffix: '%', label: localLabels[3], color: 'from-emerald-400 to-teal-500' },
  ]

  return (
    <section className="relative py-20 px-4 sm:px-6 border-t border-white/[0.04]">
      <div className="mx-auto max-w-5xl">
        <motion.div
          className="relative rounded-2xl border border-white/[0.06] bg-gradient-to-br from-[#060B18]/90 via-[#0D1528]/80 to-[#060B18]/90 backdrop-blur-xl p-8 md:p-14 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          {/* Decorative gradient orbs */}
          <div className="absolute top-0 left-1/4 w-72 h-72 bg-cyan-500/[0.04] rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-violet-500/[0.04] rounded-full blur-[120px]" />

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
                <div className="mt-3 text-[10px] md:text-xs text-white/35 uppercase tracking-[0.2em] font-medium">
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
