import React from 'react'
import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  hover?: boolean
}

const Card: React.FC<CardProps> = ({ children, className, onClick, hover = false }) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        'glass-card rounded-xl p-4',
        hover && 'cursor-pointer transition-all duration-200 hover:bg-white/10 hover:border-silver/20',
        className
      )}
    >
      {children}
    </div>
  )
}

export default Card
