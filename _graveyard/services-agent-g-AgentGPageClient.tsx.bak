'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'
import { UnifiedServiceShell } from '@/components/services/unified'
import { AgentGChatInterface } from '@/components/AgentG/ChatInterface'
import VoicePanel from '@/components/voice/VoicePanel'

interface AgentGPageClientProps {
  serviceId: string
  serviceName: string
  serviceIcon: string
  agentId: string
  locale: string
  features: string[]
  description: string
}

export default function AgentGPageClient(props: AgentGPageClientProps) {
  const demoMode = (process.env.NEXT_PUBLIC_DEMO_MODE ?? '').trim().toLowerCase() === 'true'
  const [_isAuthenticated, setIsAuthenticated] = useState(demoMode)
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get('q') ?? undefined

  useEffect(() => {
    if (demoMode) {
      setIsAuthenticated(true)
      return
    }

    const supabase = createBrowserClient()

    supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(!!data.session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session)
    })

    return () => subscription.unsubscribe()
  }, [demoMode])

  return (
    <UnifiedServiceShell
      activeServiceId={props.serviceId}
      locale={props.locale}
    >
      <div className="mb-4">
        <VoicePanel compact />
      </div>
      <AgentGChatInterface
        locale={props.locale}
        initialQuery={initialQuery}
      />
    </UnifiedServiceShell>
  )
}
