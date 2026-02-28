'use client'
// BusinessChatPanel is a thin wrapper over ServiceChatPanel
// with agentId fixed to 'business-agent' and quick action buttons.
import { useState } from 'react'
import { ServiceChatPanel } from '@/components/service/ServiceChatPanel'

const QUICK_ACTIONS = [
  { label: 'Create plan', message: 'business plan' },
  { label: 'Analyse product', message: 'analyze product' },
  { label: 'Build resell pipeline', message: 'resell pipeline' },
  { label: 'Create listing pack', message: 'marketplace listing pack' },
]

export function BusinessChatPanel({ userId }: { userId: string }) {
  const [injectedMessage, setInjectedMessage] = useState<string | undefined>()

  return (
    <div className="flex flex-col h-full">
      {/* Quick actions */}
      <div className="p-3 border-b border-white/[0.06] flex flex-wrap gap-2">
        {QUICK_ACTIONS.map(action => (
          <button
            key={action.label}
            onClick={() => setInjectedMessage(action.message)}
            className="text-xs px-2 py-1 bg-white/[0.05] border border-white/[0.08] rounded-lg text-white/60 hover:text-white hover:border-white/20 transition-all"
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Reuse ServiceChatPanel — agentId='business-agent' */}
      <ServiceChatPanel
        agentId="business-agent"
        userId={userId}
        serviceId="business"
        injectedMessage={injectedMessage}
        onInjectedMessageConsumed={() => setInjectedMessage(undefined)}
      />
    </div>
  )
}
