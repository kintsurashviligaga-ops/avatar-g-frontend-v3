'use client'

import type { ServiceId } from '@/lib/services/registry'
import { SmartIntakeForm } from './SmartIntakeForm'
import { ServiceChatPanel } from './ServiceChatPanel'
import { ProjectVersionList } from './ProjectVersionList'
import { ArtifactGrid } from './ArtifactGrid'
import { ExecutionTraceWidget } from './ExecutionTraceWidget'
import { PresetSelector } from './PresetSelector'
import { SERVICE_REGISTRY } from '@/lib/services/registry'

type DashboardLocale = 'ka' | 'en' | 'ru'

interface ServiceDashboardLabels {
  poweredBy: string
}

interface Props {
  serviceId?: ServiceId
  userId?: string
  locale?: DashboardLocale
  labels?: Partial<ServiceDashboardLabels>
}

const COPY_BY_LOCALE: Record<DashboardLocale, ServiceDashboardLabels> = {
  ka: {
    poweredBy: 'Agent G-ს მიერ',
  },
  en: {
    poweredBy: 'Powered by Agent G',
  },
  ru: {
    poweredBy: 'Работает на Agent G',
  },
}

const DEFAULT_SERVICE_ID = 'agent-g' as ServiceId

export function ServiceDashboard({ serviceId, userId, locale = 'ka', labels }: Props) {
  const activeLocale: DashboardLocale = locale === 'en' || locale === 'ru' ? locale : 'ka'
  const t = { ...COPY_BY_LOCALE[activeLocale], ...(labels ?? {}) }

  const activeServiceId = serviceId ?? DEFAULT_SERVICE_ID
  const safeUserId = userId ?? 'guest'

  const service =
    SERVICE_REGISTRY.find((s) => s.id === activeServiceId) ??
    SERVICE_REGISTRY.find((s) => s.id === DEFAULT_SERVICE_ID) ??
    SERVICE_REGISTRY[0]

  if (!service) {
    return null
  }

  return (
    <div className="min-h-screen bg-transparent text-white">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-6 py-6">
        <h1 className="text-2xl font-bold">{service.name}</h1>
        <p className="text-white/40 text-sm mt-1">{t.poweredBy}</p>
      </div>

      <div className="flex h-[calc(100vh-160px)]">
        {/* Left panel: Intake + Presets + Projects */}
        <div className="w-full lg:w-[420px] flex-shrink-0 border-r border-white/[0.06] overflow-y-auto">
          <div className="p-6 space-y-6">
            <PresetSelector serviceId={activeServiceId} locale={activeLocale} />
            <SmartIntakeForm serviceId={activeServiceId} userId={safeUserId} locale={activeLocale} />
            <ProjectVersionList serviceId={activeServiceId} userId={safeUserId} locale={activeLocale} />
          </div>
        </div>

        {/* Center: Execution trace + Artifacts */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 hidden lg:block">
          <ExecutionTraceWidget userId={safeUserId} locale={activeLocale} />
          <ArtifactGrid userId={safeUserId} serviceId={activeServiceId} locale={activeLocale} />
        </div>

        {/* Right panel: Chat */}
        <div className="w-full lg:w-[380px] flex-shrink-0 border-l border-white/[0.06] flex flex-col">
          <ServiceChatPanel
            agentId={service.agentId}
            userId={safeUserId}
            serviceId={activeServiceId}
            locale={activeLocale}
          />
        </div>
      </div>
    </div>
  )
}

