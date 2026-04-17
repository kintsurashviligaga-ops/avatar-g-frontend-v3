'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { getLocalizedServices, type ServiceDefinition } from '@/lib/service-registry'

const GROUPS = [
  { sectionKey: 'mediaCreation', slugs: ['avatar', 'video', 'editing', 'music', 'photo', 'image', 'game', 'interior'] },
  { sectionKey: 'aiTools', slugs: ['text', 'prompt', 'visual-intel', 'media'] },
  { sectionKey: 'business', slugs: ['shop', 'software', 'business', 'tourism'] },
  { sectionKey: 'automation', slugs: ['workflow', 'agent-g'] },
] as const

interface ServicesGridProps {
  locale: string
}

export function ServicesGrid({ locale }: ServicesGridProps) {
  const t = useTranslations('dashboard')
  const services = getLocalizedServices(locale)
  const serviceMap = new Map(services.map(s => [s.slug, s]))

  return (
    <div className="space-y-6">
      {GROUPS.map((group, gi) => {
        const svcList = group.slugs
          .map(slug => serviceMap.get(slug))
          .filter((s): s is ServiceDefinition => !!s && s.enabled)

        if (svcList.length === 0) return null

        return (
          <motion.div
            key={group.sectionKey}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 + gi * 0.05 }}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-muted)' }}>
              {t(`sections.${group.sectionKey}`)}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {svcList.map(svc => (
                <ServiceCard key={svc.slug} service={svc} locale={locale} />
              ))}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

function ServiceCard({ service, locale }: { service: ServiceDefinition; locale: string }) {
  return (
    <Link
      href={`/${locale}/services/${service.slug}`}
      className="group relative rounded-xl p-4 transition-all duration-200 hover:-translate-y-0.5"
      style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
      data-testid="service-card"
    >
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(0,212,255,0.04), transparent 70%)' }}
      />
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 transition-transform group-hover:scale-110"
            style={{ background: 'var(--color-cyan-dim, rgba(0,212,255,0.08))', border: '1px solid rgba(0,212,255,0.12)' }}
          >
            {service.icon}
          </div>
          <h4 className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{service.name}</h4>
        </div>
        <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--color-muted)' }}>{service.description}</p>
      </div>
    </Link>
  )
}
