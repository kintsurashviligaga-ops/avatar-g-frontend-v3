'use client'

import { cn } from '@/lib/utils'

type AgentStatus = 'idle' | 'working' | 'error'

interface AgentIndicatorProps {
  status: AgentStatus
  label?: string
  className?: string
}

export function AgentIndicator({ status, label, className }: AgentIndicatorProps) {
  const colorMap: Record<AgentStatus, string> = {
    idle: 'bg-slate-500',
    working: 'bg-[#00d4ff]',
    error: 'bg-red-400',
  }

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="relative flex h-2.5 w-2.5">
        {status === 'working' && (
          <span className="absolute inset-0 rounded-full bg-[#00d4ff] animate-ping opacity-40" />
        )}
        <span className={cn('relative inline-flex rounded-full h-2.5 w-2.5', colorMap[status])} />
      </span>
      {label && <span className="text-xs font-medium text-[var(--color-muted)]">{label}</span>}
    </span>
  )
}
