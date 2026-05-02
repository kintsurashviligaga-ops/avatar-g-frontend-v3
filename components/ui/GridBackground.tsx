'use client'

import React from 'react'
import { cn } from '@/lib/utils'

type GridVariant = 'dots' | 'lines' | 'circuit'

interface GridBackgroundProps {
  variant?: GridVariant
  className?: string
  opacity?: number
}

export function GridBackground({ variant = 'dots', className, opacity = 0.04 }: GridBackgroundProps) {
  const getStyle = (): React.CSSProperties => {
    switch (variant) {
      case 'dots':
        return {
          backgroundImage: 'radial-gradient(rgba(0,212,255,0.5) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          opacity,
        }
      case 'lines':
        return {
          backgroundImage:
            'linear-gradient(rgba(0,212,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.15) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          opacity,
        }
      case 'circuit': {
        const svg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect x='0' y='0' width='40' height='40' fill='none'/%3E%3Cpath d='M20 0 L20 10 M20 30 L20 40 M0 20 L10 20 M30 20 L40 20' stroke='rgba(0,212,255,0.3)' stroke-width='0.5'/%3E%3Ccircle cx='20' cy='20' r='2' fill='rgba(0,212,255,0.3)'/%3E%3C/svg%3E")`
        return {
          backgroundImage: svg,
          backgroundSize: '40px 40px',
          opacity,
        }
      }
    }
  }

  return (
    <div
      className={cn('absolute inset-0 pointer-events-none', className)}
      style={getStyle()}
      aria-hidden="true"
    />
  )
}
