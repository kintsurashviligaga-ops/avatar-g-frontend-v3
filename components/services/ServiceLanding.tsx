import Link from 'next/link'
import ServiceChatWidget from '@/components/services/ServiceChatWidget'

interface ServiceLandingProps {
  icon: string
  headline: string
  description: string
  features: string[]
  serviceName: string
  locale?: string
  agentId?: string
}

const CTA_TEXT: Record<string, { start: string; plans: string; tryNow: string }> = {
  en: { start: 'Start Free', plans: 'View Plans', tryNow: 'Try Now' },
  ka: { start: 'დაწყება უფასოდ', plans: 'გეგმების ნახვა', tryNow: 'სცადე ახლა' },
  ru: { start: 'Начать бесплатно', plans: 'Тарифы', tryNow: 'Попробовать' },
}

const AGENT_LABEL: Record<string, string> = {
  en: 'Powered by Agent G',
  ka: 'აგენტი G-ით მართული',
  ru: 'На базе Агента G',
}

export default function ServiceLanding({ icon, headline, description, features, serviceName, locale = 'ka', agentId = 'main-assistant' }: ServiceLandingProps) {
  const cta = CTA_TEXT[locale] ?? CTA_TEXT['en']!
  const agentLabel = AGENT_LABEL[locale] ?? AGENT_LABEL['en']!

  return (
    <div className="relative min-h-screen bg-transparent text-white overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_900px_420px_at_18%_8%,rgba(34,211,238,0.12),transparent_62%),radial-gradient(ellipse_760px_400px_at_86%_84%,rgba(124,92,252,0.12),transparent_58%)]" />

      {/* Hero */}
      <section className="relative ag-section px-4 sm:px-6 lg:px-10 max-w-6xl mx-auto pt-24 md:pt-28">
        <div className="ag-surface-hero rounded-3xl p-7 sm:p-10 md:p-12">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-3xl">{icon}</span>
            <span className="text-xs text-white/40 uppercase tracking-widest border border-white/[0.12] bg-white/[0.04] px-3 py-1 rounded-full">
            AI Service
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.04] tracking-[-0.02em] mb-5">
            {headline}
          </h1>
          <p className="text-white/65 text-lg max-w-2xl leading-relaxed mb-10">
            {description}
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href={`/${locale}/signup`}
              className="bg-white text-[#050510] font-semibold text-sm px-6 py-3 rounded-2xl hover:bg-white/90 transition-all shadow-[0_12px_30px_rgba(255,255,255,0.15)]">
              {cta.start}
            </Link>
            <Link href={`/${locale}/pricing`}
              className="border border-white/25 text-white font-semibold text-sm px-6 py-3 rounded-2xl hover:bg-white/[0.08] transition-all">
              {cta.plans}
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-white/[0.10] px-4 sm:px-6 lg:px-10 py-14 max-w-6xl mx-auto">
        <p className="text-xs text-white/40 uppercase tracking-widest mb-8">
          {locale === 'ka' ? 'შესაძლებლობები' : locale === 'ru' ? 'Возможности' : 'Capabilities'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {features.map((f) => (
            <div key={f}
              className="ag-surface-secondary rounded-2xl p-5 flex items-start gap-3 hover:border-cyan-300/30 transition-all duration-300">
              <span className="text-white/20 mt-0.5 flex-shrink-0">✦</span>
              <span className="text-sm text-white/75">{f}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Agent G notice */}
      <section className="px-4 sm:px-6 lg:px-10 py-10 max-w-6xl mx-auto">
        <div className="ag-surface-primary rounded-3xl p-6 flex items-center gap-4">
          <div className="w-10 h-10 bg-white/[0.08] rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-white/60 text-lg">◈</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{agentLabel}</p>
            <p className="text-xs text-white/50 mt-0.5">
              {locale === 'ka'
                ? `ყველა ${serviceName} სამუშაო კოორდინირდება, კონტროლდება და მიწოდდება აგენტი G-ით.`
                : locale === 'ru'
                ? `Каждая задача ${serviceName} координируется, проверяется и доставляется Агентом G.`
                : `Every ${serviceName} job is coordinated, quality-checked, and delivered by Agent G.`}
            </p>
          </div>
        </div>
      </section>

      {/* Service Chat Widget */}
      <ServiceChatWidget serviceName={serviceName} agentId={agentId} locale={locale} />
    </div>
  )
}

