// components/agent/AgentStatusBadge.tsx
'use client'
import { useEffect, useState } from 'react'

type AgentStatus = 'online' | 'busy' | 'offline' | 'loading'

interface Props {
  agentId: string
  showLabel?: boolean
  size?: 'sm' | 'md'
}

const STATUS_CONFIG = {
  online:  { dot: 'bg-green-400', pulse: 'bg-green-400', label: 'Online', ring: 'ring-green-400/20' },
  busy:    { dot: 'bg-amber-400', pulse: 'bg-amber-400', label: 'Busy',   ring: 'ring-amber-400/20' },
  offline: { dot: 'bg-white/20',  pulse: '',              label: 'Offline', ring: '' },
  loading: { dot: 'bg-white/10',  pulse: '',              label: '...',    ring: '' },
} as const

export function AgentStatusBadge({ agentId, showLabel = false, size = 'md' }: Props) {
  const [status, setStatus] = useState<AgentStatus>('loading')

  useEffect(() => {
    fetch(`/api/agents/status?agentId=${agentId}`)
      .then(r => r.json())
      .then(d => setStatus(d.status ?? 'offline'))
      .catch(() => setStatus('offline'))
  }, [agentId])

  const cfg = STATUS_CONFIG[status]
  const sz = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5'

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`relative inline-flex ${sz}`}>
        <span className={`${sz} rounded-full ${cfg.dot}`} />
        {cfg.pulse && (
          <span className={`animate-ping absolute inline-flex ${sz} rounded-full ${cfg.pulse} opacity-50`} />
        )}
      </span>
      {showLabel && (
        <span className="text-xs text-white/50">{cfg.label}</span>
      )}
    </span>
  )
}
