'use client'

import React from 'react'

interface NeonBadgeProps {
  children: React.ReactNode
  variant?: 'cyan' | 'violet' | 'magenta' | 'default'
  className?: string
}

const colors = {
  cyan: 'bg-cyan-500/[0.08] text-cyan-300/90 border-cyan-500/15 shadow-[0_0_12px_rgba(34,211,238,0.06)]',
  violet: 'bg-violet-500/[0.08] text-violet-300/90 border-violet-500/15 shadow-[0_0_12px_rgba(139,92,246,0.06)]',
  magenta: 'bg-pink-500/[0.08] text-pink-300/90 border-pink-500/15 shadow-[0_0_12px_rgba(236,72,153,0.06)]',
  default: 'bg-white/[0.04] text-white/60 border-white/[0.08]',
}

export function NeonBadge({ children, variant = 'default', className = '' }: NeonBadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-3 py-1
        text-[10px] font-semibold tracking-[0.08em] uppercase
        rounded-full border
        ${colors[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  )
}
