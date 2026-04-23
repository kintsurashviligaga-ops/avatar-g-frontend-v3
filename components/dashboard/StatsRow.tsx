'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { AgentIndicator } from '@/components/ui/AgentIndicator'

type StatItem = {
  label: string
  value?: number | string | null
  icon: string
  color?: string
  isAgent?: boolean
}

interface StatsRowProps {
  credits?: number
  activeTasks?: number
  totalGenerated?: number
  agentStatus?: 'idle' | 'working' | 'error'
  statsItems?: StatItem[]
}

export function StatsRow({ credits = 0, activeTasks = 0, totalGenerated = 0, agentStatus = 'idle', statsItems }: StatsRowProps) {
  const t = useTranslations('dashboard')

  const stats = statsItems ?? [
    { label: t('stats.credits'), value: credits, icon: '⚡', color: '#00d4ff' },
    { label: t('stats.activeTasks'), value: activeTasks, icon: '📋', color: '#a78bfa' },
    { label: t('stats.totalGenerated'), value: totalGenerated, icon: '✨', color: '#34d399' },
    { label: t('stats.agentStatus'), value: null, icon: '🤖', isAgent: true },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: i * 0.06 }}
          className="rounded-2xl p-4 group cursor-default"
          style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-lg">{stat.icon}</span>
            {'isAgent' in stat && stat.isAgent ? (
              <AgentIndicator status={agentStatus} />
            ) : (
              <span className="text-[10px] font-medium" style={{ color: 'color' in stat ? stat.color : undefined }}>—</span>
            )}
          </div>
          {'isAgent' in stat && stat.isAgent ? (
            <div className="animate-counter">
              <p className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
                {agentStatus === 'working' ? '●' : agentStatus === 'error' ? '!' : '—'}
              </p>
            </div>
          ) : (
            <p className="text-2xl font-bold animate-counter" style={{ color: 'var(--color-text)' }}>
              {stat.value?.toLocaleString() ?? '0'}
            </p>
          )}
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{stat.label}</p>
        </motion.div>
      ))}
    </div>
  )
}
