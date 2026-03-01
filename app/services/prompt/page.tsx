import ServiceLanding from '@/components/services/ServiceLanding'
import { SERVICE_META } from '@/lib/services/metadata'

const meta = SERVICE_META['prompt']!

export default function PromptPage() {
  return (
    <ServiceLanding
      icon={meta.icon}
      headline={meta.headline}
      description={meta.description}
      features={meta.features}
      serviceName="Prompt Builder"
    />
  )
}
