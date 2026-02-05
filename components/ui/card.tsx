"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean
  gradient?: string
}

export function Card({ className, glow, gradient, children, ...props }: CardProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className={cn(
        "relative rounded-2xl bg-[#0A0F1C] border border-white/10 overflow-hidden",
        glow && "shadow-[0_0_40px_rgba(6,182,212,0.15)]",
        className
      )}
      {...props}
    >
      {gradient && (
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-5`} />
      )}
      <div className="relative z-10">{children}</div>
    </motion.div>
  )
}
