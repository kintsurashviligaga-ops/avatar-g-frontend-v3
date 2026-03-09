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
        <div className="relative rounded-3xl border border-white/[0.12] bg-[linear-gradient(155deg,rgba(12,22,46,0.90),rgba(7,14,32,0.82))] backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.10),0_32px_80px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.07)] p-7 sm:p-10 md:p-12 overflow-hidden">
          {/* neon top edge */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/35 to-transparent" />
          {/* corner orbs */}
          <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-gradient-to-br from-cyan-500/12 to-blue-600/8 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-40 h-40 rounded-full bg-gradient-to-br from-violet-500/10 to-indigo-600/6 blur-3xl pointer-events-none" />

          <div className="relative flex items-center gap-3 mb-6">
            <span className="text-3xl">{icon}</span>
            <span className="text-[10px] text-cyan-300/80 uppercase tracking-[0.15em] border border-cyan-400/25 bg-cyan-400/[0.07] px-3 py-1 rounded-full font-semibold">
              AI Service
            </span>
          </div>
          <h1 className="relative text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.04] tracking-[-0.02em] mb-5">
            {headline}
          </h1>
          <p className="relative text-white/60 text-lg max-w-2xl leading-relaxed mb-10">
            {description}
          </p>
          <div className="relative flex flex-wrap gap-4">
            <Link
              href={`/${locale}/signup`}
              className="ag-btn-primary px-7 py-3 rounded-2xl text-sm"
            >
              {cta.start}
            </Link>
            <Link
              href={`/${locale}/pricing`}
              className="btn-ghost px-7 py-3 rounded-2xl text-sm"
            >
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
            <div
              key={f}
              className="relative rounded-2xl border border-white/[0.08] bg-[linear-gradient(135deg,rgba(7,14,30,0.80),rgba(4,9,22,0.65))] backdrop-blur-xl p-5 flex items-start gap-3 hover:border-cyan-400/25 hover:shadow-[0_0_24px_rgba(34,211,238,0.07)] transition-all duration-300 overflow-hidden group"
            >
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
              <span className="text-cyan-400/60 mt-0.5 flex-shrink-0 group-hover:text-cyan-400/90 transition-colors">✦</span>
              <span className="text-sm text-white/70 leading-relaxed">{f}</span>
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

