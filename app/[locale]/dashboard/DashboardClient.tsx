'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar'
import { CommandBar } from '@/components/dashboard/CommandBar'
import { StatsRow } from '@/components/dashboard/StatsRow'
import { ServicesGrid } from '@/components/dashboard/ServicesGrid'
import { ActivityFeed, type ActivityItem } from '@/components/dashboard/ActivityFeed'

interface DashboardClientProps {
  locale: string
}

export default function DashboardClient({ locale }: DashboardClientProps) {
  const t = useTranslations('dashboard')
  const router = useRouter()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [commandLoading, setCommandLoading] = useState(false)

  // Mock data — replace with real Supabase queries
  const [activities] = useState<ActivityItem[]>([])

  const handleCommand = useCallback(async (message: string) => {
    setCommandLoading(true)
    // Route to Agent G with the message
    router.push(`/${locale}/services/agent-g?q=${encodeURIComponent(message)}`)
  }, [locale, router])

  return (
    <div className="fixed inset-0 flex" style={{ background: 'var(--color-bg-deep, #0a0a0f)' }}>
      {/* Sidebar — hidden on mobile */}
      <div className="hidden md:block">
        <DashboardSidebar
          locale={locale}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(v => !v)}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
              {t('welcome')} 👋
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
              {t('title')}
            </p>
          </motion.div>

          {/* Stats */}
          <StatsRow
            credits={1000}
            activeTasks={0}
            totalGenerated={0}
            agentStatus="idle"
          />

          {/* Command Bar */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.15 }}
          >
            <CommandBar
              locale={locale}
              onSubmit={handleCommand}
              loading={commandLoading}
            />
          </motion.div>

          {/* Services Grid */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.2 }}
          >
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--color-muted)' }}>
              {t('sections.services')}
            </h2>
            <ServicesGrid locale={locale} />
          </motion.div>

          {/* Activity Feed */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.25 }}
          >
            <ActivityFeed items={activities} locale={locale} />
          </motion.div>

          {/* Bottom spacer */}
          <div className="h-8" />
        </div>
      </div>
    </div>
  )
}
