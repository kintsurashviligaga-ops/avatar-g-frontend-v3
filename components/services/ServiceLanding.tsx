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
    <div className="relative min-h-screen overflow-hidden" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 900px 420px at 18% 8%, var(--color-accent-soft), transparent 62%), radial-gradient(ellipse 760px 400px at 86% 84%, rgba(124,92,252,0.08), transparent 58%)' }} />

      {/* Hero */}
      <section className="relative ag-section px-4 sm:px-6 lg:px-10 max-w-6xl mx-auto pt-24 md:pt-28">
        <div
          className="relative rounded-3xl backdrop-blur-xl p-7 sm:p-10 md:p-12 overflow-hidden"
          style={{
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--card-bg)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.12)',
          }}
        >
          {/* accent top edge */}
          <div className="absolute top-0 inset-x-0 h-px" style={{ background: 'linear-gradient(to right, transparent, var(--color-accent-soft), transparent)' }} />
          {/* corner orbs */}
          <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl pointer-events-none" style={{ background: 'var(--color-accent-soft)' }} />
          <div className="absolute -bottom-16 -left-16 w-40 h-40 rounded-full blur-3xl pointer-events-none" style={{ background: 'rgba(139,92,246,0.06)' }} />

          <div className="relative flex items-center gap-3 mb-6">
            <span className="text-3xl">{icon}</span>
            <span className="text-[10px] uppercase tracking-[0.15em] px-3 py-1 rounded-full font-semibold"
              style={{ color: 'var(--color-accent)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-accent-soft)' }}>
              AI Service
            </span>
          </div>
          <h1 className="relative text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.04] tracking-[-0.02em] mb-5" style={{ color: 'var(--color-text)' }}>
            {headline}
          </h1>
          <p className="relative text-lg max-w-2xl leading-relaxed mb-10" style={{ color: 'var(--color-text-secondary)' }}>
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
      <section className="px-4 sm:px-6 lg:px-10 py-14 max-w-6xl mx-auto" style={{ borderTop: '1px solid var(--color-border)' }}>
        <p className="text-xs uppercase tracking-widest mb-8" style={{ color: 'var(--color-text-tertiary)' }}>
          {locale === 'ka' ? 'შესაძლებლობები' : locale === 'ru' ? 'Возможности' : 'Capabilities'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {features.map((f) => (
            <div
              key={f}
              className="relative rounded-2xl backdrop-blur-xl p-5 flex items-start gap-3 transition-all duration-300 overflow-hidden group"
              style={{
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--card-bg)',
              }}
            >
              <div className="absolute top-0 inset-x-0 h-px" style={{ background: 'linear-gradient(to right, transparent, var(--color-border), transparent)' }} />
              <span className="mt-0.5 flex-shrink-0 transition-colors" style={{ color: 'var(--color-accent)' }}>✦</span>
              <span className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{f}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Agent G notice */}
      <section className="px-4 sm:px-6 lg:px-10 py-10 max-w-6xl mx-auto">
        <div className="rounded-3xl p-6 flex items-center gap-4" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-accent-soft)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--card-bg)' }}>
            <span className="text-lg" style={{ color: 'var(--color-text-secondary)' }}>◈</span>
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{agentLabel}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
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

