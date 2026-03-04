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
    'bg-white text-[#050510] font-semibold hover:bg-white/90 shadow-lg shadow-white/10',
  secondary:
    'bg-white/[0.06] text-white/90 border border-white/[0.12] backdrop-blur-md hover:bg-white/[0.10] hover:border-white/[0.20]',
  ghost:
    'text-white/60 hover:text-white hover:bg-white/[0.06]',
}

const sizes: Record<Size, string> = {
  sm: 'text-xs px-3 py-1.5 rounded-lg',
  md: 'text-sm px-5 py-2.5 rounded-xl',
  lg: 'text-sm px-8 py-3.5 rounded-xl',
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
  const base = `inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 
    hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none`

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
