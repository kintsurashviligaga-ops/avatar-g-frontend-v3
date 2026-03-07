'use client'

import React from 'react'
import Link from 'next/link'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface GlassButtonProps {
  children: React.ReactNode
  variant?: Variant
  size?: Size
  href?: string
  onClick?: () => void
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
}

const variants: Record<Variant, string> = {
  primary:
    'bg-white text-[#030712] font-semibold hover:bg-white/[0.92] shadow-[0_2px_16px_rgba(255,255,255,0.1)] hover:shadow-[0_4px_24px_rgba(255,255,255,0.15)]',
  secondary:
    'bg-white/[0.05] text-white/85 border border-white/[0.10] backdrop-blur-xl hover:bg-white/[0.08] hover:border-white/[0.18]',
  ghost:
    'text-white/50 hover:text-white hover:bg-white/[0.05]',
}

const sizes: Record<Size, string> = {
  sm: 'text-xs px-3.5 py-1.5 rounded-lg',
  md: 'text-sm px-6 py-2.5 rounded-xl',
  lg: 'text-sm px-10 py-4 rounded-2xl',
}

export function GlassButton({
  children,
  variant = 'primary',
  size = 'md',
  href,
  onClick,
  disabled,
  className = '',
  type = 'button',
}: GlassButtonProps) {
  const base = `inline-flex items-center justify-center gap-2 font-medium transition-all duration-300 ag-neon-button
    hover:scale-[1.015] active:scale-[0.985] disabled:opacity-40 disabled:pointer-events-none`

  const cls = `${base} ${variants[variant]} ${sizes[size]} ${className}`

  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    )
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  )
}
