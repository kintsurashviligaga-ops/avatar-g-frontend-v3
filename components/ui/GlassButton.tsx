'use client'

import React from 'react'

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
    'bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-600 text-white font-bold border border-white/[0.18] shadow-[0_8px_32px_rgba(34,211,238,0.38),inset_0_1px_0_rgba(255,255,255,0.2)] hover:shadow-[0_14px_50px_rgba(34,211,238,0.50),inset_0_1px_0_rgba(255,255,255,0.25)] hover:brightness-110',
  secondary:
    'bg-white/[0.055] text-white/85 border border-white/[0.11] backdrop-blur-xl hover:bg-white/[0.095] hover:border-white/[0.20] shadow-[0_4px_20px_rgba(0,0,0,0.3)]',
  ghost:
    'text-white/55 hover:text-white hover:bg-white/[0.06] backdrop-blur-md',
}

const sizes: Record<Size, string> = {
  sm: 'text-xs px-3.5 py-1.5 rounded-xl',
  md: 'text-sm px-6 py-2.5 rounded-2xl',
  lg: 'text-[0.9375rem] px-10 py-4 rounded-2xl',
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
  const base = `relative inline-flex items-center justify-center gap-2 font-semibold
    transition-all duration-300 overflow-hidden
    hover:scale-[1.02] active:scale-[0.99]
    disabled:opacity-40 disabled:pointer-events-none
    cursor-pointer`

  const cls = `${base} ${variants[variant]} ${sizes[size]} ${className}`

  if (href) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    )
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  )
}
