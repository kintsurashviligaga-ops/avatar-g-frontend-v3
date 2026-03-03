'use client'

import React, { useState } from 'react'
import { Brain, Sparkles, Video, Music, Image as ImageIcon, MessageSquare, Bot, Cpu, Monitor, Zap, LayoutTemplate, PenTool, Database, Users, Mic, Layers } from 'lucide-react'
import Link from 'next/link'

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

type OrbitService = typeof ORBIT_SERVICES[number]

export function OrbitSolarSystem() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const isPaused = activeId !== null
  const total = ORBIT_SERVICES.length

  return (
    <section className="relative w-full py-24 md:py-32 overflow-hidden bg-transparent flex items-center justify-center min-h-[600px] md:min-h-[800px] pointer-events-none">
      <style jsx global>{`
        @keyframes orbit-spin { 
          from { transform: rotate(0deg); } 
          to { transform: rotate(360deg); } 
        }
        @keyframes orbit-counter-spin { 
          from { transform: rotate(0deg); } 
          to { transform: rotate(-360deg); } 
        }
        .orbit-container {
          animation: orbit-spin 60s linear infinite;
        }
        .orbit-item-counter {
          animation: orbit-counter-spin 60s linear infinite;
        }
        .paused {
          animation-play-state: paused !important;
        }
        .running {
          animation-play-state: running;
        }
      `}</style>
      
      {/* Container for Orbit visual elements */}
      <div className="relative w-[340px] h-[340px] md:w-[600px] md:h-[600px] flex items-center justify-center pointer-events-auto">
        
        {/* Core Center */}
        <div className="absolute z-20 flex flex-col items-center justify-center select-none">
          <div className="relative w-24 h-24 md:w-32 md:h-32 rounded-full border border-white/10 bg-black/20 shadow-[0_0_40px_rgba(6,182,212,0.1)] flex items-center justify-center backdrop-blur-sm">
            <Brain className="w-10 h-10 md:w-12 md:h-12 text-cyan-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
            <div className="absolute inset-0 rounded-full border-2 border-cyan-400/30 animate-ping" style={{ animationDuration: '3s' }} />
          </div>
          <div className="mt-4 text-center">
            <h3 className="text-white font-bold text-lg md:text-xl tracking-tight drop-shadow-lg" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>Core AI</h3>
            <p className="text-cyan-400/80 text-xs md:text-sm font-medium drop-shadow-md">შენი ციფრული იდენტობა</p>
          </div>
        </div>

        {/* Outer Orbit Rings */}
        <div className="absolute inset-0 rounded-full border border-white/[0.1] shadow-[0_0_30px_rgba(255,255,255,0.05)]" />
        <div className="absolute inset-[15%] rounded-full border border-white/[0.05]" />

        {/* Orbit Rotating Container */}
        <div className={`absolute inset-0 w-full h-full orbit-container ${isPaused ? 'paused' : 'running'}`}>
          {ORBIT_SERVICES.map((service, i) => {
            const angle = (360 / total) * i
            
            return (
              <div
                key={service.id}
                className="orbit-item-wrapper absolute top-1/2 left-1/2 w-0 h-0"
                style={{ 
                  '--angle': `${angle}deg` 
                } as React.CSSProperties}
              >
                <div className={`orbit-item-counter flex items-center justify-center -translate-x-1/2 -translate-y-1/2 ${isPaused ? 'paused' : 'running'}`}>
                  <OrbitNodeContent 
                    service={service} 
                    isActive={activeId === service.id}
                    onEnter={() => setActiveId(service.id)}
                    onLeave={() => setActiveId(null)}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      
      <style jsx>{`
        .orbit-item-wrapper {
          transform: rotate(var(--angle)) translateX(165px) rotate(calc(var(--angle) * -1));
        }
        @media (min-width: 768px) {
          .orbit-item-wrapper {
            transform: rotate(var(--angle)) translateX(290px) rotate(calc(var(--angle) * -1));
          }
        }
      `}</style>
    </section>
  )
}

function OrbitNodeContent({ service, isActive, onEnter, onLeave }: { service: OrbitService; isActive: boolean; onEnter: () => void; onLeave: () => void }) {
  return (
    <Link
      href={'/services/' + service.slug}
      className={`group relative flex items-center justify-center rounded-full transition-all duration-300 z-30
        ${isActive ? 'w-14 h-14 md:w-16 md:h-16 bg-[#1a1a2e] border-cyan-400 scale-110 shadow-[0_0_20px_rgba(6,182,212,0.4)]' : 'w-12 h-12 md:w-14 md:h-14 bg-[#11111a]/80 border-white/10 hover:bg-[#1a1a2e] hover:scale-105'}
        border backdrop-blur-sm
      `}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      aria-label={service.label}
    >
      <service.icon 
        className={`w-5 h-5 md:w-6 md:h-6 transition-colors relative z-10 ${isActive ? 'text-white' : 'text-white/70 group-hover:text-white'}`}
        style={{ color: isActive ? service.color : undefined }}
      />
      
      {/* Tooltip */}
      <div 
        className={`absolute pointer-events-none top-full mt-4 left-1/2 -translate-x-1/2 whitespace-nowrap px-4 py-2 rounded-xl bg-[#0f0f1a]/95 border border-white/10 text-sm font-medium text-white shadow-2xl backdrop-blur-md transition-all duration-200 z-50
          ${isActive ? 'opacity-100 translate-y-0 visible' : 'opacity-0 translate-y-2 invisible'}
        `}
      >
        {service.label}
        {/* Triangle arrow */}
        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#0f0f1a]/95 border-t border-l border-white/10 transform rotate-45" />
      </div>
    </Link>
  )
}
