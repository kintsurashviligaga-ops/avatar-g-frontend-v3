'use client'

import React from 'react'

interface GlassCardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  onClick?: () => void
}

export function GlassCard({ children, className = '', hover = true, onClick }: GlassCardProps) {
  return (
    <div
      onClick={onClick}
      className={[
        'relative rounded-2xl overflow-hidden',
        'bg-[linear-gradient(155deg,rgba(7,14,30,0.90),rgba(4,9,22,0.80))]',
        'backdrop-blur-2xl',
        'border border-white/[0.08]',
        'shadow-[0_16px_48px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)]',
        'transition-all duration-300',
        hover
          ? 'hover:border-white/[0.16] hover:shadow-[0_24px_72px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.08),0_0_32px_rgba(34,211,238,0.06)] hover:-translate-y-1'
          : '',
        onClick ? 'cursor-pointer' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Top shine */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.09] to-transparent pointer-events-none" />
      {children}
    </div>
  )
}
