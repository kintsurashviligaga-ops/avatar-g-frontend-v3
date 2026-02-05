"use client"

import { motion } from "framer-motion"
import { Card } from "@/components/ui/card"

interface FeatureCardProps {
  title: string
  description: string
  icon: React.ReactNode
  gradient?: string
  onClick?: () => void
  isActive?: boolean
}

export function FeatureCard({ title, description, icon, gradient = "from-cyan-500 to-blue-500", onClick, isActive }: FeatureCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
    >
      <Card 
        className={`p-6 cursor-pointer transition-all duration-300 ${isActive ? 'ring-2 ring-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.3)]' : ''}`}
        gradient={gradient}
      >
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4`}>
          {icon}
        </div>
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-gray-400">{description}</p>
      </Card>
    </motion.div>
  )
}
