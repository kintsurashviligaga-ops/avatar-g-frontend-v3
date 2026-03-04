'use client'

import React from 'react'

interface NeonBadgeProps {
  children: React.ReactNode
  variant?: 'cyan' | 'violet' | 'magenta' | 'default'
  className?: string
}

const colors = {
  cyan: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
  violet: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
  magenta: 'bg-pink-500/10 text-pink-300 border-pink-500/20',
  default: 'bg-white/[0.06] text-white/70 border-white/[0.10]',
}

export function NeonBadge({ children, variant = 'default', className = '' }: NeonBadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2.5 py-0.5
        text-[11px] font-semibold tracking-wide uppercase
        rounded-full border
        ${colors[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  )
}
