'use client'

import type { ServiceId } from '@/lib/services/registry'
import { SmartIntakeForm } from './SmartIntakeForm'
import { ServiceChatPanel } from './ServiceChatPanel'
import { ProjectVersionList } from './ProjectVersionList'
import { ArtifactGrid } from './ArtifactGrid'
import { ExecutionTraceWidget } from './ExecutionTraceWidget'
import { PresetSelector } from './PresetSelector'
import { SERVICE_REGISTRY } from '@/lib/services/registry'

interface Props {
  serviceId: ServiceId
  userId: string
}

export function ServiceDashboard({ serviceId, userId }: Props) {
  const service = SERVICE_REGISTRY.find(s => s.id === serviceId)!

  return (
    <div className="min-h-screen bg-transparent text-white">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-6 py-6">
        <h1 className="text-2xl font-bold">{service.name}</h1>
        <p className="text-white/40 text-sm mt-1">Powered by Agent G</p>
      </div>

      <div className="flex h-[calc(100vh-160px)]">
        {/* Left panel: Intake + Presets + Projects */}
        <div className="w-full lg:w-[420px] flex-shrink-0 border-r border-white/[0.06] overflow-y-auto">
          <div className="p-6 space-y-6">
            <PresetSelector serviceId={serviceId} />
            <SmartIntakeForm serviceId={serviceId} userId={userId} />
            <ProjectVersionList serviceId={serviceId} userId={userId} />
          </div>
        </div>

        {/* Center: Execution trace + Artifacts */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 hidden lg:block">
          <ExecutionTraceWidget userId={userId} />
          <ArtifactGrid userId={userId} serviceId={serviceId} />
        </div>

        {/* Right panel: Chat */}
        <div className="w-full lg:w-[380px] flex-shrink-0 border-l border-white/[0.06] flex flex-col">
          <ServiceChatPanel
            agentId={service.agentId}
            userId={userId}
            serviceId={serviceId}
          />
        </div>
      </div>
    </div>
  )
}

