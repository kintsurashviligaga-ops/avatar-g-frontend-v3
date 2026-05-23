'use client'

import * as React from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'

interface GlassCardProps extends Omit<HTMLMotionProps<'div'>, 'ref'> {
  glow?: boolean
  variant?: 'default' | 'cyan' | 'violet'
  children: React.ReactNode
}

export function GlassCard({ children, className, glow = false, variant = 'default', ...props }: GlassCardProps) {
  const borderMap = {
    default: 'border-white/[0.06] hover:border-white/[0.12]',
    cyan: 'border-[rgba(0,212,255,0.12)] hover:border-[rgba(0,212,255,0.3)]',
    violet: 'border-[rgba(2,132,199,0.12)] hover:border-[rgba(2,132,199,0.3)]',
  }

  return (
    <motion.div
      whileHover={{ scale: 1.01, y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={cn(
        'relative rounded-2xl border backdrop-blur-xl',
        'bg-[var(--color-bg-card)] transition-colors duration-200',
        borderMap[variant],
        glow && variant === 'cyan' && 'shadow-neon-cyan',
        glow && variant === 'violet' && 'shadow-neon-violet',
        glow && variant === 'default' && 'shadow-neon-cyan',
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  )
}
