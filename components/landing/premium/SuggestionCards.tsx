'use client'

import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { ServiceCardVisual } from '@/components/ui/ServiceCardVisual'
import { SERVICES, SUGGESTION_SLUGS, type ServiceDefinition } from '@/lib/services/catalog'

const SUGGESTION_SERVICES: ServiceDefinition[] = SUGGESTION_SLUGS
  .filter(slug => slug !== 'agent-g')
  .map(slug => SERVICES.find(s => s.slug === slug)!)
  .filter(Boolean)

export function SuggestionCards() {
  const { language } = useLanguage()
  const router = useRouter()
  const lang = language as 'en' | 'ka' | 'ru'

  return (
    <section className="px-4 sm:px-6 lg:px-10 pb-8 sm:pb-12">
      <div className="max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {SUGGESTION_SERVICES.map(service => (
          <button
            key={service.slug}
            onClick={() => router.push(`/${language}/services/${service.slug}`)}
            className="service-card group flex flex-col overflow-hidden rounded-xl transition-all duration-300 text-left cursor-pointer active:scale-[0.97] hover:-translate-y-1"
            style={{
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--color-border)',
            }}
          >
            <ServiceCardVisual serviceId={service.slug} variant="thumb" />
            <div className="relative flex items-center gap-2 p-3.5 sm:p-4">
              <span className="text-base leading-none">{service.icon}</span>
              <span className="text-[13px] leading-snug font-semibold" style={{ color: 'var(--color-text)' }}>
                {service.title[lang] || service.title.en}
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
