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
      className={[
        'relative w-full p-4 rounded-2xl border transition-all duration-200 text-left overflow-hidden backdrop-blur-xl',
        isActive
          ? 'border-cyan-400/35 bg-[linear-gradient(135deg,rgba(34,211,238,0.08),rgba(59,130,246,0.06))] shadow-[0_0_20px_rgba(34,211,238,0.12)]'
          : 'border-white/[0.10] bg-[linear-gradient(135deg,rgba(12,22,46,0.85),rgba(7,14,32,0.75))] hover:border-white/[0.20] hover:shadow-[0_0_24px_rgba(34,211,238,0.10)]',
      ].join(' ')}
    >
      {isActive && <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />}
      <div className={[
        'w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-gradient-to-br',
        gradient,
        isActive ? 'shadow-[0_0_16px_rgba(34,211,238,0.25)]' : '',
      ].join(' ')}>
        {icon}
      </div>
      <h3 className="font-semibold text-sm mb-1 text-white/90">{title}</h3>
      <p className="text-xs text-white/40 leading-relaxed">{description}</p>
    </motion.button>
  )
}
