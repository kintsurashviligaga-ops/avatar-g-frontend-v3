"use client";

import React from 'react'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { 
  Image, Video, Music, MessageSquare, Sparkles, 
  Wand2, Mic, Film, Gamepad2, Brain, 
  Briefcase, Shield, Cpu 
} from 'lucide-react'

const services = [
  { id: 'image_generator', icon: Image, color: '#d4af37', orbit: 0 },
  { id: 'video_generator', icon: Video, color: '#8b5cf6', orbit: 1 },
  { id: 'music_generator', icon: Music, color: '#06b6d4', orbit: 2 },
  { id: 'text_intelligence', icon: MessageSquare, color: '#f472b6', orbit: 0 },
  { id: 'prompt_builder', icon: Sparkles, color: '#10b981', orbit: 1 },
  { id: 'image_architect', icon: Wand2, color: '#f59e0b', orbit: 2 },
  { id: 'voice_lab', icon: Mic, color: '#ef4444', orbit: 0 },
  { id: 'video_cine_lab', icon: Film, color: '#3b82f6', orbit: 1 },
  { id: 'game_forge', icon: Gamepad2, color: '#8b5cf6', orbit: 2 },
  { id: 'agent_g', icon: Brain, color: '#06b6d4', orbit: 0 },
  { id: 'ai_production', icon: Cpu, color: '#d4af37', orbit: 1 },
  { id: 'business_agent', icon: Briefcase, color: '#8b5cf6', orbit: 2 },
  { id: 'pentagon', icon: Shield, color: '#06b6d4', orbit: 0 },
]

export default function ServiceOrbital() {
  const t = useTranslations('services')
  
  return (
    <div className="relative w-full h-[600px] flex items-center justify-center">
      {/* Central Avatar Placeholder */}
      <div className="absolute w-32 h-32 rounded-full bg-gradient-to-br from-[#d4af37] to-[#8b5cf6] flex items-center justify-center z-10 neon-glow">
        <Brain className="w-16 h-16 text-white" />
      </div>
      
      {/* Orbital Rings */}
      {[200, 280, 360].map((radius, i) => (
        <div 
          key={i}
          className="absolute rounded-full border border-[#d4af37]/20"
          style={{ width: radius * 2, height: radius * 2 }}
        />
      ))}
      
      {/* Orbiting Services */}
      {services.map((service, index) => {
        const Icon = service.icon
        const angle = (index / services.length) * Math.PI * 2
        const radius = 200 + (service.orbit * 40)
        const x = Math.cos(angle) * radius
        const y = Math.sin(angle) * radius * 0.3
        
        return (
          <motion.div
            key={service.id}
            className="absolute"
            animate={{
              x: [x, -x, x],
              y: [y, -y, y],
            }}
            transition={{
              duration: 20 + index * 2,
              repeat: Infinity,
              ease: "linear"
            }}
          >
            <motion.button
              whileHover={{ scale: 1.2 }}
              className="w-16 h-16 rounded-2xl glass-gold flex flex-col items-center justify-center gap-1 group"
            >
              <Icon className="w-6 h-6" style={{ color: service.color }} />
              <span className="text-[8px] uppercase text-white/60 group-hover:text-white">
                {t(service.id).split(' ')[0]}
              </span>
            </motion.button>
          </motion.div>
        )
      })}
    </div>
  )
}
