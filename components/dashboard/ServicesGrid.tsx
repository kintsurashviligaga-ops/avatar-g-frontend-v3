'use client'

import { useRouter } from 'next/navigation'
import { SERVICE_REGISTRY } from '@/lib/registry'

interface ServicesGridProps {
  locale: string
}

const USE_LABEL: Record<string, string> = {
  ka: 'გამოყენება',
  en: 'Use',
  ru: 'Открыть',
}

const CREDITS_LABEL: Record<string, string> = {
  ka: 'კრედიტი',
  en: 'credits',
  ru: 'кр.',
}

const TIME_LABEL: Record<string, string> = {
  ka: 'წმ',
  en: 's',
  ru: 'с',
}

export function ServicesGrid({ locale }: ServicesGridProps) {
  const router = useRouter()
  const lang = (locale as 'ka' | 'en' | 'ru') in { ka: true, en: true, ru: true } ? (locale as 'ka' | 'en' | 'ru') : 'en'
  const useLabel = USE_LABEL[lang] ?? 'Use'
  const creditsLabel = CREDITS_LABEL[lang] ?? 'credits'
  const timeLabel = TIME_LABEL[lang] ?? 's'

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-4">
      {SERVICE_REGISTRY.map((service) => (
        <ServiceCard
          key={service.id}
          service={service}
          lang={lang}
          useLabel={useLabel}
          creditsLabel={creditsLabel}
          timeLabel={timeLabel}
          onClick={() => router.push(`/${locale}/chat?service=${service.id}`)}
        />
      ))}
    </div>
  )
}

type ServiceEntry = typeof SERVICE_REGISTRY[number]

function ServiceCard({
  service,
  lang,
  useLabel,
  creditsLabel,
  timeLabel,
  onClick,
}: {
  service: ServiceEntry
  lang: 'ka' | 'en' | 'ru'
  useLabel: string
  creditsLabel: string
  timeLabel: string
  onClick: () => void
}) {
  return (
    <div
      className="group relative flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/30 p-3 backdrop-blur-sm transition-all duration-200 hover:bg-black/45"
      style={{
        ['--svc-color' as string]: service.color,
      }}
    >
      <style jsx>{`
        .group:hover {
          border-color: var(--svc-color);
          box-shadow: 0 0 14px 0 color-mix(in srgb, var(--svc-color) 30%, transparent);
        }
      `}</style>

      <div className="flex items-start justify-between gap-1">
        <span
          className="text-2xl leading-none"
          style={{ color: service.color }}
        >
          {service.icon}
        </span>
        <div className="flex flex-col items-end gap-1">
          <span className="rounded-full border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/60">
            {service.credits} {creditsLabel}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/45">
            ~{service.avgSeconds}{timeLabel}
          </span>
        </div>
      </div>

      <div className="flex-1">
        <h3 className="text-sm font-semibold text-white/90">{service.name[lang]}</h3>
        <p className="mt-0.5 text-[11px] leading-relaxed text-white/50">{service.description[lang]}</p>
      </div>

      <button
        type="button"
        onClick={onClick}
        className="mt-1 w-full rounded-lg border border-white/15 bg-white/[0.05] py-1.5 text-[11px] font-semibold text-white/80 transition hover:bg-white/[0.10] hover:text-white"
        style={{
          borderColor: `color-mix(in srgb, ${service.color} 40%, transparent)`,
        }}
      >
        {useLabel}
      </button>
    </div>
  )
}

export default ServicesGrid
