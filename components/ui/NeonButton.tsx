'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface NeonButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'cyan' | 'violet'
  size?: 'sm' | 'md' | 'lg'
}

export function NeonButton({ children, className, variant = 'cyan', size = 'md', disabled, ...props }: NeonButtonProps) {
  const sizeMap = { sm: 'h-9 px-4 text-sm', md: 'h-11 px-6 text-sm', lg: 'h-12 px-8 text-base' }
  const gradientMap = {
    cyan: 'from-[#00d4ff] to-[#0891b2]',
    violet: 'from-[#0284c7] to-[#5b21b6]',
  }
  const glowMap = {
    cyan: 'shadow-[0_4px_20px_rgba(0,212,255,0.25)] hover:shadow-[0_4px_32px_rgba(0,212,255,0.4)]',
    violet: 'shadow-[0_4px_20px_rgba(2,132,199,0.25)] hover:shadow-[0_4px_32px_rgba(2,132,199,0.4)]',
  }

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-white transition-all duration-200',
        `bg-gradient-to-r ${gradientMap[variant]}`,
        !disabled && glowMap[variant],
        'hover:brightness-110 active:scale-[0.97]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0f]',
        sizeMap[size],
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}

export function GhostButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 h-10 text-sm font-medium',
        'text-[var(--color-muted)] hover:text-white hover:bg-white/[0.06]',
        'transition-all duration-200 active:scale-[0.97]',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
