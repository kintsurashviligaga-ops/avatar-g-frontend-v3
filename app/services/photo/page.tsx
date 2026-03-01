import ServiceLanding from '@/components/services/ServiceLanding'
import { SERVICE_META } from '@/lib/services/metadata'

const meta = SERVICE_META['photo']!

export default function PhotoPage() {
  return (
    <ServiceLanding
      icon={meta.icon}
      headline={meta.headline}
      description={meta.description}
      features={meta.features}
      serviceName="Photo Studio"
    />
  )
}
