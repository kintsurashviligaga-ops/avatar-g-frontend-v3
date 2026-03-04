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
        rounded-3xl
        bg-white/[0.04]
        backdrop-blur-[18px]
        border border-white/[0.10]
        shadow-[0_8px_32px_rgba(0,0,0,0.4)]
        transition-all duration-300 ease-out
        ${hover ? 'hover:border-white/[0.18] hover:shadow-[0_12px_40px_rgba(0,0,0,0.5)] hover:-translate-y-[2px]' : ''}
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  )
}
