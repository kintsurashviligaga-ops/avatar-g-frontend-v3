import Link from 'next/link'
import { getLocalizedMeta, getAgentIdForService } from '@/lib/services/metadata'
import AgentGPageClient from './AgentGPageClient'

type AgentGPageProps = {
  params: Promise<{ locale: string }>
}

export default async function AgentGPage({ params }: AgentGPageProps) {
  const { locale } = await params
  const meta = getLocalizedMeta('agent-g', locale)

  if (!meta) {
    return (
      <section className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold">Agent G</h1>
          <Link href={`/${locale}/services`} className="text-sm" style={{ color: 'var(--color-accent)' }}>← Back</Link>
        </div>
      </section>
    )
  }

  const agentId = getAgentIdForService('agent-g')

  return (
    <AgentGPageClient
      serviceId="agent-g"
      serviceName={meta.headline}
      serviceIcon={meta.icon}
      agentId={agentId}
      locale={locale}
      features={meta.features}
      description={meta.description}
    />
  )
}
