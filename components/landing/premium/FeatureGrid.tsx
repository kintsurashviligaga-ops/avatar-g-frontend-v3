'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { ServiceCardVisual } from '@/components/ui/ServiceCardVisual'
import { SERVICES, CATEGORY_LABELS, type ServiceCategory } from '@/lib/services/catalog'

const SECTION_COPY = {
  en: { title: '16 AI Services', subtitle: 'Everything you need, one workspace' },
  ka: { title: '16 AI სერვისი', subtitle: 'ყველაფერი რაც გჭირდება, ერთ სივრცეში' },
  ru: { title: '16 AI-сервисов', subtitle: 'Всё необходимое в одном пространстве' },
} as const

const CATEGORY_ORDER: ServiceCategory[] = ['create', 'edit', 'analyze', 'automate', 'scale']

export default function FeatureGrid() {
  const { language } = useLanguage()
  const lang = language as 'ka' | 'en' | 'ru'
  const copy = SECTION_COPY[lang] || SECTION_COPY.en
  const lh = (p: string) => '/' + language + p

  return (
    <section className="px-4 sm:px-6 lg:px-10 py-14 sm:py-20">
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-12 sm:mb-16">
          <p
            className="text-[11px] tracking-[0.25em] uppercase font-medium mb-3"
            style={{ color: 'var(--color-accent)' }}
          >
            {copy.title}
          </p>
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight"
            style={{ color: 'var(--color-text)' }}
          >
            {copy.subtitle}
          </h2>
        </div>

        {/* Category groups */}
        <div className="space-y-12">
          {CATEGORY_ORDER.map(cat => {
            const services = SERVICES.filter(s => s.category === cat)
            const catLabel = CATEGORY_LABELS[cat]
            return (
              <div key={cat}>
                {/* Category label */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-accent)', boxShadow: '0 0 8px var(--color-accent)' }} />
                  <h3
                    className="text-xs tracking-[0.2em] uppercase font-bold"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {catLabel[lang] || catLabel.en}
                  </h3>
                  <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, var(--color-border), transparent)' }} />
                </div>

                {/* Service cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                  {services.map(svc => (
                    <Link
                      key={svc.slug}
                      href={lh(`/services/${svc.slug}`)}
                      className="service-card group relative flex flex-col overflow-hidden rounded-xl transition-all duration-300 hover:-translate-y-1 active:scale-[0.98]"
                      style={{
                        backgroundColor: 'var(--card-bg)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      {/* Visual header */}
                      <ServiceCardVisual serviceId={svc.slug} variant="thumb" />

                      {/* Text content */}
                      <div className="relative flex flex-col gap-1.5 p-3.5 sm:p-4">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{svc.icon}</span>
                          <h4
                            className="text-[13px] sm:text-sm font-semibold leading-snug truncate"
                            style={{ color: 'var(--color-text)' }}
                          >
                            {svc.title[lang] || svc.title.en}
                          </h4>
                        </div>
                        <p
                          className="text-[11px] sm:text-[12px] leading-relaxed line-clamp-2"
                          style={{ color: 'var(--color-text-tertiary)' }}
                        >
                          {svc.description[lang] || svc.description.en}
                        </p>
                      </div>

                      {/* Hover glow border overlay */}
                      <div
                        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                        style={{
                          boxShadow: `inset 0 0 0 1px var(--color-accent), 0 0 20px rgba(99,102,241,0.15), 0 8px 32px rgba(0,0,0,0.3)`,
                        }}
                      />
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
