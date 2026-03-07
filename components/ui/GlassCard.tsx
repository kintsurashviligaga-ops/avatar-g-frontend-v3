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
      className={`
        rounded-2xl
        ag-neon-contour
        bg-white/[0.03]
        backdrop-blur-2xl
        border border-white/[0.08]
        shadow-[0_8px_40px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.04)]
        transition-all duration-[400ms]
        ${hover ? 'hover:border-white/[0.15] hover:shadow-[0_16px_64px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.06)] hover:-translate-y-[3px]' : ''}
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  )
}
