'use client'

import React from 'react'
import { cn } from '@/lib/utils'

type BadgeColor = 'cyan' | 'violet' | 'emerald' | 'crimson' | 'gold'

interface NeonBadgeProps {
  children: React.ReactNode
  color?: BadgeColor
  pulse?: boolean
  className?: string
}

const colorMap: Record<BadgeColor, { bg: string; border: string; text: string; dot: string; glow: string }> = {
  cyan: {
    bg: 'rgba(0,212,255,0.08)',
    border: 'rgba(0,212,255,0.3)',
    text: '#00d4ff',
    dot: '#00d4ff',
    glow: 'rgba(0,212,255,0.4)',
  },
  violet: {
    bg: 'rgba(2,132,199,0.08)',
    border: 'rgba(2,132,199,0.3)',
    text: '#38bdf8',
    dot: '#0284c7',
    glow: 'rgba(2,132,199,0.4)',
  },
  emerald: {
    bg: 'rgba(16,185,129,0.08)',
    border: 'rgba(16,185,129,0.3)',
    text: '#10b981',
    dot: '#10b981',
    glow: 'rgba(16,185,129,0.4)',
  },
  crimson: {
    bg: 'rgba(232,58,58,0.08)',
    border: 'rgba(232,58,58,0.3)',
    text: '#f87171',
    dot: '#e83a3a',
    glow: 'rgba(232,58,58,0.4)',
  },
  gold: {
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.3)',
    text: '#fbbf24',
    dot: '#f59e0b',
    glow: 'rgba(245,158,11,0.4)',
  },
}

export function NeonBadge({ children, color = 'cyan', pulse = false, className }: NeonBadgeProps) {
  const c = colorMap[color]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase backdrop-blur-sm border transition-all duration-200',
        className,
      )}
      style={{
        backgroundColor: c.bg,
        borderColor: c.border,
        color: c.text,
      }}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
          <span
            className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
            style={{ backgroundColor: c.dot }}
          />
          <span
            className="relative inline-flex rounded-full h-1.5 w-1.5"
            style={{ backgroundColor: c.dot }}
          />
        </span>
      )}
      {children}
    </span>
  )
}
