'use client'

import React, { useRef } from 'react'
import { cn } from '@/lib/utils'

type CardVariant = 'default' | 'elevated' | 'bordered' | 'glass' | 'featured'

interface GlowCardProps {
  children: React.ReactNode
  variant?: CardVariant
  className?: string
  onClick?: () => void
  href?: string
}

const variantBase: Record<CardVariant, string> = {
  default: 'bg-[rgba(255,255,255,0.03)] border border-white/10',
  elevated: 'bg-[rgba(255,255,255,0.05)] border border-white/10 shadow-lg shadow-black/40',
  bordered: 'bg-transparent border border-white/15',
  glass: 'bg-[rgba(255,255,255,0.04)] backdrop-blur-xl border border-white/10',
  featured: 'bg-[rgba(0,212,255,0.04)] border border-transparent',
}

export function GlowCard({ children, variant = 'default', className, onClick }: GlowCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    el.style.setProperty('--x', `${x}px`)
    el.style.setProperty('--y', `${y}px`)
  }

  const handleMouseLeave = () => {
    const el = cardRef.current
    if (!el) return
    el.style.setProperty('--x', '-9999px')
    el.style.setProperty('--y', '-9999px')
  }

  const isFeatured = variant === 'featured'

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={cn(
        'relative rounded-2xl overflow-hidden transition-all duration-300',
        'hover:-translate-y-1',
        variantBase[variant],
        onClick && 'cursor-pointer',
        className,
      )}
      style={
        {
          '--x': '-9999px',
          '--y': '-9999px',
        } as React.CSSProperties
      }
    >
      {/* Mouse spotlight */}
      <div
        className="pointer-events-none absolute inset-0 z-10 opacity-0 hover:opacity-100 transition-opacity duration-300"
        style={{
          background:
            'radial-gradient(200px circle at var(--x) var(--y), rgba(0,212,255,0.07), transparent 80%)',
        }}
      />

      {/* Featured: animated top gradient border */}
      {isFeatured && (
        <>
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              padding: '1px',
              background: 'linear-gradient(135deg, rgba(0,212,255,0.5), rgba(2,132,199,0.5))',
              WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
            }}
          />
          <div
            className="absolute -top-px left-0 right-0 h-px animate-pulse"
            style={{
              background: 'linear-gradient(to right, transparent, rgba(0,212,255,0.8), rgba(2,132,199,0.8), transparent)',
            }}
          />
        </>
      )}

      {children}
    </div>
  )
}
