'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Brain, Sparkles, Video, Music, Image as ImageIcon, MessageSquare, Bot, Cpu, Monitor, Zap, LayoutTemplate, PenTool, Database, Users, Mic, Layers } from 'lucide-react'

const ORBIT_SERVICES = [
  { id: 'video', label: 'ვიდეო სტუდია', icon: Video, color: '#3b82f6', slug: 'video-studio' },
  { id: 'music', label: 'მუსიკის სტუდია', icon: Music, color: '#8b5cf6', slug: 'music-studio' },
  { id: 'photo', label: 'ფოტო სტუდია', icon: ImageIcon, color: '#ec4899', slug: 'photo-studio' },
  { id: 'image', label: 'ვიზუალების შექმნა', icon: PenTool, color: '#f43f5e', slug: 'image-creator' },
  { id: 'social', label: 'სოც. მედია', icon: Users, color: '#f59e0b', slug: 'social-media' },
  { id: 'voice', label: 'ხმის ლაბორატორია', icon: Mic, color: '#10b981', slug: 'voice-lab' },
  { id: 'business', label: 'ბიზნეს აგენტი', icon: Bot, color: '#06b6d4', slug: 'business-agent' },
  { id: 'text', label: 'ტექსტის გენერაცია', icon: MessageSquare, color: '#6366f1', slug: 'text-intelligence' },
  { id: 'automation', label: 'ავტომატიზაცია', icon: Zap, color: '#eab308', slug: 'workflow-builder' },
  { id: 'layout', label: 'დიზაინი', icon: LayoutTemplate, color: '#f97316', slug: 'image-architect' },
  { id: 'media', label: 'მედია პროდუქცია', icon: Monitor, color: '#84cc16', slug: 'media-production' },
  { id: 'data', label: 'მონაცემები', icon: Database, color: '#0ea5e9', slug: 'prompt-builder' },
  { id: 'logic', label: 'AI ლოგიკა', icon: Cpu, color: '#d946ef', slug: 'visual-intelligence' },
  { id: 'game', label: 'თამაშების შექმნა', icon: Layers, color: '#14b8a6', slug: 'game-creator' },
  { id: 'core', label: 'Core AI', icon: Brain, color: '#64748b', slug: 'avatar-builder' },
  { id: 'special', label: 'სპეციალური', icon: Sparkles, color: '#f43f5e', slug: 'social-media-manager' },
]

function getRadius() {
  if (typeof window === 'undefined') return 300
  return window.innerWidth < 768 ? 155 : 280
}

export function OrbitSolarSystem() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const total = ORBIT_SERVICES.length

  return (
    <section className="relative w-full py-24 md:py-32 overflow-hidden bg-[#050510] flex items-center justify-center min-h-[800px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.05)_0%,transparent_60%)]" />

      <div className="relative w-[340px] h-[340px] md:w-[600px] md:h-[600px] flex items-center justify-center lg:scale-110">

        {/* Core Center */}
        <div className="absolute z-20 flex flex-col items-center justify-center">
          <div className="relative w-24 h-24 md:w-32 md:h-32 rounded-full border border-white/10 bg-[#0a0a1a] shadow-[0_0_40px_rgba(6,182,212,0.2)] flex items-center justify-center backdrop-blur-md">
            <Brain className="w-10 h-10 md:w-12 md:h-12 text-cyan-400" />
            <div className="absolute inset-0 rounded-full border-2 border-cyan-400/30 animate-ping" style={{ animationDuration: '3s' }} />
          </div>
          <div className="mt-4 text-center">
            <h3 className="text-white font-bold text-lg md:text-xl tracking-tight">Core AI</h3>
            <p className="text-cyan-400/80 text-xs md:text-sm">შენი ციფრული იდენტობა</p>
          </div>
        </div>

        {/* Outer Orbit Ring */}
        <div className="absolute inset-0 rounded-full border border-white/[0.04]" />
        <div className="absolute inset-[10%] rounded-full border border-white/[0.02]" />

        {/* Orbiting Icons */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 30, ease: 'linear', repeat: Infinity }}
          style={{ width: '100%', height: '100%', position: 'absolute' }}
          className="z-10"
        >
          {ORBIT_SERVICES.map((service, i) => {
            const angle = (360 / total) * i
            const r = getRadius()

            return (
              <OrbitNode
                key={service.id}
                service={service}
                angle={angle}
                radius={r}
                isActive={activeId === service.id}
                onEnter={() => setActiveId(service.id)}
                onLeave={() => setActiveId(null)}
              />
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}

/* ── Individual orbit node (avoids template-literal issues) ── */
interface OrbitNodeProps {
  service: (typeof ORBIT_SERVICES)[number]
  angle: number
  radius: number
  isActive: boolean
  onEnter: () => void
  onLeave: () => void
}

function OrbitNode({ service, angle, radius, isActive, onEnter, onLeave }: OrbitNodeProps) {
  const transform = 'rotate(' + angle + 'deg) translateX(' + radius + 'px) rotate(-' + angle + 'deg)'
  const href = '/ka/services/' + service.slug
  const tooltipClass = 'absolute top-full mt-3 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 rounded-lg bg-[#0f0f1a] border border-white/10 text-xs text-white shadow-xl transition-all duration-200 ' + (isActive ? 'opacity-100 translate-y-0 visible' : 'opacity-0 translate-y-2 invisible')

  return (
    <div
      className="absolute top-1/2 left-1/2 -ml-6 -mt-6 md:-ml-7 md:-mt-7"
      style={{ transform }}
    >
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 30, ease: 'linear', repeat: Infinity }}
      >
        <a
          href={href}
          className="group relative flex w-12 h-12 md:w-14 md:h-14 items-center justify-center rounded-full bg-[#11111a] border border-white/10 hover:border-cyan-400/50 hover:bg-[#1a1a2e] transition-all shadow-xl backdrop-blur-sm z-30"
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          <service.icon className="w-5 h-5 md:w-6 md:h-6 text-white/70 group-hover:text-cyan-300 transition-colors" />
          <div className={tooltipClass}>
            {service.label}
          </div>
        </a>
      </motion.div>
    </div>
  )
}
