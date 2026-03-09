'use client'

import React from 'react'

interface NeonBadgeProps {
  children: React.ReactNode
  variant?: 'cyan' | 'violet' | 'magenta' | 'default'
  className?: string
}

const colors = {
  cyan:    'bg-cyan-400/[0.10] text-cyan-200 border-cyan-400/25 shadow-[0_0_16px_rgba(34,211,238,0.14),inset_0_1px_0_rgba(255,255,255,0.06)]',
  violet:  'bg-violet-500/[0.10] text-violet-200 border-violet-400/25 shadow-[0_0_16px_rgba(139,92,246,0.14),inset_0_1px_0_rgba(255,255,255,0.06)]',
  magenta: 'bg-pink-500/[0.10] text-pink-200 border-pink-400/25 shadow-[0_0_16px_rgba(236,72,153,0.14),inset_0_1px_0_rgba(255,255,255,0.06)]',
  default: 'bg-white/[0.05] text-white/65 border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
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
