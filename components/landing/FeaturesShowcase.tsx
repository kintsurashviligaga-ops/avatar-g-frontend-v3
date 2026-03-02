'use client'

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { useRef, MouseEvent } from 'react'
import {
  Cpu, Wand2, Layers, Zap, Shield, Globe,
} from 'lucide-react'

const FEATURES = [
  {
    icon: Cpu,
    title: '16 AI Modules',
    description: 'From video generation to music, photography, text — a full creative studio powered by AI.',
    gradient: 'from-cyan-500 to-blue-600',
    glow: 'rgba(6,182,212,0.25)',
  },
  {
    icon: Wand2,
    title: 'One-Click Workflows',
    description: 'Chain modules into automated pipelines. Define once, run infinitely with Agent G orchestrating.',
    gradient: 'from-purple-500 to-indigo-600',
    glow: 'rgba(139,92,246,0.25)',
  },
  {
    icon: Layers,
    title: 'Your Digital Avatar',
    description: 'A persistent 3D identity that represents you across all platforms and creative outputs.',
    gradient: 'from-rose-500 to-pink-600',
    glow: 'rgba(244,63,94,0.25)',
  },
  {
    icon: Zap,
    title: 'Blazing Performance',
    description: 'Edge-deployed infrastructure with 99.9% uptime. Optimized for real-time creative production.',
    gradient: 'from-amber-400 to-orange-500',
    glow: 'rgba(245,158,11,0.25)',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'SOC-2 aligned infrastructure with end-to-end encryption and granular access controls.',
    gradient: 'from-emerald-500 to-teal-600',
    glow: 'rgba(16,185,129,0.25)',
  },
  {
    icon: Globe,
    title: 'Global & Localized',
    description: 'Multi-language support with Georgian, English, and Russian — built for global creative teams.',
    gradient: 'from-sky-400 to-cyan-500',
    glow: 'rgba(56,189,248,0.25)',
  },
]

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
  return (
    <section className="relative py-24 px-4 sm:px-6 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-0 w-96 h-96 bg-cyan-500/[0.04] rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-purple-500/[0.04] rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-purple-400/20 bg-purple-400/[0.05] mb-5">
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs font-medium text-purple-300 tracking-wider uppercase">Platform Capabilities</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
            Everything You Need.{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
              Nothing You Don&apos;t.
            </span>
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto text-base md:text-lg">
            A unified AI platform designed for creators, agencies, and enterprises.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <TiltCard className="h-full">
                <div
                  className="group relative h-full rounded-2xl border border-white/[0.08] bg-[#0A0F1E]/80 backdrop-blur-sm p-6 transition-all duration-500 hover:border-white/[0.15] hover:bg-[#0D1528]/90"
                  style={{ ['--card-glow' as string]: feature.glow }}
                >
                  {/* Glow on hover */}
                  <div
                    className="absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"
                    style={{ background: feature.glow }}
                  />

                  <div className="relative">
                    <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${feature.gradient} mb-4`}>
                      <feature.icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">{feature.description}</p>
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
