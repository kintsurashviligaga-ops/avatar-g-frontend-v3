"use client"

import { motion } from "framer-motion"
import { ReactNode } from "react"

interface FeatureCardProps {
  title: string
  description: string
  icon: ReactNode
  gradient: string
  isActive?: boolean
  onClick?: () => void
}

export function FeatureCard({ title, description, icon, gradient, isActive, onClick }: FeatureCardProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`
        w-full p-4 rounded-xl border-2 transition-all text-left
        ${isActive 
          ? 'border-white/30 bg-white/10' 
          : 'border-white/5 bg-[#0A0F1C] hover:border-white/20 hover:bg-white/5'}
      `}
    >
      <div className={`
        w-10 h-10 rounded-lg bg-gradient-to-br ${gradient} 
        flex items-center justify-center mb-3
        ${isActive ? 'shadow-lg shadow-white/10' : ''}
      `}>
        {icon}
      </div>
      <h3 className="font-semibold text-sm mb-1">{title}</h3>
      <p className="text-xs text-gray-500">{description}</p>
    </motion.button>
  )
}
