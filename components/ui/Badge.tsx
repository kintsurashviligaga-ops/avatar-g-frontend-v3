import React from 'react'
import { cn } from '@/lib/utils'

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'info' | 'premium'
  children: React.ReactNode
  className?: string
}

const Badge: React.FC<BadgeProps> = ({ variant = 'default', children, className }) => {
  const variants = {
    default: 'bg-silver/10 text-silver border-silver/20',
    success: 'bg-green-500/10 text-green-400 border-green-500/20',
    warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    premium: 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-300 border-yellow-500/30',
  }
  
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}

export default Badge
