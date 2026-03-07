'use client'

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { useRef, MouseEvent } from 'react'
import {
  Cpu, Wand2, Layers, Shield,
} from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const FEATURES = [
  {
    icon: Cpu,
    title: '17 AI Modules',
    description: 'Create avatars, videos, music, designs, and text from one connected platform layer.',
    gradient: 'from-cyan-500 to-blue-600',
    glow: 'rgba(6,182,212,0.25)',
  },
  {
    icon: Wand2,
    title: 'AI Automation',
    description: 'Connect tools into intelligent workflows that run with consistency and speed.',
    gradient: 'from-purple-500 to-indigo-600',
    glow: 'rgba(139,92,246,0.25)',
  },
  {
    icon: Layers,
    title: 'Agent G',
    description: 'Your AI director coordinating tasks across services and teams in one system.',
    gradient: 'from-rose-500 to-pink-600',
    glow: 'rgba(244,63,94,0.25)',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: '99.9% uptime and stable infrastructure for production-grade platform reliability.',
    gradient: 'from-emerald-500 to-teal-600',
    glow: 'rgba(16,185,129,0.25)',
  },
]

const FEATURES_COPY = {
  en: {
    badge: 'Platform Capabilities',
    title: 'AI Platform',
    titleAccent: 'Capabilities',
    subtitle: 'Core capabilities that power your full AI factory workflow.',
    cards: [
      {
        title: '17 AI Modules',
        description: 'Create avatars, videos, music, designs, and text.',
      },
      {
        title: 'AI Automation',
        description: 'Connect tools into intelligent workflows.',
      },
      {
        title: 'Agent G',
        description: 'Your AI director coordinating tasks.',
      },
      {
        title: 'Enterprise Security',
        description: '99.9% uptime and stable infrastructure.',
      },
    ],
  },
  ka: {
    badge: 'Platform Capabilities',
    title: 'AI Platform',
    titleAccent: 'Capabilities',
    subtitle: 'ძირითადი შესაძლებლობები შენი AI ქარხნის workflow-სთვის.',
    cards: [
      {
        title: '17 AI Modules',
        description: 'Create avatars, videos, music, designs, and text.',
      },
      {
        title: 'AI Automation',
        description: 'Connect tools into intelligent workflows.',
      },
      {
        title: 'Agent G',
        description: 'Your AI director coordinating tasks.',
      },
      {
        title: 'Enterprise უსაფრთხოება',
        description: '99.9% uptime and stable infrastructure.',
      },
    ],
  },
  ru: {
    badge: 'Platform Capabilities',
    title: 'AI Platform',
    titleAccent: 'Capabilities',
    subtitle: 'Ключевые возможности для полного AI factory workflow.',
    cards: [
      {
        title: '17 AI Modules',
        description: 'Create avatars, videos, music, designs, and text.',
      },
      {
        title: 'AI Automation',
        description: 'Connect tools into intelligent workflows.',
      },
      {
        title: 'Agent G',
        description: 'Your AI director coordinating tasks.',
      },
      {
        title: 'Безопасность Enterprise',
        description: '99.9% uptime and stable infrastructure.',
      },
    ],
  },
} as const

function TiltCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [8, -8]), { stiffness: 200, damping: 20 })
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-8, 8]), { stiffness: 200, damping: 20 })

  function handleMouse(e: MouseEvent) {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    x.set((e.clientX - rect.left) / rect.width - 0.5)
    y.set((e.clientY - rect.top) / rect.height - 0.5)
  }

  function handleLeave() {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      style={{ rotateX, rotateY, transformPerspective: 800 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function FeaturesShowcase() {
  const { language } = useLanguage()
  const copy = FEATURES_COPY[language as keyof typeof FEATURES_COPY] || FEATURES_COPY.ka

  return (
    <section className="relative py-28 px-4 sm:px-6 overflow-hidden border-t border-white/[0.08]">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-0 w-[500px] h-[500px] bg-cyan-500/[0.03] rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-0 w-[500px] h-[500px] bg-violet-500/[0.03] rounded-full blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <motion.div
          className="text-center mb-20"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-violet-400/15 bg-violet-400/[0.04] mb-6">
            <Layers className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-[10px] font-semibold text-violet-300/80 tracking-[0.12em] uppercase">{copy.badge}</span>
          </div>
          <h2 className="text-3xl md:text-5xl lg:text-[3.5rem] font-bold text-white mb-5 tracking-[-0.02em]">
            {copy.title}{' '}
            <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 bg-clip-text text-transparent">
              {copy.titleAccent}
            </span>
          </h2>
          <p className="text-white/40 max-w-xl mx-auto text-base md:text-lg leading-relaxed">
            {copy.subtitle}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.08 }}
            >
              <TiltCard className="h-full">
                <div
                  className="group relative h-full rounded-2xl ag-surface-secondary p-7 transition-all duration-500 hover:border-white/[0.16]"
                  style={{ ['--card-glow' as string]: feature.glow }}
                >
                  {/* Glow on hover */}
                  <div
                    className="absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl"
                    style={{ background: feature.glow }}
                  />

                  <div className="relative">
                    <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${feature.gradient} mb-5 shadow-lg`}>
                      <feature.icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2.5 tracking-[-0.01em]">{copy.cards[index]?.title || feature.title}</h3>
                    <p className="text-sm text-white/35 leading-relaxed">{copy.cards[index]?.description || feature.description}</p>
                  </div>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
